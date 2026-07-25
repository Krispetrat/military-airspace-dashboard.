import { Clock, Calendar, Radio, Timer } from 'lucide-react';
import { Airspace } from './AirspaceMap';
import { useState, useEffect } from 'react';
import { getAirspaceCountdown } from '../utils/timeUtils';

interface SchedulePanelProps {
  airspaces: Airspace[];
  selectedAirspace: Airspace | null;
  onSelectAirspace: (airspace: Airspace) => void;
}

export function SchedulePanel({ airspaces, selectedAirspace, onSelectAirspace }: SchedulePanelProps) {
  const activeAirspaces = airspaces.filter((a) => a.status === 'active');
  const scheduledAirspaces = airspaces.filter((a) => a.status === 'scheduled');
  const inactiveAirspaces = airspaces.filter((a) => a.status === 'inactive');

  const [countdowns, setCountdowns] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: { [key: string]: string } = {};
      airspaces.forEach((airspace) => {
        if (airspace.status === 'active' || airspace.status === 'scheduled') {
          const result = getAirspaceCountdown(
            airspace.status,
            airspace.scheduledStart,
            airspace.scheduledEnd
          );
          newCountdowns[airspace.id] = result.text;
        }
      });
      setCountdowns(newCountdowns);
    };

    updateCountdowns();
    const intervalId = setInterval(updateCountdowns, 1000);

    return () => clearInterval(intervalId);
  }, [airspaces]);

  return (
    <div className="h-full bg-[#141b26] border-r border-slate-700/50 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
          Airspace Schedule
        </h2>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5" />
          <span className="font-mono">{new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          })}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Active Section */}
        {activeAirspaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
                Active Now ({activeAirspaces.length})
              </h3>
            </div>
            <div className="space-y-2">
              {activeAirspaces.map((airspace) => (
                <AirspaceCard
                  key={airspace.id}
                  airspace={airspace}
                  isSelected={selectedAirspace?.id === airspace.id}
                  onClick={() => onSelectAirspace(airspace)}
                  countdown={countdowns[airspace.id]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Scheduled Section */}
        {scheduledAirspaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-amber-400" />
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                Scheduled ({scheduledAirspaces.length})
              </h3>
            </div>
            <div className="space-y-2">
              {scheduledAirspaces.map((airspace) => (
                <AirspaceCard
                  key={airspace.id}
                  airspace={airspace}
                  isSelected={selectedAirspace?.id === airspace.id}
                  onClick={() => onSelectAirspace(airspace)}
                  countdown={countdowns[airspace.id]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Inactive Section */}
        {inactiveAirspaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Inactive ({inactiveAirspaces.length})
              </h3>
            </div>
            <div className="space-y-2">
              {inactiveAirspaces.map((airspace) => (
                <AirspaceCard
                  key={airspace.id}
                  airspace={airspace}
                  isSelected={selectedAirspace?.id === airspace.id}
                  onClick={() => onSelectAirspace(airspace)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AirspaceCard({ 
  airspace, 
  isSelected, 
  onClick,
  countdown
}: { 
  airspace: Airspace; 
  isSelected: boolean; 
  onClick: () => void; 
  countdown?: string;
}) {
  const statusColors = {
    active: 'border-orange-500/40 bg-orange-500/5',
    scheduled: 'border-amber-500/40 bg-amber-500/5',
    inactive: 'border-slate-600/40 bg-slate-700/5',
  };

  const selectedBorder = {
    active: 'border-orange-500/80 shadow-lg shadow-orange-500/20',
    scheduled: 'border-amber-500/80 shadow-lg shadow-amber-500/20',
    inactive: 'border-slate-500/80 shadow-lg shadow-slate-500/20',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-md border transition-all duration-200 hover:bg-slate-700/20 ${
        isSelected ? selectedBorder[airspace.status] : statusColors[airspace.status]
      }`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-200">{airspace.name}</div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">{airspace.type}</div>
        </div>
        {airspace.status === 'active' && (
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse mt-1"></div>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Radio className="w-3 h-3" />
          <span className="font-mono">{airspace.altitudeFloor} - {airspace.altitudeCeiling}</span>
        </div>
        
        {airspace.activeTime && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{airspace.activeTime}</span>
          </div>
        )}
        
        {airspace.scheduledStart && airspace.scheduledEnd && !airspace.activeTime && (
          <div className="flex items-center gap-1.5 text-slate-400">
            <Timer className="w-3 h-3" />
            <span className="font-mono">{countdown || 'N/A'}</span>
          </div>
        )}
      </div>
    </button>
  );
}