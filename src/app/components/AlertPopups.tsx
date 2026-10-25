import { AlertTriangle, X } from 'lucide-react';
import type { LateAlert } from '../utils/schedule';

interface Props {
  alerts: LateAlert[];
  onAcknowledge: (id: string) => void;
}

/** Pop-up cards for late-open airspace you haven't acknowledged yet. */
export function AlertPopups({ alerts, onAcknowledge }: Props) {
  if (alerts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col-reverse gap-3 w-[380px] max-w-[calc(100vw-2.5rem)]">
      {alerts.slice(0, 2).map((a) => (
        <div
          key={a.id}
          role="alertdialog"
          className="rounded-xl border border-red-500/60 bg-[#1a0f12]/95 backdrop-blur-xl shadow-[0_20px_60px_-10px_rgba(239,68,68,0.45)] overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 border-b border-red-500/30">
            <AlertTriangle className="w-4 h-4 text-red-300" />
            <span className="text-xs font-bold tracking-widest text-red-200">AIRSPACE OPEN LATE</span>
            <button onClick={() => onAcknowledge(a.id)} aria-label="Close" className="ml-auto p-1 rounded hover:bg-red-500/25 text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-2.5 space-y-1.5">
            <div className="text-xl font-semibold text-slate-50 tabular-nums">
              until {a.endLabel} <span className="text-base font-medium text-red-300">{a.dayLabel}</span>
            </div>
            <ul className="text-sm text-slate-300 space-y-0.5">
              {a.names.map((n) => <li key={n} className="font-mono text-[13px]">{n}</li>)}
            </ul>
            {a.pending && <div className="text-xs text-amber-300">Schedule pending FAA approval</div>}
            <button
              onClick={() => onAcknowledge(a.id)}
              className="mt-1 w-full py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-sm font-semibold text-red-100 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
