'use client';

import { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
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

// Helper function to get CSS variable value safely
function getCSSVariable(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return getCSSVariable('--map-color-low', '#fca5a5'); // Light red: <95 or no data
  }
  if (score >= 130) {
    return getCSSVariable('--map-color-high', '#16a34a'); // Dark green: >= 130
  }
  return getCSSVariable('--map-color-medium', '#44e37e'); // Light green: >= 95 and < 130
}

const countyGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const stateGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// A "safe" center point for geoAlbersUsa (roughly central US).
// Using [0, 0] can cause geoAlbersUsa to return null and crash on zoom/pan.
const DEFAULT_US_CENTER: [number, number] = [-97, 38];

function isValidAlbersUsaCenter(coords: [number, number]): boolean {
  const lon = coords[0];
  const lat = coords[1];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

  // Rough bounding boxes for geoAlbersUsa sub-projections (lower 48, Alaska, Hawaii).
  const inLower48 = lon >= -125 && lon <= -66 && lat >= 24 && lat <= 50;
  const inAlaska = lon >= -170 && lon <= -130 && lat >= 50 && lat <= 72;
  const inHawaii = lon >= -161 && lon <= -154 && lat >= 18 && lat <= 24;

  return inLower48 || inAlaska || inHawaii;
}

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowHeight, setWindowHeight] = useState(600);
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: DEFAULT_US_CENTER,
    zoom: 1,
  });

  // Ensure coordinates are always valid
  const safeCoordinates: [number, number] = useMemo(() => {
    const coords = position.coordinates;
    if (
      Array.isArray(coords) &&
      coords.length === 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number' &&
      !isNaN(coords[0]) &&
      !isNaN(coords[1])
    ) {
      const candidate: [number, number] = [coords[0], coords[1]];
      if (isValidAlbersUsaCenter(candidate)) return candidate;
    }
    return DEFAULT_US_CENTER;
  }, [position.coordinates]);

  const safeZoom = useMemo(() => {
    const zoom = position.zoom;
    if (typeof zoom === 'number' && !isNaN(zoom) && zoom >= 0.5 && zoom <= 4) {
      return zoom;
    }
    return 1;
  }, [position.zoom]);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const switchContainerRef = useRef<HTMLDivElement | null>(null);
  const switchButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [switchIndicatorStyle, setSwitchIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // Update window height for fullscreen
  useEffect(() => {
    if (isFullscreen) {
      setWindowHeight(window.innerHeight);
      const handleResize = () => setWindowHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isFullscreen]);

  // Update switch indicator position when map level changes or window resizes
  useLayoutEffect(() => {
    const updateIndicator = () => {
      if (!switchContainerRef.current || switchButtonRefs.current.length === 0) return;
      const activeIndex = mapLevel === 'county' ? 0 : 1;
      const activeButton = switchButtonRefs.current[activeIndex];
      const container = switchContainerRef.current;
      if (!activeButton || !container) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setSwitchIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [mapLevel]);

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

  // Handle ESC key to close fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // Prevent body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  const mapContent = (
    <div 
      ref={mapContainerRef}
      className={`relative w-full bg-[var(--map-bg)] overflow-hidden ${
        isFullscreen ? 'h-screen' : 'h-[500px] sm:h-[600px] rounded-lg border border-[var(--border-color)]'
      }`}
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
      {/* Loading overlay - stays visible during map type switches */}
      {loading && (
        <div className="absolute inset-0 z-20 bg-[var(--map-bg)] flex items-center justify-center">
          <p className="text-[var(--text-tertiary)]">Loading map...</p>
        </div>
      )}
      {/* County/State selector and Fullscreen button - positioned inside map */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <div ref={switchContainerRef} className="relative inline-flex border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] shadow-sm overflow-hidden">
          {/* Animated sliding indicator */}
          <div
            className="absolute top-0 bottom-0 bg-[var(--bg-hover)] transition-all duration-300 ease-out"
            style={{
              left: `${switchIndicatorStyle.left}px`,
              width: `${switchIndicatorStyle.width}px`,
            }}
          />
          <button
            ref={(el) => {
              switchButtonRefs.current[0] = el;
            }}
            onClick={() => setMapLevel('county')}
            className={`relative px-2.5 py-2 text-xs font-medium transition-colors duration-200 ${
              mapLevel === 'county'
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            County
          </button>
          <button
            ref={(el) => {
              switchButtonRefs.current[1] = el;
            }}
            onClick={() => setMapLevel('state')}
            className={`relative px-2.5 py-2 text-xs font-medium transition-colors duration-200 ${
              mapLevel === 'state'
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            State
          </button>
        </div>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="px-2.5 py-2 text-xs font-medium rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] shadow-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
      </div>
      {!loading && (
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1400 }}
          width={1400}
          height={isFullscreen ? windowHeight : 600}
          className="w-full h-full transition-opacity duration-300"
          style={{ width: '100%', height: '100%' }}
          key={mapLevel}
        >
        <ZoomableGroup
          zoom={safeZoom}
          center={safeCoordinates}
          onMoveEnd={(pos: any) => {
            try {
              if (pos && typeof pos === 'object') {
                const coords = pos.coordinates;
                const zoom = pos.zoom;
                
                // Validate coordinates
                if (Array.isArray(coords) && coords.length === 2) {
                  const lon = Number(coords[0]);
                  const lat = Number(coords[1]);
                  if (!isNaN(lon) && !isNaN(lat) && isValidAlbersUsaCenter([lon, lat])) {
                    // Validate zoom
                    const validZoom = typeof zoom === 'number' && !isNaN(zoom) 
                      ? Math.max(0.5, Math.min(4, zoom))
                      : safeZoom;
                    
                    setPosition({ 
                      coordinates: [lon, lat] as [number, number], 
                      zoom: validZoom 
                    });
                  }
                }
              }
            } catch (e) {
              // Silently ignore errors in callback to prevent crashes
              console.warn('Error in onMoveEnd:', e);
            }
          }}
          minZoom={0.5}
          maxZoom={4}
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
                  const lowColor = getCSSVariable('--map-color-low', '#fca5a5');
                  const sortedGeos = [...geographies].sort((a, b) => {
                    const getIsRed = (geo: any) => {
                      if (mapLevel === 'county') {
                        const fips = geo?.id !== undefined && geo?.id !== null
                          ? String(geo.id).padStart(5, '0')
                          : '';
                        const county = fips ? countyScoreMap.get(fips) : undefined;
                        const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                        return getColorForScore(scoreValue) === lowColor;
                      } else {
                        const stateCode = getStateCode(geo);
                        const state = stateCode ? stateScoreMap.get(stateCode) : undefined;
                        const scoreValue = state?.medianScore ?? state?.avgScore ?? null;
                        return getColorForScore(scoreValue) === lowColor;
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
                      const isRed = fillColor === lowColor;

                      const strokeColor = isHovered 
                        ? getCSSVariable('--map-stroke-hover', '#0a0a0a')
                        : (isRed 
                          ? getCSSVariable('--map-stroke-low', '#ffffff')
                          : getCSSVariable('--map-stroke-high', '#525252'));

                      return (
                        <Geography
                          key={`stroke-${geo.rsmKey}`}
                          geography={geo}
                          fill="none"
                          stroke={strokeColor}
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
                      const isRed = fillColor === lowColor;

                      const strokeColor = isHovered 
                        ? getCSSVariable('--map-stroke-hover', '#0a0a0a')
                        : (isRed 
                          ? getCSSVariable('--map-stroke-low', '#ffffff')
                          : getCSSVariable('--map-stroke-high', '#525252'));

                      return (
                        <Geography
                          key={`stroke-${geo.rsmKey}`}
                          geography={geo}
                          fill="none"
                          stroke={strokeColor}
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
        </ZoomableGroup>
        </ComposableMap>
      )}

      {/* Zoom Controls */}
      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1">
        <button
          onClick={() => {
            const newZoom = Math.min(safeZoom * 1.5, 4);
            setPosition({ coordinates: safeCoordinates, zoom: newZoom });
          }}
          className="px-2.5 py-2 text-xs font-medium rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] shadow-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => {
            const newZoom = Math.max(safeZoom / 1.5, 0.5);
            setPosition({ coordinates: safeCoordinates, zoom: newZoom });
          }}
          className="px-2.5 py-2 text-xs font-medium rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] shadow-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={() => {
            setPosition({ coordinates: DEFAULT_US_CENTER, zoom: 1 });
          }}
          className="px-2.5 py-2 text-xs font-medium rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] shadow-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label="Reset zoom"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

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
  );

  if (isFullscreen) {
    return (
      <div
        ref={fullscreenRef}
        className="fixed inset-0 z-50 bg-[var(--map-bg)]"
        onClick={(e) => {
          // Close fullscreen if clicking on the overlay background (not the map)
          if (e.target === fullscreenRef.current) {
            setIsFullscreen(false);
          }
        }}
      >
        {mapContent}
      </div>
    );
  }

  return (
    <div className="w-full">
      {mapContent}
    </div>
  );
}
