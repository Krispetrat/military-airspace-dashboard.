'use strict';
/**
 * FAA retrieval tests.
 *
 * IMPORTANT: every fixture below is SYNTHETIC. The gateway sample is copied from
 * the FAA's own format document (https://sua.faa.gov/ops/docs/suagwDataFmt.html);
 * the Text List CSV and public-page fixtures are hand-built from the layout a
 * third-party client documents / the header row seen on the live page. None of
 * this proves the live FAA endpoints work: run `npm run faa:probe` for that.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const faa = require('./faa.cjs');

const NOW = Date.UTC(2026, 8, 30, 15, 0); // 2026-09-30 15:00Z, injected so fixtures never "expire"
const clock = () => NOW;
const noSleep = async () => {};
const resp = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => body,
});

// Sample dataset taken from the FAA's gateway format description.
const FAA_SPEC_SAMPLE = [
  '[24] Mon May 24 13:24:25 2021 UTC',
  '# This site is informational in nature and is designed to assist pilots.',
  '#[24/May/2021:13:24:00 +0000]',
  '5937728|3865|W|M|LIVE OAK MOA|2021/0525 13:00|2021/0525 21:30|080|180|A',
  '5950031|5300|W|M|LUCIN A MOA|2021/0525 13:00|2021/0526 06:00|001|090|A',
  '5723021|2106|W|M|OWENS MOA|2021/0525 13:00|2021/0526 01:00|002|180|A',
  '5951225|14178|H|V|VR1020|2021/0524 13:00|2021/0524 20:00|A|E|A',
  '# This site is informational in nature and is designed to assist pilots.',
].join('\r\n');

const gatewayFeed = (rows, count) => [
  `[${count ?? rows.length + 3}] Wed Sep 30 14:59:30 2026 UTC`, '# disclaimer', '#[30/Sep/2026:14:59:00 +0000]',
  ...rows, '# disclaimer',
].join('\r\n');

const BW4 = '1|1|H|M|BROWNWOOD 4 MOA|2026/0930 14:00|2026/0930 22:00|001|180|A';
const BW4A = '2|2|W|A|BROWNWOOD 4 ATCAA|2026/0930 14:00|2026/0930 22:00|180|600|A';
const BW9 = '3|3|W|M|BROWNWOOD 9 MOA|2026/0930 14:00|2026/0930 22:00|001|180|A';
const OWENS = '4|4|W|M|OWENS MOA|2026/0930 14:00|2026/0930 22:00|001|180|A';
const RIV = '5|5|W|M|RIVERS 1 MOA|2026/0930 14:00|2026/0930 22:00|001|180|A';

/* ---------------- gateway parser ---------------- */

test('gateway: parses the FAA spec sample', () => {
  const r = faa.parseGatewayFeed(FAA_SPEC_SAMPLE);
  assert.equal(r.declaredCount, 24);
  assert.equal(r.entries.length, 4);
  const live = r.entries[0];
  assert.equal(live.name, 'LIVE OAK MOA');
  assert.equal(live.type, 'M');
  assert.equal(live.status, 'W');
  assert.equal(live.start, Date.UTC(2021, 4, 25, 13, 0));
  assert.equal(live.end, Date.UTC(2021, 4, 25, 21, 30));
  assert.equal(live.lowAlt, '080');
  assert.equal(live.highAlt, '180');
});

test('gateway: reads the request and generation timestamps from the header lines', () => {
  const r = faa.parseGatewayFeed(FAA_SPEC_SAMPLE);
  assert.equal(r.requestedAt, Date.UTC(2021, 4, 24, 13, 24, 25));
  assert.equal(r.generatedAt, Date.UTC(2021, 4, 24, 13, 24, 0));
});

test('gateway: schedule that crosses midnight UTC keeps the right end date', () => {
  const r = faa.parseGatewayFeed(FAA_SPEC_SAMPLE);
  assert.equal(r.entries.find((e) => e.name === 'OWENS MOA').end, Date.UTC(2021, 4, 26, 1, 0));
});

test('gateway: route (MTR) records do not report entry/exit letters as altitudes', () => {
  const route = faa.parseGatewayFeed(FAA_SPEC_SAMPLE).entries.find((e) => e.name === 'VR1020');
  assert.equal(route.lowAlt, undefined);
  assert.equal(route.highAlt, undefined);
});

test('gateway: ignores comments, blank lines and malformed records without throwing', () => {
  const text = [
    '[5] Mon May 24 13:24:25 2021 UTC', '', '# comment', 'garbage line',
    '1|2|W|M|GOOD MOA|2021/0525 13:00|2021/0525 14:00|001|180|A',
    '1|2|W|M|BAD DATE MOA|2021/13/99 13:00|2021/0525 14:00|001|180|A',
    '1|2|W|M|END BEFORE START MOA|2021/0525 15:00|2021/0525 14:00|001|180|A',
  ].join('\n');
  const r = faa.parseGatewayFeed(text);
  assert.equal(r.entries.length, 1);
  assert.equal(r.skipped, 3);
});

test('gateway: an HTML/login page is rejected, not treated as "no schedules"', () => {
  assert.throws(() => faa.parseGatewayFeed('<html><body>Please log in</body></html>'), /not an SUA gateway dataset/);
});

test('gateway: a valid but empty dataset parses to zero entries', () => {
  const r = faa.parseGatewayFeed('[3] Mon May 24 13:24:25 2021 UTC\n# a\n#[24/May/2021:13:24:00 +0000]\n# b\n');
  assert.equal(r.entries.length, 0);
  assert.equal(r.declaredCount, 3);
});

/* ---------------- names / redaction ---------------- */

test('name matching ignores punctuation, case and a missing MOA/ATCAA suffix', () => {
  assert.equal(faa.nameKey('Brownwood 4 MOA'), faa.nameKey('BROWNWOOD  4', 'M'));
  assert.notEqual(faa.nameKey('BROWNWOOD 4 MOA'), faa.nameKey('BROWNWOOD 4 ATCAA'));
});

test('withDesignation: adds the suffix from the type, refuses ambiguous names', () => {
  assert.equal(faa.withDesignation('Brownwood 4', 'M'), 'BROWNWOOD 4 MOA');
  assert.equal(faa.withDesignation('BROWNWOOD 4', 'A'), 'BROWNWOOD 4 ATCAA');
  assert.equal(faa.withDesignation('BROWNWOOD 4 MOA', undefined), 'BROWNWOOD 4 MOA');
  assert.equal(faa.withDesignation('BROWNWOOD 4', undefined), null);
});

test('redact removes credentials from error text', () => {
  const s = faa.redact('failed https://x/y?user=bob&pwd=hunter2 done');
  assert.ok(!s.includes('hunter2') && !s.includes('bob'));
});

/* ---------------- validation ---------------- */

test('validateEntries: drops malformed, impossible and already-ended records, keeps the rest', () => {
  const ok = { name: 'A MOA', start: NOW - 3600e3, end: NOW + 3600e3 };
  const { valid, rejected } = faa.validateEntries([
    ok,
    { name: '', start: NOW, end: NOW + 1 },
    { name: 'B MOA', start: NaN, end: NOW },
    { name: 'C MOA', start: NOW + 10, end: NOW },
    { name: 'D MOA', start: NOW - 3600e3, end: NOW - 1000 },
    { name: 'E MOA', start: NOW, end: NOW + 30 * 86400e3 },
  ], NOW);
  assert.deepEqual(valid, [ok]);
  assert.deepEqual(rejected.map((r) => r.reason).sort(),
    ['already ended', 'end not after start', 'missing airspace name', 'unparseable time', 'window longer than 14 days']);
});

/* ---------------- Text List CSV ---------------- */

const CSV_HEADER = ',Type,Zoom,SAA / NOTAM ID,Start Time,End Time,Center ID,State,Min Alt (100s ft),Max Alt (100s ft),Group';
const csv = (...rows) => [CSV_HEADER, ...rows].join('\r\n');

test('textlist csv: parses rows, adds MOA/ATCAA designation from the Type column, Zulu times', () => {
  const r = faa.parseTextListCsv(csv(
    ',MOA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A',
    ',ATCAA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,180,600,A',
    ',MOA,,"=""BRADY NORTH MOA""",09/30/2026 19:00,10/01/2026 01:00,ZFW,TX,036,180,A',
  ));
  assert.deepEqual(r.entries.map((e) => e.name), ['BROWNWOOD 4 MOA', 'BROWNWOOD 4 ATCAA', 'BRADY NORTH MOA']);
  assert.equal(r.entries[0].start, Date.UTC(2026, 8, 30, 14, 0));
  assert.equal(r.entries[2].end, Date.UTC(2026, 9, 1, 1, 0)); // overnight, crosses UTC midnight
  assert.equal(r.entries[1].lowAlt, '180');
  assert.equal(r.entries[1].highAlt, '600');
});

test('textlist csv: rows with no MOA/ATCAA designation are ambiguous and never attributed', () => {
  const r = faa.parseTextListCsv(csv(',,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A',
    ',MOA,,OWENS,09/30/2026 14:00,09/30/2026 22:00,ZLA,CA,001,180,A'));
  assert.equal(r.ambiguous, 1);
  assert.deepEqual(r.entries.map((e) => e.name), ['OWENS MOA']);
});

test('textlist csv: a web page, an empty body and an unknown layout all fail loudly', () => {
  assert.throws(() => faa.parseTextListCsv('<html>Service unavailable</html>'), /web page/);
  assert.throws(() => faa.parseTextListCsv(''), /empty/);
  assert.throws(() => faa.parseTextListCsv('a,b,c\n1,2,3\n'), /no recognizable header/);
  assert.throws(() => faa.parseTextListCsv(csv(',MOA,,X,not a date,also not,ZFW,TX,1,2,A')), /none could be parsed/);
});

/* ---------------- public page parser ---------------- */

test('public page: a header-only page parses to zero entries (and is NOT proof of inactivity)', () => {
  const html = '<html><head><title>Interacting Schedules</title></head><body><table><tr><td>Schedules that interact with airspace BROWNWOOD 3 MOA:</td></tr></table></body></html>';
  assert.equal(faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA').entries.length, 0);
});

test('public page: reads schedule lines that name the requested airspace', () => {
  const html = `<ul><li>Schedules that interact with airspace BROWNWOOD 3 MOA:</li>
    <li>BROWNWOOD 3 MOA 09/30/2026 14:00 09/30/2026 22:00</li></ul>`;
  const r = faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA');
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].start, Date.UTC(2026, 8, 30, 14, 0));
  assert.equal(r.entries[0].end, Date.UTC(2026, 8, 30, 22, 0));
});

test('public page: lines naming a different airspace are not attributed to this one', () => {
  const html = `<li>Schedules that interact with airspace BROWNWOOD 3 MOA:</li>
    <li>R-6302 2026/0930 14:00 2026/0930 22:00</li>`;
  const r = faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA');
  assert.equal(r.entries.length, 0);
  assert.equal(r.foreign, 1);
});

test('public page: an overlying ATCAA row is not credited to the MOA', () => {
  const html = '<li>BROWNWOOD 3 ATCAA 2026/0930 14:00 2026/0930 22:00</li>';
  const r = faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA');
  assert.equal(r.entries.length, 0);
  assert.equal(r.foreign, 1);
});

test('public page: schedule-like content we cannot parse FAILS instead of reporting "closed"', () => {
  const html = '<li>Schedules that interact with airspace BROWNWOOD 3 MOA:</li><li>Active until 22Z tomorrow 14:00</li>';
  assert.throws(() => faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA'), /could not be parsed/);
});

test('public page: a timed row we cannot tie to any airspace FAILS rather than guessing', () => {
  const html = '<li>Some activity 2026/0930 14:00 2026/0930 22:00</li>';
  assert.throws(() => faa.parseInteractingSchedules(html, 'BROWNWOOD 3 MOA'), /could not be parsed or attributed/);
});

/* ---------------- retry / backoff helpers ---------------- */

test('backoffDelay grows exponentially, is capped, and jitters within +/-25%', () => {
  const mid = () => 0.5;
  assert.equal(faa.backoffDelay(1, mid), 1000);
  assert.equal(faa.backoffDelay(2, mid), 2000);
  assert.equal(faa.backoffDelay(3, mid), 4000);
  assert.equal(faa.backoffDelay(9, mid), 8000);
  assert.equal(faa.backoffDelay(1, () => 0), 750);
  assert.equal(faa.backoffDelay(1, () => 1), 1250);
});

test('parseRetryAfter understands seconds and HTTP dates', () => {
  assert.equal(faa.parseRetryAfter('30', NOW), 30000);
  assert.equal(faa.parseRetryAfter(new Date(NOW + 90000).toUTCString(), NOW), 90000);
  assert.equal(faa.parseRetryAfter('garbage', NOW), undefined);
});

/* ---------------- orchestration ---------------- */

test('gateway success filters to requested airspaces and lists unmapped regional names (incl. RIVERS)', async () => {
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA', 'BROWNWOOD 4 ATCAA'], now: clock,
    doFetch: async () => resp(200, gatewayFeed([BW4, BW4A, BW9, OWENS, RIV])),
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'gateway');
  assert.equal(r.coverage, 'nationwide-24h');
  assert.deepEqual(r.entries.map((e) => e.name).sort(), ['BROWNWOOD 4 ATCAA', 'BROWNWOOD 4 MOA']);
  assert.deepEqual(r.unmatched.sort(), ['BROWNWOOD 9 MOA', 'RIVERS 1 MOA']);
  assert.equal(r.entries.find((e) => e.name === 'BROWNWOOD 4 MOA').status, 'H');
});

test('gateway success: asOf is the feed generation time and validity runs 24 h from it', async () => {
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock,
    doFetch: async () => resp(200, gatewayFeed([BW4])),
  });
  const gen = Date.UTC(2026, 8, 30, 14, 59, 0);
  assert.equal(r.feedGeneratedAt, gen);
  assert.equal(r.asOf, gen);
  assert.equal(r.validFrom, gen);
  assert.equal(r.validThrough, gen + 86400e3);
  assert.equal(r.fetchedAt, NOW);
});

test('gateway success: an old feed timestamp is reported, a future one falls back to local time', async () => {
  const old = gatewayFeed([BW4]).replace('#[30/Sep/2026:14:59:00 +0000]', '#[30/Sep/2026:14:30:00 +0000]');
  const r1 = await faa.fetchSchedules({ creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock, doFetch: async () => resp(200, old) });
  assert.equal(r1.asOf, Date.UTC(2026, 8, 30, 14, 30));
  assert.ok(r1.notes.some((n) => /30 min before/.test(n)));
  const fut = gatewayFeed([BW4]).replace('#[30/Sep/2026:14:59:00 +0000]', '#[30/Sep/2026:16:30:00 +0000]');
  const r2 = await faa.fetchSchedules({ creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock, doFetch: async () => resp(200, fut) });
  assert.equal(r2.asOf, NOW);
  assert.ok(r2.notes.some((n) => /ahead of this computer/.test(n)));
});

test('gateway: a truncated feed (fewer records than declared) is retried, then fails; it is never accepted', async () => {
  let calls = 0;
  const waits = [];
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock, random: () => 0.5,
    sleep: async (ms) => { waits.push(ms); },
    doFetch: async (url) => { if (!url.includes('datafeed')) return resp(404, 'nope'); calls++; return resp(200, gatewayFeed([BW4], 50)); },
  });
  assert.equal(r.ok, false);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(r.attempts.find((a) => a.source === 'gateway').code, 'INCOMPLETE');
});

test('retry: HTTP 503 twice then success -> ok, with exponential waits between attempts', async () => {
  let calls = 0;
  const waits = [];
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock, random: () => 0.5,
    sleep: async (ms) => { waits.push(ms); },
    doFetch: async () => (++calls < 3 ? resp(503, 'busy') : resp(200, gatewayFeed([BW4]))),
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'gateway');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('retry: a wrong login is NOT retried (avoids account lockout) and falls through', async () => {
  const calls = [];
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'wrongpass' }, names: ['BROWNWOOD 4 MOA'], now: clock, sleep: noSleep,
    doFetch: async (url) => { calls.push(url); return url.includes('datafeed') ? resp(401, 'denied') : resp(200, csv(',MOA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A')); },
  });
  assert.equal(calls.filter((u) => u.includes('datafeed')).length, 1);
  assert.equal(r.ok, true);
  assert.equal(r.source, 'textlist');
  assert.equal(r.attempts[0].source, 'gateway');
  assert.equal(r.attempts[0].code, 'AUTH');
});

test('skipGateway: a previously rejected login is not sent again', async () => {
  const calls = [];
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'wrongpass' }, names: ['BROWNWOOD 4 MOA'], now: clock, sleep: noSleep, skipGateway: true,
    doFetch: async (url) => { calls.push(url); return resp(200, csv(',MOA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A')); },
  });
  assert.ok(!calls.some((u) => u.includes('datafeed')));
  assert.equal(r.attempts[0].code, 'AUTH_BLOCKED');
});

test('rate limit: HTTP 429 stops the whole refresh at once and reports when to retry', async () => {
  const calls = [];
  const r = await faa.fetchSchedules({
    creds: null, names: ['BROWNWOOD 4 MOA'], now: clock, sleep: noSleep,
    doFetch: async (url) => { calls.push(url); return resp(429, 'slow down', { 'retry-after': '120' }); },
  });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1, 'must not hammer other endpoints after a 429');
  assert.equal(r.retryAfterMs, 120000);
  assert.equal(r.attempts.find((a) => a.code === 'RATE_LIMIT').httpStatus, 429);
});

test('timeout: a hung request is aborted and reported as TIMEOUT', async () => {
  const r = await faa.fetchSchedules({
    creds: null, names: ['BROWNWOOD 4 MOA'], now: Date.now, sleep: noSleep, timeoutMs: 20, tries: 1,
    doFetch: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); })),
  });
  assert.equal(r.ok, false);
  assert.ok(r.attempts.some((a) => a.code === 'TIMEOUT'));
});

test('fallback: gateway down -> the public Text List export supplies real windows, labelled as such', async () => {
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA', 'BROWNWOOD 4 ATCAA', 'BRADY NORTH MOA'], now: clock, sleep: noSleep, tries: 1,
    doFetch: async (url) => url.includes('datafeed') ? resp(500, 'boom') : resp(200, csv(
      ',MOA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A',
      ',ATCAA,,BROWNWOOD 4,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,180,600,A',
      ',MOA,,RIVERS 2,09/30/2026 14:00,09/30/2026 22:00,ZFW,TX,001,180,A')),
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'textlist');
  assert.equal(r.verification, 'undocumented');
  assert.equal(r.attempts[0].source, 'gateway');
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.unmatched, ['RIVERS 2 MOA']);
  assert.equal(r.entries[0].status, '?', 'the export carries no schedule status; we must not invent one');
});

test('public pages: loading fine but showing zero rows everywhere is a FAILURE, not "nothing scheduled"', async () => {
  const empty = '<html><body><table><tr><td>Schedules that interact with airspace X:</td></tr></table></body></html>';
  const r = await faa.fetchSchedules({
    creds: null, names: ['BROWNWOOD 3 MOA', 'BROWNWOOD 4 MOA'], now: clock, sleep: noSleep, tries: 1,
    doFetch: async (url) => (url.includes('lkSched') ? resp(200, empty) : resp(404, 'not found')),
  });
  assert.equal(r.ok, false);
  assert.equal(r.entries, undefined, 'a failed refresh must carry no schedule data');
  assert.ok(r.attempts.some((a) => a.source === 'public' && a.code === 'NO_ROWS'));
});

test('public pages: real rows are accepted as the last resort, labelled per-airspace/unverified', async () => {
  const r = await faa.fetchSchedules({
    creds: null, names: ['BROWNWOOD 3 MOA'], now: clock, sleep: noSleep, tries: 1,
    doFetch: async (url) => (url.includes('lkSched')
      ? resp(200, '<ul><li>BROWNWOOD 3 MOA 09/30/2026 14:00 09/30/2026 22:00</li></ul>') : resp(404, 'x')),
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'public');
  assert.equal(r.coverage, 'per-airspace');
  assert.equal(r.validThrough, null, 'the public pages do not state a validity period');
  assert.equal(r.entries.length, 1);
});

test('no fabrication: network down everywhere returns ok:false with no entries and every source listed', async () => {
  const r = await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 3 MOA', 'BROWNWOOD 4 MOA'], now: clock, sleep: noSleep, tries: 1,
    doFetch: async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.entries, undefined);
  assert.deepEqual(r.attempts.map((a) => a.source), ['gateway', 'textlist', 'public']);
  assert.ok(r.attempts.every((a) => a.code === 'NETWORK'));
  assert.match(r.error, /Could not reach the FAA/);
});

test('credentials never appear in results, logs or captured raw responses', async () => {
  faa.resetDiagnostics();
  const creds = { user: 'alice-the-user', pwd: 'S3cret!pass' };
  const echoing = `[3] Wed Sep 30 14:59:30 2026 UTC\n# echo user=alice-the-user&pwd=S3cret!pass\n#[30/Sep/2026:14:59:00 +0000]\n# S3cret!pass\n`;
  const r1 = await faa.fetchSchedules({ creds, names: ['BROWNWOOD 3 MOA'], now: clock, sleep: noSleep, tries: 1, doFetch: async (url) => resp(200, echoing + url) });
  const r2 = await faa.fetchSchedules({ creds, names: ['BROWNWOOD 3 MOA'], now: clock, sleep: noSleep, tries: 1, doFetch: async (url) => { throw new Error(`fetch failed for ${url}`); } });
  const blob = JSON.stringify([r1, r2, faa.getDiagnostics()]);
  assert.ok(!blob.includes('S3cret'), 'password leaked');
  assert.ok(!blob.includes('alice-the-user'), 'username leaked');
});

test('diagnostics: log records attempts and HTTP results; raw response is retrievable for inspection', async () => {
  faa.resetDiagnostics();
  await faa.fetchSchedules({
    creds: { user: 'abcd', pwd: 'p4ssw0rd' }, names: ['BROWNWOOD 4 MOA'], now: clock, sleep: noSleep, tries: 1,
    doFetch: async () => resp(200, gatewayFeed([BW4]), { 'content-type': 'text/plain' }),
  });
  const d = faa.getDiagnostics();
  assert.ok(d.log.some((l) => /HTTP 200/.test(l.msg)));
  assert.ok(d.log.some((l) => /Refresh succeeded via gateway/.test(l.msg)));
  assert.equal(d.raw.gateway.httpStatus, 200);
  assert.equal(d.raw.gateway.headers['content-type'], 'text/plain');
  assert.match(d.raw.gateway.text, /BROWNWOOD 4 MOA/);
  assert.equal(d.lastSuccess.source, 'gateway');
  assert.ok(d.raw.gateway.url.includes('user=***'));
});
