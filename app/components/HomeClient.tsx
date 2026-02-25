'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchInput from './SearchInput';
import FMRResults from './FMRResults';
import PercentageBadge from './PercentageBadge';
import type { FMRResult, ZIPFMRData } from '@/lib/types';
import ResultAbout from './ResultAbout';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { STATES } from '@/lib/states';
import IdealPurchasePriceCard from './IdealPurchasePriceCard';
import AppHeader from './AppHeader';
import NewBadge from './NewBadge';
import ChromeExtensionModal from './ChromeExtensionModal';
import GeoTabBar from './GeoTabBar';
import FooterV2 from './landing/FooterV2';
import { formatCountyName } from '@/lib/county-utils';
import { useRateLimit } from '@/app/contexts/RateLimitContext';

function getTextColorForScore(score: number | null): string {
  if (score === null || score === undefined || score < 95) {
    return '#b91c1c'; // Dark red for text: <95 or no data (improved contrast for readability)
  }
  if (score >= 130) {
    return '#2563eb'; // Lighter blue for text: >= 130 (improved legibility for small/bold labels)
  }
  return '#16a34a'; // Darker green for text: 100-129 (improved contrast, easier on eyes)
}

const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  STATES.map((s) => [s.code, s.name])
);

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

type ZipRanking = { 
  zipCode: string; 
  percentDiff: number; 
  avgFMR?: number;
  score?: number | null;
};

type ZipScoreData = {
  zipCode: string;
  medianScore: number | null;
  avgScore: number | null;
};

type MarketPreviewType = 'state' | 'county' | 'city' | 'zip';

type MarketPreviewItem = {
  rank: number;
  stateCode?: string;
  countyName?: string;
  cityName?: string;
  zipCode?: string;
  medianScore: number | null;
  zipCount: number;
};

function computeZipRankings(data: FMRResult | null): { rankings: ZipRanking[]; medianAvgFMR: number } | null {
  if (!data?.zipFMRData || data.zipFMRData.length < 2) return null;

  const zipScores = data.zipFMRData.map((zip) => {
    const values = [zip.bedroom0, zip.bedroom1, zip.bedroom2, zip.bedroom3, zip.bedroom4].filter(
      (v) => v !== undefined
    ) as number[];
    const avgFMR = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    return { zipCode: zip.zipCode, avgFMR };
  });

  const sorted = [...zipScores].sort((a, b) => a.avgFMR - b.avgFMR);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianAvgFMR =
    sorted.length % 2 === 0 ? (sorted[medianIndex - 1].avgFMR + sorted[medianIndex].avgFMR) / 2 : sorted[medianIndex].avgFMR;

  const rankings: ZipRanking[] = zipScores
    .map((z) => ({
      zipCode: z.zipCode,
      avgFMR: z.avgFMR,
      percentDiff: medianAvgFMR > 0 ? ((z.avgFMR - medianAvgFMR) / medianAvgFMR) * 100 : 0,
    }))
    .sort((a, b) => b.avgFMR - a.avgFMR);

  return { rankings, medianAvgFMR };
}

function computeZipScoreRankings(
  zipScores: ZipScoreData[]
): { rankings: ZipRanking[]; medianScore: number | null } | null {
  if (!zipScores || zipScores.length < 2) return null;

  const scores = zipScores.map(z => z.medianScore ?? z.avgScore).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianScore =
    sorted.length % 2 === 0
      ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
      : sorted[medianIndex];

  const rankings: ZipRanking[] = zipScores
    .map((z) => {
      const score = z.medianScore ?? z.avgScore ?? null;
      return {
        zipCode: z.zipCode,
        score,
        percentDiff: medianScore && score
          ? ((score - medianScore) / medianScore) * 100
          : 0,
      };
    })
    .sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      return scoreB - scoreA;
    });

  return { rankings, medianScore };
}

/**
 * Merge zipFMRData (canonical ZIP list from chart) with investment scores from API.
 * Ensures panel shows same ZIPs as alignment chart; scores shown where available.
 */
function mergeZipFMRDataWithScores(
  zipFMRData: { zipCode: string }[],
  apiZipScores: ZipScoreData[]
): ZipRanking[] {
  if (!zipFMRData || zipFMRData.length === 0) return [];

  const scoreMap = new Map<string, ZipScoreData>();
  for (const z of apiZipScores || []) {
    scoreMap.set(z.zipCode, z);
  }

  const scoresWithValues = apiZipScores
    ?.map(z => z.medianScore ?? z.avgScore)
    .filter((s): s is number => s != null) ?? [];
  const sorted = [...scoresWithValues].sort((a, b) => a - b);
  const medianIndex = Math.floor(sorted.length / 2);
  const medianScore = sorted.length > 0
    ? (sorted.length % 2 === 0) ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2 : sorted[medianIndex]
    : null;

  const rankings: ZipRanking[] = zipFMRData.map((z) => {
    const scoreData = scoreMap.get(z.zipCode);
    const score = scoreData ? (scoreData.medianScore ?? scoreData.avgScore ?? null) : null;
    const percentDiff = medianScore != null && score != null
      ? ((score - medianScore) / medianScore) * 100
      : 0;
    return { zipCode: z.zipCode, score, percentDiff };
  });

  return rankings.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    return scoreB - scoreA;
  });
}

export default function HomeClient(props: {
  initialQuery?: string | null;
  initialType?: 'zip' | 'city' | 'county' | 'address' | 'state' | null;
  initialData?: FMRResult | null;
  initialError?: string | null;
  initialState?: string | null;
  extensionConfig?: string;
  rateLimitExceeded?: boolean;
  rateLimitResetTime?: number | null;
}) {
  const router = useRouter();
  const { showRateLimitModal } = useRateLimit();
  const mainCardRef = useRef<HTMLDivElement | null>(null);
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const [zipCardHeight, setZipCardHeight] = useState<number | null>(null);
  const trackedSearchKeyRef = useRef<string>('');
  const drilldownHistoryCacheRef = useRef<Map<string, any>>(new Map());
  const addressAbortRef = useRef<AbortController | null>(null);
  const addressReqSeqRef = useRef(0);

  // Parse and validate extension config from URL params
  const [parsedExtensionConfig, setParsedExtensionConfig] = useState<any>(null);

  useEffect(() => {
    if (props.extensionConfig) {
      try {
        // Decode from base64
        const configJson = atob(decodeURIComponent(props.extensionConfig));
        const config = JSON.parse(configJson);

        // Validate and sanitize config
        const validatedConfig = {
          downPaymentMode: config.downPaymentMode === 'percent' || config.downPaymentMode === 'amount' ? config.downPaymentMode : 'percent',
          downPaymentPercent: typeof config.downPaymentPercent === 'number' && config.downPaymentPercent >= 0 && config.downPaymentPercent <= 100 ? config.downPaymentPercent : 20,
          downPaymentAmount: typeof config.downPaymentAmount === 'number' && config.downPaymentAmount >= 0 ? config.downPaymentAmount : 0,
          insuranceMonthly: typeof config.insuranceMonthly === 'number' && config.insuranceMonthly >= 0 ? config.insuranceMonthly : 100,
          hoaMonthly: typeof config.hoaMonthly === 'number' && config.hoaMonthly >= 0 ? config.hoaMonthly : 0,
          propertyManagementMode: config.propertyManagementMode === 'percent' || config.propertyManagementMode === 'amount' ? config.propertyManagementMode : 'percent',
          propertyManagementPercent: typeof config.propertyManagementPercent === 'number' && config.propertyManagementPercent >= 0 && config.propertyManagementPercent <= 100 ? config.propertyManagementPercent : 10,
          propertyManagementAmount: typeof config.propertyManagementAmount === 'number' && config.propertyManagementAmount >= 0 ? config.propertyManagementAmount : 0,
          overrideTaxRate: typeof config.overrideTaxRate === 'boolean' ? config.overrideTaxRate : false,
          overrideMortgageRate: typeof config.overrideMortgageRate === 'boolean' ? config.overrideMortgageRate : false,
          propertyTaxRateAnnualPct: typeof config.propertyTaxRateAnnualPct === 'number' && config.propertyTaxRateAnnualPct >= 0 ? config.propertyTaxRateAnnualPct : null,
          mortgageRateAnnualPct: typeof config.mortgageRateAnnualPct === 'number' && config.mortgageRateAnnualPct >= 0 ? config.mortgageRateAnnualPct : null,
          customLineItems: Array.isArray(config.customLineItems) ? config.customLineItems.map((item: any) => ({
            id: String(item.id || Date.now()),
            label: String(item.label || 'Custom Expense'),
            method: item.method === 'percent' || item.method === 'amount' ? item.method : 'amount',
            percentOf: item.percentOf === 'purchasePrice' || item.percentOf === 'rent' || item.percentOf === 'downPayment' ? item.percentOf : 'purchasePrice',
            value: typeof item.value === 'number' && item.value >= 0 ? item.value : 0,
          })) : [],
          purchasePrice: typeof config.purchasePrice === 'number' && config.purchasePrice > 0 ? config.purchasePrice : null,
          bedrooms: typeof config.bedrooms === 'number' && config.bedrooms >= 0 && config.bedrooms <= 8 ? config.bedrooms : null,
          // Default to effective rent when extension config present (until extension sends rentSource)
          rentSource: config.rentSource === 'fmr' || config.rentSource === 'effective' ? config.rentSource : 'effective',
        };

        setParsedExtensionConfig(validatedConfig);
      } catch (error) {
        console.error('Failed to parse extension config:', error);
        setParsedExtensionConfig(null);
      }
    }
  }, [props.extensionConfig]);

  // Show rate limit modal if redirected from rate-limited page
  useEffect(() => {
    if (props.rateLimitExceeded && props.rateLimitResetTime) {
      showRateLimitModal(props.rateLimitResetTime);
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('rateLimitExceeded');
      url.searchParams.delete('resetTime');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [props.rateLimitExceeded, props.rateLimitResetTime, showRateLimitModal, router]);

  const computeInitial = () => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    const hasQuery = !!q && !!t;

    if (!hasQuery) {
      return {
        searchStatus: 'idle' as SearchStatus,
        rootFmrData: null as FMRResult | null,
        viewFmrData: null as FMRResult | null,
        error: null as string | null,
        zipRankings: null as ZipRanking[] | null,
        zipMedianAvgFMR: null as number | null,
      };
    }

    if (props.initialError) {
      return {
        searchStatus: 'error' as SearchStatus,
        rootFmrData: null,
        viewFmrData: null,
        error: props.initialError,
        zipRankings: null,
        zipMedianAvgFMR: null,
      };
    }

    if (props.initialData) {
      const computed = computeZipRankings(props.initialData);
      return {
        searchStatus: 'success' as SearchStatus,
        rootFmrData: props.initialData,
        viewFmrData: props.initialData,
        error: null,
        zipRankings: computed?.rankings || null,
        zipMedianAvgFMR: computed?.medianAvgFMR ?? null,
      };
    }

    return {
      searchStatus: 'loading' as SearchStatus,
      rootFmrData: null,
      viewFmrData: null,
      error: null,
      zipRankings: null,
      zipMedianAvgFMR: null,
    };
  };

  const [searchStatus, setSearchStatus] = useState<SearchStatus>(() => computeInitial().searchStatus);
  const [rootFmrData, setRootFmrData] = useState<FMRResult | null>(() => computeInitial().rootFmrData);
  const [viewFmrData, setViewFmrData] = useState<FMRResult | null>(() => computeInitial().viewFmrData);
  const [error, setError] = useState<string | null>(() => computeInitial().error);
  const [zipRankings, setZipRankings] = useState<ZipRanking[] | null>(() => computeInitial().zipRankings);
  const [zipMedianAvgFMR, setZipMedianAvgFMR] = useState<number | null>(() => computeInitial().zipMedianAvgFMR);
  const [drilldownZip, setDrilldownZip] = useState<string | null>(null);
  const [zipScoresLoading, setZipScoresLoading] = useState(false);

  const appliedKeyRef = useRef<string>('');

  // Scroll to calculator when extension config is present
  useEffect(() => {
    if (parsedExtensionConfig && calculatorRef.current && searchStatus === 'success') {
      setTimeout(() => {
        calculatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [parsedExtensionConfig, searchStatus]);

  // Apply server-provided initial state for SEO / direct loads and for client navigations
  // that update searchParams.
  useEffect(() => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    const key = `${t || ''}|${q}`;
    if (appliedKeyRef.current === key) {
      return;
    }
    appliedKeyRef.current = key;

    if (!q || !t) {
      setSearchStatus('idle');
      setRootFmrData(null);
      setViewFmrData(null);
      setError(null);
      setZipRankings(null);
      setZipMedianAvgFMR(null);
      setDrilldownZip(null);
      return;
    }

    if (props.initialError) {
      setSearchStatus('error');
      setRootFmrData(null);
      setViewFmrData(null);
      setError(props.initialError);
      setZipRankings(null);
      setZipMedianAvgFMR(null);
      setDrilldownZip(null);
      return;
    }

    if (props.initialData) {
      // If initialState is provided and initialData doesn't have stateCode, merge it in
      const dataWithState = props.initialState && !props.initialData.stateCode
        ? { ...props.initialData, stateCode: props.initialState }
        : props.initialData;
      setSearchStatus('success');
      setError(null);
      setRootFmrData(dataWithState);
      setViewFmrData(dataWithState);
      // For SAFMR county/city views, don't compute from FMR data - let the effect fetch investment scores
      if (dataWithState.source === 'safmr' && (dataWithState.queriedType === 'county' || dataWithState.queriedType === 'city')) {
        setZipRankings(null);
        setZipMedianAvgFMR(null);
        setZipScoresLoading(true); // Set loading state so the component shows while fetching
      } else {
        const computed = computeZipRankings(dataWithState);
        setZipRankings(computed?.rankings || null);
        setZipMedianAvgFMR(computed?.medianAvgFMR ?? null);
        setZipScoresLoading(false);
      }
      setDrilldownZip(null);
      return;
    }

    // If we have params but no data/error, treat as loading (should be rare).
    setSearchStatus('loading');
    setError(null);
    setRootFmrData(null);
    setViewFmrData(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);
  }, [props.initialQuery, props.initialType, props.initialData, props.initialError]);

  // Make ZIP card match main card height (lg+), without forcing main card to stretch.
  useEffect(() => {
    const el = mainCardRef.current;
    if (!el) return;
    if (!zipRankings || zipRankings.length === 0) {
      setZipCardHeight(null);
      return;
    }

    let raf = 0 as any;
    const measure = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const isLg = window.matchMedia('(min-width: 1024px)').matches;
        if (!isLg) {
          setZipCardHeight(null);
          return;
        }
        const rect = el.getBoundingClientRect();
        // Guard against 0 during initial layout.
        const h = Math.max(0, Math.round(rect.height));
        setZipCardHeight(h > 0 ? h : null);
      });
    };

    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);

    window.addEventListener('resize', measure);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [zipRankings]);

  // Fetch ZIP investment scores for SAFMR-based county/city views
  // For SAFMR views, always use investment scores (not FMR averages) to match city view behavior
  useEffect(() => {
    if (!viewFmrData || viewFmrData.source !== 'safmr' || 
        (viewFmrData.queriedType !== 'county' && viewFmrData.queriedType !== 'city') ||
        !viewFmrData.stateCode) {
      // Only clear loading if we were previously loading for SAFMR
      if (viewFmrData?.source === 'safmr') {
        setZipScoresLoading(false);
      }
      return;
    }

    // Always fetch investment scores for SAFMR county/city views (same as city view)
    setZipScoresLoading(true);
    const params = new URLSearchParams();
    
    // Normalize county name - remove "County" suffix if present for API query
    // Use countyName if available, otherwise fall back to areaName
    if (viewFmrData.queriedType === 'county') {
      const countyName = viewFmrData.countyName || viewFmrData.areaName;
      if (countyName && viewFmrData.stateCode) {
        const normalizedCounty = countyName.replace(/\s+County\s*$/i, '').trim();
        params.set('county', normalizedCounty);
        params.set('state', viewFmrData.stateCode);
      } else {
        setZipScoresLoading(false);
        return;
      }
    } else if (viewFmrData.queriedType === 'city' && viewFmrData.cityName) {
      params.set('city', viewFmrData.cityName);
      params.set('state', viewFmrData.stateCode);
    } else {
      setZipScoresLoading(false);
      return;
    }
    if (viewFmrData.year) params.set('year', String(viewFmrData.year));

    const zipFMRData = viewFmrData.zipFMRData ?? [];
    fetch(`/api/investment/zip-scores?${params.toString()}`)
      .then(res => res.json())
      .then(result => {
        if (zipFMRData.length > 0) {
          const merged = mergeZipFMRDataWithScores(zipFMRData, result?.zipScores ?? []);
          setZipRankings(merged.length > 0 ? merged : null);
        } else if (result.found && result.zipScores && result.zipScores.length > 0) {
          const computed = computeZipScoreRankings(result.zipScores);
          setZipRankings(computed?.rankings || null);
        } else {
          setZipRankings(null);
        }
        setZipMedianAvgFMR(null); // Not used for score-based rankings
        setZipScoresLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch ZIP scores:', err);
        setZipRankings(null);
        setZipScoresLoading(false);
      });
  }, [viewFmrData]);

  // Track location searches for the dashboard “popular searches” (client-only, privacy-friendly).
  useEffect(() => {
    if (searchStatus !== 'success') return;
    if (!viewFmrData?.queriedType || !viewFmrData.queriedLocation) return;
    const type = viewFmrData.queriedType;
    if (type !== 'zip' && type !== 'city' && type !== 'county') return;
    const key = `${type}|${viewFmrData.queriedLocation}`;
    if (trackedSearchKeyRef.current === key) return;
    trackedSearchKeyRef.current = key;

    const canonicalPath =
      type === 'zip'
        ? (() => {
            const zip = String(viewFmrData.queriedLocation).match(/\b(\d{5})\b/)?.[1];
            return zip ? `/zip/${zip}` : null;
          })()
        : type === 'city'
          ? (() => {
              const [city, state] = String(viewFmrData.queriedLocation).split(',').map((s) => s.trim());
              return city && state && state.length === 2 ? `/city/${buildCitySlug(city, state)}` : null;
            })()
          : (() => {
              const [county, state] = String(viewFmrData.queriedLocation).split(',').map((s) => s.trim());
              return county && state && state.length === 2 ? `/county/${buildCountySlug(county, state)}` : null;
            })();

    // Fire-and-forget.
    fetch('/api/track/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, query: viewFmrData.queriedLocation, canonicalPath }),
      keepalive: true,
    }).catch(() => {});
  }, [searchStatus, viewFmrData]);

  // Address searches are not SSR-fetched (privacy + infinite variants),
  // so we need a client fetch when the URL indicates an address query.
  useEffect(() => {
    const q = props.initialQuery?.trim() || '';
    const t = props.initialType || null;
    if (!q || t !== 'address') return;

    // Cancel any in-flight address search
    if (addressAbortRef.current) {
      addressAbortRef.current.abort();
    }
    const abortController = new AbortController();
    addressAbortRef.current = abortController;
    const seq = ++addressReqSeqRef.current;

    setSearchStatus('loading');
    setError(null);
    setRootFmrData(null);
    setViewFmrData(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);

    (async () => {
      try {
        const url = `/api/search/fmr?address=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: abortController.signal });
        const json = await res.json();
        if (abortController.signal.aborted || seq !== addressReqSeqRef.current) return;
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch FMR data');

        const data = json?.data as FMRResult | undefined;
        if (!data) throw new Error('No data returned');

        setRootFmrData(data);
        setViewFmrData(data);
        const computed = computeZipRankings(data);
        setZipRankings(computed?.rankings || null);
        setZipMedianAvgFMR(computed?.medianAvgFMR ?? null);
        setSearchStatus('success');
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (abortController.signal.aborted || seq !== addressReqSeqRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to fetch FMR data');
        setSearchStatus('error');
      }
    })();

    return () => {
      if (addressAbortRef.current === abortController) {
        abortController.abort();
      }
    };
  }, [props.initialQuery, props.initialType]);

  const isSearching = searchStatus === 'loading';

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => {
    setSearchStatus('loading');
    setError(null);
    setDrilldownZip(null);

    if (type === 'state') {
      const state = (value || '').trim().toUpperCase();
      if (state && state.length === 2) {
        router.push(`/state/${state}`, { scroll: false });
        return;
      }
    }

    // Clean canonical URLs (slugs) for SERP + sharing.
    if (type === 'zip') {
      const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
      if (zip) {
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: zip, canonicalPath: `/zip/${zip}` }),
          keepalive: true,
        }).catch(() => {});
        const stateFromData = viewFmrData?.stateCode || rootFmrData?.stateCode || props.initialState;
        router.push(`/zip/${zip}${stateFromData ? `?state=${stateFromData}` : ''}`, { scroll: false });
        return;
      }
    }
    if (type === 'city') {
      const [city, state] = value.split(',').map((s) => s.trim());
      if (city && state && state.length === 2) {
        const q = `${city}, ${state.toUpperCase()}`;
        const slug = buildCitySlug(city, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/city/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/city/${buildCitySlug(city, state)}`, { scroll: false });
        return;
      }
    }
    if (type === 'county') {
      const [county, state] = value.split(',').map((s) => s.trim());
      if (county && state && state.length === 2) {
        const q = `${county}, ${state.toUpperCase()}`;
        const slug = buildCountySlug(county, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/county/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/county/${buildCountySlug(county, state)}`, { scroll: false });
        return;
      }
    }

    // Address (and any fallback): keep the query-param view.
    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  const handleReset = () => {
    setRootFmrData(null);
    setViewFmrData(null);
    setError(null);
    setZipRankings(null);
    setZipMedianAvgFMR(null);
    setDrilldownZip(null);
    setSearchStatus('idle');
    router.replace('/', { scroll: false });
  };

  const handleZipDrilldown = (zipCode: string) => {
    if (!rootFmrData?.zipFMRData || rootFmrData.zipFMRData.length === 0) return;
    const zipRow = rootFmrData.zipFMRData.find((z) => z.zipCode === zipCode);
    if (!zipRow) return;

    // Navigate to the ZIP URL instead of just updating local state
    const stateCode = rootFmrData.stateCode;
    const zipUrl = `/zip/${zipCode}${stateCode ? `?state=${stateCode}` : ''}`;
    router.push(zipUrl, { scroll: false });
  };

  const handleBackToRoot = () => {
    if (!rootFmrData) return;
    setDrilldownZip(null);
    setViewFmrData(rootFmrData);
  };

  const drilldownPercentDiff = useMemo(() => {
    if (!drilldownZip || !zipRankings) return null;
    const hit = zipRankings.find((z) => z.zipCode === drilldownZip);
    return hit?.percentDiff ?? null;
  }, [drilldownZip, zipRankings]);

  const showResults = useMemo(() => {
    // Once the user has initiated a search (or URL params did), show results states.
    // "idle" means no search yet, so show the dashboard.
    return searchStatus !== 'idle';
  }, [searchStatus]);

  // Lightweight "dashboard snapshot" for the idle homepage (push heavy views to /map, /explorer, /insights).
  const DASHBOARD_PREVIEW_YEAR = 2026;
  const [marketPreviewType, setMarketPreviewType] = useState<MarketPreviewType>('state');
  const [marketPreviewItems, setMarketPreviewItems] = useState<MarketPreviewItem[]>([]);
  const [marketPreviewStatus, setMarketPreviewStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('loading');
  const [marketPreviewError, setMarketPreviewError] = useState<string | null>(null);
  const marketPreviewAbortRef = useRef<AbortController | null>(null);

  const [indexComputedAt, setIndexComputedAt] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const indexAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (showResults) return;

    if (indexAbortRef.current) {
      indexAbortRef.current.abort();
    }
    const controller = new AbortController();
    indexAbortRef.current = controller;

    setIndexStatus('loading');

    fetch(`/api/stats/investment-score-index?year=${DASHBOARD_PREVIEW_YEAR}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as any)?.error || 'Failed to load index status');
        return json as any;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setIndexComputedAt(typeof json?.computedAt === 'string' ? json.computedAt : null);
        setIndexStatus('success');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setIndexComputedAt(null);
        setIndexStatus('error');
      });

    return () => {
      if (indexAbortRef.current === controller) {
        controller.abort();
      }
    };
  }, [DASHBOARD_PREVIEW_YEAR, showResults]);

  const indexedText = useMemo(() => {
    if (indexStatus === 'loading') return 'Indexed (updating…)';
    if (!indexComputedAt) return 'Indexed';
    const computed = new Date(indexComputedAt);
    if (!Number.isFinite(computed.getTime())) return 'Indexed';

    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - computed.getTime());
    const diffMins = Math.round(diffMs / (60 * 1000));
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 60) {
      return `Indexed ${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `Indexed ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return `Indexed ${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    }
  }, [indexComputedAt, indexStatus]);

  useEffect(() => {
    if (showResults) return;

    // Cancel any in-flight preview request.
    if (marketPreviewAbortRef.current) {
      marketPreviewAbortRef.current.abort();
    }
    const controller = new AbortController();
    marketPreviewAbortRef.current = controller;

    setMarketPreviewStatus('loading');
    setMarketPreviewError(null);

    const sp = new URLSearchParams();
    sp.set('type', marketPreviewType);
    sp.set('year', String(DASHBOARD_PREVIEW_YEAR));
    sp.set('offset', '0');
    sp.set('limit', '8');

    fetch(`/api/stats/geo-rankings?${sp.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as any)?.error || 'Failed to load market snapshot');
        return json as any;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setMarketPreviewItems(Array.isArray(json?.items) ? (json.items as MarketPreviewItem[]) : []);
        setMarketPreviewStatus('success');
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setMarketPreviewItems([]);
        setMarketPreviewError(e instanceof Error ? e.message : 'Failed to load market snapshot');
        setMarketPreviewStatus('error');
      });

    return () => {
      if (marketPreviewAbortRef.current === controller) {
        controller.abort();
      }
    };
  }, [marketPreviewType, showResults]);

  const marketPreviewLabel = (item: MarketPreviewItem) => {
    if (marketPreviewType === 'state') {
      const code = item.stateCode || '';
      return STATE_NAME_BY_CODE[code] || code;
    }
    if (marketPreviewType === 'county') return item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
    if (marketPreviewType === 'city') return item.cityName || '';
    return item.zipCode || '';
  };

  const marketPreviewSubLabel = (item: MarketPreviewItem) => {
    if (marketPreviewType === 'state') return item.stateCode || '';
    if (marketPreviewType === 'county') return item.stateCode || '';
    if (marketPreviewType === 'city') {
      const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
      const state = item.stateCode || '';
      return `${county}${county && state ? ', ' : ''}${state}`.trim();
    }
    // zip
    const county = item.countyName ? formatCountyName(item.countyName, item.stateCode) : '';
    const state = item.stateCode || '';
    return `${county}${county && state ? ', ' : ''}${state}`.trim();
  };

  const marketPreviewHref = (item: MarketPreviewItem): string | null => {
    if (marketPreviewType === 'state') return item.stateCode ? `/state/${item.stateCode}` : null;
    if (marketPreviewType === 'county')
      return item.countyName && item.stateCode ? `/county/${buildCountySlug(item.countyName, item.stateCode)}` : null;
    if (marketPreviewType === 'city')
      return item.cityName && item.stateCode ? `/city/${buildCitySlug(item.cityName, item.stateCode)}` : null;
    const zip = item.zipCode?.match(/\b(\d{5})\b/)?.[1] || item.zipCode;
    return zip ? `/zip/${zip}` : null;
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <ChromeExtensionModal />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header */}
        <AppHeader
          onTitleClick={handleReset}
          showSearch={true}
          onSearchSelect={handleSearch}
        />

        <div className="flex flex-col gap-3 sm:gap-4">

          {showResults ? (
            <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 items-start">
              {/* Main Results Card */}
              <div
                ref={mainCardRef}
                className="flex-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-6 md:p-8 w-full"
              >
                <FMRResults
                  data={viewFmrData}
                  loading={isSearching}
                  error={error}
                  zipVsCountyMedianPercent={drilldownPercentDiff}
                  breadcrumbs={
                    drilldownZip && rootFmrData
                      ? {
                          parentLabel: rootFmrData.queriedLocation || rootFmrData.areaName,
                          parentType: rootFmrData.queriedType || 'county',
                          zipCode: drilldownZip,
                        }
                      : null
                  }
                  onBreadcrumbBack={drilldownZip ? handleBackToRoot : undefined}
                />
              </div>

              {/* Right Panel - Sticky Container */}
              <div className="w-full lg:w-[420px] flex-shrink-0 lg:sticky lg:top-8 lg:self-start">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {/* Ideal Purchase Price Card - only show when ZIP codes list is not showing */}
                  {!(!drilldownZip && (zipRankings && zipRankings.length > 0 || zipScoresLoading)) && (
                    <div ref={calculatorRef} className="m-0 p-0">
                      <IdealPurchasePriceCard data={viewFmrData} extensionConfig={parsedExtensionConfig} />
                    </div>
                  )}

                  {/* ZIP Code Ranking Card (hide when drilled into a ZIP) */}
                  {!drilldownZip && (zipRankings && zipRankings.length > 0 || zipScoresLoading) && (
                    <div className="m-0 p-0">
                      <div className="w-full bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-4 sm:p-6 md:p-8">
                      <div className="mb-4">
                        <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mb-1">ZIP Codes</h3>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {viewFmrData?.source === 'safmr'
                            ? 'Ranked by Investment Score (vs area median)'
                            : 'Ranked by average FMR (vs county median)'}
                        </p>
                      </div>
                      {zipScoresLoading ? (
                        <div className="space-y-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 bg-[var(--border-color)] rounded animate-pulse" />
                          ))}
                        </div>
                      ) : zipRankings && zipRankings.length > 0 ? (
                        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 -mr-2 custom-scrollbar">
                            {zipRankings.map((zip, index) => {
                              const isSelected = drilldownZip === zip.zipCode;
                              const isScoreBased = viewFmrData?.source === 'safmr' && zip.score !== undefined;
                              const scoreTextColor = isScoreBased && zip.score !== null && zip.score !== undefined
                                ? getTextColorForScore(zip.score)
                                : undefined;

                              return (
                                <button
                                  key={zip.zipCode}
                                  type="button"
                                  onClick={() => handleZipDrilldown(zip.zipCode)}
                                  className={`w-full flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 rounded-md border transition-colors group text-left ${
                                    isSelected
                                      ? 'bg-[var(--bg-hover)] border-[var(--border-secondary)]'
                                      : 'border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border-color)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <span className="text-xs font-medium text-[var(--text-tertiary)] w-4 sm:w-5 tabular-nums shrink-0">
                                      {index + 1}
                                    </span>
                                    <span className="font-medium text-[var(--text-primary)] text-sm">{zip.zipCode}</span>
                                  </div>
                                  {isScoreBased && zip.score !== null && zip.score !== undefined ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span 
                                        className="font-semibold text-xs tabular-nums"
                                        style={{ color: scoreTextColor }}
                                      >
                                        {Math.round(zip.score ?? 0)}
                                      </span>
                                      <PercentageBadge value={zip.percentDiff} className="text-xs shrink-0" />
                                    </div>
                                  ) : isScoreBased && zip.score === null ? (
                                    <span className="text-xs text-[var(--text-muted)]" title="Insufficient data to compute investment score">Insufficient data</span>
                                  ) : (
                                    <PercentageBadge value={zip.percentDiff} className="text-xs sm:text-sm shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div ref={mainCardRef} className="flex-1 w-full">
              <div className="flex flex-col gap-3 sm:gap-6">
                {/* Primary actions */}
                <section>
                  <div className="mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm text-[#737373] mt-1">
                      Find your next cash flowing market.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
                    <Link
                      href="/map"
                      className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-5 sm:p-6 flex flex-col hover:border-[var(--border-color)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200"
                    >
                      <div className="text-xs font-semibold text-[var(--text-secondary)]">Interactive</div>
                      <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mt-1">Investment Score Map</h3>
                      <p className="text-sm text-[var(--text-tertiary)] mt-2">
                        Visualize Investment Scores across the US.
                      </p>
                      <div className="mt-auto pt-4 text-sm font-medium text-[var(--text-primary)]">Open map →</div>
                    </Link>

                    <Link
                      href="/explorer"
                      className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-5 sm:p-6 flex flex-col hover:border-[var(--border-color)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200"
                    >
                      <div className="text-xs font-semibold text-[var(--text-secondary)]">Rankings</div>
                      <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mt-1">Market Explorer</h3>
                      <p className="text-sm text-[var(--text-tertiary)] mt-2">
                        Search states, counties, cities, and ZIPs by Investment Score.
                      </p>
                      <div className="mt-auto pt-4 text-sm font-medium text-[var(--text-primary)]">Browse rankings →</div>
                    </Link>

                    <Link
                      href="/insights"
                      className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] p-5 sm:p-6 flex flex-col hover:border-[var(--border-color)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200"
                    >
                      <div className="text-xs font-semibold text-[var(--text-secondary)]">Trends</div>
                      <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mt-1">Market Intelligence</h3>
                      <p className="text-sm text-[var(--text-tertiary)] mt-2">
                        Find markets with noteworthy outliers.
                      </p>
                      <div className="mt-auto pt-4 text-sm font-medium text-[var(--text-primary)]">View insights →</div>
                    </Link>
                  </div>
                </section>

                {/* Snapshot + context */}
                <section>
                  <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col">
                    <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] mb-0.5">
                          Top markets by Investment Score
                        </h3>
                        <p className="text-xs text-[var(--text-tertiary)]">{indexedText}</p>
                      </div>
                      <Link
                        href={`/explorer?geoTab=${marketPreviewType}`}
                        className="text-xs font-semibold text-[var(--text-primary)] hover:opacity-70 whitespace-nowrap"
                      >
                        View all →
                      </Link>
                    </div>

                    <div className="px-3 sm:px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                      <GeoTabBar
                        value={marketPreviewType}
                        onChange={(t) => setMarketPreviewType(t as MarketPreviewType)}
                        tabs={['state', 'county', 'city', 'zip']}
                        getLabel={(t) => (t === 'state' ? 'States' : t === 'county' ? 'Counties' : t === 'city' ? 'Cities' : 'ZIPs')}
                        className="relative flex gap-1 overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0"
                      />
                    </div>

                    <div className="divide-y divide-[var(--border-color)]">
                      {marketPreviewStatus === 'loading' && (
                        [...Array(8)].map((_, i) => (
                          <div key={i} className="px-3 sm:px-4 py-2 sm:py-2.5">
                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                              <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                                <div className="h-3 bg-[var(--border-color)] rounded w-4 shrink-0 animate-pulse"></div>
                                <div className="min-w-0 flex-1">
                                  <div className="h-3.5 sm:h-4 bg-[var(--border-color)] rounded w-28 sm:w-36 mb-1 sm:mb-1.5 animate-pulse"></div>
                                  <div className="h-3 bg-[var(--border-color)] rounded w-24 sm:w-32 animate-pulse"></div>
                                </div>
                              </div>
                              <div className="h-3.5 sm:h-4 bg-[var(--border-color)] rounded w-12 sm:w-16 ml-auto animate-pulse"></div>
                            </div>
                          </div>
                        ))
                      )}

                      {marketPreviewStatus === 'error' && (
                        <div className="px-3 sm:px-4 py-3 text-xs text-red-600 dark:text-red-400">
                          {marketPreviewError || 'Failed to load market snapshot.'}
                        </div>
                      )}

                      {marketPreviewStatus === 'success' && marketPreviewItems.length === 0 && (
                        <div className="px-3 sm:px-4 py-6 text-xs text-[var(--text-tertiary)]">
                          No results available.
                        </div>
                      )}

                      {marketPreviewStatus === 'success' && marketPreviewItems.length > 0 && (
                        marketPreviewItems.map((item, index) => {
                          const href = marketPreviewHref(item);
                          const label = marketPreviewLabel(item);
                          const sub = marketPreviewSubLabel(item);
                          const scoreColor = getTextColorForScore(item.medianScore);
                          const key = `${marketPreviewType}:${item.stateCode || ''}:${item.countyName || ''}:${item.cityName || ''}:${item.zipCode || ''}:${index}`;

                          const content = (
                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                              <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
                                <span className="text-xs text-[var(--text-muted)] font-medium shrink-0 tabular-nums">
                                  #{item.rank || index + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-medium text-[var(--text-primary)] text-xs sm:text-sm truncate">
                                    {label}
                                  </div>
                                  {!!sub && (
                                    <div className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                                      {sub}
                                    </div>
                                  )}
                                  {item.zipCount > 1 && (
                                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                      {item.zipCount} ZIPs
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                {item.medianScore !== null ? (
                                  <div
                                    className="font-semibold text-xs sm:text-sm tabular-nums"
                                    style={{ color: scoreColor }}
                                  >
                                    {Math.round(item.medianScore)}
                                  </div>
                                ) : (
                                  <div className="font-semibold text-[var(--text-tertiary)] text-xs sm:text-sm tabular-nums">
                                    —
                                  </div>
                                )}
                              </div>
                            </div>
                          );

                          return href ? (
                            <Link
                              key={key}
                              href={href}
                              className="block px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div
                              key={key}
                              className="block px-3 sm:px-4 py-2 sm:py-2.5"
                            >
                              {content}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        {/* Outside the main content card(s): SEO/help content + related links */}
        {showResults && viewFmrData && (
          <div className="mt-6 sm:mt-8">
            <ResultAbout data={viewFmrData} />
          </div>
        )}

      </div>
      <FooterV2 />
    </main>
  );
}




