'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

interface CountyScore {
  countyFips: string;
  countyName: string;
  stateCode: string;
  medianScore: number | null;
  avgScore: number | null;
  zipCount: number;
}

export interface MapShowcaseProps {
  onReady?: () => void;
}

const countyGeoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

function getColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return 'var(--map-color-low, #fca5a5)';
  }
  if (score >= 130) {
    return 'var(--map-color-high, #16a34a)';
  }
  return 'var(--map-color-medium, #44e37e)';
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${className}`}
      style={{
        border: '1px solid hsl(220 15% 88%)',
        backgroundColor: 'transparent',
        color: 'hsl(220 15% 45%)',
      }}
    >
      {children}
    </span>
  );
}

// Icons
const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
);

const DollarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);

const HomeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
  </svg>
);

const FileTextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

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
      projectionConfig={{ scale: 1200 }}
      width={1200}
      height={750}
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
                    stroke="var(--bg-secondary, #ffffff)"
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

// Compact score factor for horizontal display
function ScoreFactorCompact({ icon, title, description, span2 }: { icon: React.ReactNode; title: string; description?: string; span2?: boolean }) {
  return (
    <div 
      className={`flex ${span2 ? 'flex-row items-start' : 'items-center'} gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border`}
      style={{ 
        backgroundColor: '#ffffff',
        borderColor: 'hsl(220 15% 88%)',
        gridColumn: span2 ? 'span 2' : undefined,
      }}
    >
      <div 
        className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
      >
        <div style={{ color: 'hsl(192 85% 42%)' }}>{icon}</div>
      </div>
      <div className="flex-1 min-w-0">
        <span 
          className="font-medium text-xs sm:text-sm block"
          style={{ color: 'hsl(220 30% 12%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {title}
        </span>
        {description && (
          <span 
            className="text-xs mt-0.5 sm:mt-1 block leading-snug"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MapShowcase({ onReady }: MapShowcaseProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
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
    <section
      ref={ref}
      className="py-8 sm:py-12 md:py-24 overflow-hidden border-t sm:border-t-0"
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Mobile header */}
        <div className="sm:hidden text-center mb-4">
          <Badge className="mb-2">Interactive Map</Badge>
          <h2 
            className="font-display text-xl font-bold tracking-tight mb-2"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Discover{" "}
            <span style={{ color: 'hsl(192 85% 42%)' }}>cash flowing markets</span>
          </h2>
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg text-white transition-colors text-xs"
            style={{ backgroundColor: 'hsl(192 85% 42%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Explore Map
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Desktop header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="hidden sm:block text-center mb-8 sm:mb-12 md:mb-16"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <Badge className="mb-3 sm:mb-4">Interactive Map</Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3 sm:mb-4"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Discover{" "}
            <span style={{ color: 'hsl(192 85% 42%)' }}>cash flowing markets</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg max-w-2xl mx-auto mb-4 sm:mb-6"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Our Investment Score helps you identify markets with the best rental yield potential
          </motion.p>
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex justify-center"
          >
            <Link
              href="/map"
              className="inline-flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg text-white transition-colors text-sm"
              style={{ backgroundColor: 'hsl(192 85% 42%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(192 85% 38%)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(192 85% 42%)'}
            >
              Explore the Interactive Map
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Two column layout - Map left, Score explanation right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8 lg:gap-16 items-start">
          {/* Left: Map Card (3D only on desktop) */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 0.8 }}
            className="lg:perspective-[1200px]"
          >
            <div
              className="lg:transform-style-preserve-3d transition-transform duration-1000"
              style={{
                transform: isInView ? 'rotateY(0deg) rotateX(0deg)' : 'rotateY(0deg) rotateX(0deg)',
              }}
            >
              <div
                className="relative rounded-xl border overflow-hidden map-connector-target"
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: 'hsl(220 15% 88%)',
                }}
              >
                {/* Map container - uses aspect ratio so map fills width */}
                <div 
                  className="relative w-full"
                  style={{ backgroundColor: 'hsl(210 20% 98%)', aspectRatio: '1200 / 750' }}
                >
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div 
                          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                          style={{ borderColor: 'hsl(192 85% 42%)', borderTopColor: 'transparent' }}
                        />
                        <span className="text-sm" style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}>Loading map...</span>
                      </div>
                    </div>
                  ) : (
                    <StaticUSMap countyScores={countyScores} onRender={handleMapRender} />
                  )}
                </div>
              </div>
            </div>
            
            {/* Shadow effect */}
            <div
              className="absolute -bottom-4 left-4 right-4 h-8 rounded-xl blur-xl -z-10"
              style={{ 
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                opacity: isInView ? 1 : 0,
                transition: 'opacity 1s',
                transform: 'rotateY(6deg)',
              }}
            />
          </motion.div>

          {/* Right: Investment Score Intro + Score Factors */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col mt-6 lg:mt-0"
          >
            <div 
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mb-4 w-fit"
              style={{ 
                backgroundColor: 'hsl(192 85% 42% / 0.1)',
                color: 'hsl(192 85% 42%)',
              }}
            >
              <StarIcon className="w-4 h-4" />
              Investment Score
            </div>
            <h3 
              className="font-display text-lg sm:text-xl md:text-2xl font-semibold tracking-tight mb-2 sm:mb-3"
              style={{ color: 'hsl(220 30% 12%)' }}
            >
              Data-driven market analysis
            </h3>
            <p 
              className="text-sm sm:text-base leading-relaxed mb-4 sm:mb-6"
              style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              Our proprietary Investment Score analyzes FMR, property values, tax rates, and rental demand to rate each market&apos;s potential for rental property investing.
            </p>

            {/* Score factors grid */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <ScoreFactorCompact
                icon={<DollarIcon className="w-5 h-5" />}
                title="Fair Market Rent"
              />
              <ScoreFactorCompact
                icon={<HomeIcon className="w-5 h-5" />}
                title="Property Values"
              />
              <ScoreFactorCompact
                icon={<FileTextIcon className="w-5 h-5" />}
                title="Tax Rates"
              />
              <ScoreFactorCompact
                icon={<UsersIcon className="w-5 h-5" />}
                title="Rental Demand"
              />
              <ScoreFactorCompact
                icon={<PlusIcon className="w-5 h-5" />}
                title="And More"
                description="Our Investment Score continues to evolve as we incorporate new data sources and refine our methodology"
                span2={true}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
