/**
 * Run with:  node --test src/app/utils/*.test.ts   (Node 22.18+ strips the types)
 * All entries are SYNTHETIC test inputs; they say nothing about real FAA schedules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAirspace, computeLateAlerts, formatCT, ctParts, mergeWindows, STATUS_LABEL } from './schedule.ts';

const Z = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);
const entry = (name: string, start: number, end: number, status = 'W', lowAlt = '001', highAlt = '180') =>
  ({ scheduleId: '', airspaceId: '', status, name, start, end, lowAlt, highAlt });
const moa: any = { id: 'bw4', name: 'Brownwood 4', type: 'MOA', faaNames: ['BROWNWOOD 4 MOA'], status: 'inactive' };
const atcaa: any = { id: 'bw4a', name: 'Brownwood 4 ATCAA', type: 'ATCAA', faaNames: ['BROWNWOOD 4 ATCAA'], status: 'inactive' };
const NOW = Z(2026, 9, 30, 16, 0); // 11:00 AM CDT

test('inside an approved FAA window -> ACTIVE (SCHEDULED), with the FAA-filed altitudes', () => {
  const a = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW - 3600e3, NOW + 3600e3, 'H', '001', '180')], NOW, 'current');
  assert.equal(a.status, 'active');
  assert.equal(STATUS_LABEL[a.status], 'ACTIVE (SCHEDULED)');
  assert.equal(a.currentWindow!.hot, true);
  assert.equal(a.currentWindow!.lowAlt, '001');
  assert.equal(a.dataSource, 'faa');
});

test('current FAA list with no entry for the airspace -> NO SCHEDULE LISTED, never ACTIVE', () => {
  const a = resolveAirspace(moa, [entry('OWENS MOA', NOW - 3600e3, NOW + 3600e3)], NOW, 'current');
  assert.equal(a.status, 'inactive');
  assert.equal(STATUS_LABEL[a.status], 'NO SCHEDULE LISTED');
});

test('no data at all -> UNKNOWN (never inactive, never typical hours)', () => {
  const withTypical: any = { ...moa, scheduledStart: '14:00Z', scheduledEnd: '23:00Z' };
  for (const [entries, cur] of [[null, 'none'], [[], 'none'], [null, 'current']] as const) {
    const a = resolveAirspace(withTypical, entries as any, NOW, cur as any);
    assert.equal(a.status, 'unknown');
    assert.deepEqual(a.windows, []);
    assert.equal(a.dataSource, 'none');
  }
});

test('cached data is NEVER ACTIVE: status UNKNOWN, windows kept only as last-known', () => {
  const a = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW - 3600e3, NOW + 3600e3, 'H')], NOW, 'cached');
  assert.equal(a.status, 'unknown');
  assert.equal(a.currentWindow, undefined);
  assert.equal(a.dataSource, 'cached');
  assert.equal(a.lastKnownWindows!.length, 1);
});

test('pending (unapproved) schedule is never ACTIVE, even after its start time', () => {
  const a = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW - 3600e3, NOW + 3600e3, 'P')], NOW, 'current');
  assert.equal(a.status, 'scheduled');
  assert.equal(a.pending, true);
  assert.equal(a.currentWindow, undefined);
});

test('future window -> SCHEDULED with that window as next', () => {
  const a = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW + 7200e3, NOW + 14400e3)], NOW, 'current');
  assert.equal(a.status, 'scheduled');
  assert.equal(a.nextWindow!.start, NOW + 7200e3);
});

test('overnight window across Central midnight stays one window and is ACTIVE after local midnight', () => {
  // 2 PM CDT Sep 30 -> 1 AM CDT Oct 1  (19:00Z Sep 30 -> 06:00Z Oct 1): spans local midnight
  const e = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 19), Z(2026, 10, 1, 6, 0));
  const at = Z(2026, 10, 1, 5, 30); // 12:30 AM CDT Oct 1
  const a = resolveAirspace(moa, [e], at, 'current');
  assert.equal(a.status, 'active');
  assert.equal(formatCT(a.currentWindow!.end), '1:00 AM CDT');
});

test('several windows in one day are all kept; between them the airspace is SCHEDULED for the next', () => {
  const e1 = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 14), Z(2026, 9, 30, 15));
  const e2 = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 19), Z(2026, 9, 30, 22));
  const a = resolveAirspace(moa, [e2, e1], Z(2026, 9, 30, 16), 'current');
  assert.equal(a.status, 'scheduled');
  assert.equal(a.nextWindow!.start, Z(2026, 9, 30, 19));
  assert.equal(a.windows!.length, 1, 'the 14-15Z window is over and dropped');
  const b = resolveAirspace(moa, [e2, e1], Z(2026, 9, 30, 14, 30), 'current');
  assert.equal(b.status, 'active');
  assert.equal(b.windows!.length, 2);
});

test('back-to-back windows with identical altitudes merge; the countdown follows the whole run', () => {
  const e1 = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 14), Z(2026, 9, 30, 18));
  const e2 = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 18), Z(2026, 9, 30, 22));
  const a = resolveAirspace(moa, [e1, e2], Z(2026, 9, 30, 15), 'current');
  assert.equal(a.windows!.length, 1);
  assert.equal(a.currentWindow!.end, Z(2026, 9, 30, 22));
});

test('overlapping windows with DIFFERENT altitudes stay separate but "closes in" follows the latest end', () => {
  const low = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 14), Z(2026, 9, 30, 18), 'W', '001', '090');
  const high = entry('BROWNWOOD 4 MOA', Z(2026, 9, 30, 16), Z(2026, 9, 30, 23), 'W', '090', '180');
  const a = resolveAirspace(moa, [low, high], Z(2026, 9, 30, 17), 'current');
  assert.equal(a.windows!.length, 2);
  assert.equal(a.currentWindow!.end, Z(2026, 9, 30, 23));
});

test('an amended schedule replaces the old one (the feed is a snapshot; a cancelled entry simply disappears)', () => {
  const before = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW - 3600e3, NOW + 3600e3)], NOW, 'current');
  const after = resolveAirspace(moa, [entry('BROWNWOOD 4 MOA', NOW - 3600e3, NOW + 60e3)], NOW, 'current');
  const cancelled = resolveAirspace(moa, [], NOW, 'current');
  assert.equal(before.currentWindow!.end, NOW + 3600e3);
  assert.equal(after.currentWindow!.end, NOW + 60e3);
  assert.equal(cancelled.status, 'inactive');
});

test('MOA and the ATCAA above it are different airspaces: one never drives the other', () => {
  const entries = [entry('BROWNWOOD 4 ATCAA', NOW - 3600e3, NOW + 3600e3, 'H', '180', '600')];
  assert.equal(resolveAirspace(moa, entries, NOW, 'current').status, 'inactive');
  const a = resolveAirspace(atcaa, entries, NOW, 'current');
  assert.equal(a.status, 'active');
  assert.equal(a.currentWindow!.lowAlt, '180');
  assert.equal(a.currentWindow!.highAlt, '600');
});

test('mergeWindows never merges pending with approved', () => {
  const m = mergeWindows([
    { start: 0, end: 10, pending: false }, { start: 5, end: 20, pending: true },
  ]);
  assert.equal(m.length, 2);
});

/* ---------- Central time (CST/CDT) ---------- */

test('UTC -> America/Chicago across the spring DST change (2026-03-08 08:00Z)', () => {
  assert.equal(formatCT(Z(2026, 3, 8, 7, 59)), '1:59 AM CST');
  assert.equal(formatCT(Z(2026, 3, 8, 8, 0)), '3:00 AM CDT');
});

test('UTC -> America/Chicago across the autumn DST change (2026-11-01 07:00Z)', () => {
  assert.equal(formatCT(Z(2026, 11, 1, 6, 30)), '1:30 AM CDT');
  assert.equal(formatCT(Z(2026, 11, 1, 7, 30)), '1:30 AM CST');
});

test('typical Zulu windows convert correctly in summer and winter', () => {
  assert.equal(formatCT(Z(2026, 7, 15, 14, 0)), '9:00 AM CDT'); // 14Z in July
  assert.equal(formatCT(Z(2026, 1, 15, 14, 0)), '8:00 AM CST'); // 14Z in January
  assert.deepEqual(ctParts(Z(2026, 10, 1, 5, 30)), { y: 2026, mo: 10, d: 1, h: 0, mi: 30 });
});

/* ---------- late alerts ---------- */

test('late alerts come only from current FAA data, never cached or unknown', () => {
  const lateEnd = Z(2026, 10, 1, 4, 30); // 11:30 PM CDT
  const e = entry('BROWNWOOD 4 MOA', NOW - 3600e3, lateEnd, 'H');
  const cur = resolveAirspace(moa, [e], NOW, 'current');
  const cached = resolveAirspace(moa, [e], NOW, 'cached');
  assert.equal(computeLateAlerts([cur], NOW, 22).length, 1);
  assert.equal(computeLateAlerts([cached], NOW, 22).length, 0);
  assert.equal(computeLateAlerts([resolveAirspace(moa, null, NOW, 'none')], NOW, 22).length, 0);
});
