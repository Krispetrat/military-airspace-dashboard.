import { useEffect, useState } from 'react';
import { X, KeyRound, Bell, Database, FolderOpen, RefreshCw, Activity } from 'lucide-react';
import { isDesktop, SOURCE_NAME, type FaaFetchResult } from '../services/faaData';
import type { AppSettings } from '../state/usePersisted';
import { formatCT } from '../utils/schedule';

interface Props {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  faaResult: FaaFetchResult | null;
  lastError?: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenDiagnostics: () => void;
  onClose: () => void;
}

const HOUR_OPTIONS = [20, 21, 22, 23].map((h) => ({ h, label: `${h - 12}:00 PM` }));

export function SettingsDialog({ settings, onChange, faaResult, lastError, loading, onRefresh, onOpenDiagnostics, onClose }: Props) {
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [info, setInfo] = useState<{ hasCredentials: boolean; user: string; secureStorage: boolean; version: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadInfo = () => window.airspaceDesktop?.getSettings().then((s) => { setInfo(s); setUser(s.user); });
  useEffect(() => { loadInfo(); }, []);

  const save = async () => {
    const r = await window.airspaceDesktop!.saveCredentials(user, pwd);
    setMsg(r.ok ? (r.persisted === false ? 'Saved for this session only (secure storage unavailable).' : 'Saved (encrypted). Refreshing…') : r.error ?? 'Could not save.');
    if (r.ok) { setPwd(''); await loadInfo(); onRefresh(); }
  };
  const clear = async () => {
    await window.airspaceDesktop!.clearCredentials();
    setUser(''); setPwd(''); setMsg('Login removed.'); await loadInfo(); onRefresh();
  };

  const section = 'rounded-lg border border-slate-700/60 bg-[#0f1520] p-4 space-y-3';
  const h3 = 'flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400';
  const input = 'w-full px-3 py-2 rounded-md bg-[#0a0f16] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-orange-500/70';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-[560px] max-w-full max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#141b26] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 sticky top-0 bg-[#141b26] z-10">
          <h2 className="text-base font-semibold text-slate-100">Settings</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <section className={section}>
            <h3 className={h3}><Bell className="w-3.5 h-3.5" /> Late-open alerts</h3>
            <label className="flex items-center justify-between gap-4 text-sm text-slate-200">
              Alert when an airspace stays open until
              <select
                value={settings.lateCutoffHour}
                onChange={(e) => onChange({ ...settings, lateCutoffHour: Number(e.target.value) })}
                className="px-2 py-1.5 rounded-md bg-[#0a0f16] border border-slate-700 text-sm"
              >
                {HOUR_OPTIONS.map((o) => <option key={o.h} value={o.h}>{o.label} or later</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-500">Central time. Windows ending between midnight and 6:00 AM also count.</p>
            {([['popups', 'Show pop-up cards'], ['nativeNotifications', 'Desktop notifications']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between text-sm text-slate-200 cursor-pointer">
                {label}
                <input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ ...settings, [k]: e.target.checked })} className="w-4 h-4 accent-orange-500" />
              </label>
            ))}
          </section>

          <section className={section}>
            <h3 className={h3}><Database className="w-3.5 h-3.5" /> FAA data</h3>
            <div className="text-sm text-slate-300 space-y-1">
              <div>Source: <b className="text-slate-100">{faaResult?.source ? SOURCE_NAME[faaResult.source] : 'none'}</b></div>
              {faaResult?.fetchedAt && <div>Last update: <span className="font-mono">{formatCT(faaResult.fetchedAt)}</span> — {faaResult.entries?.length ?? 0} matching schedule(s)</div>}
              {lastError && <div className="text-amber-300 text-xs break-words">Last attempt failed: {lastError}</div>}
              {faaResult?.attempts?.map((a, i) => <div key={i} className="text-amber-300 text-xs break-words">{SOURCE_NAME[a.source] ?? a.source}: {a.error}</div>)}
              {faaResult?.notes?.map((n, i) => <div key={i} className="text-slate-500 text-xs">{n}</div>)}
              {!!faaResult?.unmatched?.length && <div className="text-xs text-slate-400">FAA names not shown on the map: <span className="font-mono">{faaResult.unmatched.join(', ')}</span></div>}
              {!isDesktop && <div className="text-xs text-amber-300">Running in a browser: live FAA data requires the desktop app.</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={onRefresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 text-xs font-semibold text-slate-200 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh now
              </button>
              <button onClick={onOpenDiagnostics} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 text-xs font-semibold text-slate-200">
                <Activity className="w-3.5 h-3.5" /> Diagnostics
              </button>
              {isDesktop && (
                <button onClick={() => window.airspaceDesktop!.showDebugFolder()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 text-xs font-semibold text-slate-200">
                  <FolderOpen className="w-3.5 h-3.5" /> Open debug file
                </button>
              )}
            </div>
          </section>

          {isDesktop && (
            <section className={section}>
              <h3 className={h3}><KeyRound className="w-3.5 h-3.5" /> FAA gateway login (optional)</h3>
              <p className="text-xs text-slate-500">
                The official FAA SUA Schedule Data Gateway is the primary source and requires a registered FAA account. Without it the dashboard falls back to public FAA website data, which is undocumented and less certain. A login the FAA rejects is not re-sent until you save it again.
                Credentials are encrypted with your Windows account and never leave this computer except to sua.faa.gov.
              </p>
              <input className={input} placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
              <input className={input} type="password" placeholder={info?.hasCredentials ? '•••••••• (saved)' : 'Password'} value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="off" />
              <div className="flex items-center gap-2">
                <button onClick={save} disabled={!user || !pwd} className="px-3 py-1.5 rounded-md bg-orange-500/90 hover:bg-orange-500 text-xs font-semibold text-black disabled:opacity-40">Save &amp; connect</button>
                {info?.hasCredentials && <button onClick={clear} className="px-3 py-1.5 rounded-md bg-slate-700/50 hover:bg-slate-700 text-xs font-semibold text-slate-200">Remove login</button>}
                {msg && <span className="text-xs text-slate-400">{msg}</span>}
              </div>
            </section>
          )}
          {info && <div className="text-[11px] text-slate-600 text-right font-mono">v{info.version}</div>}
        </div>
      </div>
    </div>
  );
}
