import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StatusBar } from './components/StatusBar';
import { SchedulePanel } from './components/SchedulePanel';
import { AirspaceMap, AIRSPACES, Airspace } from './components/AirspaceMap';
import { AirspaceInfoCard } from './components/AirspaceInfoCard';
import { TwitchBanner } from './components/TwitchBanner';
import { TwitchPopout } from './components/TwitchPopout';
import { AlertBar } from './components/AlertBar';
import { AlertPopups } from './components/AlertPopups';
import { SettingsDialog } from './components/SettingsDialog';
import { FaaStatusBanner } from './components/FaaStatusBanner';
import { DiagnosticsPanel, type CycleInfo } from './components/DiagnosticsPanel';
import {
  allFaaNames, fetchFaaSchedules, loadCachedFaa, saveCachedFaa, isDesktop, FaaFetchResult, FaaAttempt,
} from './services/faaData';
import { resolveAirspace, computeLateAlerts } from './utils/schedule';
import { deriveFaaState, nextRefreshDelay, type Origin } from './utils/faaState';
import { usePersistedState, usePersistedIdSet, DEFAULT_SETTINGS, AppSettings } from './state/usePersisted';

const FAA_NAMES = allFaaNames(AIRSPACES);

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPopout, setShowPopout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const wasLiveRef = useRef(false);

  const [settings, setSettings] = usePersistedState<AppSettings>('airspace-settings-v1', DEFAULT_SETTINGS);
  const dismissed = usePersistedIdSet('alerts-dismissed-v1'); // hidden from the bar
  const acked = usePersistedIdSet('alerts-acked-v1');         // pop-up closed
  const notified = usePersistedIdSet('alerts-notified-v1');   // desktop notification sent

  // Auto-open the miniplayer the moment the stream goes live (not on every check).
  const handleTwitchLiveChange = (isLive: boolean) => {
    if (isLive && !wasLiveRef.current) setShowPopout(true);
    wasLiveRef.current = isLive;
  };

  /* ---------------- FAA data ---------------- */
  // A result restored from the previous session is CACHED until this session retrieves fresh data.
  const [faaResult, setFaaResult] = useState<FaaFetchResult | null>(() => loadCachedFaa());
  const [origin, setOrigin] = useState<Origin | null>(() => (loadCachedFaa() ? 'cache' : null));
  const [lastError, setLastError] = useState<string | undefined>();
  const [cycle, setCycle] = useState<CycleInfo | null>(null);
  const [failures, setFailures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | undefined>();

  const inFlight = useRef(false);          // never two renderer-side requests at once
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failuresRef = useRef(0);
  const sourceRef = useRef<FaaFetchResult['source']>(faaResult?.source);

  const schedule = useCallback((retryAfterMs?: number) => {
    clearTimeout(timerRef.current);
    const delay = nextRefreshDelay({ source: sourceRef.current, failures: failuresRef.current, retryAfterMs });
    setNextRefreshAt(Date.now() + delay);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    timerRef.current = setTimeout(() => refreshRef.current(), delay);
  }, []);
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    clearTimeout(timerRef.current);
    setNextRefreshAt(undefined);
    setLoading(true);
    const r = await fetchFaaSchedules(FAA_NAMES);
    const attempts: FaaAttempt[] = r.attempts ?? [];
    if (r.ok && r.entries && r.fetchedAt) {
      setFaaResult(r);
      setOrigin('network');
      saveCachedFaa(r);
      setLastError(undefined);
      failuresRef.current = 0;
      setFailures(0);
      sourceRef.current = r.source;
      setCycle({ at: Date.now(), ok: true, source: r.source, attempts });
    } else {
      // Failure: keep whatever we had (it ages out on its own), report the error, back off.
      setLastError(r.error ?? 'FAA request failed.');
      failuresRef.current += 1;
      setFailures(failuresRef.current);
      setCycle({ at: Date.now(), ok: false, attempts, error: r.error });
    }
    setLoading(false);
    inFlight.current = false;
    schedule(r.ok ? undefined : r.retryAfterMs);
  }, [schedule]);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
    return () => clearTimeout(timerRef.current);
  }, [refresh]);

  // Clock tick: statuses and countdowns recompute from real timestamps.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(i);
  }, []);

  const derived = deriveFaaState({ result: faaResult, origin, lastError, loading, now });
  const { state: dataState, currency } = derived;
  // Cached or missing data never drives a status; resolveAirspace turns it into UNKNOWN.
  const entries = currency === 'none' || !faaResult ? null : faaResult.entries ?? [];

  /* ---------------- Live airspace state + late alerts ---------------- */
  const resolved = useMemo<Airspace[]>(
    () => AIRSPACES.map((a) => resolveAirspace(a, entries, now, currency)),
    [now, entries, currency]
  );
  const alerts = useMemo(() => computeLateAlerts(resolved, now, settings.lateCutoffHour), [resolved, now, settings.lateCutoffHour]);

  const liveAirspaces = useMemo<Airspace[]>(() => {
    const lateIds = new Set(alerts.flatMap((a) => a.airspaceIds));
    return resolved.map((a) => (lateIds.has(a.id) ? { ...a, lateOpen: true } : a));
  }, [resolved, alerts]);

  const barAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const popupAlerts = settings.popups ? barAlerts.filter((a) => !acked.has(a.id)) : [];

  // Desktop notification once per new alert; prune old ids.
  useEffect(() => {
    for (const a of alerts) {
      if (notified.has(a.id)) continue;
      notified.add(a.id);
      if (settings.nativeNotifications && isDesktop) {
        window.airspaceDesktop?.notify('Airspace open late', a.message);
      }
    }
    notified.prune(now); acked.prune(now); dismissed.prune(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const selectedAirspace = liveAirspaces.find((a) => a.id === selectedId) ?? null;
  const select = (a: Airspace | null) => setSelectedId(a ? a.id : null);

  const cutoffLabel = `${settings.lateCutoffHour - 12}:00 PM`;
  const lastSuccessAt = faaResult?.fetchedAt;

  return (
    <div className="size-full flex flex-col bg-[#0a0f16] text-slate-200">
      {derived.showBanner && (
        <FaaStatusBanner
          lastSuccessAt={lastSuccessAt}
          attempts={cycle && !cycle.ok ? cycle.attempts : []}
          error={lastError}
          retrying={loading}
          nextRetryAt={nextRefreshAt}
          onRetry={refresh}
          onOpenDiagnostics={() => setShowDiagnostics(true)}
        />
      )}
      <AlertBar alerts={barAlerts} dataState={dataState} cutoffLabel={cutoffLabel} onDismiss={dismissed.add} />
      <TwitchBanner onOpenPopout={() => setShowPopout(true)} onLiveChange={handleTwitchLiveChange} />
      <StatusBar
        dataState={dataState}
        currency={currency}
        result={faaResult}
        origin={origin}
        loading={loading}
        nextRefreshAt={nextRefreshAt}
        onRefresh={refresh}
        onOpenSettings={() => setShowSettings(true)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-80 flex-shrink-0 md:block hidden">
          <SchedulePanel airspaces={liveAirspaces} selectedAirspace={selectedAirspace} onSelectAirspace={select} />
        </div>

        <div className="flex-1 relative">
          <AirspaceMap airspaces={liveAirspaces} selectedAirspace={selectedAirspace} onSelectAirspace={select} />
          {selectedAirspace && (
            <AirspaceInfoCard airspace={selectedAirspace} onClose={() => setSelectedId(null)} result={faaResult} currency={currency} />
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a2332] border-t border-slate-700 p-4 z-40 max-h-[40vh] overflow-auto">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Active (scheduled)</div>
        <div className="space-y-2">
          {liveAirspaces.filter((a) => a.status === 'active').map((a) => (
            <button key={a.id} onClick={() => select(a)}
              className="w-full text-left px-3 py-2 bg-[#0f1419] border border-slate-700 rounded-md text-sm text-slate-300 hover:bg-slate-700/50 transition-colors">
              {a.name}
            </button>
          ))}
          {dataState !== 'live' && <div className="text-xs text-amber-300">FAA data is not current; statuses may be unknown.</div>}
        </div>
      </div>

      <AlertPopups alerts={popupAlerts} onAcknowledge={acked.add} />
      {showPopout && <TwitchPopout onClose={() => setShowPopout(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onChange={setSettings}
          faaResult={faaResult}
          lastError={lastError}
          loading={loading}
          onRefresh={refresh}
          onOpenDiagnostics={() => { setShowSettings(false); setShowDiagnostics(true); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showDiagnostics && (
        <DiagnosticsPanel
          dataState={dataState}
          currency={currency}
          origin={origin}
          result={faaResult}
          cycle={cycle}
          failures={failures}
          loading={loading}
          onRetry={refresh}
          onClose={() => setShowDiagnostics(false)}
        />
      )}
    </div>
  );
}
