import { Activity, Radio, Wifi } from 'lucide-react';
import { useState, useEffect } from 'react';

export function StatusBar() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // CST is UTC-6 (standard) or UTC-5 (daylight saving)
  // Using 'America/Chicago' timezone for accurate CST/CDT handling
  const cstTime12 = currentTime.toLocaleTimeString('en-US', { 
    timeZone: 'America/Chicago',
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const cstTime24 = currentTime.toLocaleTimeString('en-US', { 
    timeZone: 'America/Chicago',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const zuluTime = currentTime.toISOString().split('T')[1].split('.')[0];

  return (
    <div className="bg-[#0d1117] border-b border-slate-700/50 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left side - Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-orange-500" />
            <h1 className="text-lg font-semibold text-slate-100 tracking-tight">
              Military Airspace Scheduler
            </h1>
          </div>
          <div className="h-4 w-px bg-slate-700"></div>
          <span className="text-xs text-slate-400 font-mono uppercase tracking-wide">
            Central Texas Region
          </span>
        </div>

        {/* Right side - Status indicators */}
        <div className="flex items-center gap-6">
          {/* Time display */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">CST Standard</div>
              <div className="text-sm font-mono text-slate-200">{cstTime12}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">CST Military</div>
              <div className="text-sm font-mono text-slate-200">{cstTime24}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Zulu Time</div>
              <div className="text-sm font-mono text-slate-200">{zuluTime}Z</div>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-700"></div>

          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-300 font-semibold">CONNECTED</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-blue-300 font-semibold">LIVE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}