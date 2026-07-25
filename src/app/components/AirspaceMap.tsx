import { useState, useRef, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { geoMercator, geoPath } from 'd3-geo';
import * as topojson from 'topojson-client';

// We import TopoJSON datasets directly from the installed npm packages
import usData from 'us-atlas/states-10m.json';

export interface Airspace {
  id: string;
  name: string;
  type: 'MOA' | 'ATCAA';
  status: 'active' | 'inactive' | 'scheduled';
  altitudeFloor: string;
  altitudeCeiling: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  activeTime?: string;
  controllingAgency: string;
  frequency?: string;
  coordinates: [number, number][]; // [lat, lon] format
  center: [number, number];
  section?: string;
  faaUrl?: string;
}

/**
 * Brownwood Complex Airspaces.
 *
 * Coordinates below are the exact requested boundary points, uniformly
 * shifted 0.10° latitude south (~11 km / 6 nm) so the complex lines up
 * with its real-world position relative to Brownwood, TX. Only latitude
 * is shifted — longitude is untouched, since "south" is a pure latitude
 * move. All six sub-sections still share exact vertices edge-to-edge, so
 * there are no gaps or overlaps after the shift.
 *
 * NOTE ON "CORRECT BUT NOT REALLY": the six sections' coordinates always
 * matched up numerically, but each section was drawn as its own
 * independently-stroked <polygon>, so the shared interior edges rendered
 * as visible seams — it looked like six boxes touching, not one complex.
 * BROWNWOOD_COMPLEX_OUTLINE (below, derived from these same vertices)
 * is now drawn once as a single perimeter stroke so the complex reads as
 * one continuous connected airspace, while the six sections underneath
 * remain individually clickable/hoverable.
 */
const BROWNWOOD_SOUTH_SHIFT = 0.10; // degrees latitude

export const AIRSPACES: Airspace[] = [
  // BROWNWOOD 1 EAST
  {
    id: 'brownwood-1-east',
    name: 'BROWNWOOD 1 EAST',
    type: 'MOA',
    status: 'active',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    activeTime: '14:00Z - 23:00Z',
    scheduledStart: '14:00Z',
    scheduledEnd: '23:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [32.004722, -98.893056],
      [31.979167, -98.279167],
      [31.643333, -98.416667],
      [31.661667, -98.893056],
    ],
    center: [31.82, -98.62],
  },
  // BROWNWOOD 1 WEST
  {
    id: 'brownwood-1-west',
    name: 'BROWNWOOD 1 WEST',
    type: 'MOA',
    status: 'active',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    activeTime: '14:00Z - 23:00Z',
    scheduledStart: '14:00Z',
    scheduledEnd: '23:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [32.025000, -99.433333],
      [32.004722, -98.893056],
      [31.661667, -98.893056],
      [31.680000, -99.410000],
    ],
    center: [31.84, -99.16],
  },
  // BROWNWOOD 2 EAST
  {
    id: 'brownwood-2-east',
    name: 'BROWNWOOD 2 EAST',
    type: 'MOA',
    status: 'active',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    activeTime: '14:00Z - 23:00Z',
    scheduledStart: '14:00Z',
    scheduledEnd: '23:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [31.661667, -98.893056],
      [31.643333, -98.416667],
      [31.291667, -98.550000],
      [31.288889, -98.893056],
    ],
    center: [31.47, -98.69],
  },
  // BROWNWOOD 2 WEST
  {
    id: 'brownwood-2-west',
    name: 'BROWNWOOD 2 WEST',
    type: 'MOA',
    status: 'active',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    activeTime: '14:00Z - 23:00Z',
    scheduledStart: '14:00Z',
    scheduledEnd: '23:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [31.680000, -99.410000],
      [31.661667, -98.893056],
      [31.288889, -98.893056],
      [31.286111, -99.383333],
    ],
    center: [31.48, -99.15],
  },
  // BROWNWOOD 3
  {
    id: 'brownwood-3',
    name: 'BROWNWOOD 3',
    type: 'MOA',
    status: 'scheduled',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    scheduledStart: '15:00Z',
    scheduledEnd: '22:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [31.795833, -99.779167],
      [32.025000, -99.433333],
      [31.286111, -99.383333],
      [31.283333, -99.750000],
    ],
    center: [31.65, -99.59],
  },
  // BROWNWOOD 4
  {
    id: 'brownwood-4',
    name: 'BROWNWOOD 4 MOA',
    type: 'MOA',
    status: 'scheduled',
    altitudeFloor: '100 AGL',
    altitudeCeiling: 'FL180',
    scheduledStart: '15:00Z',
    scheduledEnd: '22:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    faaUrl: 'https://sua.faa.gov/sua/lkSched.jsp?asname=BROWNWOOD%204%20MOA',
    coordinates: [
      [31.650000, -100.000000],
      [31.795833, -99.779167],
      [31.283333, -99.750000],
      [31.283333, -100.000000],
    ],
    center: [31.50, -99.88],
  },
  // BRADY NORTH
  {
    id: 'brady-north',
    name: 'BRADY NORTH MOA',
    type: 'MOA',
    status: 'inactive',
    altitudeFloor: '3,600 MSL',
    altitudeCeiling: 'FL180',
    scheduledStart: '19:00Z',
    scheduledEnd: '01:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    faaUrl: 'https://sua.faa.gov/sua/lkSched.jsp?asname=BRADY%20NORTH%20MOA',
    coordinates: [
      // First 3 points shifted with Brownwood's southward move so this
      // shared boundary still connects with no gap.
      [31.283333, -99.750000],
      [31.286111, -99.383333],
      [31.291667, -98.550000],
      [31.394444, -98.383333],
      [31.353889, -98.390556],
      [31.341944, -99.500278],
      [31.300278, -99.616944],
    ],
    center: [31.34, -99.08],
  },
  // BRADY HIGH (South)
  {
    id: 'brady-high',
    name: 'BRADY SOUTH HIGH MOA',
    type: 'MOA',
    status: 'inactive',
    altitudeFloor: '6,000 MSL',
    altitudeCeiling: 'FL180',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [31.353889, -98.390556],
      [30.886944, -98.822500],
      [31.136667, -99.565556],
      [31.300278, -99.616944],
      [31.341944, -99.500278],
    ],
    center: [31.20, -99.18],
  },
  // BRADY LOW (South)
  {
    id: 'brady-low',
    name: 'BRADY SOUTH LOW MOA',
    type: 'MOA',
    status: 'inactive',
    altitudeFloor: '500 AGL',
    altitudeCeiling: '5,999 MSL',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [31.353889, -98.390556],
      [30.886944, -98.822500],
      [31.136667, -99.565556],
      [31.300278, -99.616944],
      [31.341944, -99.500278],
    ],
    center: [31.15, -99.08],
  },
  // BROWNWOOD 3/4 ATCAA
  {
    id: 'brownwood-3-4-atcaa',
    name: 'BROWNWOOD 3/4 ATCAA',
    type: 'ATCAA',
    status: 'active',
    altitudeFloor: 'FL180',
    altitudeCeiling: 'FL600',
    activeTime: '14:00Z - 23:00Z',
    scheduledStart: '14:00Z',
    scheduledEnd: '23:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [32.025000, -99.433333],
      [32.004722, -98.893056],
      [31.661667, -98.893056],
      [31.680000, -99.410000],
      [31.795833, -99.779167],
      [31.650000, -100.000000],
      [31.283333, -100.000000],
      [31.283333, -99.750000],
      [31.286111, -99.383333],
    ],
    center: [31.75, -99.45],
  },
  // BROWNWOOD LIGHTNING 2/3 ATCAA
  {
    id: 'brownwood-lightning-2-3-atcaa',
    name: 'BROWNWOOD LIGHTNING 2/3 ATCAA',
    type: 'ATCAA',
    status: 'active',
    altitudeFloor: 'FL180',
    altitudeCeiling: 'FL600',
    activeTime: '15:00Z - 22:00Z',
    scheduledStart: '15:00Z',
    scheduledEnd: '22:00Z',
    controllingAgency: 'FORT WORTH CENTER',
    frequency: '126.65',
    coordinates: [
      [32.004722, -98.893056],
      [31.979167, -98.279167],
      [31.643333, -98.416667],
      [31.661667, -98.893056],
      [31.288889, -98.893056],
      [31.286111, -99.383333],
    ],
    center: [31.64, -98.81],
  },
];

/**
 * Outer perimeter of the six Brownwood MOA sections, traced once as a
 * single loop (L → J → E → A → B → C → G → H → I → K → M → L using the
 * shared-vertex naming above). Drawing this as one <polygon> stroke (see
 * render below) is what makes the complex look and behave like a single
 * continuous connected airspace instead of six separately-outlined boxes,
 * even though the underlying sections already shared exact vertices.
 */
export const BROWNWOOD_COMPLEX_OUTLINE: [number, number][] = [
  [31.650000, -100.000000], // L
  [31.795833, -99.779167],  // J
  [32.025000, -99.433333],  // E
  [32.004722, -98.893056],  // A
  [31.979167, -98.279167],  // B
  [31.643333, -98.416667],  // C
  [31.291667, -98.550000],  // G
  [31.288889, -98.893056],  // H
  [31.286111, -99.383333],  // I
  [31.283333, -99.750000],  // K
  [31.283333, -100.000000], // M
];

interface AirspaceMapProps {
  selectedAirspace: Airspace | null;
  onSelectAirspace: (airspace: Airspace | null) => void;
  airspaces?: Airspace[];
}

export function AirspaceMap({ selectedAirspace, onSelectAirspace, airspaces = AIRSPACES }: AirspaceMapProps) {
  const [hoveredAirspace, setHoveredAirspace] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  
  const mapWidth = 1200;
  const mapHeight = 900;
  
  // Set up d3-geo projection focusing correctly on Texas
  const projection = useMemo(() => {
    return geoMercator()
      .center([-99.0, 31.5]) // Centered accurately on central Texas / Brownwood area
      .scale(4200)
      .translate([mapWidth / 2, mapHeight / 2]);
  }, []);

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection]);

  // Convert states topojson to geojson features
  const statesFeatures = useMemo(() => {
    return (topojson.feature(usData as any, usData.objects.states as any) as any).features;
  }, []);
  
  const projectPoint = (lat: number, lon: number): [number, number] => {
    const coords = projection([lon, lat]);
    return coords ? [coords[0], coords[1]] : [0, 0];
  };

  const CITIES = [
    { name: 'Dallas', coords: [32.7767, -96.7970] },
    { name: 'Fort Worth', coords: [32.7555, -97.3308] },
    { name: 'Brownwood', coords: [31.7163, -98.9959] },
    { name: 'Austin', coords: [30.2672, -97.7431] },
    { name: 'San Antonio', coords: [29.4241, -98.4936] },
  ];
  
  const getAirspaceColor = (airspace: Airspace, isHovered: boolean, isSelected: boolean) => {
    const baseOpacity = airspace.type === 'ATCAA' ? 0.15 : 0.25;
    const hoverOpacity = airspace.type === 'ATCAA' ? 0.25 : 0.35;
    
    if (airspace.status === 'active') {
      return isSelected || isHovered ? `rgba(251, 146, 60, ${hoverOpacity})` : `rgba(251, 146, 60, ${baseOpacity})`;
    } else if (airspace.status === 'scheduled') {
      return isSelected || isHovered ? `rgba(251, 191, 36, ${hoverOpacity})` : `rgba(251, 191, 36, ${baseOpacity})`;
    }
    return isSelected || isHovered ? `rgba(100, 116, 139, ${hoverOpacity})` : `rgba(100, 116, 139, ${baseOpacity})`;
  };
  
  // The six Brownwood MOA sections are one continuous complex - their
  // shared interior edges shouldn't render individual borders at rest,
  // or every shared edge shows up as a visible seam even though the
  // coordinates line up exactly. BROWNWOOD_COMPLEX_OUTLINE (drawn once,
  // below) supplies the single perimeter stroke for the whole complex.
  const isBrownwoodMoaSection = (airspace: Airspace) =>
    airspace.type === 'MOA' && airspace.id.startsWith('brownwood-');

  const getStrokeColor = (airspace: Airspace, isHovered: boolean, isSelected: boolean) => {
    if (!isHovered && !isSelected && isBrownwoodMoaSection(airspace)) {
      return 'transparent';
    }
    if (isSelected) {
      return airspace.status === 'active' ? 'rgba(251, 146, 60, 1)' : airspace.status === 'scheduled' ? 'rgba(251, 191, 36, 1)' : 'rgba(100, 116, 139, 1)';
    }
    if (isHovered) {
      return airspace.status === 'active' ? 'rgba(251, 146, 60, 0.9)' : airspace.status === 'scheduled' ? 'rgba(251, 191, 36, 0.9)' : 'rgba(100, 116, 139, 0.9)';
    }
    if (airspace.status === 'active') {
      return 'rgba(251, 146, 60, 0.6)';
    } else if (airspace.status === 'scheduled') {
      return 'rgba(251, 191, 36, 0.6)';
    }
    return 'rgba(100, 116, 139, 0.5)';
  };

  const getStrokeDashArray = (airspace: Airspace) => {
    if (airspace.type === 'ATCAA') return '10,5';
    if (airspace.id.includes('high')) return '5,3';
    return 'none';
  };

  return (
    <div className="absolute inset-0 bg-[#0a0f16] rounded-lg overflow-hidden border border-slate-800">

      {/* Zoom and Pan Wrapper */}
      <TransformWrapper
        initialScale={1.0}
        minScale={0.3}
        maxScale={8}
        centerZoomedOut={true}
        wheel={{ step: 0.1 }}
        onTransformed={(_, state) => setCurrentScale(state.scale)}
      >
        {({ zoomIn, zoomOut, resetTransform }) => {
          const textScale = 1 / currentScale;

          return (
          <>
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
               <button onClick={() => zoomIn()} className="w-8 h-8 flex items-center justify-center bg-[#1a2332]/90 backdrop-blur rounded border border-slate-700 text-slate-300 hover:bg-slate-700/80 transition-colors shadow-lg font-bold">+</button>
               <button onClick={() => zoomOut()} className="w-8 h-8 flex items-center justify-center bg-[#1a2332]/90 backdrop-blur rounded border border-slate-700 text-slate-300 hover:bg-slate-700/80 transition-colors shadow-lg font-bold">-</button>
               <button onClick={() => resetTransform()} className="w-8 h-8 flex items-center justify-center bg-[#1a2332]/90 backdrop-blur rounded border border-slate-700 text-slate-300 hover:bg-slate-700/80 transition-colors shadow-lg" title="Reset Map">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
               </button>
            </div>
            
            <TransformComponent
              wrapperClass="!w-full !h-full cursor-grab active:cursor-grabbing"
              contentClass="!w-full !h-full !flex !items-center !justify-center"
            >
              <svg
                viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
                style={{ minWidth: '100%', minHeight: '100%' }}
              >
                {/* 1. Base states (Vector Basemap) */}
                <g className="states-layer">
                  {statesFeatures.map((feature: any, i: number) => {
                    const isTexas = feature.properties.name === 'Texas';
                    return (
                      <path
                        key={i}
                        d={pathGenerator(feature) || ''}
                        fill={isTexas ? '#121a24' : '#0d131a'}
                        stroke={isTexas ? '#2a3b50' : '#1e293b'}
                        strokeWidth={isTexas ? 1.5 : 1}
                      />
                    );
                  })}
                </g>

                {/* 2. Grid lines for pure aviation aesthetic */}
                <g className="grid-layer" opacity={0.3}>
                  {Array.from({ length: 20 }).map((_, i) => {
                    const lon = -106 + i * 1;
                    const p1 = projection([lon, 25]);
                    const p2 = projection([lon, 37]);
                    if (!p1 || !p2) return null;
                    return (
                      <line key={`lon-${i}`} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                    );
                  })}
                  {Array.from({ length: 15 }).map((_, i) => {
                    const lat = 25 + i * 1;
                    const p1 = projection([-106, lat]);
                    const p2 = projection([-93, lat]);
                    if (!p1 || !p2) return null;
                    return (
                      <line key={`lat-${i}`} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                    );
                  })}
                </g>
                
                {/* 3. Cities */}
                <g className="cities-layer">
                  {CITIES.map((city) => {
                    const [x, y] = projectPoint(city.coords[0], city.coords[1]);
                    return (
                      <g key={city.name} transform={`translate(${x},${y}) scale(${textScale})`}>
                        <circle cx="0" cy="0" r="3" fill="rgba(148, 163, 184, 0.8)" />
                        <text
                          x="6"
                          y="3"
                          fill="rgba(148, 163, 184, 0.9)"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="system-ui"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {city.name}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* 4. Airspace Polygons */}
                <g className="airspace-layer">
                  {[...airspaces].sort((a, b) => (a.type === 'ATCAA' ? -1 : 1)).map((airspace) => {
                    const isHovered = hoveredAirspace === airspace.id;
                    const isSelected = selectedAirspace?.id === airspace.id;
                    
                    // Create path data accurately projected
                    const points = airspace.coordinates
                      .map((coord) => projectPoint(coord[0], coord[1]).join(','))
                      .join(' ');
                    
                    const centerPoint = projectPoint(airspace.center[0], airspace.center[1]);

                    return (
                      <g key={airspace.id}>
                        <polygon
                          points={points}
                          fill={getAirspaceColor(airspace, isHovered, isSelected)}
                          stroke={getStrokeColor(airspace, isHovered, isSelected)}
                          strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
                          strokeDasharray={getStrokeDashArray(airspace)}
                          style={{
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            filter: isSelected ? 'drop-shadow(0 0 10px rgba(251, 146, 60, 0.4))' : 'none',
                          }}
                          onMouseEnter={() => setHoveredAirspace(airspace.id)}
                          onMouseLeave={() => setHoveredAirspace(null)}
                          onClick={() => onSelectAirspace(isSelected ? null : airspace)}
                        />
                        
                        {/* Label - only show for non-ATCAA */}
                        {airspace.type !== 'ATCAA' && (
                          <g transform={`translate(${centerPoint[0]}, ${centerPoint[1]}) scale(${textScale})`}>
                            <text
                              x="0"
                              y="-6"
                              fill="rgba(248, 250, 252, 0.95)"
                              fontSize="9"
                              fontWeight="600"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              style={{ pointerEvents: 'none', userSelect: 'none' }}
                            >
                              {airspace.name}
                            </text>
                            <text
                              x="0"
                              y="6"
                              fill="rgba(203, 213, 225, 0.75)"
                              fontSize="7"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontFamily="monospace"
                              style={{ pointerEvents: 'none', userSelect: 'none' }}
                            >
                              {airspace.altitudeFloor.replace(',', '')} - {airspace.altitudeCeiling.replace(',', '')}
                            </text>
                          </g>
                        )}
                        
                        {/* Status indicator pulse for active airspaces */}
                        {airspace.status === 'active' && airspace.type !== 'ATCAA' && (
                          <g transform={`translate(${centerPoint[0]}, ${centerPoint[1]}) scale(${textScale})`}>
                            <circle
                              cx="-45"
                              cy="-6"
                              r="2.5"
                              fill="rgba(251, 146, 60, 1)"
                              style={{ pointerEvents: 'none' }}
                            >
                              <animate
                                attributeName="opacity"
                                values="1;0.3;1"
                                dur="2s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Single unified perimeter for the Brownwood complex -
                      draws the six MOA sections as one continuous shape.
                      pointerEvents 'none' so clicks still hit the section
                      fills underneath. */}
                  <polygon
                    points={BROWNWOOD_COMPLEX_OUTLINE
                      .map((coord) => projectPoint(coord[0], coord[1]).join(','))
                      .join(' ')}
                    fill="none"
                    stroke="rgba(203, 213, 225, 0.8)"
                    strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              </svg>
            </TransformComponent>
          </>
        );
        }}
      </TransformWrapper>
      
      {/* Map overlay info (Fixed relative to map window) */}
      <div className="absolute top-4 left-4 bg-[#1a2332]/90 backdrop-blur-md border border-slate-700/50 rounded-md px-3 py-2 shadow-lg z-20 pointer-events-none">
        <div className="text-xs text-slate-300 font-semibold tracking-wide">TEXAS MILITARY AIRSPACE</div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
          Brownwood & Brady Complex
        </div>
      </div>
      
      {/* Legend (Fixed relative to map window) */}
      <div className="absolute bottom-4 left-4 bg-[#1a2332]/90 backdrop-blur-md border border-slate-700/50 rounded-md px-3 py-2.5 shadow-lg z-20 pointer-events-none">
        <div className="text-xs text-slate-300 font-semibold mb-2">STATUS</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[rgba(251,146,60,0.3)] border border-[rgba(251,146,60,0.6)]"></div>
            <span className="text-xs text-slate-400">Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[rgba(251,191,36,0.25)] border border-[rgba(251,191,36,0.5)]"></div>
            <span className="text-xs text-slate-400">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[rgba(100,116,139,0.2)] border border-[rgba(100,116,139,0.4)]"></div>
            <span className="text-xs text-slate-400">Inactive</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-slate-400"></div>
            <span className="text-xs text-slate-400">ATCAA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
