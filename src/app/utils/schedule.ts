/**
 * Schedule logic: turns raw FAA schedule entries (absolute UTC start/end
 * timestamps) into per-airspace status, and detects airspace that will be
 * open late at night.
 *
 * All display times are America/Chicago, matching the dashboard's region.
 *
 * NOTHING HERE ESTIMATES ANYTHING. An airspace's status comes only from FAA
 * schedule entries that were retrieved recently by this app:
 *
 *   active    = an approved FAA schedule window contains "now" (SCHEDULED
 *               activation; it does NOT confirm aircraft are in the airspace)
 *   scheduled = an approved window starts later, or the only window is pending
 *   inactive  = the current FAA list contains no schedule for it. This is
 *               "no schedule listed", never a confirmation that it is quiet
 *               (key kept for compatibility; shown as NO SCHEDULE LISTED)
 *   unknown   = no current FAA data (disconnected, stale, or only cached)
 */
import type { Airspace } from '../components/AirspaceMap';
import type { FaaEntry } from '../services/faaData';
import type { Currency } from './faaState';

export type AirspaceStatus = 'active' | 'scheduled' | 'inactive' | 'unknown';

/** What the UI prints for each status. */
export const STATUS_LABEL: Record<AirspaceStatus, string> = {
  active: 'ACTIVE (SCHEDULED)',
  scheduled: 'SCHEDULED',
  inactive: 'NO SCHEDULE LISTED',
  unknown: 'UNKNOWN',
};

export interface ScheduleWindow {
  start: number; // epoch ms
  end: number;   // epoch ms
  pending: boolean; // FAA status "P": entered but not yet approved
  hot?: boolean;    // FAA status "H": the FAA has marked it activated
  lowAlt?: string;  // hundreds of feet, as filed
  highAlt?: string;
}

const TZ = 'America/Chicago';
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------------------------------------------------------------- */
/* Central-time helpers                                              */
/* ---------------------------------------------------------------- */

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });

export function ctParts(ms: number) {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}

const ctDayNumber = (ms: number) => {
  const { y, mo, d } = ctParts(ms);
  return Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
};

/** "10:00 PM CDT" */
export const formatCT = (ms: number) => timeFmt.format(new Date(ms));

/** "today" | "tomorrow" | "Fri" | "yesterday" relative to `now`, by Central calendar day. */
export function ctDayLabel(ms: number, now: number): string {
  const diff = ctDayNumber(ms) - ctDayNumber(now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return weekdayFmt.format(new Date(ms));
}

/** "4h 12m" / "12m" / "45s" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

/** FAA altitudes are hundreds of feet: "180" -> "FL180", "008" -> "800 ft". */
export function formatFiledAltitude(hundreds?: string): string | null {
  if (!hundreds || !/^\d+$/.test(hundreds)) return null;
  const n = parseInt(hundreds, 10);
  return n >= 180 ? `FL${String(n).padStart(3, '0')}` : `${(n * 100).toLocaleString('en-US')} ft`;
}

/* ---------------------------------------------------------------- */
/* Windows                                                           */
/* ---------------------------------------------------------------- */

/**
 * Sort windows and merge ones that overlap or touch AND are the same kind
 * (same approval state and same filed altitudes). Windows that differ (an
 * amended altitude block, a pending vs approved schedule) stay separate so
 * nothing the FAA filed is hidden.
 */
export function mergeWindows(windows: ScheduleWindow[]): ScheduleWindow[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: ScheduleWindow[] = [];
  for (const w of sorted) {
    const same = out.find(
      (o) => o.pending === w.pending && o.lowAlt === w.lowAlt && o.highAlt === w.highAlt && w.start <= o.end
    );
    if (same) {
      same.end = Math.max(same.end, w.end);
      same.hot = same.hot || w.hot;
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

/** End of the continuous approved activity that contains `now`, following chained/overlapping windows. */
function continuousEnd(windows: ScheduleWindow[], first: ScheduleWindow): number {
  let end = first.end;
  for (let changed = true; changed; ) {
    changed = false;
    for (const w of windows) {
      if (!w.pending && w.start <= end && w.end > end) { end = w.end; changed = true; }
    }
  }
  return end;
}

export function windowsFromEntries(airspace: Airspace, entries: FaaEntry[]): ScheduleWindow[] {
  const keys = new Set((airspace.faaNames ?? []).map(nameKey));
  return entries
    .filter((e) => keys.has(nameKey(e.name)))
    .map((e) => ({
      start: e.start, end: e.end, pending: e.status === 'P', hot: e.status === 'H',
      lowAlt: e.lowAlt, highAlt: e.highAlt,
    }));
}

export function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Matches names regardless of a trailing MOA/ATCAA suffix. */
export function nameKey(name: string): string {
  return normalizeName(name).replace(/ (MOA|ATCAA)$/, '') + '|' + (/ ATCAA$/.test(normalizeName(name)) ? 'A' : 'M');
}

/**
 * Compute an airspace's state from FAA entries.
 *
 *   currency 'current' : entries are fresh FAA data -> real status.
 *   currency 'cached'  : entries are old/last-session data -> status is UNKNOWN;
 *                        the windows are kept only as "last known" for display.
 *   currency 'none'    : no data -> UNKNOWN, no windows.
 */
export function resolveAirspace(
  airspace: Airspace, entries: FaaEntry[] | null, now: number, currency: Currency
): Airspace {
  if (!entries || currency === 'none') {
    return { ...airspace, status: 'unknown', windows: [], currentWindow: undefined, nextWindow: undefined, lastKnownWindows: [], dataSource: 'none', pending: false };
  }

  const windows = mergeWindows(windowsFromEntries(airspace, entries)).filter((w) => w.end > now);

  if (currency === 'cached') {
    return { ...airspace, status: 'unknown', windows: [], currentWindow: undefined, nextWindow: undefined, lastKnownWindows: windows, dataSource: 'cached', pending: false };
  }

  const firstCurrent = windows.find((w) => w.start <= now && !w.pending);
  const currentWindow = firstCurrent ? { ...firstCurrent, end: continuousEnd(windows, firstCurrent) } : undefined;
  // A pending window is never "active", even once its start time has passed.
  const nextWindow = windows.find((w) => (w.start > now || w.pending) && (!currentWindow || w.start > currentWindow.end || w.pending));
  const status: AirspaceStatus = currentWindow ? 'active' : nextWindow ? 'scheduled' : 'inactive';

  return {
    ...airspace,
    status,
    windows,
    currentWindow,
    nextWindow,
    lastKnownWindows: [],
    dataSource: 'faa',
    pending: (currentWindow ?? nextWindow)?.pending ?? false,
  };
}

/* ---------------------------------------------------------------- */
/* Late-open alerts                                                  */
/* ---------------------------------------------------------------- */

export interface LateAlert {
  id: string;
  names: string[];
  airspaceIds: string[];
  start: number;
  end: number;
  active: boolean;   // already open right now (vs. scheduled to open)
  pending: boolean;  // FAA hasn't approved the schedule yet
  endLabel: string;  // "10:00 PM CDT"
  dayLabel: string;  // "today" | "tomorrow" | "Fri"
  message: string;   // one-line summary for the bar
}

/** Window ends at/after the cutoff (e.g. 10 PM) or in the small hours before 6 AM Central. */
export function endsLate(endMs: number, cutoffHour: number): boolean {
  const { h, mi } = ctParts(endMs);
  const mins = h * 60 + mi;
  return mins >= cutoffHour * 60 || mins < 6 * 60;
}

function shortList(names: string[], max = 2): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

/** Only current FAA data produces late alerts; cached or missing data never does. */
export function computeLateAlerts(airspaces: Airspace[], now: number, cutoffHour: number): LateAlert[] {
  const groups = new Map<string, LateAlert>();

  for (const a of airspaces) {
    if (a.dataSource !== 'faa') continue;
    for (const w of a.windows ?? []) {
      if (w.end <= now || w.start > now + 36 * 60 * 60 * 1000) continue;
      if (!endsLate(w.end, cutoffHour)) continue;

      const endMin = Math.floor(w.end / 60000);
      const key = `${endMin}:${w.pending ? 'p' : 'c'}`;
      const existing = groups.get(key);
      if (existing) {
        existing.names.push(a.name);
        existing.airspaceIds.push(a.id);
        existing.start = Math.min(existing.start, w.start);
        existing.active = existing.active || w.start <= now;
      } else {
        groups.set(key, {
          id: '', names: [a.name], airspaceIds: [a.id], start: w.start, end: endMin * 60000,
          active: w.start <= now, pending: w.pending, endLabel: '', dayLabel: '', message: '',
        });
      }
    }
  }

  return [...groups.values()]
    .map((g) => {
      const names = [...new Set(g.names)].sort();
      const endLabel = formatCT(g.end);
      const dayLabel = ctDayLabel(g.end, now);
      const verb = g.active ? (names.length > 1 ? 'are open' : 'is open') : 'will be open';
      return {
        ...g,
        names,
        id: `${g.end}|${names.join(',')}`,
        endLabel,
        dayLabel,
        message: `${shortList(names)} ${verb} until ${endLabel} ${dayLabel}${g.pending ? ' (pending approval)' : ''}`,
      };
    })
    .sort((a, b) => a.end - b.end);
}
