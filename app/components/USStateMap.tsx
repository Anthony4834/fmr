'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { buildCountySlug } from '@/lib/location-slugs';

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

interface USStateMapProps {
  year?: number;
}

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#fca5a5'; // Light red: <95 or no data
  }
  if (score >= 130) {
    return '#16a34a'; // Dark green: >= 130
  }
  return '#44e37e'; // Light green: >= 95 and < 130
}


const geoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

export default function USStateMap({ year }: USStateMapProps) {
  const router = useRouter();
  const [countyScores, setCountyScores] = useState<CountyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);

  useEffect(() => {
    const fetchScores = async () => {
      setLoading(true);
      try {
        const url = year
          ? `/api/stats/state-scores?year=${year}`
          : '/api/stats/state-scores';
        const res = await fetch(url);
        const json = await res.json();
        setCountyScores(json.countyScores || []);
      } catch (e) {
        console.error('Failed to fetch county scores:', e);
        setCountyScores([]);
      } finally {
        setLoading(false);
      }
    };
    fetchScores();
  }, [year]);

  // ✅ Build score map: ALWAYS pad; don't drop non-5-length inputs
  const scoreMap = useMemo(() => {
    const m = new Map<string, CountyScore>();
    for (const c of countyScores) {
      if (!c?.countyFips) continue;
      const fips = String(c.countyFips).replace(/\D/g, '').padStart(5, '0');
      if (fips.length !== 5) continue;
      // keep first occurrence
      if (!m.has(fips)) m.set(fips, c);
    }
    return m;
  }, [countyScores]);


  const handleCountyClick = (countyFips: string) => {
    const county = scoreMap.get(countyFips);
    if (!county?.countyName || !county?.stateCode) return;
    const countySlug = buildCountySlug(county.countyName, county.stateCode);
    router.push(`/county/${countySlug}`);
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-white rounded-lg border border-[#e5e5e5] flex items-center justify-center">
        <p className="text-[#737373]">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-[#e5e5e5] p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#0a0a0a] mb-1">
          Investment Score Heatmap by County
        </h3>
        <p className="text-sm text-[#737373]">
          Median investment score across all ZIP codes in each county (100 = national median)
        </p>
      </div>

      <div className="relative w-full h-[600px] bg-[#fafafa] rounded border border-[#e5e5e5] overflow-hidden">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1400 }}
          width={1400}
          height={600}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo: any) => {
                // ✅ For us-atlas counties, FIPS is geo.id
                const fips =
                  geo?.id !== undefined && geo?.id !== null
                    ? String(geo.id).padStart(5, '0')
                    : '';

                const county = fips ? scoreMap.get(fips) : undefined;
                const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                const fillColor = getColorForScore(scoreValue);
                const isHovered = hoveredCounty === fips;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke={isHovered ? '#0a0a0a' : '#ffffff'}
                    strokeWidth={isHovered ? 2 : 0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', cursor: county ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() => fips && setHoveredCounty(fips)}
                    onMouseLeave={() => setHoveredCounty(null)}
                    onClick={() => county && fips && handleCountyClick(fips)}
                    opacity={1}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

        <div className="mt-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#737373]">Score:</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-[#fca5a5]" title="< 95 or no data" />
                <span className="text-xs text-[#737373]">&lt; 95</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-[#44e37e]" title="≥ 95 and &lt; 130" />
                <span className="text-xs text-[#737373]">95-129</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-[#16a34a]" title="≥ 130" />
                <span className="text-xs text-[#737373]">≥ 130</span>
              </div>
            </div>
          </div>

        {hoveredCounty && scoreMap.get(hoveredCounty) && (
          <div className="text-sm text-[#0a0a0a]">
            <strong>{scoreMap.get(hoveredCounty)?.countyName}</strong>,{' '}
            {scoreMap.get(hoveredCounty)?.stateCode}: Score{' '}
            {scoreMap.get(hoveredCounty)?.medianScore?.toFixed(1) ?? 'N/A'} •{' '}
            {scoreMap.get(hoveredCounty)?.zipCount ?? 0} ZIPs
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-[#737373]">
        <p>Showing {scoreMap.size} counties with investment scores</p>
      </div>

      <p className="mt-4 text-xs text-[#737373]">
        Click a county to view detailed investment scores and ZIP code data.
      </p>
    </div>
  );
}
