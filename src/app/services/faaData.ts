/**
 * FAA Special Use Airspace (SUA) Data Service
 * 
 * This service fetches live schedule data from the FAA SUA website.
 * In production, this would require a backend proxy to avoid CORS issues,
 * or use the FAA's official API if available.
 * 
 * For now, this uses mock data structured to match FAA SUA format.
 */

export interface FAAScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
  altitude: string;
  status: 'active' | 'scheduled' | 'inactive';
}

export interface FAAAirspaceData {
  name: string;
  type: 'MOA' | 'ATCAA';
  controllingAgency: string;
  frequency: string;
  altitudeFloor: string;
  altitudeCeiling: string;
  schedule: FAAScheduleEntry[];
  lastUpdated: string;
}

// FAA SUA URLs for reference
const FAA_SUA_URLS = {
  'BROWNWOOD 4 MOA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%204%20MOA',
  'BROWNWOOD 3 ATCAA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%203%20ATCAA',
  'BROWNWOOD 4 ATCAA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%204%20ATCAA',
  'BROWNWOOD LIGHTNING 2 ATCAA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%20LIGHTNING%202%20ATCAA',
  'BROWNWOOD LIGHTNING 3 ATCAA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%20LIGHTNING%203%20ATCAA',
  'BRADY NORTH MOA': 'https://sua.faa.gov/sua/lkSched.jsp?asname=BRADY%20NORTH%20MOA',
};

/**
 * Fetches current schedule data from FAA SUA website
 * 
 * NOTE: In production, implement one of these approaches:
 * 1. Backend proxy server to fetch FAA data and handle CORS
 * 2. Use FAA's official API if they provide one
 * 3. Set up scheduled scraping with a backend service
 */
async function fetchFAASchedule(airspaceName: string): Promise<FAAAirspaceData> {
  // TODO: Replace with actual FAA API call through backend proxy
  // const response = await fetch(`/api/faa-sua/${encodeURIComponent(airspaceName)}`);
  // return await response.json();
  
  // For now, return mock data that matches FAA format
  return getMockFAAData(airspaceName);
}

/**
 * Mock FAA data - structured to match real FAA SUA schedule format
 * Replace this with actual API calls to FAA
 */
function getMockFAAData(airspaceName: string): FAAAirspaceData {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentHour = today.getUTCHours(); // schedule times are Zulu (UTC)
  
  // Mock data based on typical FAA SUA schedules
  const mockData: Record<string, FAAAirspaceData> = {
    'BROWNWOOD 4 MOA': {
      name: 'BROWNWOOD 4 MOA',
      type: 'MOA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: '13,000 MSL',
      altitudeCeiling: '18,000 MSL',
      schedule: [
        {
          date: todayStr,
          startTime: '14:00Z',
          endTime: '23:00Z',
          altitude: '13000-18000',
          status: currentHour >= 14 && currentHour < 23 ? 'active' : 'scheduled',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BROWNWOOD 3 ATCAA': {
      name: 'BROWNWOOD 3 ATCAA',
      type: 'ATCAA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: 'FL180',
      altitudeCeiling: 'FL600',
      schedule: [
        {
          date: todayStr,
          startTime: '14:00Z',
          endTime: '23:00Z',
          altitude: 'FL180-FL600',
          status: currentHour >= 14 && currentHour < 23 ? 'active' : 'scheduled',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BROWNWOOD 4 ATCAA': {
      name: 'BROWNWOOD 4 ATCAA',
      type: 'ATCAA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: 'FL180',
      altitudeCeiling: 'FL600',
      schedule: [
        {
          date: todayStr,
          startTime: '14:00Z',
          endTime: '23:00Z',
          altitude: 'FL180-FL600',
          status: currentHour >= 14 && currentHour < 23 ? 'active' : 'scheduled',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BROWNWOOD LIGHTNING 2 ATCAA': {
      name: 'BROWNWOOD LIGHTNING 2 ATCAA',
      type: 'ATCAA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: 'FL180',
      altitudeCeiling: 'FL600',
      schedule: [
        {
          date: todayStr,
          startTime: '15:00Z',
          endTime: '22:00Z',
          altitude: 'FL180-FL600',
          status: currentHour >= 15 && currentHour < 22 ? 'active' : 'scheduled',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BROWNWOOD LIGHTNING 3 ATCAA': {
      name: 'BROWNWOOD LIGHTNING 3 ATCAA',
      type: 'ATCAA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: 'FL180',
      altitudeCeiling: 'FL600',
      schedule: [
        {
          date: todayStr,
          startTime: '15:00Z',
          endTime: '22:00Z',
          altitude: 'FL180-FL600',
          status: 'inactive',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BRADY NORTH MOA': {
      name: 'BRADY NORTH MOA',
      type: 'MOA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: '3,600 MSL',
      altitudeCeiling: '18,000 MSL',
      schedule: [
        {
          date: todayStr,
          startTime: '19:00Z',
          endTime: '01:00Z',
          altitude: '3600-18000',
          status: 'scheduled',
        },
      ],
      lastUpdated: new Date().toISOString(),
    },
    'BRADY SOUTH LOW': {
      name: 'BRADY SOUTH MOA',
      type: 'MOA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: '500 AGL',
      altitudeCeiling: '5,999 MSL',
      schedule: [],
      lastUpdated: new Date().toISOString(),
    },
    'BRADY SOUTH HIGH': {
      name: 'BRADY SOUTH MOA',
      type: 'MOA',
      controllingAgency: 'FORT WORTH CENTER',
      frequency: '126.65',
      altitudeFloor: '6,000 MSL',
      altitudeCeiling: '18,000 MSL',
      schedule: [],
      lastUpdated: new Date().toISOString(),
    },
  };
  
  return mockData[airspaceName] || {
    name: airspaceName,
    type: 'MOA',
    controllingAgency: 'UNKNOWN',
    frequency: '',
    altitudeFloor: '',
    altitudeCeiling: '',
    schedule: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get current status for an airspace based on its schedule
 */
export function getAirspaceStatus(schedule: FAAScheduleEntry[]): 'active' | 'scheduled' | 'inactive' {
  if (schedule.length === 0) return 'inactive';
  
  const now = new Date();
  const currentTime = now.toISOString();
  
  for (const entry of schedule) {
    if (entry.status === 'active') {
      return 'active';
    }
    if (entry.status === 'scheduled') {
      return 'scheduled';
    }
  }
  
  return 'inactive';
}

/**
 * Get active time string from schedule
 */
export function getActiveTimeString(schedule: FAAScheduleEntry[]): string | undefined {
  const activeEntry = schedule.find(entry => entry.status === 'active');
  if (activeEntry) {
    return `${activeEntry.startTime} - ${activeEntry.endTime}`;
  }
  return undefined;
}

/**
 * Main export - fetch all Brownwood complex airspace data
 */
export async function fetchBrownwoodComplexData(): Promise<Record<string, FAAAirspaceData>> {
  // In production, fetch all in parallel
  // const results = await Promise.all([
  //   fetchFAASchedule('BROWNWOOD 4 MOA'),
  //   fetchFAASchedule('BROWNWOOD 3 ATCAA'),
  //   fetchFAASchedule('BROWNWOOD 4 ATCAA'),
  //   fetchFAASchedule('BROWNWOOD LIGHTNING 2 ATCAA'),
  //   fetchFAASchedule('BROWNWOOD LIGHTNING 3 ATCAA'),
  //   fetchFAASchedule('BRADY NORTH MOA'),
  // ]);
  
  return {
    'BROWNWOOD 4 MOA': getMockFAAData('BROWNWOOD 4 MOA'),
    'BROWNWOOD 3 ATCAA': getMockFAAData('BROWNWOOD 3 ATCAA'),
    'BROWNWOOD 4 ATCAA': getMockFAAData('BROWNWOOD 4 ATCAA'),
    'BROWNWOOD LIGHTNING 2 ATCAA': getMockFAAData('BROWNWOOD LIGHTNING 2 ATCAA'),
    'BROWNWOOD LIGHTNING 3 ATCAA': getMockFAAData('BROWNWOOD LIGHTNING 3 ATCAA'),
    'BRADY NORTH MOA': getMockFAAData('BRADY NORTH MOA'),
    'BRADY SOUTH LOW': getMockFAAData('BRADY SOUTH LOW'),
    'BRADY SOUTH HIGH': getMockFAAData('BRADY SOUTH HIGH'),
  };
}

export { FAA_SUA_URLS };
