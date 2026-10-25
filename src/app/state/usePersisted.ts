import { useCallback, useEffect, useState } from 'react';

/** useState that survives restarts via localStorage (failures are non-fatal). */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? ({ ...(initial as object), ...JSON.parse(raw) } as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

/**
 * A persisted set of alert ids. Ids look like "<endEpochMs>|<names>"; entries
 * whose end time has passed are pruned so the set can't grow forever.
 */
export function usePersistedIdSet(key: string) {
  const [ids, setIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* ignore */ }
  }, [key, ids]);

  const add = useCallback((id: string) => setIds((p) => (p.includes(id) ? p : [...p, id])), []);
  const prune = useCallback((now: number) => {
    setIds((p) => {
      const kept = p.filter((id) => Number(id.split('|')[0]) > now - 60 * 60 * 1000);
      return kept.length === p.length ? p : kept;
    });
  }, []);
  return { has: (id: string) => ids.includes(id), add, prune };
}

export interface AppSettings {
  /** Local (Central) hour at/after which an airspace closing counts as "open late". */
  lateCutoffHour: number;
  popups: boolean;
  nativeNotifications: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { lateCutoffHour: 22, popups: true, nativeNotifications: true };
