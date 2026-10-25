import { useState } from 'react';
import { AlertTriangle, ChevronDown, ShieldCheck, X, Moon } from 'lucide-react';
import type { LateAlert } from '../utils/schedule';

import type { DataState } from '../utils/faaState';
export type { DataState };

interface AlertBarProps {
  alerts: LateAlert[];
  dataState: DataState;
  cutoffLabel: string;
  onDismiss: (id: string) => void;
}

/** Full-width bar pinned to the very top of the window. */
export function AlertBar({ alerts, dataState, cutoffLabel, onDismiss }: AlertBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length > 0) {
    const [first, ...rest] = alerts;
    return (
      <div className="relative z-50">
        <div className="flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-red-950 via-red-900/90 to-red-950 border-b border-red-500/50 text-red-50 shadow-[0_2px_20px_rgba(239,68,68,0.25)]">
          <span className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded bg-red-500/25 border border-red-400/50 text-[11px] font-bold tracking-widest text-red-200">
            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" /> LATE ACTIVITY
          </span>
          <span className="text-sm font-medium truncate" title={first.names.join(', ')}>{first.message}</span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {rest.length > 0 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 transition-colors"
              >
                +{rest.length} more <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button onClick={() => onDismiss(first.id)} aria-label="Dismiss alert" className="p-1 rounded hover:bg-red-500/30 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {expanded && rest.length > 0 && (
          <div className="absolute inset-x-0 top-full bg-red-950/95 backdrop-blur border-b border-red-500/40 divide-y divide-red-500/20 shadow-2xl">
            {rest.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-2 text-sm text-red-100">
                <Moon className="w-3.5 h-3.5 text-red-300 shrink-0" />
                <span className="truncate" title={a.names.join(', ')}>{a.message}</span>
                <button onClick={() => onDismiss(a.id)} aria-label="Dismiss alert" className="ml-auto p-1 rounded hover:bg-red-500/30">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Connection problems are reported by the red FaaStatusBanner above this bar.
  // The all-clear below is only claimed when the FAA data is current.
  if (dataState === 'offline' || dataState === 'stale') return null;

  return (
    <div className="flex items-center gap-3 px-5 py-1.5 bg-emerald-950/40 border-b border-emerald-700/30 text-emerald-200/90">
      <ShieldCheck className="w-4 h-4 text-emerald-400" />
      <span className="text-xs font-semibold tracking-wide">
        {dataState === 'loading' ? 'Checking FAA schedules…' : `NO LATE SCHEDULES — FAA lists nothing past ${cutoffLabel} in the next 24 hours (a schedule listing, not a confirmation of activity)`}
      </span>
    </div>
  );
}
