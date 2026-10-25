import { Clock, Calendar, Radio, Timer, Moon, AlertCircle, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Airspace } from './AirspaceMap';
import { ctDayLabel, formatCT, formatDuration, STATUS_LABEL } from '../utils/schedule';

interface SchedulePanelProps {
  airspaces: Airspace[];
  selectedAirspace: Airspace | null;
  onSelectAirspace: (airspace: Airspace) => void;
}

export function SchedulePanel({ airspaces, selectedAirspace, onSelectAirspace }: SchedulePanelProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const active = airspaces.filter((a) => a.status === 'active');
  const scheduled = airspaces.filter((a) => a.status === 'scheduled');
  const inactive = airspaces.filter((a) => a.status === 'inactive');
  const unknown = airspaces.filter((a) => a.status === 'unknown');
  const today = scheduled.filter((a) => ctDayLabel(a.nextWindow!.start, now) === 'today');
  const later = scheduled.filter((a) => ctDayLabel(a.nextWindow!.start, now) !== 'today');

  const card = (a: Airspace) => (
    <AirspaceCard key={a.id} airspace={a} now={now} isSelected={selectedAirspace?.id === a.id} onClick={() => onSelectAirspace(a)} />
  );

  return (
    <div className="h-full bg-[#111822] border-r border-slate-700/50 flex flex-col">
      <div className="px-4 py-4 border-b border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">Airspace Schedule</h2>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5" />
          <span className="font-mono">{new Date(now).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {active.length > 0 && (
          <Group icon={<span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />} title={`Active — scheduled (${active.length})`} color="text-orange-400">
            {active.map(card)}
          </Group>
        )}
        {scheduled.length > 0 && (
          <Group icon={<Clock className="w-3 h-3 text-amber-400" />} title={`Scheduled (${scheduled.length})`} color="text-amber-400">
            {today.length > 0 && <Sub label="Today">{today.map(card)}</Sub>}
            {later.length > 0 && <Sub label="Tomorrow & later">{later.map(card)}</Sub>}
          </Group>
        )}
        {inactive.length > 0 && (
          <Group icon={<span className="w-2 h-2 bg-slate-500 rounded-full" />} title={`No schedule listed (${inactive.length})`} color="text-slate-400">
            {inactive.map(card)}
          </Group>
        )}
        {unknown.length > 0 && (
          <Group icon={<HelpCircle className="w-3 h-3 text-slate-400" />} title={`Unknown — no current FAA data (${unknown.length})`} color="text-slate-300">
            {unknown.map(card)}
          </Group>
        )}
      </div>
      <div className="px-4 py-2 border-t border-slate-700/50 text-[10px] leading-snug text-slate-500">
        Times come from FAA schedules. A scheduled activation does not confirm aircraft are in the airspace, and “no schedule listed” does not confirm it is quiet.
      </div>
    </div>
  );
}

function Group({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        {icon}
        <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${color}`}>{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest pl-1">{label}</div>
      {children}
    </div>
  );
}

const THEME = {
  active:    { bar: 'bg-orange-500', border: 'border-orange-500/30', sel: 'border-orange-400 shadow-lg shadow-orange-500/20', bg: 'bg-orange-500/[0.06]' },
  scheduled: { bar: 'bg-amber-400',  border: 'border-amber-500/25',  sel: 'border-amber-400 shadow-lg shadow-amber-500/20',  bg: 'bg-amber-500/[0.04]' },
  inactive:  { bar: 'bg-slate-600',  border: 'border-slate-700/60',  sel: 'border-slate-400 shadow-lg shadow-slate-500/20',  bg: 'bg-slate-800/20' },
  unknown:   { bar: 'bg-slate-500',  border: 'border-slate-600/60 border-dashed', sel: 'border-slate-300 shadow-lg shadow-slate-500/20', bg: 'bg-slate-800/10' },
};

function AirspaceCard({ airspace: a, now, isSelected, onClick }: { airspace: Airspace; now: number; isSelected: boolean; onClick: () => void }) {
  const t = THEME[a.status];
  const w = a.status === 'active' ? a.currentWindow : a.nextWindow;
  const progress = a.status === 'active' && w ? Math.min(100, Math.max(0, ((now - w.start) / (w.end - w.start)) * 100)) : 0;

  return (
    <button onClick={onClick}
      className={`group relative w-full text-left rounded-lg border overflow-hidden transition-all duration-200 hover:bg-white/[0.04] ${t.bg} ${isSelected ? t.sel : t.border}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${t.bar}`} />
      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{a.name}</div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
              {a.type}
              <span className="text-slate-500">· {STATUS_LABEL[a.status]}</span>
              {a.dataSource === 'cached' && <span className="px-1 rounded bg-slate-700/60 text-slate-300 text-[9px] tracking-wide">CACHED</span>}
              {a.currentWindow?.hot && <span className="px-1 rounded bg-orange-500/20 text-orange-300 text-[9px] tracking-wide">FAA HOT</span>}
              {a.pending && <span className="px-1 rounded bg-amber-500/20 text-amber-300 text-[9px] tracking-wide flex items-center gap-0.5"><AlertCircle className="w-2.5 h-2.5" />PENDING</span>}
            </div>
          </div>
          {a.lateOpen && <span title="Open late" className="shrink-0 mt-0.5 p-1 rounded bg-red-500/20 border border-red-500/40"><Moon className="w-3 h-3 text-red-300" /></span>}
        </div>

        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Radio className="w-3 h-3" />
            <span className="font-mono">{a.altitudeFloor} – {a.altitudeCeiling}</span>
          </div>
          {a.status === 'unknown' && (
            <div className="text-slate-400">
              Status unknown — no current FAA data.
              {a.lastKnownWindows && a.lastKnownWindows.length > 0 && (
                <span className="block font-mono text-[11px] text-slate-500 mt-0.5">
                  Last known (cached): {formatCT(a.lastKnownWindows[0].start)} {ctDayLabel(a.lastKnownWindows[0].start, now)} – {formatCT(a.lastKnownWindows[0].end)} {ctDayLabel(a.lastKnownWindows[0].end, now)}
                </span>
              )}
            </div>
          )}
          {w && (
            <>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="font-mono tabular-nums">
                  {a.status === 'active'
                    ? `Scheduled until ${formatCT(w.end)} ${ctDayLabel(w.end, now)}`
                    : `Scheduled ${formatCT(w.start)} ${ctDayLabel(w.start, now)}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Timer className="w-3 h-3" />
                <span className="font-mono tabular-nums">
                  {a.status === 'active' ? `Scheduled to end in ${formatDuration(w.end - now)}` : w.start <= now ? 'Pending approval' : `Opens in ${formatDuration(w.start - now)}`}
                </span>
              </div>
            </>
          )}
        </div>
        {a.status === 'active' && (
          <div className="mt-2 h-1 rounded-full bg-slate-700/60 overflow-hidden">
            <div className="h-full bg-orange-500/80 transition-[width] duration-1000" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </button>
  );
}
