import { Radar, RefreshCw, Settings, Wifi, WifiOff, Clock3, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { DataState, Currency, Origin } from '../utils/faaState';
import { formatAge, formatCountdown } from '../utils/faaState';
import type { FaaFetchResult } from '../services/faaData';
import { SOURCE_NAME } from '../services/faaData';
import { formatCT, ctDayLabel } from '../utils/schedule';

// Re-exported so older imports of DataState keep working.
export type { DataState };

interface StatusBarProps {
  dataState: DataState;
  currency: Currency;
  result: FaaFetchResult | null;
  origin: Origin | null;
  loading: boolean;
  /** When the next automatic refresh (or retry) fires, epoch ms. */
  nextRefreshAt?: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
}

const STATE_STYLE: Record<DataState, { label: string; cls: string; meaning: string }> = {
  live:    { label: 'FAA CONNECTED',    cls: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300', meaning: 'Current validated FAA schedules retrieved.' },
  stale:   { label: 'FAA DATA STALE',   cls: 'bg-amber-500/10 border-amber-500/40 text-amber-300',       meaning: 'The last successful retrieval is outdated, or the latest refresh failed.' },
  offline: { label: 'FAA DISCONNECTED', cls: 'bg-red-500/10 border-red-500/40 text-red-300',             meaning: 'No usable current FAA schedule data.' },
  loading: { label: 'CONNECTING',       cls: 'bg-slate-500/10 border-slate-500/40 text-slate-300',       meaning: 'Retrieving and validating FAA information.' },
};

const VERIFICATION_BADGE: Record<string, string> = {
  undocumented: 'UNDOCUMENTED SOURCE',
  'unverified-format': 'UNVERIFIED LAYOUT',
};

function Clock({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-slate-700/50 text-right">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="text-sm font-mono text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}

function Item({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-slate-500 uppercase tracking-wider text-[10px]">{label}</span>
      <span className={tone ?? 'text-slate-300'}>{children}</span>
    </span>
  );
}

export function StatusBar({
  dataState, currency, result, origin, loading, nextRefreshAt, onRefresh, onOpenSettings, onOpenDiagnostics,
}: StatusBarProps) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const tz = 'America/Chicago';
  const nowMs = now.getTime();
  const zone = formatCT(nowMs).split(' ').pop();
  const local12 = now.toLocaleTimeString('en-US', { timeZone: tz, hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const local24 = now.toLocaleTimeString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const zulu = now.toISOString().split('T')[1].split('.')[0] + 'Z';
  const st = STATE_STYLE[dataState];

  const fetchedAt = result?.fetchedAt;
  const asOf = result?.asOf ?? fetchedAt;
  const badge = result?.verification ? VERIFICATION_BADGE[result.verification] : undefined;
  const cached = currency === 'cached';

  const validity = !result || !result.validFrom
    ? '—'
    : result.validThrough
      ? `${formatCT(result.validFrom)} ${ctDayLabel(result.validFrom, nowMs)} → ${formatCT(result.validThrough)} ${ctDayLabel(result.validThrough, nowMs)}`
      : `from ${formatCT(result.validFrom)} (end not stated by source)`;

  const refreshText = loading ? 'refreshing…' : nextRefreshAt ? formatCountdown(nextRefreshAt - nowMs) : '—';

  return (
    <header className="bg-gradient-to-b from-[#0f1620] to-[#0b1118] border-b border-slate-700/50 px-6 py-3">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid place-items-center w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 shadow-[0_0_20px_rgba(251,146,60,0.15)]">
            <Radar className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-100 tracking-tight leading-tight truncate">Military Airspace Scheduler</h1>
            <div className="text-[11px] text-slate-400 font-mono uppercase tracking-widest">Central Texas · Brownwood &amp; Brady</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Clock label={`${zone} 12h`} value={local12} />
          <Clock label={`${zone} 24h`} value={local24} />
          <Clock label="Zulu" value={zulu} />
          <div className="h-9 w-px bg-slate-700/60 mx-1" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${st.cls}`} title={st.meaning}>
            {dataState === 'offline' ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className={`w-3.5 h-3.5 ${dataState === 'loading' ? 'animate-pulse' : ''}`} />}
            <div className="leading-tight">
              <div className="text-xs font-bold tracking-wide">{st.label}</div>
              {fetchedAt && dataState !== 'offline' && (
                <div className="text-[10px] opacity-80 font-mono flex items-center gap-1">
                  <Clock3 className="w-2.5 h-2.5" />{formatCT(fetchedAt)}{cached ? ' · CACHED' : ''}
                </div>
              )}
            </div>
          </div>
          <button onClick={onRefresh} disabled={loading} aria-label="Refresh FAA data" title="Refresh FAA data now"
            className="p-2 rounded-md border border-slate-700/60 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onOpenDiagnostics} aria-label="FAA connection diagnostics" title="FAA connection diagnostics"
            className="p-2 rounded-md border border-slate-700/60 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 transition-colors">
            <Activity className="w-4 h-4" />
          </button>
          <button onClick={onOpenSettings} aria-label="Settings" title="Settings"
            className="p-2 rounded-md border border-slate-700/60 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Data-source transparency: where schedules came from, how old, how long they are valid, when we refresh next. */}
      <div className="mt-2 pt-2 border-t border-slate-700/40 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono">
        <Item label="Source" tone={result ? 'text-slate-200' : 'text-slate-500'}>
          {result?.source ? SOURCE_NAME[result.source] : 'none'}
          {badge && <span className="ml-1.5 px-1 rounded bg-amber-500/15 text-amber-300 text-[9px] tracking-wide">{badge}</span>}
          {cached && <span className="ml-1.5 px-1 rounded bg-slate-600/50 text-slate-200 text-[9px] tracking-wide">CACHED · {origin === 'cache' ? 'PREVIOUS SESSION' : 'NOT CURRENT'}</span>}
        </Item>
        <Item label="Retrieved" tone={fetchedAt ? 'text-slate-200' : 'text-slate-500'}>
          {fetchedAt ? `${formatCT(fetchedAt)} ${ctDayLabel(fetchedAt, nowMs)} (${formatAge(nowMs - fetchedAt)})` : 'never'}
        </Item>
        {asOf && fetchedAt && Math.abs(asOf - fetchedAt) > 60000 && (
          <Item label="Data as of" tone="text-amber-300">{formatCT(asOf)} ({formatAge(nowMs - asOf)})</Item>
        )}
        <Item label="Schedules valid" tone="text-slate-200">{validity}</Item>
        <Item label="Next refresh" tone="text-slate-200">{refreshText}</Item>
      </div>
    </header>
  );
}
