import { useState, useEffect } from 'react';
import { ExternalLink, Tv } from 'lucide-react';
import { isTwitchChannelLive } from '../services/twitchStatus';

const TWITCH_CHANNEL = 'thoraviation';
const TWITCH_URL = `https://www.twitch.tv/${TWITCH_CHANNEL}`;

interface TwitchBannerProps {
  className?: string;
  onOpenPopout?: () => void;
  onLiveChange?: (isLive: boolean) => void;
}

export function TwitchBanner({ className = '', onOpenPopout, onLiveChange }: TwitchBannerProps) {
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check Twitch live status
    checkTwitchStatus();
    
    // Refresh status every 60 seconds
    const interval = setInterval(checkTwitchStatus, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const checkTwitchStatus = async () => {
    try {
      const live = await isTwitchChannelLive(TWITCH_CHANNEL);
      setIsLive(live);
      setIsLoading(false);
      onLiveChange?.(live);
    } catch (error) {
      console.error('Error checking Twitch status:', error);
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    window.open(TWITCH_URL, '_blank', 'noopener,noreferrer');
  };

  const handlePopoutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenPopout) {
      onOpenPopout();
    }
  };

  if (isLoading) {
    return (
      <div 
        className={`w-full bg-purple-700 text-white px-6 py-3 ${className}`}
      >
        <div className="flex items-center justify-center gap-3">
          <div className="animate-pulse text-sm font-medium">
            Checking stream status...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full bg-purple-700 text-white px-6 py-3 ${className}`}
    >
      <div className="flex items-center justify-center gap-4">
        {/* Live/Offline Indicator */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-md">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-xs font-bold uppercase tracking-wide">LIVE</span>
              </div>
              <span className="text-sm font-semibold">
                LIVE – DFW Scanner (Courtesy of Thor Aviation)
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-600 rounded-md">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-xs font-bold uppercase tracking-wide">OFFLINE</span>
              </div>
              <span className="text-sm font-semibold">
                OFFLINE – DFW Scanner (Courtesy of Thor Aviation)
              </span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Popout Player Button (only show when live) */}
          {isLive && onOpenPopout && (
            <button
              onClick={handlePopoutClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-md transition-colors text-xs font-semibold"
              aria-label="Open Popout Player"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Popout Player</span>
            </button>
          )}

          {/* External Link Button */}
          <button
            onClick={handleClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-800 hover:bg-purple-600 rounded-md transition-colors text-xs font-semibold"
            aria-label={`Visit ${TWITCH_CHANNEL} on Twitch`}
          >
            <span>Watch on Twitch</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}