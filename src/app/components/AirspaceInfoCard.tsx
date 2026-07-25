import { useState, useEffect } from 'react';
import { X, Radio, Layers, Clock, Building2, Phone, Timer } from 'lucide-react';
import { Airspace } from './AirspaceMap';
import { getAirspaceCountdown, zuluToLocal } from '../utils/timeUtils';

interface AirspaceInfoCardProps {
  airspace: Airspace;
  onClose: () => void;
}

export function AirspaceInfoCard({ airspace, onClose }: AirspaceInfoCardProps) {
  const [countdown, setCountdown] = useState(
    getAirspaceCountdown(airspace.status, airspace.scheduledStart, airspace.scheduledEnd)
  );
  
  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(
        getAirspaceCountdown(airspace.status, airspace.scheduledStart, airspace.scheduledEnd)
      );
    }, 1000);
    
    return () => clearInterval(interval);
  }, [airspace.status, airspace.scheduledStart, airspace.scheduledEnd]);

  const statusConfig = {
    active: {
      border: '#fb923c',
      badge: 'bg-orange-500/30 text-orange-200 border-orange-500/60',
    },
    scheduled: {
      border: '#fbbf24',
      badge: 'bg-amber-500/30 text-amber-200 border-amber-500/60',
    },
    inactive: {
      border: '#64748b',
      badge: 'bg-slate-600/30 text-slate-300 border-slate-600/60',
    },
  };

  const config = statusConfig[airspace.status];
  
  // Convert times to local
  const startLocal = airspace.scheduledStart ? zuluToLocal(airspace.scheduledStart) : null;
  const endLocal = airspace.scheduledEnd ? zuluToLocal(airspace.scheduledEnd) : null;

  return (
    <div 
      className="absolute top-6 right-6 w-80 border rounded-lg shadow-2xl overflow-hidden"
      style={{
        backgroundColor: '#1a2332',
        borderColor: config.border,
        boxShadow: '0 20px 60px -10px rgba(0, 0, 0, 0.95)',
      }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 border-b flex items-start justify-between"
        style={{ 
          backgroundColor: '#0d1117',
          borderColor: config.border + '80',
        }}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-slate-100">{airspace.name}</h3>
            {airspace.status === 'active' && (
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border ${config.badge} font-semibold uppercase tracking-wide`}>
              {airspace.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded border ${config.badge} font-semibold uppercase tracking-wide`}>
              {airspace.status}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-700/50 rounded"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div 
        className="px-4 py-4 space-y-3"
        style={{ backgroundColor: '#141b26' }}
      >
        {/* Countdown */}
        {countdown.countdown && (
          <div 
            className="flex items-center gap-3 px-3 py-2 rounded-md"
            style={{ 
              backgroundColor: airspace.status === 'active' ? '#fb923c20' : '#fbbf2420',
              border: `1px solid ${airspace.status === 'active' ? '#fb923c40' : '#fbbf2440'}`,
            }}
          >
            <Timer className={`w-4 h-4 ${airspace.status === 'active' ? 'text-orange-400' : 'text-amber-400'}`} />
            <div className="flex-1">
              <div className={`text-sm font-semibold ${airspace.status === 'active' ? 'text-orange-300' : 'text-amber-300'}`}>
                {countdown.text}
              </div>
            </div>
          </div>
        )}
        
        {/* Altitude */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Altitude</div>
            <div className="text-sm text-slate-200 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Floor:</span>
                <span>{airspace.altitudeFloor}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-400">Ceiling:</span>
                <span>{airspace.altitudeCeiling}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Time - Enhanced with local + Zulu */}
        {(startLocal || endLocal) && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                {airspace.status === 'active' ? 'Active Time' : 'Scheduled Time'}
              </div>
              <div className="space-y-1.5 text-xs">
                {startLocal && (
                  <div>
                    <div className="text-slate-400">Start:</div>
                    <div className="text-slate-200 font-mono pl-2">
                      {startLocal.standard} CST ({startLocal.military})
                    </div>
                    <div className="text-slate-400 font-mono pl-2 text-[11px]">
                      {airspace.scheduledStart}
                    </div>
                  </div>
                )}
                {endLocal && (
                  <div>
                    <div className="text-slate-400">End:</div>
                    <div className="text-slate-200 font-mono pl-2">
                      {endLocal.standard} CST ({endLocal.military})
                    </div>
                    <div className="text-slate-400 font-mono pl-2 text-[11px]">
                      {airspace.scheduledEnd}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Controlling Agency */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
              Controlling Agency
            </div>
            <div className="text-sm text-slate-200">{airspace.controllingAgency}</div>
          </div>
        </div>

        {/* Frequency */}
        {airspace.frequency && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Phone className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Frequency</div>
              <div className="text-sm text-slate-200 font-mono">{airspace.frequency} MHz</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div 
        className="px-4 py-2.5 border-t"
        style={{ 
          backgroundColor: '#0f1419',
          borderColor: '#374151',
        }}
      >
        <div className="text-xs text-slate-500 font-mono">
          Last Updated: {new Date().toLocaleTimeString('en-US', { hour12: false })}
        </div>
      </div>
    </div>
  );
}