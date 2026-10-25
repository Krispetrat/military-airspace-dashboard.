import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFaaState, nextRefreshDelay, formatCountdown, formatAge, FRESH_MS, CACHE_MAX_MS } from './faaState.ts';

const NOW = Date.UTC(2026, 9, 21, 18, 0);
const res = (ageMs: number, source: any = 'gateway'): any => ({ ok: true, source, fetchedAt: NOW - ageMs, asOf: NOW - ageMs, entries: [] });
const MIN = 60e3;

test('no data yet: connecting (gray) while loading, disconnected (red + banner) otherwise', () => {
  assert.deepEqual(deriveFaaState({ result: null, origin: null, loading: true, now: NOW }).state, 'loading');
  assert.equal(deriveFaaState({ result: null, origin: null, loading: true, now: NOW }).showBanner, false);
  const off = deriveFaaState({ result: null, origin: null, loading: false, now: NOW });
  assert.equal(off.state, 'offline'); assert.equal(off.showBanner, true); assert.equal(off.currency, 'none');
});

test('first attempt failed and a retry is running: still red with banner (no flip back to gray)', () => {
  const d = deriveFaaState({ result: null, origin: null, lastError: 'x', loading: true, now: NOW });
  assert.equal(d.state, 'offline'); assert.equal(d.showBanner, true);
});

test('fresh network data, last refresh ok -> green, current, no banner', () => {
  const d = deriveFaaState({ result: res(1 * MIN), origin: 'network', loading: false, now: NOW });
  assert.deepEqual([d.state, d.currency, d.showBanner], ['live', 'current', false]);
});

test('a background refresh while holding fresh data does not flicker to "connecting"', () => {
  assert.equal(deriveFaaState({ result: res(1 * MIN), origin: 'network', loading: true, now: NOW }).state, 'live');
});

test('latest refresh failed but data still inside its freshness limit -> yellow + banner, still current', () => {
  const d = deriveFaaState({ result: res(3 * MIN), origin: 'network', lastError: 'boom', loading: false, now: NOW });
  assert.deepEqual([d.state, d.currency, d.showBanner], ['stale', 'current', true]);
});

test('network data older than its freshness limit -> yellow, CACHED (never current), banner', () => {
  const d = deriveFaaState({ result: res(FRESH_MS.gateway + MIN), origin: 'network', lastError: 'boom', loading: false, now: NOW });
  assert.deepEqual([d.state, d.currency, d.showBanner], ['stale', 'cached', true]);
});

test('uses the feed\'s own age, not just when we fetched it', () => {
  const r: any = { ok: true, source: 'gateway', fetchedAt: NOW - 10e3, asOf: NOW - 20 * MIN, entries: [] };
  const d = deriveFaaState({ result: r, origin: 'network', loading: false, now: NOW });
  assert.equal(d.currency, 'cached');
});

test('data restored from the previous session is CACHED even if recent, and is never green', () => {
  const connecting = deriveFaaState({ result: res(1 * MIN), origin: 'cache', loading: true, now: NOW });
  assert.deepEqual([connecting.state, connecting.currency, connecting.showBanner], ['loading', 'cached', false]);
  const failed = deriveFaaState({ result: res(1 * MIN), origin: 'cache', lastError: 'boom', loading: false, now: NOW });
  assert.deepEqual([failed.state, failed.currency, failed.showBanner], ['stale', 'cached', true]);
});

test('the banner is never hidden just because a cache exists', () => {
  const d = deriveFaaState({ result: res(30 * MIN), origin: 'cache', lastError: 'offline', loading: false, now: NOW });
  assert.equal(d.showBanner, true);
});

test('data older than the cache limit is discarded: red', () => {
  const d = deriveFaaState({ result: res(CACHE_MAX_MS + MIN), origin: 'network', lastError: 'x', loading: false, now: NOW });
  assert.deepEqual([d.state, d.currency, d.showBanner], ['offline', 'none', true]);
});

test('a source-specific freshness limit applies (gateway 6 min, public export 12 min)', () => {
  assert.equal(deriveFaaState({ result: res(8 * MIN, 'gateway'), origin: 'network', loading: false, now: NOW }).currency, 'cached');
  assert.equal(deriveFaaState({ result: res(8 * MIN, 'textlist'), origin: 'network', loading: false, now: NOW }).currency, 'current');
});

test('refresh cadence: 2 min gateway, 5 min public; exponential backoff on failure, capped; Retry-After honoured', () => {
  assert.equal(nextRefreshDelay({ source: 'gateway', failures: 0 }), 2 * MIN);
  assert.equal(nextRefreshDelay({ source: 'textlist', failures: 0 }), 5 * MIN);
  assert.equal(nextRefreshDelay({ failures: 0 }), 2 * MIN);
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((f) => nextRefreshDelay({ failures: f })), [30e3, 60e3, 120e3, 240e3, 300e3, 300e3]);
  assert.equal(nextRefreshDelay({ failures: 1, retryAfterMs: 10 * MIN }), 10 * MIN);
});

test('formatters', () => {
  assert.equal(formatCountdown(102e3), '1:42');
  assert.equal(formatCountdown(-5), '0:00');
  assert.equal(formatAge(35e3), '35 s ago');
  assert.equal(formatAge(4 * MIN), '4 min ago');
  assert.equal(formatAge(125 * MIN), '2 h 5 min ago');
});
