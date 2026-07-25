import { useState, useEffect, useMemo } from 'react';
import { StatusBar } from './components/StatusBar';
import { SchedulePanel } from './components/SchedulePanel';
import { AirspaceMap, AIRSPACES, Airspace } from './components/AirspaceMap';
import { AirspaceInfoCard } from './components/AirspaceInfoCard';
import { TwitchBanner } from './components/TwitchBanner';
import { TwitchPopout } from './components/TwitchPopout';
import { fetchBrownwoodComplexData } from './services/faaData';
import { computeLiveStatus } from './utils/timeUtils';

export default function App() {
  const [selectedAirspace, setSelectedAirspace] = useState<Airspace | null>(null);
  const [faaData, setFaaData] = useState<any>(null);
  const [showPopout, setShowPopout] = useState(false);

  // Fetch FAA data on mount and refresh every 5 minutes
  useEffect(() => {
    const loadFAAData = async () => {
      try {
        const data = await fetchBrownwoodComplexData();
        setFaaData(data);
        console.log('FAA SUA Data loaded:', data);
      } catch (error) {
        console.error('Error fetching FAA data:', error);
      }
    };

    loadFAAData();
    const faaInterval = setInterval(loadFAAData, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(faaInterval);
  }, []);

  // Previously `status` was just whatever was hardcoded on each airspace
  // in AIRSPACES, so the panel/map never changed as the day went on. Now
  // we recompute each airspace's status every tick from its real Zulu
  // schedule window vs the actual current time, so "Active Now" /
  // "Scheduled" / "Inactive" are genuinely live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tickInterval = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(tickInterval);
  }, []);

  const liveAirspaces = useMemo<Airspace[]>(() => {
    return AIRSPACES.map((airspace) => {
      if (!airspace.scheduledStart || !airspace.scheduledEnd) {
        return airspace;
      }
      return {
        ...airspace,
        status: computeLiveStatus(airspace.scheduledStart, airspace.scheduledEnd),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [now]);

  return (
    <div className="size-full flex flex-col bg-[#0f1419]">
      {/* Twitch Stream Banner */}
      <TwitchBanner onOpenPopout={() => setShowPopout(true)} />
      
      {/* Top Status Bar */}
      <StatusBar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar - Schedule Panel */}
        <div className="w-80 flex-shrink-0 md:block hidden">
          <SchedulePanel
            airspaces={liveAirspaces}
            selectedAirspace={selectedAirspace}
            onSelectAirspace={setSelectedAirspace}
          />
        </div>

        {/* Main Map Area */}
        <div className="flex-1 relative">
          <AirspaceMap
            airspaces={liveAirspaces}
            selectedAirspace={selectedAirspace}
            onSelectAirspace={setSelectedAirspace}
          />

          {/* Info Card Overlay */}
          {selectedAirspace && (
            <AirspaceInfoCard
              airspace={selectedAirspace}
              onClose={() => setSelectedAirspace(null)}
            />
          )}
        </div>
      </div>

      {/* Mobile Schedule Panel (Bottom Sheet) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a2332] border-t border-slate-700 p-4 z-40 max-h-[40vh] overflow-auto">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Active Airspace</div>
        <div className="space-y-2">
          {liveAirspaces.filter(a => a.status === 'active').map(airspace => (
            <button
              key={airspace.id}
              onClick={() => setSelectedAirspace(airspace)}
              className="w-full text-left px-3 py-2 bg-[#0f1419] border border-slate-700 rounded-md text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
            >
              {airspace.name}
            </button>
          ))}
        </div>
      </div>

      {/* Twitch Popout */}
      {showPopout && <TwitchPopout onClose={() => setShowPopout(false)} />}
    </div>
  );
}