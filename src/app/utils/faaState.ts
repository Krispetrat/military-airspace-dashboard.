/**
 * Connection-state logic, kept free of React so it can be unit-tested.
 *
 * The one rule everything here serves: data may be presented as CURRENT only if
 * it was retrieved from the FAA by this running app, recently, and is still
 * inside its freshness limit. Anything else is CACHED (clearly labelled, never
 * used to claim an airspace is active) or NONE.
 */
import type { FaaFetchResult, FaaSourceId } from '../services/faaData';

export type DataState = 'loading' | 'live' | 'stale' | 'offline';
/** current = fresh from the FAA this session; cached = older/previous-session; none = nothing usable. */
export type Currency = 'current' | 'cached' | 'none';
export type Origin = 'network' | 'cache';

/** Auto-refresh cadence per source (the gateway is updated each minute; the public site every 5). */
export const REFRESH_MS: Record<FaaSourceId, number> = {
  gateway: 2 * 60 * 1000,
  textlist: 5 * 60 * 1000,
  public: 5 * 60 * 1000,
};
/** Data older than this (by its own timestamp) is no longer "current". ~3 missed polls. */
export const FRESH_MS: Record<FaaSourceId, number> = {
  gateway: 6 * 60 * 1000,
  textlist: 12 * 60 * 1000,
  public: 12 * 60 * 1000,
};
export const DEFAULT_REFRESH_MS = 2 * 60 * 1000; // before any source has answered
/** Cached windows older than this are discarded (mirrors CACHE_MAX_AGE_MS in faaData). */
export const CACHE_MAX_MS = 3 * 60 * 60 * 1000;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface FaaStateInput {
  /** Newest usable result held, from the network this session or from the cache. */
  result: FaaFetchResult | null;
  origin: Origin | null;
  /** Error text of the latest refresh if it failed; cleared only by a success. */
  lastError?: string;
  loading: boolean;
  now: number;
}

export interface FaaDerived {
  state: DataState;
  currency: Currency;
  /** Age of the data by its own timestamp. */
  ageMs: number | null;
  freshLimitMs: number;
  /** The red "FAA DATA UNAVAILABLE" banner. Never hidden because a cache exists. */
  showBanner: boolean;
}

export function deriveFaaState({ result, origin, lastError, loading, now }: FaaStateInput): FaaDerived {
  const failed = Boolean(lastError);
  const connectingOrOffline: DataState = loading && !failed ? 'loading' : 'offline';

  if (!result || !result.fetchedAt || !result.source) {
    return { state: connectingOrOffline, currency: 'none', ageMs: null, freshLimitMs: FRESH_MS.gateway, showBanner: failed || connectingOrOffline === 'offline' };
  }

  const asOf = result.asOf ?? result.fetchedAt;
  const ageMs = Math.max(0, now - asOf);
  const freshLimitMs = FRESH_MS[result.source];

  if (ageMs > CACHE_MAX_MS) {
    return { state: connectingOrOffline, currency: 'none', ageMs, freshLimitMs, showBanner: failed || connectingOrOffline === 'offline' };
  }

  const fresh = ageMs <= freshLimitMs;
  if (origin === 'network' && fresh) {
    // Current data. If the latest refresh failed we say so (yellow + banner) but the
    // schedule itself is still inside its freshness limit.
    return { state: failed ? 'stale' : 'live', currency: 'current', ageMs, freshLimitMs, showBanner: failed };
  }

  // Previous-session cache, or network data that has aged out: last-known only.
  const state: DataState = loading && !failed ? 'loading' : 'stale';
  return { state, currency: 'cached', ageMs, freshLimitMs, showBanner: state === 'stale' };
}

/** Delay before the next automatic refresh: normal cadence on success, exponential backoff on failure. */
export function nextRefreshDelay(opts: {
  source?: FaaSourceId; failures: number; retryAfterMs?: number;
}): number {
  const { source, failures, retryAfterMs } = opts;
  if (failures <= 0) return source ? REFRESH_MS[source] : DEFAULT_REFRESH_MS;
  const backoff = Math.min(MAX_BACKOFF_MS, 30 * 1000 * 2 ** (failures - 1)); // 30 s, 1 m, 2 m, 4 m, 5 m...
  // Honour a server-supplied wait even if it exceeds our own cap.
  return Math.max(backoff, retryAfterMs ?? 0);
}

/** "1:42" style countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "4 min ago" / "35 s ago" / "2 h 5 min ago" */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 90) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 120) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
