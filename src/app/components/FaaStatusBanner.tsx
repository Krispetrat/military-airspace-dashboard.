import { AlertTriangle, RefreshCw, Activity } from 'lucide-react';
import type { FaaAttempt } from '../services/faaData';
import { SOURCE_NAME } from '../services/faaData';
import { formatCT, ctDayLabel } from '../utils/schedule';
import { formatAge, formatCountdown } from '../utils/faaState';
import { useNow } from '../state/useNow';

interface Props {
  /** Last time this app retrieved FAA data successfully (this session or a restored cache). */
  lastSuccessAt?: number;
  attempts: FaaAttempt[];
  error?: string;
  retrying: boolean;
  nextRetryAt?: number;
  onRetry: () => void;
  onOpenDiagnostics: () => void;
}

/**
 * Full-width red warning pinned above everything else. It stays up until a
 * retrieval succeeds; having cached schedules never hides it.
 */
export function FaaStatusBanner({ lastSuccessAt, attempts, error, retrying, nextRetryAt, onRetry, onOpenDiagnostics }: Props) {
  const now = useNow(1000);
  const failed = attempts.filter((a) => a.outcome !== 'skipped');
  const skipped = attempts.filter((a) => a.outcome === 'skipped');

  return (
    <div role="alert" className="relative z-50 flex items-start gap-4 px-5 py-3 bg-gradient-to-r from-red-950 via-red-800/90 to-red-950 border-b-2 border-red-500 text-red-50 shadow-[0_2px_24px_rgba(239,68,68,0.35)]">
      <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-200" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-bold tracking-wide">
          ⚠ FAA DATA UNAVAILABLE — Unable to retrieve current FAA military airspace schedules. Displayed information may be outdated or unavailable.
        </div>

        <div className="text-xs text-red-100/90 font-mono">
          {lastSuccessAt
            ? <>Last successful update: {formatCT(lastSuccessAt)} {ctDayLabel(lastSuccessAt, now)} ({formatAge(now - lastSuccessAt)})</>
            : <>No successful FAA update has been received.</>}
          {nextRetryAt && !retrying && <> · Next automatic retry in {formatCountdown(nextRetryAt - now)}</>}
          {retrying && <> · Retrying…</>}
        </div>

        {failed.length > 0 ? (
          <ul className="text-xs text-red-100/90 space-y-0.5">
            {failed.map((a, i) => (
              <li key={i} className="break-words">
                <b className="text-red-50">Failed: {SOURCE_NAME[a.source] ?? a.source}</b>
                {a.httpStatus ? ` (HTTP ${a.httpStatus})` : ''} — {a.error}
              </li>
            ))}
            {skipped.map((a, i) => (
              <li key={`s${i}`} className="text-red-200/70 break-words">Not tried: {SOURCE_NAME[a.source] ?? a.source} — {a.error.replace(/^Skipped: /, '')}</li>
            ))}
          </ul>
        ) : error ? (
          <div className="text-xs text-red-100/90 break-words">Reason: {error}</div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onRetry} disabled={retrying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 text-red-900 text-xs font-bold hover:bg-white disabled:opacity-60 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} /> Retry Connection
        </button>
        <button onClick={onOpenDiagnostics}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300/50 bg-red-500/20 hover:bg-red-500/35 text-xs font-semibold transition-colors">
          <Activity className="w-3.5 h-3.5" /> Diagnostics
        </button>
      </div>
    </div>
  );
}
