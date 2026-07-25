import { useState, useRef, useEffect } from 'react';
import { X, Move, Maximize2, Minimize2 } from 'lucide-react';

const TWITCH_CHANNEL = 'thoraviation';

interface TwitchPopoutProps {
  onClose: () => void;
}

export function TwitchPopout({ onClose }: TwitchPopoutProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - (isExpanded ? 640 : 420), dragRef.current.initialX + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - (isExpanded ? 400 : 260), dragRef.current.initialY + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isExpanded]);

  const width = isExpanded ? 640 : 420;
  const height = isExpanded ? 400 : 260;

  return (
    <div
      className="fixed z-50 bg-[#1a2332] rounded-lg shadow-2xl border border-purple-600/50 overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        height: `${height}px`,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header */}
      <div
        className="bg-purple-700 px-3 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4 text-white/70" />
          <span className="text-sm font-semibold text-white">DFW Scanner - Thor Aviation</span>
        </div>
        <div className="flex items-center gap-2 no-drag">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white/70 hover:text-white transition-colors p-1 hover:bg-purple-600 rounded"
            aria-label={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 hover:bg-purple-600 rounded"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Twitch Embed */}
      <div className="w-full h-[calc(100%-40px)] bg-black">
        <iframe
          src={`https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=${window.location.hostname}&muted=false`}
          height="100%"
          width="100%"
          allowFullScreen
          frameBorder="0"
          scrolling="no"
          title="Twitch Stream"
        ></iframe>
      </div>
    </div>
  );
}
