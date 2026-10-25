/**
 * FAA Special Use Airspace (SUA) schedule service.
 *
 * Live data comes from the Electron main process (see electron/faa.cjs),
 * which can reach sua.faa.gov without the browser CORS restrictions that
 * made a pure-web version impossible. In a plain browser there is no live
 * data and the dashboard says so, instead of showing invented schedules.
 *
 * Nothing in this file (or anywhere in the renderer) generates schedule data.
 */
import type { Airspace } from '../components/AirspaceMap';

export interface FaaEntry {
  scheduleId: string;
  airspaceId: string;
  /** P = pending approval, W = waiting to start, H = hot (activated), ? = source carries no status. */
  status: string;
  type?: string;
  name: string;
  start: number; // epoch ms (UTC)
  end: number;
  lowAlt?: string;  // hundreds of feet
  highAlt?: string;
}

export type FaaSourceId = 'gateway' | 'textlist' | 'public';

export interface FaaAttempt {
  source: string;
  label?: string;
  /** failed = tried and failed; skipped = deliberately not tried (no login, previous login rejected...). */
  outcome?: 'failed' | 'skipped';
  code: string;
  httpStatus?: number;
  tries?: number;
  durationMs?: number;
  error: string;
}

export interface FaaFetchResult {
  ok: boolean;
  schemaVersion?: number;
  source?: FaaSourceId;
  sourceLabel?: string;
  /** nationwide-24h: the whole next-24h list, so "absent" means "no schedule in that list". per-airspace: one page per airspace. */
  coverage?: 'nationwide-24h' | 'per-airspace';
  verification?: 'documented' | 'undocumented' | 'unverified-format';
  /** When this computer retrieved it. */
  fetchedAt?: number;
  /** How old the data itself is (the feed's own generation time when it states one, else fetchedAt). */
  asOf?: number;
  validFrom?: number;
  /** End of the period the schedule list covers; null when the source does not state one. */
  validThrough?: number | null;
  feedGeneratedAt?: number;
  entries?: FaaEntry[];
  unmatched?: string[];
  notes?: string[];
  attempts?: FaaAttempt[];
  stats?: Record<string, unknown>;
  error?: string;
  /** Server asked us to wait this long before the next request (HTTP 429). */
  retryAfterMs?: number;
  /** True when the desktop app returned its previous result instead of making a new request. */
  throttled?: boolean;
}

export interface FaaLogLine { t: number; level: 'info' | 'warn' | 'error'; source: string; msg: string }
export interface FaaRawResponse {
  capturedAt: number; url: string; httpStatus: number; headers: Record<string, string>;
  bytes: number; truncated: boolean; text: string; name?: string;
}
export interface FaaDiagnostics {
  generatedAt: number;
  log: FaaLogLine[];
  raw: { gateway?: FaaRawResponse; textlist?: FaaRawResponse; public?: FaaRawResponse[] };
  lastSuccess: { source: string; fetchedAt: number; asOf: number } | null;
  sources: { id: string; label: string; verification: string; coverage: string }[];
}

declare global {
  interface Window {
    airspaceDesktop?: {
      isDesktop: true;
      fetchFaaSchedules: (names: string[]) => Promise<FaaFetchResult>;
      getFaaDiagnostics: () => Promise<FaaDiagnostics>;
      getSettings: () => Promise<{
        hasCredentials: boolean; user: string; secureStorage: boolean; version: string; userDataPath: string;
      }>;
      saveCredentials: (user: string, pwd: string) => Promise<{ ok: boolean; error?: string; persisted?: boolean }>;
      clearCredentials: () => Promise<{ ok: boolean }>;
      notify: (title: string, body: string) => Promise<boolean>;
      showDebugFolder: () => Promise<boolean>;
    };
  }
}

/** Plain-language names for the places we try, used in the banner and diagnostics. */
export const SOURCE_NAME: Record<string, string> = {
  gateway: 'FAA SUA Schedule Data Gateway',
  textlist: 'FAA SUA website Text List export',
  public: 'FAA SUA website public schedule pages',
  browser: 'Web browser (blocked by CORS)',
  app: 'Desktop app',
};

export const isDesktop = typeof window !== 'undefined' && Boolean(window.airspaceDesktop?.isDesktop);

export const BROWSER_MODE_ERROR =
  'Live FAA data needs the desktop app: web browsers block requests to sua.faa.gov (CORS). No FAA schedule data is available in this browser.';

/** Every distinct FAA designation the dashboard needs to look up. */
export function allFaaNames(airspaces: Airspace[]): string[] {
  return [...new Set(airspaces.flatMap((a) => a.faaNames ?? []))];
}

export async function fetchFaaSchedules(names: string[]): Promise<FaaFetchResult> {
  if (!window.airspaceDesktop) {
    return {
      ok: false,
      error: BROWSER_MODE_ERROR,
      attempts: [{ source: 'browser', outcome: 'failed', code: 'CORS', error: BROWSER_MODE_ERROR }],
    };
  }
  try {
    return await window.airspaceDesktop.fetchFaaSchedules(names);
  } catch (err) {
    const error = `FAA request failed inside the app: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, error, attempts: [{ source: 'app', outcome: 'failed', code: 'IPC', error }] };
  }
}

export async function fetchFaaDiagnostics(): Promise<FaaDiagnostics | null> {
  try { return (await window.airspaceDesktop?.getFaaDiagnostics()) ?? null; } catch { return null; }
}

/* ---- Cache: last good result, so a restart/outage can show "last known" windows ----
 * A cached result is NEVER live. It keeps its original fetchedAt/asOf; the UI
 * labels it CACHED and treats every airspace's current status as UNKNOWN.      */

const CACHE_KEY = 'faa-schedule-cache-v2';
/** Cached schedules older than this are discarded outright. */
export const CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export function loadCachedFaa(): FaaFetchResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as FaaFetchResult;
    if (!r.ok || !r.fetchedAt || !Array.isArray(r.entries)) return null;
    const asOf = r.asOf ?? r.fetchedAt;
    return Date.now() - asOf > CACHE_MAX_AGE_MS ? null : r;
  } catch {
    return null;
  }
}

export function saveCachedFaa(result: FaaFetchResult) {
  try {
    const { attempts: _a, stats: _s, ...slim } = result;
    localStorage.setItem(CACHE_KEY, JSON.stringify(slim));
  } catch { /* storage full/blocked: ignore */ }
}
