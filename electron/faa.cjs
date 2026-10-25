'use strict';
/**
 * FAA Special Use Airspace (SUA) schedule client. Runs in the Electron main
 * process, where requests to sua.faa.gov are not subject to browser CORS.
 *
 * RULE ZERO: this module never invents data. Every entry it returns was parsed
 * from an FAA response. If no source yields a validated response it returns
 * { ok:false } and the UI says so. There are no "typical hours" here.
 *
 * Sources, tried in order until one returns a validated response:
 *
 *  1. SUA Schedule Data Gateway   (official, documented, needs an FAA login)
 *     https://sua.faa.gov/datafeed/suagw/n24sua?user=...&pwd=...
 *     Format: https://sua.faa.gov/ops/docs/suagwDataFmt.html
 *     Pipe-delimited, one record per schedule, next 24 h, updated each minute.
 *
 *  2. SUA website "Text List" export (public, NOT documented by the FAA)
 *     https://sua.faa.gov/sua/download.app?colHead=...
 *     The same CSV the "Download Data" link on the public Text List page
 *     produces: every active/next-24h schedule nationwide in one request.
 *     The request shape comes from a third-party client (2021); it has NOT been
 *     verified against the live site by the author of this module. Parsing is
 *     header-driven and fails loudly on anything unexpected.
 *
 *  3. SUA website "interacting schedules" pages (public, NOT documented)
 *     https://sua.faa.gov/sua/lkSched.jsp?asname=<AIRSPACE NAME>
 *     The endpoint exists (it returns a "Schedules that interact with airspace
 *     X:" page) but the layout of a populated page has not been observed, so
 *     rows are accepted only when they explicitly name the airspace and carry
 *     two parseable timestamps. A source that returns pages but zero
 *     recognisable rows is treated as FAILED, not as "nothing scheduled".
 *
 * Politeness: bounded retries with exponential backoff + jitter, request
 * timeouts, an overall deadline, Retry-After handling, and an immediate stop on
 * HTTP 429. Callers (main.cjs) add in-flight de-duplication and a minimum gap.
 */

const GATEWAY_URL = process.env.AIRSPACE_FAA_GATEWAY_URL || 'https://sua.faa.gov/datafeed/suagw/n24sua';
const TEXTLIST_URL = process.env.AIRSPACE_FAA_TEXTLIST_URL ||
  'https://sua.faa.gov/sua/download.app?colHead=%3Cbr%3E%3Cbr%3E|Type%3Cbr%3E%3Cbr%3E|Zoom%3Cbr%3E%3Cbr%3E|SAA%20/%20NOTAM%20ID%3Cbr%3E%3Cbr%3E|Start%20Time%3Cbr%3E%3Cbr%3E|End%20Time%3Cbr%3E%3Cbr%3E|Center%20ID%3Cbr%3E%3Cbr%3E|State%3Cbr%3E%3Cbr%3E|Min%20Alt%3Cbr%3E(100s%20ft)|Max%20Alt%3Cbr%3E(100s%20ft)|Group%3Cbr%3E%3Cbr%3E&';
const PUBLIC_URL = process.env.AIRSPACE_FAA_PUBLIC_URL || 'https://sua.faa.gov/sua/lkSched.jsp';
const USER_AGENT = 'MilitaryAirspaceScheduler/1.1 (desktop dashboard; polls at most every 2-5 min)';

const SOURCES = {
  gateway: {
    id: 'gateway', coverage: 'nationwide-24h', verification: 'documented',
    label: 'FAA SUA Schedule Data Gateway (official, login required)',
  },
  textlist: {
    id: 'textlist', coverage: 'nationwide-24h', verification: 'undocumented',
    label: 'FAA SUA website Text List export (public, undocumented)',
  },
  public: {
    id: 'public', coverage: 'per-airspace', verification: 'unverified-format',
    label: 'FAA SUA website interacting-schedules pages (public, unverified layout)',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RAW_CHARS = 60000;

/** Extra region words always reported if they appear in a nationwide feed but are not mapped. */
const EXTRA_REGION_WORDS = ['RIVERS'];

class FaaError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.retryable = Boolean(extra.retryable);
    this.retryAfterMs = extra.retryAfterMs;
    this.httpStatus = extra.httpStatus;
  }
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

/** Never let a password, user name or token end up in an error message or log. */
function redact(text) {
  return String(text)
    .replace(/(pwd|password|passwd|user|username|token|apikey|api_key)=([^&\s"']*)/gi, '$1=***')
    .replace(/(authorization:\s*)\S+(\s+\S+)?/gi, '$1***');
}

function makeScrubber(creds) {
  const secrets = [];
  if (creds && typeof creds.pwd === 'string' && creds.pwd.length >= 3) secrets.push(creds.pwd);
  if (creds && typeof creds.user === 'string' && creds.user.length >= 4) secrets.push(creds.user);
  return (text) => {
    let out = redact(text);
    for (const s of secrets) out = out.split(s).join('***');
    return out;
  };
}

/* ------------------------------------------------------------------ */
/* Connection log + raw response store (in memory, redacted)           */
/* ------------------------------------------------------------------ */

const LOG_MAX = 400;
const logBuf = [];
const rawStore = {};
let lastSuccess = null;

function log(level, source, msg) {
  logBuf.push({ t: Date.now(), level, source, msg: redact(msg) });
  if (logBuf.length > LOG_MAX) logBuf.splice(0, logBuf.length - LOG_MAX);
}

function captureRaw(sourceId, rec, scrub) {
  const text = scrub(rec.text || '');
  const entry = {
    capturedAt: Date.now(),
    url: scrub(rec.url),
    httpStatus: rec.httpStatus,
    headers: rec.headers || {},
    bytes: rec.bytes,
    truncated: text.length > MAX_RAW_CHARS,
    name: rec.name,
    text: text.slice(0, MAX_RAW_CHARS),
  };
  if (sourceId === 'public') {
    const list = (rawStore.public = rawStore.public || []);
    const i = list.findIndex((p) => p.name === rec.name);
    if (i >= 0) list[i] = entry; else list.push(entry);
    if (list.length > 24) list.shift();
  } else {
    rawStore[sourceId] = entry;
  }
}

function getDiagnostics() {
  return {
    generatedAt: Date.now(),
    log: logBuf.slice().reverse(), // newest first
    raw: JSON.parse(JSON.stringify(rawStore)),
    lastSuccess,
    sources: Object.values(SOURCES).map((s) => ({ id: s.id, label: s.label, verification: s.verification, coverage: s.coverage })),
  };
}

function resetDiagnostics() {
  logBuf.length = 0;
  for (const k of Object.keys(rawStore)) delete rawStore[k];
  lastSuccess = null;
}

/* ------------------------------------------------------------------ */
/* Name matching                                                       */
/* ------------------------------------------------------------------ */

function normalizeName(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "BROWNWOOD 4 MOA" + type -> "BROWNWOOD 4|M" so a missing/extra suffix still matches. */
function nameKey(name, typeChar) {
  let n = normalizeName(name);
  let t = typeChar;
  const suffix = n.match(/ (MOA|ATCAA)$/);
  if (suffix) {
    t = t || (suffix[1] === 'MOA' ? 'M' : 'A');
    n = n.slice(0, suffix.index);
  }
  return `${n}|${t || '?'}`;
}

function typeCharFromName(name) {
  const n = normalizeName(name);
  if (/ ATCAA$/.test(n)) return 'A';
  if (/ MOA$/.test(n)) return 'M';
  return undefined;
}

/**
 * Give an entry its full FAA designation ("BROWNWOOD 4" + type M -> "BROWNWOOD 4 MOA").
 * Returns null when the name has no MOA/ATCAA suffix and the type is unknown:
 * that record is ambiguous and must not be attributed to either.
 */
function withDesignation(name, typeChar) {
  const n = normalizeName(name);
  if (/ (MOA|ATCAA)$/.test(n)) return n;
  if (typeChar === 'M') return `${n} MOA`;
  if (typeChar === 'A') return `${n} ATCAA`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Drop records that are malformed or already over; report why. Never throws. */
function validateEntries(entries, nowMs) {
  const valid = [];
  const rejected = [];
  for (const e of entries) {
    if (!e || !e.name) { rejected.push({ reason: 'missing airspace name' }); continue; }
    if (!Number.isFinite(e.start) || !Number.isFinite(e.end)) { rejected.push({ reason: 'unparseable time', name: e.name }); continue; }
    if (e.end <= e.start) { rejected.push({ reason: 'end not after start', name: e.name }); continue; }
    if (e.end - e.start > 14 * DAY_MS) { rejected.push({ reason: 'window longer than 14 days', name: e.name }); continue; }
    if (e.end < nowMs) { rejected.push({ reason: 'already ended', name: e.name }); continue; }
    valid.push(e);
  }
  return { valid, rejected };
}

function summarizeRejected(rejected) {
  const by = {};
  for (const r of rejected) by[r.reason] = (by[r.reason] || 0) + 1;
  return by;
}

/* ------------------------------------------------------------------ */
/* Source 1: SUA Schedule Data Gateway                                 */
/* ------------------------------------------------------------------ */

/** "2021/0525 13:00" (UTC) -> epoch ms, or null if malformed. */
function parseGatewayTime(str) {
  const m = /^(\d{4})\/(\d{2})(\d{2}) (\d{2}):(\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, 0, 0);
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "#[24/May/2021:13:24:00 +0000]" -> epoch ms or null. */
function parseGeneratedStamp(line) {
  const m = /^#\[(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]/.exec(line);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const sign = m[7][0] === '-' ? -1 : 1;
  const offMin = sign * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(3, 5)));
  return Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - offMin * 60000;
}

/**
 * Parse the n24sua dataset (see format doc above).
 * Returns { declaredCount, requestedAt, generatedAt, entries, skipped }.
 * Throws FaaError('FORMAT') if the text doesn't look like a gateway dataset at
 * all (e.g. a login/error page).
 */
function parseGatewayFeed(text) {
  const lines = String(text).split(/\r?\n/);
  let declaredCount = null;
  let requestedAt = null;
  let generatedAt = null;
  const entries = [];
  let skipped = 0;
  let sawHeader = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (generatedAt === null) generatedAt = parseGeneratedStamp(line);
      continue;
    }

    const header = /^\[(\d+)\]\s*(.*)$/.exec(line);
    if (header) {
      declaredCount = Number(header[1]);
      const ts = Date.parse(header[2]);
      requestedAt = Number.isFinite(ts) ? ts : null;
      sawHeader = true;
      continue;
    }

    const f = line.split('|');
    if (f.length < 9) { skipped++; continue; }
    const start = parseGatewayTime(f[5]);
    const end = parseGatewayTime(f[6]);
    if (start === null || end === null || end <= start) { skipped++; continue; }

    const type = f[3].trim();
    const isRoute = ['I', 'V', 'S'].includes(type); // MTRs: f[7]/f[8] are entry/exit points
    entries.push({
      scheduleId: f[0].trim(),
      airspaceId: f[1].trim(),
      status: f[2].trim(),            // P pending, W waiting to start, H hot
      type,                           // M = MOA, A = ATCAA, ...
      name: f[4].trim(),
      start,
      end,
      lowAlt: isRoute ? undefined : f[7].trim(),   // hundreds of feet
      highAlt: isRoute ? undefined : f[8].trim(),
    });
  }

  if (!sawHeader && entries.length === 0) {
    throw new FaaError('FORMAT', 'Response was not an SUA gateway dataset (login or error page?).');
  }
  return { declaredCount, requestedAt, generatedAt, entries, skipped };
}

/* ------------------------------------------------------------------ */
/* Source 2: SUA website Text List CSV export                          */
/* ------------------------------------------------------------------ */

/** Small RFC-4180-ish CSV reader (quoted fields, doubled quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** Excel-style ="value" wrappers and stray tags/whitespace -> plain text. */
function cleanCell(v) {
  let s = String(v).trim();
  const m = /^="(.*)"$/.exec(s);
  if (m) s = m[1];
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "09/30/2026 14:00" (Zulu) -> epoch ms or null. */
function parseTextListTime(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(str).trim());
  if (!m) return null;
  const [, mo, d, y, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi);
}

function textListTypeChar(typeStr) {
  const t = String(typeStr || '').toUpperCase().trim();
  if (t === 'M' || /\bMOA\b/.test(t) || /MILITARY OPERATIONS/.test(t)) return 'M';
  if (t === 'A' || /ATCAA/.test(t) || /ATC ASSIGNED/.test(t)) return 'A';
  return undefined;
}

function padAlt(v) {
  const s = String(v || '').trim();
  return /^\d{1,3}$/.test(s) ? s.padStart(3, '0') : undefined;
}

/**
 * Parse the Text List CSV. Header-driven: the columns we need (airspace id,
 * start, end) must be present or we throw FORMAT instead of guessing.
 */
function parseTextListCsv(text) {
  const body = String(text);
  if (/^\s*<(!doctype|html)/i.test(body)) {
    throw new FaaError('FORMAT', 'Text List export returned a web page instead of CSV data.');
  }
  const rows = parseCsv(body);
  if (rows.length === 0) throw new FaaError('FORMAT', 'Text List export was empty.');

  let headerIdx = -1;
  let cols = null;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const names = rows[i].map((c) => cleanCell(c).toLowerCase());
    const find = (re) => names.findIndex((n) => re.test(n));
    const c = {
      id: find(/saa|notam/), start: find(/^start/), end: find(/^end/),
      type: find(/^type$/), min: find(/^min alt/), max: find(/^max alt/),
    };
    if (c.id >= 0 && c.start >= 0 && c.end >= 0) { headerIdx = i; cols = c; break; }
  }
  if (!cols) {
    const first = rows[0].map(cleanCell).join(' | ').slice(0, 160);
    throw new FaaError('FORMAT', `Text List export has no recognizable header row (first row: "${first}").`);
  }

  const entries = [];
  let skipped = 0;
  let ambiguous = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const rawName = cleanCell(r[cols.id] || '');
    const start = parseTextListTime(cleanCell(r[cols.start] || ''));
    const end = parseTextListTime(cleanCell(r[cols.end] || ''));
    if (!rawName || start === null || end === null || end <= start) { skipped++; continue; }
    const type = cols.type >= 0 ? textListTypeChar(cleanCell(r[cols.type] || '')) : undefined;
    const designation = withDesignation(rawName, type);
    if (!designation) { ambiguous++; continue; }
    entries.push({
      scheduleId: '', airspaceId: '', status: '?', // the export carries no schedule status
      type: type || typeCharFromName(designation),
      name: designation, start, end,
      lowAlt: cols.min >= 0 ? padAlt(cleanCell(r[cols.min] || '')) : undefined,
      highAlt: cols.max >= 0 ? padAlt(cleanCell(r[cols.max] || '')) : undefined,
    });
  }
  const dataRows = rows.length - headerIdx - 1;
  if (dataRows > 0 && entries.length === 0 && ambiguous === 0) {
    throw new FaaError('FORMAT', `Text List export had ${dataRows} data row(s) but none could be parsed.`);
  }
  return { entries, skipped, ambiguous, dataRows, header: rows[headerIdx].map(cleanCell) };
}

/* ------------------------------------------------------------------ */
/* Source 3: public "interacting schedules" page (best effort)         */
/* ------------------------------------------------------------------ */

function htmlToLines(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/li|\/tr|\/p|\/div|\/h\d|\/ul|\/ol|\/table)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Timestamp layouts accepted on the page. ASSUMED to be Zulu (unverified; see header).
const TIME_PATTERNS = [
  { re: /(\d{4})\/(\d{2})(\d{2})\s+(\d{2}):?(\d{2})/g, order: 'ymd' },      // 2026/0930 14:00
  { re: /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/g, order: 'ymd' },       // 2026-09-30 14:00
  { re: /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):?(\d{2})/g, order: 'mdy' }, // 09/30/2026 14:00
];

// Designators that mean "some other airspace": R-6302, W228, VR1020, 2901A, or any "... MOA"/"... ATCAA".
const OTHER_AIRSPACE = /\b(?:(?:R|W|A|P|VR|IR|SR|AR) ?\d{2,4}[A-Z]?|\d{3,4}[A-Z]|MOA|ATCAA)\b/;

function findTimes(line) {
  const found = [];
  for (const { re, order } of TIME_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const [a, b, c, h, mi] = m.slice(1).map(Number);
      const [y, mo, d] = order === 'ymd' ? [a, b, c] : [c, a, b];
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59) continue;
      found.push({ index: m.index, end: m.index + m[0].length, ms: Date.UTC(y, mo - 1, d, h, mi) });
    }
  }
  found.sort((x, y) => x.index - y.index);
  return found.filter((t, i) => i === 0 || t.index >= found[i - 1].end);
}

/**
 * Parse one lkSched.jsp page for the airspace `asname`.
 * Returns { entries, foreign, sampleLines }. A row becomes an entry ONLY if the
 * text before its first timestamp contains the airspace's own full name.
 * Throws FaaError('FORMAT') if the page holds schedule-looking content we
 * could not attribute, so the UI reports a data problem and not a false "none".
 */
function parseInteractingSchedules(html, asname) {
  const lines = htmlToLines(html).filter(
    (l) => !/^interacting schedules$/i.test(l) && !/schedules that interact with airspace/i.test(l)
  );
  const wanted = normalizeName(asname); // full name incl. MOA/ATCAA: an overlying ATCAA is NOT this MOA
  const entries = [];
  let foreign = 0;
  let unattributed = 0;
  let looksLikeData = 0;

  for (const line of lines) {
    const times = findTimes(line);
    if (/\d{1,2}:\d{2}/.test(line) || /\d{4}\/\d{4}/.test(line)) looksLikeData++;
    if (times.length < 2) continue;

    const prefix = normalizeName(line.slice(0, times[0].index));
    if (prefix.includes(wanted)) {
      for (let i = 0; i + 1 < times.length; i += 2) {
        if (times[i + 1].ms > times[i].ms) {
          entries.push({
            scheduleId: '', airspaceId: '', status: '?', type: typeCharFromName(asname),
            name: asname, start: times[i].ms, end: times[i + 1].ms,
            lowAlt: undefined, highAlt: undefined,
          });
        }
      }
    } else if (OTHER_AIRSPACE.test(prefix)) {
      foreign++;
    } else {
      unattributed++; // schedule-like row we cannot tie to this airspace: never guess
    }
  }

  if (entries.length === 0 && foreign === 0 && (looksLikeData > 0 || unattributed > 0)) {
    throw new FaaError('FORMAT', `Page for "${asname}" has schedule-like content that could not be parsed or attributed.`);
  }
  return { entries, foreign, unattributed, sampleLines: lines.slice(0, 6) };
}

/* ------------------------------------------------------------------ */
/* HTTP + retry plumbing                                               */
/* ------------------------------------------------------------------ */

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(value, nowMs) {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isFinite(when) ? Math.max(0, when - nowMs) : undefined;
}

function pickHeaders(res) {
  const out = {};
  if (!res.headers || typeof res.headers.get !== 'function') return out;
  for (const k of ['content-type', 'date', 'last-modified', 'retry-after', 'server', 'cache-control']) {
    const v = res.headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/** One HTTP GET. Throws FaaError for network/timeout/HTTP-status problems; returns { status, text, headers, bytes }. */
async function httpGet(ctx, url, opts = {}) {
  const { doFetch, timeoutMs, now } = ctx;
  const started = now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  let text;
  try {
    res = await doFetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: opts.accept || 'text/plain, text/csv, text/html, */*' },
    });
    text = await res.text();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new FaaError('TIMEOUT', `Request to the FAA timed out after ${Math.round(timeoutMs / 1000)} s.`, { retryable: true });
    }
    throw new FaaError('NETWORK', `Could not reach the FAA (${ctx.scrub(err && err.message ? err.message : err)}).`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  const rec = {
    url, httpStatus: res.status, headers: pickHeaders(res), bytes: Buffer.byteLength(text, 'utf8'),
    text, name: opts.name,
  };
  captureRaw(opts.source, rec, ctx.scrub);
  ctx.log('info', opts.source, `GET ${opts.label || 'request'} -> HTTP ${res.status}, ${rec.bytes} bytes, ${now() - started} ms`);

  const status = res.status;
  if (status === 401 || status === 403) {
    throw new FaaError('AUTH', `FAA rejected the request (HTTP ${status}). Check the gateway login.`, { httpStatus: status });
  }
  if (status === 429) {
    const ra = parseRetryAfter(rec.headers['retry-after'], now());
    throw new FaaError('RATE_LIMIT', `FAA is rate limiting requests (HTTP 429${ra !== undefined ? `, retry after ${Math.ceil(ra / 1000)} s` : ''}).`, { httpStatus: 429, retryAfterMs: ra ?? 60000 });
  }
  if (status >= 500) {
    throw new FaaError('HTTP', `FAA server error (HTTP ${status}).`, { retryable: true, httpStatus: status });
  }
  if (!res.ok) {
    const hint = status === 404 ? ' The endpoint may have moved or been withdrawn.' : '';
    throw new FaaError('HTTP', `FAA returned HTTP ${status}.${hint}`, { httpStatus: status });
  }
  return { status, text, headers: rec.headers, bytes: rec.bytes };
}

function backoffDelay(attempt, random = Math.random) {
  const base = Math.min(8000, 1000 * 2 ** (attempt - 1)); // 1 s, 2 s, 4 s, 8 s (capped)
  return Math.round(base * (0.75 + random() * 0.5));       // +/- 25 % jitter
}

/** Run fn with bounded retries (exponential backoff + jitter) for retryable failures only. */
async function withRetry(ctx, sourceId, label, fn, tries = ctx.tries) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const out = await fn();
      if (i > 1) ctx.log('info', sourceId, `${label}: succeeded on attempt ${i}/${tries}.`);
      return out;
    } catch (err) {
      const e = err instanceof FaaError ? err : new FaaError('ERROR', ctx.scrub(err && err.message ? err.message : err));
      e.tries = i;
      lastErr = e;
      ctx.log('warn', sourceId, `${label}: attempt ${i}/${tries} failed - ${e.code}: ${e.message}`);
      if (!e.retryable || i === tries) break;
      const wait = backoffDelay(i, ctx.random);
      if (ctx.now() + wait > ctx.deadline) { ctx.log('warn', sourceId, `${label}: not retrying, overall time budget exhausted.`); break; }
      ctx.log('info', sourceId, `${label}: retrying in ${wait} ms.`);
      await ctx.sleep(wait);
    }
  }
  throw lastErr;
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Per-source runners                                                  */
/* ------------------------------------------------------------------ */

function matchEntries(entries, wantedKeys, regionWords) {
  const matched = [];
  const unmatched = new Set();
  for (const e of entries) {
    const k = nameKey(e.name, e.type);
    if (wantedKeys.has(k) || wantedKeys.has(k.split('|')[0] + '|?')) matched.push(e);
    else if (regionWords.some((w) => normalizeName(e.name).startsWith(w))) unmatched.add(e.name);
  }
  return { matched, unmatched: [...unmatched] };
}

async function runGateway(ctx, creds) {
  const url = new URL(GATEWAY_URL);
  url.searchParams.set('user', creds.user);
  url.searchParams.set('pwd', creds.pwd);

  return withRetry(ctx, 'gateway', 'gateway request', async () => {
    const res = await httpGet(ctx, url.toString(), { source: 'gateway', label: 'SUA gateway n24sua' });
    // Some auth failures come back as a 200 HTML page.
    if (/^\s*<(!doctype|html)/i.test(res.text) && !res.text.includes('|')) {
      throw new FaaError('AUTH', 'FAA gateway returned a web page instead of data (check the login).');
    }
    const parsed = parseGatewayFeed(res.text);
    const expected = parsed.declaredCount !== null ? parsed.declaredCount - 3 : null;
    const got = parsed.entries.length + parsed.skipped;
    if (expected !== null && got < expected) {
      throw new FaaError('INCOMPLETE', `Gateway feed is incomplete: header declares ${expected} record(s), only ${got} received.`, { retryable: true });
    }
    return { parsed, bytes: res.bytes };
  });
}

async function runTextList(ctx) {
  return withRetry(ctx, 'textlist', 'Text List export', async () => {
    const res = await httpGet(ctx, TEXTLIST_URL, { source: 'textlist', label: 'SUA Text List export', accept: 'text/csv, text/plain, */*' });
    const parsed = parseTextListCsv(res.text);
    // A nationwide list with zero usable rows is not a believable "nothing scheduled".
    if (parsed.entries.length === 0) {
      throw new FaaError('FORMAT', 'Text List export contained no usable schedule rows nationwide; treating it as unreliable.');
    }
    return { parsed, bytes: res.bytes };
  });
}

async function runPublic(ctx, names) {
  const uniqueNames = [...new Set(names.map(normalizeName))];
  const results = await mapLimit(uniqueNames, 3, async (name) => {
    try {
      const page = await withRetry(ctx, 'public', `page ${name}`, async () => {
        const url = new URL(PUBLIC_URL);
        url.searchParams.set('asname', name);
        const res = await httpGet(ctx, url.toString(), { source: 'public', label: `lkSched ${name}`, name, accept: 'text/html, */*' });
        return parseInteractingSchedules(res.text, name);
      }, 2);
      return { name, ...page };
    } catch (err) { return { name, error: err }; }
  });

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    const first = failed[0].error;
    const e = new FaaError(first.code || 'ERROR', `${failed.length} of ${results.length} FAA pages failed: ${first.message}`, { httpStatus: first.httpStatus, retryAfterMs: first.retryAfterMs });
    e.tries = first.tries;
    throw e;
  }
  const entries = results.flatMap((r) => r.entries);
  if (entries.length === 0) {
    throw new FaaError('NO_ROWS', `All ${results.length} public pages loaded but none listed a recognizable schedule row. ` +
      'This cannot be told apart from "page does not expose schedules", so no status is inferred from it.');
  }
  return { entries, results };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch schedules for the requested FAA airspace names.
 *   creds: { user, pwd } | null
 *   names: ["BROWNWOOD 4 MOA", ...]
 * Always resolves. Failure -> { ok:false, error, attempts, retryAfterMs? }.
 * Success -> see buildSuccess().
 */
async function fetchSchedules(opts) {
  const {
    creds, names, doFetch, timeoutMs = 20000, sleep = defaultSleep, random = Math.random,
    now = Date.now, skipGateway = false, tries = 3, deadlineMs = 90000, only = null,
  } = opts;
  const scrub = makeScrubber(creds);
  const startedAt = now();
  const ctx = {
    doFetch, timeoutMs, sleep, random, now, scrub, tries,
    deadline: startedAt + deadlineMs,
    log: (level, source, msg) => log(level, source, scrub(msg)),
  };

  const wantedKeys = new Set();
  for (const n of names) {
    wantedKeys.add(nameKey(n));
    wantedKeys.add(nameKey(n).split('|')[0] + '|?');
  }
  const regionWords = [...new Set([...names.map((n) => normalizeName(n).split(' ')[0]), ...EXTRA_REGION_WORDS])];
  const attempts = [];

  ctx.log('info', 'cycle', `Refresh started: ${names.length} airspace name(s), gateway login ${creds && creds.user ? 'configured' : 'not configured'}.`);

  const order = [];
  const allowed = (id) => !only || only.includes(id); // `only` is for the probe script: test one source in isolation
  if (creds && creds.user && creds.pwd && !skipGateway) { if (allowed('gateway')) order.push('gateway'); }
  else if (allowed('gateway')) {
    const why = skipGateway ? 'previous login was rejected; re-save the login to retry' : 'no FAA gateway login configured';
    attempts.push({ source: 'gateway', label: SOURCES.gateway.label, outcome: 'skipped', code: skipGateway ? 'AUTH_BLOCKED' : 'NO_CREDENTIALS', error: `Skipped: ${why}.` });
    ctx.log('info', 'gateway', `Skipped: ${why}.`);
  }
  if (allowed('textlist')) order.push('textlist');
  if (allowed('public')) order.push('public');

  for (const id of order) {
    if (now() > ctx.deadline) {
      attempts.push({ source: id, label: SOURCES[id].label, outcome: 'skipped', code: 'DEADLINE', error: 'Skipped: overall time budget for this refresh was used up.' });
      continue;
    }
    const t0 = now();
    try {
      let result;
      if (id === 'gateway') {
        const { parsed } = await runGateway(ctx, creds);
        result = finishNationwide(ctx, id, parsed, wantedKeys, regionWords, attempts, now);
        result.stats.declaredRecords = parsed.declaredCount !== null ? parsed.declaredCount - 3 : null;
        result.stats.skippedRecords = parsed.skipped;
        if (parsed.requestedAt) result.feedRequestedAt = parsed.requestedAt;
        if (parsed.generatedAt) result.feedGeneratedAt = parsed.generatedAt;
        applyFeedTimestamp(result, parsed, now);
        if (parsed.skipped) result.notes.push(`${parsed.skipped} unreadable record(s) skipped.`);
      } else if (id === 'textlist') {
        const { parsed } = await runTextList(ctx);
        result = finishNationwide(ctx, id, parsed, wantedKeys, regionWords, attempts, now);
        result.stats.columns = parsed.header;
        if (parsed.skipped) result.notes.push(`${parsed.skipped} unreadable row(s) skipped.`);
        if (parsed.ambiguous) result.notes.push(`${parsed.ambiguous} row(s) ignored: no MOA/ATCAA designation, so they cannot be attributed.`);
      } else {
        const { entries, results } = await runPublic(ctx, names);
        result = finishPerAirspace(ctx, id, entries, results, attempts, now);
      }
      lastSuccess = { source: id, fetchedAt: result.fetchedAt, asOf: result.asOf };
      ctx.log('info', 'cycle', `Refresh succeeded via ${id}: ${result.entries.length} matching schedule(s), ${now() - t0} ms.`);
      return result;
    } catch (err) {
      const e = err instanceof FaaError ? err : new FaaError('ERROR', scrub(err && err.message ? err.message : err));
      attempts.push({
        source: id, label: SOURCES[id].label, outcome: 'failed', code: e.code, httpStatus: e.httpStatus,
        tries: e.tries, durationMs: now() - t0, error: scrub(e.message),
      });
      ctx.log('error', id, `Source failed: ${e.code} - ${e.message}`);
      if (e.code === 'RATE_LIMIT') {
        ctx.log('warn', 'cycle', `Stopping this refresh: rate limited. Next attempt allowed after ${Math.ceil((e.retryAfterMs || 60000) / 1000)} s.`);
        return failure(attempts, scrub, e.retryAfterMs || 60000);
      }
    }
  }
  ctx.log('error', 'cycle', 'All FAA sources failed. No data will be displayed as current.');
  return failure(attempts, scrub);
}

function failure(attempts, scrub, retryAfterMs) {
  const real = attempts.filter((a) => a.outcome === 'failed');
  const summary = (real.length ? real : attempts).map((a) => `${a.source}: ${a.outcome === 'failed' ? `${a.code} - ` : ''}${a.error}`).join(' | ');
  return { ok: false, schemaVersion: 2, error: scrub(summary), attempts, finishedAt: Date.now(), retryAfterMs };
}

function applyFeedTimestamp(result, parsed, now) {
  // Use the dataset's own generation time as "as of", unless it is implausible.
  if (!parsed.generatedAt) return;
  const skew = parsed.generatedAt - result.fetchedAt;
  if (skew > 5 * 60000) {
    result.notes.push(`FAA feed timestamp is ${Math.round(skew / 60000)} min ahead of this computer's clock; using the local retrieval time. Check the system clock.`);
    return;
  }
  result.asOf = Math.min(parsed.generatedAt, result.fetchedAt);
  result.validFrom = result.asOf;
  result.validThrough = result.asOf + DAY_MS;
  const age = result.fetchedAt - parsed.generatedAt;
  if (age > 10 * 60000) result.notes.push(`FAA feed was generated ${Math.round(age / 60000)} min before it was retrieved.`);
}

function baseResult(id, now, attempts) {
  const fetchedAt = now();
  return {
    ok: true, schemaVersion: 2, source: id, sourceLabel: SOURCES[id].label,
    coverage: SOURCES[id].coverage, verification: SOURCES[id].verification,
    fetchedAt, asOf: fetchedAt, validFrom: fetchedAt,
    validThrough: SOURCES[id].coverage === 'nationwide-24h' ? fetchedAt + DAY_MS : null,
    entries: [], unmatched: [], notes: [], attempts: attempts.slice(), stats: {},
  };
}

function finishNationwide(ctx, id, parsed, wantedKeys, regionWords, attempts, now) {
  const result = baseResult(id, now, attempts);
  const { valid, rejected } = validateEntries(parsed.entries, result.fetchedAt);
  const { matched, unmatched } = matchEntries(valid, wantedKeys, regionWords);
  result.entries = matched;
  result.unmatched = unmatched;
  result.stats.totalFeedRecords = parsed.entries.length;
  result.stats.validRecords = valid.length;
  result.stats.rejected = summarizeRejected(rejected);
  if (rejected.length) ctx.log('info', id, `Validation dropped ${rejected.length} record(s): ${JSON.stringify(result.stats.rejected)}`);
  if (id !== 'gateway') result.notes.push('Read from the public FAA SUA website export (not the documented gateway). Add FAA gateway credentials in Settings for the official feed.');
  return result;
}

function finishPerAirspace(ctx, id, entries, results, attempts, now) {
  const result = baseResult(id, now, attempts);
  const { valid, rejected } = validateEntries(entries, result.fetchedAt);
  result.entries = valid;
  result.stats.pagesFetched = results.length;
  result.stats.rejected = summarizeRejected(rejected);
  result.notes.push('Read from the FAA SUA interacting-schedules pages. The layout of these pages is not documented and timestamps are ASSUMED to be Zulu; verify against sua.faa.gov before relying on them.');
  const foreign = results.reduce((s, r) => s + r.foreign, 0);
  if (foreign) result.notes.push(`${foreign} schedule line(s) for other airspaces ignored.`);
  result.samples = results.filter((r) => r.sampleLines && r.sampleLines.length).slice(0, 3)
    .map((r) => ({ name: r.name, lines: r.sampleLines }));
  return result;
}

module.exports = {
  FaaError, SOURCES, redact, makeScrubber, normalizeName, nameKey, withDesignation, parseGatewayTime,
  parseGeneratedStamp, parseGatewayFeed, parseCsv, parseTextListTime, parseTextListCsv,
  parseInteractingSchedules, validateEntries, backoffDelay, parseRetryAfter, fetchSchedules,
  getDiagnostics, resetDiagnostics, logEvent: log,
};
