import { useState, useEffect } from 'react';
import { X, Radio, Layers, Clock, Building2, Phone, Timer, AlertCircle } from 'lucide-react';
import { Airspace } from './AirspaceMap';
import { ctDayLabel, formatCT, formatDuration, formatFiledAltitude, STATUS_LABEL, type ScheduleWindow } from '../utils/schedule';
import { SOURCE_NAME } from '../services/faaData';
import type { Currency } from '../utils/faaState';
import type { FaaFetchResult } from '../services/faaData';

interface AirspaceInfoCardProps {
  airspace: Airspace;
  onClose: () => void;
  result?: FaaFetchResult | null;
  currency?: Currency;
}

const zulu = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)}Z ${new Date(ms).toISOString().slice(5, 10)}`;

function WindowRow({ w, now, emphasize }: { w: ScheduleWindow; now: number; emphasize?: boolean }) {
  const low = formatFiledAltitude(w.lowAlt);
  const high = formatFiledAltitude(w.highAlt);
  return (
    <div className={`rounded-md px-2.5 py-2 border ${emphasize ? 'border-slate-500/60 bg-white/[0.04]' : 'border-slate-700/50 bg-white/[0.02]'}`}>
      <div className="text-sm text-slate-200 font-mono">
        {formatCT(w.start)} <span className="text-slate-400">{ctDayLabel(w.start, now)}</span>
        <span className="text-slate-500"> → </span>
        {formatCT(w.end)} <span className="text-slate-400">{ctDayLabel(w.end, now)}</span>
      </div>
      <div className="text-slate-500 font-mono text-[11px]">{zulu(w.start)} → {zulu(w.end)}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500">
        {(low || high) && <span>Filed: {low ?? '—'} – {high ?? '—'}</span>}
        {w.pending && <span className="px-1 rounded bg-amber-500/20 text-amber-300 flex items-center gap-0.5"><AlertCircle className="w-2.5 h-2.5" />PENDING APPROVAL</span>}
        {w.hot && <span className="px-1 rounded bg-orange-500/20 text-orange-300">FAA: HOT</span>}
      </div>
    </div>
  );
}

export function AirspaceInfoCard({ airspace, onClose, result, currency }: AirspaceInfoCardProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const w = airspace.status === 'active' ? airspace.currentWindow : airspace.nextWindow;
  const countdownText = w
    ? airspace.status === 'active'
      ? `Scheduled to end in ${formatDuration(w.end - now)}`
      : w.start <= now ? 'Pending approval — not yet active' : `Opens in ${formatDuration(w.start - now)}`
    : null;

  const statusConfig = {
    active:    { border: '#fb923c', badge: 'bg-orange-500/30 text-orange-200 border-orange-500/60' },
    scheduled: { border: '#fbbf24', badge: 'bg-amber-500/30 text-amber-200 border-amber-500/60' },
    inactive:  { border: '#64748b', badge: 'bg-slate-600/30 text-slate-300 border-slate-600/60' },
    unknown:   { border: '#94a3b8', badge: 'bg-slate-500/20 text-slate-200 border-slate-400/50' },
  };
  const config = statusConfig[airspace.status];

  const windows = airspace.windows ?? [];
  const lastKnown = airspace.lastKnownWindows ?? [];
  const asOfNote = result?.fetchedAt
    ? `FAA data retrieved ${formatCT(result.fetchedAt)}${result.source ? ` · ${SOURCE_NAME[result.source]}` : ''}${currency === 'cached' ? ' · CACHED' : ''}`
    : 'No FAA data retrieved';

  return (
    <div
      className="absolute top-4 right-16 w-80 max-h-[calc(100%-2rem)] overflow-y-auto border rounded-lg shadow-2xl"
      style={{ backgroundColor: '#1a2332', borderColor: config.border, boxShadow: '0 20px 60px -10px rgba(0, 0, 0, 0.95)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-start justify-between sticky top-0 z-10" style={{ backgroundColor: '#0d1117', borderColor: config.border + '80' }}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-slate-100">{airspace.name}</h3>
            {airspace.status === 'active' && <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border ${config.badge} font-semibold uppercase tracking-wide`}>{airspace.type}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${config.badge} font-semibold uppercase tracking-wide`}>{STATUS_LABEL[airspace.status]}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-700/50 rounded" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3" style={{ backgroundColor: '#141b26' }}>
        {countdownText && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-md"
            style={{ backgroundColor: airspace.status === 'active' ? '#fb923c20' : '#fbbf2420', border: `1px solid ${airspace.status === 'active' ? '#fb923c40' : '#fbbf2440'}` }}>
            <Timer className={`w-4 h-4 ${airspace.status === 'active' ? 'text-orange-400' : 'text-amber-400'}`} />
            <div className={`text-sm font-semibold ${airspace.status === 'active' ? 'text-orange-300' : 'text-amber-300'}`}>{countdownText}</div>
          </div>
        )}

        {/* Altitude: charted limits of the airspace itself */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5"><Layers className="w-4 h-4 text-slate-400" /></div>
          <div className="flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Altitude (charted limits)</div>
            <div className="text-sm text-slate-200 font-mono">
              <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Floor:</span><span>{airspace.altitudeFloor}</span></div>
              <div className="flex items-center justify-between mt-1"><span className="text-xs text-slate-400">Ceiling:</span><span>{airspace.altitudeCeiling}</span></div>
            </div>
          </div>
        </div>

        {/* FAA schedule windows (all of them: several per day are normal) */}
        {windows.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5"><Clock className="w-4 h-4 text-slate-400" /></div>
            <div className="flex-1 space-y-1.5">
              <div className="text-xs text-slate-500 uppercase tracking-wide">
                FAA schedule windows · Central (CST/CDT) and Zulu
              </div>
              {windows.map((win, i) => <WindowRow key={i} w={win} now={now} emphasize={win === airspace.currentWindow || (airspace.currentWindow && win.start === airspace.currentWindow.start) || false} />)}
              <div className="text-[10px] text-slate-500">Filed altitudes are in the FAA feed as hundreds of feet; the feed does not say whether the floor is AGL or MSL.</div>
            </div>
          </div>
        )}

        {airspace.status === 'inactive' && (
          <div className="text-xs text-slate-400">
            The current FAA list has no schedule for {airspace.name} in the next 24 hours. That means nothing is <i>scheduled</i>; it is not confirmation that the airspace is unused.
          </div>
        )}

        {airspace.status === 'unknown' && (
          <div className="text-xs px-3 py-2 rounded-md bg-slate-700/30 border border-slate-500/50 text-slate-200 space-y-1.5">
            <div><b>Status unknown.</b> There is no current FAA data, so this airspace is not shown as active, scheduled or inactive.</div>
            {lastKnown.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-slate-400">Last known windows (CACHED — not current, may have changed or been cancelled):</div>
                {lastKnown.map((win, i) => <WindowRow key={i} w={win} now={now} />)}
              </div>
            )}
          </div>
        )}

        {airspace.status === 'active' && (
          <div className="text-[11px] text-slate-500">
            This is a <i>scheduled</i> activation from FAA data. It does not confirm that military aircraft are physically operating in the airspace.
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="mt-0.5"><Building2 className="w-4 h-4 text-slate-400" /></div>
          <div className="flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Controlling Agency</div>
            <div className="text-sm text-slate-200">{airspace.controllingAgency}</div>
          </div>
        </div>

        {airspace.frequency && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5"><Phone className="w-4 h-4 text-slate-400" /></div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Frequency</div>
              <div className="text-sm text-slate-200 font-mono">{airspace.frequency} MHz</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t" style={{ backgroundColor: '#0f1419', borderColor: '#374151' }}>
        <div className="text-xs text-slate-500 font-mono">{asOfNote}</div>
      </div>
    </div>
  );
}
