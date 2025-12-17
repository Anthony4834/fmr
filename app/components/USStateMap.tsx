'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { buildCountySlug } from '@/lib/location-slugs';
import { STATES } from '@/lib/states';

interface CountyScore {
  countyFips: string;
  countyName: string;
  stateCode: string;
  medianScore: number | null;
  avgScore: number | null;
  zipCount: number;
  avgYield: number | null;
  avgYieldPct: number | null;
}

interface StateScore {
  stateCode: string;
  medianScore: number | null;
  avgScore: number | null;
  zipCount: number;
}

interface USStateMapProps {
  year?: number;
}

type MapLevel = 'county' | 'state';

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#fca5a5'; // Light red: <95 or no data
  }
  if (score >= 130) {
    return '#16a34a'; // Dark green: >= 130
  }
  return '#44e37e'; // Light green: >= 95 and < 130
}

const countyGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const stateGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

function getStateCode(geo: any): string {
  const props = geo?.properties || {};

  // Try common property names for state abbreviation
  const abbrevCandidates = [
    props.abbrev,
    props.abbreviation,
    props.state,
    props.stateCode,
    props.code,
    props.STUSPS,
    props.STUSAB,
  ].filter(Boolean);

  for (const candidate of abbrevCandidates) {
    const code = String(candidate).toUpperCase().trim();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
      const isValidState = STATES.some(s => s.code === code);
      if (isValidState) {
        return code;
      }
    }
  }

  // Try matching by state name
  if (props.name) {
    const stateName = String(props.name).trim();
    const stateMatch = STATES.find(s =>
      s.name === stateName ||
      s.name.toLowerCase() === stateName.toLowerCase()
    );
    if (stateMatch) {
      return stateMatch.code;
    }
  }

  // Last resort: try geo.id if it looks like a state code
  if (geo?.id) {
    const idStr = String(geo.id).trim().toUpperCase();
    if (idStr.length === 2 && /^[A-Z]{2}$/.test(idStr)) {
      const isValidState = STATES.some(s => s.code === idStr);
      if (isValidState) {
        return idStr;
      }
    }
  }

  return '';
}

export default function USStateMap({ year }: USStateMapProps) {
  const router = useRouter();
  const [mapLevel, setMapLevel] = useState<MapLevel>('county');
  const [countyScores, setCountyScores] = useState<CountyScore[]>([]);
  const [stateScores, setStateScores] = useState<StateScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchScores = async () => {
      setLoading(true);
      try {
        if (mapLevel === 'county') {
          // Add cache-busting timestamp to force fresh requests
          const timestamp = Date.now();
          const url = year
            ? `/api/stats/state-scores?year=${year}&_t=${timestamp}`
            : `/api/stats/state-scores?_t=${timestamp}`;
          const res = await fetch(url, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
            },
          });
          const json = await res.json();
          console.log('[USStateMap] Fetched county scores:', {
            count: json.countyScores?.length || 0,
            debug: json._debug,
            sample: json.countyScores?.slice(0, 3).map((c: any) => ({
              fips: c.countyFips,
              name: c.countyName,
              score: c.medianScore,
            })),
          });
          setCountyScores(json.countyScores || []);
        } else {
          // Add cache-busting timestamp to force fresh requests
          const timestamp = Date.now();
          const url = year
            ? `/api/stats/state-scores?level=state&year=${year}&_t=${timestamp}`
            : `/api/stats/state-scores?level=state&_t=${timestamp}`;
          const res = await fetch(url, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
            },
          });
          const json = await res.json();
          console.log('[USStateMap] Fetched state scores:', {
            count: json.stateScores?.length || 0,
            debug: json._debug,
          });
          setStateScores(json.stateScores || []);
        }
      } catch (e) {
        console.error('Failed to fetch scores:', e);
        if (mapLevel === 'county') {
          setCountyScores([]);
        } else {
          setStateScores([]);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchScores();
  }, [year, mapLevel]);

  // ✅ Build county score map: ALWAYS pad; don't drop non-5-length inputs
  // Use FIPS as key (FIPS codes are unique across the entire US)
  // If duplicates exist, keep the one with more ZIPs or higher score
  const countyScoreMap = useMemo(() => {
    const m = new Map<string, CountyScore>();
    for (const c of countyScores) {
      if (!c?.countyFips) continue;
      const fips = String(c.countyFips).replace(/\D/g, '').padStart(5, '0');
      if (fips.length !== 5) continue;
      
      // If we already have this FIPS, keep the one with more ZIPs or higher score
      const existing = m.get(fips);
      if (!existing || 
          (c.zipCount > existing.zipCount) ||
          (c.zipCount === existing.zipCount && (c.medianScore ?? 0) > (existing.medianScore ?? 0))) {
        m.set(fips, c);
      }
    }
    return m;
  }, [countyScores]);

  // Build state score map (normalize state codes to uppercase for consistent matching)
  const stateScoreMap = useMemo(() => {
    const m = new Map<string, StateScore>();
    for (const s of stateScores) {
      if (!s?.stateCode) continue;
      // Normalize to uppercase for consistent matching
      const normalizedCode = String(s.stateCode).toUpperCase().trim();
      m.set(normalizedCode, s);
    }
    return m;
  }, [stateScores]);


  const handleCountyClick = (countyFips: string) => {
    const county = countyScoreMap.get(countyFips);
    if (!county?.countyName || !county?.stateCode) return;
    const countySlug = buildCountySlug(county.countyName, county.stateCode);
    router.push(`/county/${countySlug}`);
  };

  const handleStateClick = (stateCode: string) => {
    router.push(`/state/${stateCode}`);
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-white rounded-lg border border-[#e5e5e5] flex items-center justify-center">
        <p className="text-[#737373]">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div 
        ref={mapContainerRef}
        className="relative w-full h-[500px] sm:h-[600px] bg-[#fafafa] rounded-lg border border-[#e5e5e5] overflow-hidden"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePosition({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        }}
        onMouseLeave={() => {
          setMousePosition(null);
          setHoveredCounty(null);
          setHoveredState(null);
        }}
      >
        {/* County/State selector - positioned inside map */}
        <div className="absolute top-3 right-3 z-10">
          <div className="flex gap-1 border border-[#e5e5e5] rounded-lg p-1 bg-white shadow-sm">
            <button
              onClick={() => setMapLevel('county')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                mapLevel === 'county'
                  ? 'bg-[#fafafa] text-[#0a0a0a]'
                  : 'text-[#737373] hover:text-[#0a0a0a]'
              }`}
            >
              County
            </button>
            <button
              onClick={() => setMapLevel('state')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                mapLevel === 'state'
                  ? 'bg-[#fafafa] text-[#0a0a0a]'
                  : 'text-[#737373] hover:text-[#0a0a0a]'
              }`}
            >
              State
            </button>
          </div>
        </div>
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1400 }}
          width={1400}
          height={600}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Separate fill and stroke layers to prevent border overlap issues */}
          <Geographies geography={mapLevel === 'county' ? countyGeoUrl : stateGeoUrl}>
            {({ geographies }: { geographies: any[] }) => (
              <>
                {/* First layer: fills only */}
                {geographies.map((geo: any) => {
                  if (mapLevel === 'county') {
                    const fips =
                      geo?.id !== undefined && geo?.id !== null
                        ? String(geo.id).padStart(5, '0')
                        : '';
                    const county = fips ? countyScoreMap.get(fips) : undefined;
                    const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                    const fillColor = getColorForScore(scoreValue);

                    return (
                      <Geography
                        key={`fill-${geo.rsmKey}`}
                        geography={geo}
                        fill={fillColor}
                        stroke="none"
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', cursor: county ? 'pointer' : 'default' },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={() => fips && setHoveredCounty(fips)}
                        onMouseLeave={() => setHoveredCounty(null)}
                        onClick={() => county && fips && handleCountyClick(fips)}
                      />
                    );
                  } else {
                    const stateCode = getStateCode(geo);
                    const state = stateCode ? stateScoreMap.get(stateCode) : undefined;
                    const scoreValue = state?.medianScore ?? state?.avgScore ?? null;
                    const fillColor = getColorForScore(scoreValue);

                    return (
                      <Geography
                        key={`fill-${geo.rsmKey}`}
                        geography={geo}
                        fill={fillColor}
                        stroke="none"
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', cursor: state ? 'pointer' : 'default' },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={() => stateCode && setHoveredState(stateCode)}
                        onMouseLeave={() => setHoveredState(null)}
                        onClick={() => state && stateCode && handleStateClick(stateCode)}
                      />
                    );
                  }
                })}
                {/* Second layer: strokes only - render white strokes first, then black on top */}
                {(() => {
                  // Sort geographies: red (white stroke) first, then green (black stroke)
                  const sortedGeos = [...geographies].sort((a, b) => {
                    const getIsRed = (geo: any) => {
                      if (mapLevel === 'county') {
                        const fips = geo?.id !== undefined && geo?.id !== null
                          ? String(geo.id).padStart(5, '0')
                          : '';
                        const county = fips ? countyScoreMap.get(fips) : undefined;
                        const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                        return getColorForScore(scoreValue) === '#fca5a5';
                      } else {
                        const stateCode = getStateCode(geo);
                        const state = stateCode ? stateScoreMap.get(stateCode) : undefined;
                        const scoreValue = state?.medianScore ?? state?.avgScore ?? null;
                        return getColorForScore(scoreValue) === '#fca5a5';
                      }
                    };
                    const aIsRed = getIsRed(a);
                    const bIsRed = getIsRed(b);
                    // Red (white stroke) first, green (black stroke) last
                    if (aIsRed && !bIsRed) return -1;
                    if (!aIsRed && bIsRed) return 1;
                    return 0;
                  });

                  return sortedGeos.map((geo: any) => {
                    if (mapLevel === 'county') {
                      const fips =
                        geo?.id !== undefined && geo?.id !== null
                          ? String(geo.id).padStart(5, '0')
                          : '';
                      const county = fips ? countyScoreMap.get(fips) : undefined;
                      const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                      const fillColor = getColorForScore(scoreValue);
                      const isHovered = hoveredCounty === fips;
                      const isRed = fillColor === '#fca5a5';

                      return (
                        <Geography
                          key={`stroke-${geo.rsmKey}`}
                          geography={geo}
                          fill="none"
                          stroke={isHovered ? '#0a0a0a' : (isRed ? '#ffffff' : '#525252')}
                          strokeWidth={isHovered ? 1.5 : 0.3}
                          style={{
                            default: { outline: 'none', pointerEvents: 'none' },
                            hover: { outline: 'none', pointerEvents: 'none' },
                            pressed: { outline: 'none', pointerEvents: 'none' },
                          }}
                        />
                      );
                    } else {
                      const stateCode = getStateCode(geo);
                      const state = stateCode ? stateScoreMap.get(stateCode) : undefined;
                      const scoreValue = state?.medianScore ?? state?.avgScore ?? null;
                      const fillColor = getColorForScore(scoreValue);
                      const isHovered = hoveredState === stateCode;
                      const isRed = fillColor === '#fca5a5';

                      return (
                        <Geography
                          key={`stroke-${geo.rsmKey}`}
                          geography={geo}
                          fill="none"
                          stroke={isHovered ? '#0a0a0a' : (isRed ? '#ffffff' : '#525252')}
                          strokeWidth={isHovered ? 1.5 : 0.3}
                          style={{
                            default: { outline: 'none', pointerEvents: 'none' },
                            hover: { outline: 'none', pointerEvents: 'none' },
                            pressed: { outline: 'none', pointerEvents: 'none' },
                          }}
                        />
                      );
                    }
                  });
                })()}
              </>
            )}
          </Geographies>
        </ComposableMap>

        {/* Tooltip */}
        {mousePosition && mapContainerRef.current && (
          <>
            {mapLevel === 'county' && hoveredCounty && countyScoreMap.get(hoveredCounty) && (
              <div
                className="absolute pointer-events-none z-20 bg-[#0a0a0a] text-white text-xs rounded-md px-2 py-1.5 shadow-lg whitespace-nowrap"
                style={{
                  left: mousePosition.x + 10 > mapContainerRef.current.offsetWidth - 200
                    ? `${mousePosition.x - 10}px`
                    : `${mousePosition.x + 10}px`,
                  top: `${mousePosition.y - 10}px`,
                  transform: mousePosition.x + 10 > mapContainerRef.current.offsetWidth - 200
                    ? 'translateX(-100%)'
                    : 'translateX(0)',
                }}
              >
                <div className="font-semibold">{countyScoreMap.get(hoveredCounty)?.countyName}</div>
                <div className="text-[#d4d4d4]">
                  {countyScoreMap.get(hoveredCounty)?.stateCode}: Score {countyScoreMap.get(hoveredCounty)?.medianScore?.toFixed(1) ?? 'N/A'}
                </div>
              </div>
            )}
            {mapLevel === 'state' && hoveredState && stateScoreMap.get(hoveredState) && (
              <div
                className="absolute pointer-events-none z-20 bg-[#0a0a0a] text-white text-xs rounded-md px-2 py-1.5 shadow-lg whitespace-nowrap"
                style={{
                  left: mousePosition.x + 10 > mapContainerRef.current.offsetWidth - 200
                    ? `${mousePosition.x - 10}px`
                    : `${mousePosition.x + 10}px`,
                  top: `${mousePosition.y - 10}px`,
                  transform: mousePosition.x + 10 > mapContainerRef.current.offsetWidth - 200
                    ? 'translateX(-100%)'
                    : 'translateX(0)',
                }}
              >
                <div className="font-semibold">{hoveredState}</div>
                <div className="text-[#d4d4d4]">
                  Score: {stateScoreMap.get(hoveredState)?.medianScore?.toFixed(1) ?? 'N/A'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
