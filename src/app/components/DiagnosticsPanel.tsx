import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Copy, Activity, FileText, ListChecks, Database } from 'lucide-react';
import {
  fetchFaaDiagnostics, isDesktop, SOURCE_NAME,
  type FaaAttempt, type FaaDiagnostics, type FaaFetchResult, type FaaRawResponse,
} from '../services/faaData';
import type { DataState, Currency, Origin } from '../utils/faaState';
import { formatAge } from '../utils/faaState';
import { formatCT } from '../utils/schedule';

export interface CycleInfo { at: number; ok: boolean; source?: string; attempts: FaaAttempt[]; error?: string }

interface Props {
  dataState: DataState;
  currency: Currency;
  origin: Origin | null;
  result: FaaFetchResult | null;
  cycle: CycleInfo | null;
  failures: number;
  onRetry: () => void;
  loading: boolean;
  onClose: () => void;
}

const STATE_LABEL: Record<DataState, string> = {
  live: 'FAA CONNECTED', stale: 'FAA DATA STALE', offline: 'FAA DISCONNECTED', loading: 'CONNECTING',
};
const VERIFY_NOTE: Record<string, string> = {
  gateway: 'Official, documented by the FAA (needs a registered login).',
  textlist: 'Public FAA website export. Not documented by the FAA; request shape taken from a third-party client.',
  public: 'Public FAA website pages. Not documented; layout of a populated page unverified.',
};
const LEVEL_CLS = { info: 'text-slate-400', warn: 'text-amber-300', error: 'text-red-300' } as const;
const timeSec = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

const card = 'rounded-lg border border-slate-700/60 bg-[#0f1520] p-4 space-y-2';
const h3 = 'flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400';
const btn = 'flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-700/50 hover:bg-slate-700 text-xs font-semibold text-slate-200 disabled:opacity-50';

export function DiagnosticsPanel({ dataState, currency, origin, result, cycle, failures, onRetry, loading, onClose }: Props) {
  const [diag, setDiag] = useState<FaaDiagnostics | null>(null);
  const [rawKey, setRawKey] = useState<string>('');
  const [copied, setCopied] = useState('');

  const reload = useCallback(async () => setDiag(await fetchFaaDiagnostics()), []);
  // Reload on open and whenever a refresh cycle finishes.
  useEffect(() => { reload(); }, [reload, cycle?.at, loading]);

  const rawList = useMemo(() => {
    const out: { key: string; label: string; raw: FaaRawResponse }[] = [];
    if (diag?.raw.gateway) out.push({ key: 'gateway', label: SOURCE_NAME.gateway, raw: diag.raw.gateway });
    if (diag?.raw.textlist) out.push({ key: 'textlist', label: SOURCE_NAME.textlist, raw: diag.raw.textlist });
    for (const p of diag?.raw.public ?? []) out.push({ key: `public:${p.name}`, label: `Public page · ${p.name}`, raw: p });
    return out;
  }, [diag]);
  const selected = rawList.find((r) => r.key === rawKey) ?? rawList[0];

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ }
  };

  const sourceRows = (diag?.sources ?? []).map((s) => {
    const failed = cycle?.attempts.find((a) => a.source === s.id);
    const won = cycle?.ok && cycle.source === s.id;
    return { s, failed, won };
  });
  const now = Date.now();

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-[820px] max-w-full max-h-[92vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#141b26] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 sticky top-0 bg-[#141b26] z-10">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100"><Activity className="w-4 h-4 text-orange-400" /> FAA connection diagnostics</h2>
          <div className="flex items-center gap-2">
            <button className={btn} onClick={onRetry} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Retry connection</button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4 text-sm text-slate-300">
          {/* Summary */}
          <section className={card}>
            <h3 className={h3}><ListChecks className="w-3.5 h-3.5" /> Status</h3>
            <div className="grid grid-cols-[170px_1fr] gap-y-1 text-xs font-mono">
              <span className="text-slate-500">Indicator</span><span className="text-slate-100 font-bold">{STATE_LABEL[dataState]}</span>
              <span className="text-slate-500">Data currency</span><span>{currency === 'current' ? 'CURRENT (retrieved this session, inside freshness limit)' : currency === 'cached' ? 'CACHED (not current: never shown as live)' : 'NONE (no usable FAA data)'}</span>
              <span className="text-slate-500">Source</span><span>{result?.source ? SOURCE_NAME[result.source] : '—'}</span>
              <span className="text-slate-500">Retrieved</span><span>{result?.fetchedAt ? `${formatCT(result.fetchedAt)} (${formatAge(now - result.fetchedAt)}) · ${origin === 'cache' ? 'from cache' : 'from network'}` : 'never'}</span>
              <span className="text-slate-500">Last success (app)</span><span>{diag?.lastSuccess ? `${formatCT(diag.lastSuccess.fetchedAt)} via ${diag.lastSuccess.source}` : '—'}</span>
              <span className="text-slate-500">Consecutive failures</span><span>{failures}</span>
              <span className="text-slate-500">Last refresh</span><span>{cycle ? `${formatCT(cycle.at)} — ${cycle.ok ? 'succeeded' : 'FAILED'}` : 'none yet'}</span>
            </div>
            {cycle?.error && <div className="text-xs text-red-300 break-words">Error: {cycle.error}</div>}
            {!isDesktop && <div className="text-xs text-amber-300">Running in a web browser: requests to sua.faa.gov are blocked by CORS. Use the desktop app for FAA data.</div>}
          </section>

          {/* Sources */}
          <section className={card}>
            <h3 className={h3}><Database className="w-3.5 h-3.5" /> Sources (latest refresh)</h3>
            {sourceRows.length === 0 && <div className="text-xs text-slate-500">No source information (desktop app only).</div>}
            {sourceRows.map(({ s, failed, won }) => (
              <div key={s.id} className="rounded-md border border-slate-700/50 bg-[#0a0f16] px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <b className="text-slate-100">{s.label}</b>
                  <span className={`px-1.5 py-0.5 rounded font-bold tracking-wide ${won ? 'bg-emerald-500/20 text-emerald-300' : failed?.outcome === 'skipped' ? 'bg-slate-600/40 text-slate-300' : failed ? 'bg-red-500/20 text-red-300' : 'bg-slate-700/40 text-slate-400'}`}>
                    {won ? 'USED — OK' : failed ? (failed.outcome === 'skipped' ? 'NOT TRIED' : `FAILED · ${failed.code}`) : 'NOT REACHED'}
                  </span>
                </div>
                <div className="text-slate-500 mt-0.5">{VERIFY_NOTE[s.id]}</div>
                {failed && (
                  <div className="text-amber-300 mt-1 break-words font-mono">
                    {failed.httpStatus ? `HTTP ${failed.httpStatus} · ` : ''}{failed.tries ? `${failed.tries} attempt(s) · ` : ''}{failed.durationMs !== undefined ? `${failed.durationMs} ms · ` : ''}{failed.error}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Validation / stats */}
          {result && (
            <section className={card}>
              <h3 className={h3}><ListChecks className="w-3.5 h-3.5" /> Validation of the current result</h3>
              <div className="text-xs font-mono space-y-0.5">
                <div>Matching schedules shown: {result.entries?.length ?? 0}</div>
                {result.stats && <pre className="whitespace-pre-wrap break-words text-slate-400">{JSON.stringify(result.stats, null, 2)}</pre>}
                {!!result.unmatched?.length && <div className="text-slate-400">Regional FAA names not on the map: {result.unmatched.join(', ')}</div>}
                {result.notes?.map((n, i) => <div key={i} className="text-amber-300/90 font-sans">{n}</div>)}
              </div>
            </section>
          )}

          {/* Raw response */}
          <section className={card}>
            <div className="flex items-center justify-between">
              <h3 className={h3}><FileText className="w-3.5 h-3.5" /> Raw FAA response</h3>
              <div className="flex items-center gap-2">
                {rawList.length > 1 && (
                  <select value={selected?.key ?? ''} onChange={(e) => setRawKey(e.target.value)} className="px-2 py-1 rounded-md bg-[#0a0f16] border border-slate-700 text-xs max-w-[320px]">
                    {rawList.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                )}
                {selected && <button className={btn} onClick={() => copy('raw', selected.raw.text)}><Copy className="w-3.5 h-3.5" /> {copied === 'raw' ? 'Copied' : 'Copy'}</button>}
              </div>
            </div>
            {!selected ? (
              <div className="text-xs text-slate-500">No response has been captured yet{isDesktop ? '.' : ' (browser mode makes no FAA requests).'}</div>
            ) : (
              <>
                <div className="text-[11px] font-mono text-slate-400 break-words">
                  {selected.raw.url}<br />
                  HTTP {selected.raw.httpStatus} · {selected.raw.bytes.toLocaleString()} bytes{selected.raw.truncated ? ' (display truncated)' : ''} · captured {formatCT(selected.raw.capturedAt)}
                  {Object.entries(selected.raw.headers).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
                </div>
                <pre className="max-h-72 overflow-auto rounded-md bg-[#0a0f16] border border-slate-700/60 p-3 text-[11px] leading-snug text-slate-300 whitespace-pre-wrap break-words">{selected.raw.text || '(empty body)'}</pre>
                <div className="text-[10px] text-slate-500">Credentials are redacted from URLs and bodies before capture. This is exactly what the FAA returned.</div>
              </>
            )}
          </section>

          {/* Log */}
          <section className={card}>
            <div className="flex items-center justify-between">
              <h3 className={h3}><Activity className="w-3.5 h-3.5" /> Connection log (newest first)</h3>
              <div className="flex gap-2">
                <button className={btn} onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Reload</button>
                {diag && <button className={btn} onClick={() => copy('log', diag.log.map((l) => `${new Date(l.t).toISOString()} ${l.level.toUpperCase()} [${l.source}] ${l.msg}`).join('\n'))}><Copy className="w-3.5 h-3.5" /> {copied === 'log' ? 'Copied' : 'Copy log'}</button>}
              </div>
            </div>
            <div className="max-h-64 overflow-auto rounded-md bg-[#0a0f16] border border-slate-700/60 p-2 font-mono text-[11px] space-y-0.5">
              {!diag || diag.log.length === 0 ? <div className="text-slate-500">No log entries yet.</div> : diag.log.map((l, i) => (
                <div key={i} className={`${LEVEL_CLS[l.level]} break-words`}>
                  <span className="text-slate-600">{timeSec(l.t)}</span> <span className="uppercase">{l.level}</span> [{l.source}] {l.msg}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
