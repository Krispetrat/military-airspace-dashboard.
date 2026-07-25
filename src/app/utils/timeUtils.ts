/**
 * Time utilities for aviation displays
 * Handles CST (local), UTC (Zulu), and countdown calculations
 */

export interface TimeDisplay {
  localStandard: string; // 3:00:30 PM
  localMilitary: string; // 15:00:30
  utc: string; // 20:00:30Z
  date: string; // Sat Mar 21
}

export interface Countdown {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  formatted: string; // "1h 23m" or "23m" or "45s"
}

/**
 * Get current time in all formats
 */
export function getCurrentTime(): TimeDisplay {
  const now = new Date();
  
  // Local time (CST is UTC-6)
  const localStandard = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  
  const localMilitary = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // UTC time
  const utc = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + 'Z';
  
  const date = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  
  return { localStandard, localMilitary, utc, date };
}

/**
 * Parse Zulu time string to Date object for today
 * Example: "14:00Z" -> Date object for today at 14:00 UTC
 */
export function parseZuluTime(zuluTimeStr: string): Date {
  const cleaned = zuluTimeStr.replace('Z', '').trim();
  const [hours, minutes] = cleaned.split(':').map(Number);
  
  const date = new Date();
  date.setUTCHours(hours, minutes || 0, 0, 0);
  
  return date;
}

/**
 * Calculate countdown to a target time
 */
export function calculateCountdown(targetTime: Date): Countdown {
  const now = new Date();
  const diff = targetTime.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  let formatted = '';
  if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    formatted = `${minutes}m`;
  } else if (seconds > 0) {
    formatted = `${seconds}s`;
  } else {
    formatted = 'Now';
  }
  
  return { hours, minutes, seconds, totalSeconds, formatted };
}

/**
 * Get countdown status for an airspace
 */
export function getAirspaceCountdown(
  status: 'active' | 'scheduled' | 'inactive',
  startTime?: string,
  endTime?: string
): { text: string; countdown: Countdown | null } {
  if (status === 'inactive') {
    return { text: 'Inactive', countdown: null };
  }
  
  if (status === 'active' && endTime) {
    const endDate = parseZuluTime(endTime);
    const countdown = calculateCountdown(endDate);
    return {
      text: `Ends in ${countdown.formatted}`,
      countdown,
    };
  }
  
  if (status === 'scheduled' && startTime) {
    const startDate = parseZuluTime(startTime);
    const countdown = calculateCountdown(startDate);
    return {
      text: `Starts in ${countdown.formatted}`,
      countdown,
    };
  }
  
  return { text: status.charAt(0).toUpperCase() + status.slice(1), countdown: null };
}

/**
 * Compute an airspace's LIVE status by comparing the actual current time
 * to its scheduled Zulu window, instead of trusting a hardcoded status
 * field. Handles windows that cross midnight Zulu (e.g. "19:00Z - 01:00Z").
 *
 * This is what makes the schedule panel/map actually live: previously
 * `status` was a fixed value baked into each airspace's data, so it never
 * changed as the day progressed - an airspace scheduled for "14:00Z -
 * 23:00Z" would still say "active" at 2am the next day.
 */
export function computeLiveStatus(
  scheduledStart?: string,
  scheduledEnd?: string
): 'active' | 'scheduled' | 'inactive' {
  if (!scheduledStart || !scheduledEnd) return 'inactive';

  const now = new Date();
  const start = parseZuluTime(scheduledStart);
  let end = parseZuluTime(scheduledEnd);

  const isOvernight = end <= start;
  if (isOvernight) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  if (now >= start && now < end) return 'active';

  // If the window crosses midnight, also check yesterday's occurrence in
  // case "now" is early this morning, after midnight but before the
  // window's end (e.g. it's 00:30Z and the window runs 19:00Z-01:00Z).
  if (isOvernight) {
    const startYesterday = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const endYesterday = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (now >= startYesterday && now < endYesterday) return 'active';
  }

  if (now < start) return 'scheduled';

  return 'inactive';
}

/**
 * Convert Zulu time to local display
 */
export function zuluToLocal(zuluTimeStr: string): { standard: string; military: string } {
  const zuluDate = parseZuluTime(zuluTimeStr);
  
  const standard = zuluDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  const military = zuluDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  return { standard, military };
}
