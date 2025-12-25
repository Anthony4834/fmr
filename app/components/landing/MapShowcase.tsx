'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';

interface CountyScore {
  countyFips: string;
  countyName: string;
  stateCode: string;
  medianScore: number | null;
  avgScore: number | null;
  zipCount: number;
}

interface MapShowcaseProps {
  onReady?: () => void;
}

const countyGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#fca5a5';
  }
  if (score >= 130) {
    return '#16a34a';
  }
  return '#44e37e';
}

// Static map component - no interactivity
function StaticUSMap({ countyScores, onRender }: { countyScores: CountyScore[]; onRender?: () => void }) {
  const hasRenderedRef = useRef(false);

  const countyScoreMap = useMemo(() => {
    const m = new Map<string, CountyScore>();
    for (const c of countyScores) {
      if (!c?.countyFips) continue;
      const fips = String(c.countyFips).replace(/\D/g, '').padStart(5, '0');
      if (fips.length !== 5) continue;
      const existing = m.get(fips);
      if (!existing ||
          (c.zipCount > existing.zipCount) ||
          (c.zipCount === existing.zipCount && (c.medianScore ?? 0) > (existing.medianScore ?? 0))) {
        m.set(fips, c);
      }
    }
    return m;
  }, [countyScores]);

  return (
    <ComposableMap
      projection="geoAlbersUsa"
      projectionConfig={{ scale: 1000 }}
      width={800}
      height={500}
      style={{ width: '100%', height: '100%' }}
    >
      <Geographies geography={countyGeoUrl}>
        {({ geographies }: { geographies: any[] }) => {
          // Signal ready after first render with geographies
          if (geographies.length > 0 && !hasRenderedRef.current) {
            hasRenderedRef.current = true;
            // Use setTimeout to ensure DOM has painted
            setTimeout(() => onRender?.(), 100);
          }

          return (
            <>
              {geographies.map((geo: any) => {
                const fips = geo?.id !== undefined && geo?.id !== null
                  ? String(geo.id).padStart(5, '0')
                  : '';
                const county = fips ? countyScoreMap.get(fips) : undefined;
                const scoreValue = county?.medianScore ?? county?.avgScore ?? null;
                const fillColor = getColorForScore(scoreValue);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke="#ffffff"
                    strokeWidth={0.2}
                    style={{
                      default: { outline: 'none', cursor: 'default' },
                      hover: { outline: 'none', cursor: 'default' },
                      pressed: { outline: 'none', cursor: 'default' },
                    }}
                  />
                );
              })}
            </>
          );
        }}
      </Geographies>
    </ComposableMap>
  );
}

// Investment score factor component
function ScoreFactor({ icon, title, description, delay, isVisible }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`flex gap-4 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#0a0a0a]/[0.04] flex items-center justify-center text-[#0a0a0a]/60">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-[#0a0a0a] text-sm">{title}</h4>
        <p className="text-sm text-[#737373]/70 mt-0.5 font-light">{description}</p>
      </div>
    </div>
  );
}

export default function MapShowcase({ onReady }: MapShowcaseProps) {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.3, mobileThreshold: 0.4 });
  const [countyScores, setCountyScores] = useState<CountyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const onReadyCalledRef = useRef(false);

  // Callback when map has rendered
  const handleMapRender = () => {
    if (!onReadyCalledRef.current) {
      onReadyCalledRef.current = true;
      onReady?.();
    }
  };

  // Pre-fetch county scores immediately on mount (before in view)
  useEffect(() => {
    const fetchScores = async () => {
      try {
        const res = await fetch('/api/stats/state-scores');
        const json = await res.json();
        setCountyScores(json.countyScores || []);
      } catch (e) {
        console.error('Failed to fetch scores:', e);
        // Call onReady even if fetch fails so we don't block forever
        if (!onReadyCalledRef.current) {
          onReadyCalledRef.current = true;
          onReady?.();
        }
      } finally {
        setLoading(false);
      }
    };
    fetchScores();

    // Preload GeoJSON for map
    fetch(countyGeoUrl).catch(() => {});

    // Fallback timeout - if map doesn't render within 8 seconds, unblock anyway
    const fallbackTimer = setTimeout(() => {
      if (!onReadyCalledRef.current) {
        onReadyCalledRef.current = true;
        onReady?.();
      }
    }, 8000);

    return () => clearTimeout(fallbackTimer);
  }, [onReady]);

  return (
    <section ref={ref} className="py-16 sm:py-24 md:py-32 bg-[#fafafa] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className={`mb-10 sm:mb-14 md:mb-20 transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-[#0a0a0a] mb-3 sm:mb-4 tracking-tight">
            Discover Cash Flowing Markets
          </h2>
          <p className="text-base sm:text-lg text-[#737373]/80 font-light max-w-xl">
            Our Investment Score helps you identify markets with the best rental yield potential
          </p>
        </div>

        {/* Two column layout - Map left, Score explanation right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: 3D Map Card */}
          <div
            className={`transition-all duration-1000 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}
            style={{ perspective: '1200px' }}
          >
            <div
              className={`relative bg-white rounded-2xl border border-[#e5e5e5]/60 overflow-hidden shadow-lg transition-transform duration-1000 ${hasBeenInView ? 'rotate-0' : ''}`}
              style={{
                transform: hasBeenInView ? 'rotateY(6deg) rotateX(2deg)' : 'rotateY(20deg) rotateX(5deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Map legend bar */}
              <div className="px-4 py-3 border-b border-[#e5e5e5]/40 bg-[#fafafa]/50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" />
                    <span className="text-xs text-[#737373] font-light">130+</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#44e37e]" />
                    <span className="text-xs text-[#737373] font-light">95-129</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm bg-[#fca5a5]" />
                    <span className="text-xs text-[#737373] font-light">&lt;95</span>
                  </div>
                </div>
              </div>

              {/* Map container */}
              <div className="relative h-[280px] sm:h-[320px] bg-[#f8f9fa]">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-[#737373]">Loading map...</span>
                    </div>
                  </div>
                ) : (
                  <StaticUSMap countyScores={countyScores} onRender={handleMapRender} />
                )}
              </div>
            </div>

            {/* Shadow effect */}
            <div
              className={`absolute -bottom-4 left-4 right-4 h-8 bg-black/10 rounded-xl blur-xl -z-10 transition-opacity duration-1000 ${hasBeenInView ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: 'rotateY(6deg)' }}
            />
          </div>

          {/* Right: Investment Score Explanation */}
          <div className={`transition-all duration-700 delay-300 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
            <div className="space-y-8">
              {/* Score intro */}
              <div className={`transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#16a34a]/[0.08] text-[#16a34a] text-sm font-normal mb-5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Investment Score
                </div>
                <h3 className="text-xl sm:text-2xl font-medium text-[#0a0a0a] mb-3 tracking-tight">
                  What Goes Into the Score?
                </h3>
                <p className="text-[#737373]/80 font-light leading-relaxed">
                  Our proprietary Investment Score analyzes multiple data points to rate each market&apos;s potential for rental property investing.
                </p>
              </div>

              {/* Score factors */}
              <div className="space-y-5">
                <ScoreFactor
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                  title="Fair Market Rent (FMR)"
                  description="HUD-published rental rates that determine Section 8 payment standards"
                  delay={400}
                  isVisible={hasBeenInView}
                />

                <ScoreFactor
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                  title="Property Values (ZHVI)"
                  description="Zillow Home Value Index to calculate rent-to-price ratios"
                  delay={500}
                  isVisible={hasBeenInView}
                />

                <ScoreFactor
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                  title="Property Tax Rates"
                  description="Local tax rates that impact your operating expenses"
                  delay={600}
                  isVisible={hasBeenInView}
                />

                <ScoreFactor
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                  title="Rental Demand"
                  description="Market rental demand data indicating tenant availability"
                  delay={700}
                  isVisible={hasBeenInView}
                />
              </div>

              {/* CTA */}
              <div className={`transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '800ms' }}>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0a0a0a] text-white font-normal rounded-lg hover:bg-[#0a0a0a]/90 transition-colors text-sm"
                >
                  Explore the Interactive Map
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
