'use strict';
/**
 * Electron main process.
 *
 * Why this exists as a desktop app (and not just a website):
 *  - Browsers block pages from reading sua.faa.gov (CORS). The main process
 *    is plain Node/Chromium-network code, so it can request FAA data directly.
 *  - The dashboard is served from http://localhost so the Twitch embed
 *    (which requires a real "parent" hostname) keeps working.
 */
const { app, BrowserWindow, shell, Menu, ipcMain, net, safeStorage, Notification } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const faa = require('./faa.cjs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let filePath = path.normalize(path.join(DIST_DIR, urlPath));
        // Block path traversal out of dist/
        if (!filePath.startsWith(DIST_DIR)) {
          res.writeHead(403); return res.end('Forbidden');
        }
        if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(DIST_DIR, 'index.html'); // SPA fallback
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500); res.end('Server error');
      }
    });
    // Prefer a stable port; fall back to any free one if it's taken.
    const PREFERRED_PORT = 47321;
    const tryListen = (port, isRetry) => {
      server.once('error', (err) => {
        if (!isRetry && err.code === 'EADDRINUSE') tryListen(0, true);
        else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    };
    tryListen(PREFERRED_PORT, false);
  });
}

/* ------------------------------------------------------------------ */
/* FAA data + settings IPC                                             */
/* ------------------------------------------------------------------ */

const userFile = (name) => path.join(app.getPath('userData'), name);
let sessionCreds = null; // used only if secure storage is unavailable

function loadCredentials() {
  try {
    const buf = fs.readFileSync(userFile('faa-gateway.bin'));
    if (!safeStorage.isEncryptionAvailable()) return sessionCreds;
    return JSON.parse(safeStorage.decryptString(buf));
  } catch {
    return sessionCreds;
  }
}

function writeDebug(result) {
  try {
    // Everything here is already redacted by faa.cjs; round-trip through JSON to drop non-serializable values.
    const safe = JSON.parse(JSON.stringify({ result, diagnostics: faa.getDiagnostics() }));
    fs.writeFileSync(userFile('faa-debug.json'), JSON.stringify(safe, null, 2));
  } catch { /* debug output is best-effort */ }
}

/* One network cycle at a time, and never more often than MIN_GAP_MS, no matter how many
 * times the UI asks (auto-refresh, Retry button, Settings dialog...). */
const MIN_GAP_MS = 15 * 1000;
let inflight = null;
let lastStartedAt = 0;
let lastResult = null;
let authBlockedFor = null; // in-memory only: user+password the FAA already rejected

function resetThrottle() { lastStartedAt = 0; lastResult = null; authBlockedFor = null; }

function registerIpc() {
  ipcMain.handle('faa:fetch', async (_evt, names) => {
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
      return { ok: false, error: 'Invalid request.', attempts: [] };
    }
    if (inflight) {
      faa.logEvent('info', 'cycle', 'Refresh requested while one is already running; joined the running request.');
      return inflight;
    }
    const sinceLast = Date.now() - lastStartedAt;
    if (lastResult && sinceLast < MIN_GAP_MS) {
      faa.logEvent('info', 'cycle', `Refresh requested ${Math.round(sinceLast / 1000)} s after the last one; returning that result (minimum gap ${MIN_GAP_MS / 1000} s).`);
      return { ...lastResult, throttled: true };
    }

    const creds = loadCredentials();
    const credKey = creds ? `${creds.user}\u0000${creds.pwd}` : null;
    const skipGateway = Boolean(credKey && authBlockedFor === credKey);

    lastStartedAt = Date.now();
    inflight = (async () => {
      try {
        const result = await faa.fetchSchedules({
          creds,
          names: names.slice(0, 40),
          skipGateway,
          doFetch: (url, opts) => net.fetch(url, opts), // uses the system proxy settings
        });
        if (credKey && (result.attempts || []).some((a) => a.source === 'gateway' && a.code === 'AUTH')) {
          authBlockedFor = credKey; // stop re-sending a rejected password every cycle
        }
        lastResult = result;
        writeDebug(result);
        return result;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  });

  ipcMain.handle('faa:diagnostics', () => faa.getDiagnostics());

  ipcMain.handle('settings:get', () => {
    const c = loadCredentials();
    return {
      hasCredentials: Boolean(c && c.user),
      user: c ? c.user : '',
      secureStorage: safeStorage.isEncryptionAvailable(),
      version: app.getVersion(),
      userDataPath: app.getPath('userData'),
    };
  });

  ipcMain.handle('settings:save-credentials', (_evt, creds) => {
    if (!creds || typeof creds.user !== 'string' || typeof creds.pwd !== 'string' || !creds.user || !creds.pwd) {
      return { ok: false, error: 'Enter both a username and password.' };
    }
    const payload = { user: creds.user.trim(), pwd: creds.pwd };
    resetThrottle();
    if (!safeStorage.isEncryptionAvailable()) {
      sessionCreds = payload; // never written to disk unencrypted
      return { ok: true, persisted: false };
    }
    fs.writeFileSync(userFile('faa-gateway.bin'), safeStorage.encryptString(JSON.stringify(payload)));
    return { ok: true, persisted: true };
  });

  ipcMain.handle('settings:clear-credentials', () => {
    sessionCreds = null;
    resetThrottle();
    try { fs.unlinkSync(userFile('faa-gateway.bin')); } catch { /* none saved */ }
    return { ok: true };
  });

  ipcMain.handle('app:notify', (_evt, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 400) }).show();
    }
    return true;
  });

  ipcMain.handle('app:show-debug', () => {
    const f = userFile('faa-debug.json');
    if (fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(app.getPath('userData'));
    return true;
  });
}

let mainWindow = null;

async function createWindow() {
  const port = await startStaticServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0f16',
    title: 'Military Airspace Scheduler',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`http://localhost:${port}/`);

  // External links (e.g. "Watch on Twitch") open in the user's browser,
  // never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
