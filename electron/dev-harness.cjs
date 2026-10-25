'use strict';
// DEV ONLY (not shipped): runs the real app against a local fake FAA gateway
// serving SYNTHETIC data in the FAA's documented format, then screenshots it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const OUT = process.env.SHOT_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const TZ = 'America/Chicago';
const hr = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const chicagoHM = (ms) => { const p = Object.fromEntries(hr.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
/** next instant (>= from) at HH:MM Central */
function nextCT(from, h, m = 0) { let t = Math.ceil(from / 60000) * 60000; while (chicagoHM(t) !== h * 60 + m) t += 60000; return t; }
const fmt = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };

const now = Date.now();
const H = 3600e3;
const rows = [
  ['W', 'M', 'BROWNWOOD 1 EAST MOA', now - 2 * H, now + 3 * H, '001', '180'],
  ['W', 'M', 'BROWNWOOD 1 WEST MOA', now - 2 * H, now + 3 * H, '001', '180'],
  ['H', 'M', 'BROWNWOOD 4 MOA', now - 1 * H, nextCT(now, 23, 0), '001', '180'],
  ['H', 'A', 'BROWNWOOD 4 ATCAA', now - 1 * H, nextCT(now, 23, 0), '180', '600'],
  ['W', 'A', 'BROWNWOOD LIGHTNING 2 ATCAA', now + 4 * H, nextCT(now + 4 * H, 1, 0), '180', '600'],
  ['P', 'M', 'BRADY NORTH MOA', now + 2 * H, now + 6 * H, '036', '180'],
  ['W', 'M', 'BROWNWOOD 9 MOA', now + 1 * H, now + 2 * H, '001', '180'],
  ['W', 'M', 'OWENS MOA', now, now + H, '002', '180'],
];
const feed = [`[${rows.length + 3}] ${new Date().toUTCString()}`, '# synthetic test data', `#[${new Date().toISOString()}]`,
  ...rows.map((r, i) => `${9000 + i}|${100 + i}|${r[0]}|${r[1]}|${r[2]}|${fmt(r[3])}|${fmt(r[4])}|${r[5]}|${r[6]}|A`), '# end'].join('\r\n');

const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(feed); });
srv.listen(47999, '127.0.0.1', () => {
  process.env.AIRSPACE_FAA_GATEWAY_URL = 'http://127.0.0.1:47999/n24sua';
  const { app, BrowserWindow } = require('electron');
  app.commandLine.appendSwitch('no-sandbox');
  require('./main.cjs');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (w, name) => { const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); console.log('shot', name); };
  app.whenReady().then(async () => {
    await sleep(4000);
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1440, 900);
    const js = (c) => w.webContents.executeJavaScript(c);
    await shot(w, '1_before_login');                       // public-page path, nothing reachable
    const idle = async () => { for (let i = 0; i < 60; i++) { if (await js(`!document.querySelector('[aria-label="Refresh FAA data"]').disabled`)) return; await sleep(500); } };
    await idle();
    await js(`window.airspaceDesktop.saveCredentials('tester','secret')`);
    await js(`document.querySelector('[aria-label="Refresh FAA data"]').click()`);
    await sleep(500); await idle(); await sleep(800);
    await shot(w, '2_live_with_alerts');
    await js(`document.querySelectorAll('[role=alertdialog] button')[1] && [...document.querySelectorAll('[role=alertdialog] button')].filter(b=>b.textContent.trim()==='Got it').forEach(b=>b.click())`);
    await sleep(500);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('BROWNWOOD 4 MOA'))?.click()`);
    await sleep(500);
    await shot(w, '3_acked_and_selected');
    await js(`document.querySelector('[aria-label="Settings"]').click()`);
    await sleep(600);
    await shot(w, '4_settings');
    console.log('DEBUG-FILE', fs.existsSync(path.join(app.getPath('userData'), 'faa-debug.json')));
    app.exit(0);
  });
});
