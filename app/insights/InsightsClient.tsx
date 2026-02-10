'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import ReactSlider from 'react-slider';
import {
  ArrowRight,
  Building2,
  DollarSign,
  Filter,
  Percent,
  Settings,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import ExplorerTopLists from '@/app/components/ExplorerTopLists';
import FilterPills from '@/app/components/FilterPills';
import GeoTabBar from '@/app/components/GeoTabBar';
import SearchInput from '@/app/components/SearchInput';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';
import { STATES } from '@/lib/states';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Separator } from '@/app/components/ui/separator';

type Trend = 'up' | 'flat' | 'down';
type TrendFilter = 'any' | Trend;
type SortBy =
  | 'price_value'
  | 'price_change'
  | 'fmr_value'
  | 'fmr_change'
  | 'yield_value'
  | 'yield_change';
type GeoType = 'zip' | 'city' | 'county';
type SortMode = 'yoy' | 'value';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'price_value', label: 'Price (value)' },
  { value: 'price_change', label: 'Price (YoY %)' },
  { value: 'fmr_value', label: 'FMR (value)' },
  { value: 'fmr_change', label: 'FMR (YoY %)' },
  { value: 'yield_value', label: 'Yield (value)' },
  { value: 'yield_change', label: 'Yield (YoY %)' },
];

const PRICE_BUFFER_PCT = 0.05;
const PRICE_BUFFER_FIXED = 10_000;
const MAX_PRICE = 500_000;
const PRICE_SLIDER_STEP = 1000;
const YIELD_DEADZONE = 0.5;
const YIELD_SLIDER_MAX_FALLBACK = 15;
const YIELD_SLIDER_STEP = 0.5;

interface ScreenerItem {
  geoKey: string;
  zipCode?: string;
  cityName?: string;
  areaName?: string;
  stateCode: string;
  countyName?: string;
  fmrCurr: number;
  fmrYoy: number;
  zhviCurr: number;
  zhviYoy: number;
  yieldCurr: number;
  yieldDeltaPp: number;
  zipCount?: number;
}

const FLAT_BAND_DEFAULT_PCT = 3;
const INSIGHTS_SETTINGS_KEY = 'fmr-insights-settings';

function getStoredInsightsSettings(): { flatBand: number; sortMode: SortMode } {
  if (typeof window === 'undefined') return { flatBand: FLAT_BAND_DEFAULT_PCT, sortMode: 'yoy' };
  try {
    const s = localStorage.getItem(INSIGHTS_SETTINGS_KEY);
    if (!s) return { flatBand: FLAT_BAND_DEFAULT_PCT, sortMode: 'yoy' };
    const j = JSON.parse(s) as { flatBand?: number; sortMode?: string };
    const flatBand = typeof j.flatBand === 'number' && Number.isFinite(j.flatBand)
      ? Math.min(10, Math.max(0.5, Math.round(j.flatBand * 100) / 100))
      : FLAT_BAND_DEFAULT_PCT;
    const sortMode = j.sortMode === 'value' ? 'value' : 'yoy';
    return { flatBand, sortMode };
  } catch {
    return { flatBand: FLAT_BAND_DEFAULT_PCT, sortMode: 'yoy' };
  }
}

function setStoredInsightsSettings(flatBand: number, sortMode: SortMode) {
  try {
    localStorage.setItem(INSIGHTS_SETTINGS_KEY, JSON.stringify({ flatBand, sortMode }));
  } catch {}
}

function trendFromDelta(delta: number, flatBand: number): Trend {
  if (delta > flatBand) return 'up';
  if (delta < -flatBand) return 'down';
  return 'flat';
}

function trendFromYieldPp(pp: number, flatBandPp: number): Trend {
  return trendFromDelta(pp, flatBandPp);
}

function TrendPill({ trend }: { trend: Trend }) {
  const cfg =
    trend === 'up'
      ? { icon: TrendingUp, cls: 'pill-up' }
      : trend === 'down'
        ? { icon: TrendingDown, cls: 'pill-down' }
        : { icon: ArrowRight, cls: 'pill-flat' };
  const Icon = cfg.icon;
  const label = trend === 'up' ? 'Up' : trend === 'down' ? 'Down' : 'Flat';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium ${cfg.cls}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </span>
  );
}

function formatUSD(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function SignalCell({
  valueMain,
  delta,
  trend,
  deltaColorClass,
}: {
  valueMain: string;
  delta: number;
  trend: Trend;
  deltaColorClass: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] sm:text-[12px] font-medium text-[var(--text-primary)]">
            {valueMain}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className={`font-medium ${deltaColorClass}`}>
              {delta > 0 ? '+' : ''}
              {formatPct(delta)}
            </span>
            <span className="text-[var(--text-muted)]">YoY</span>
          </div>
        </div>
        <TrendPill trend={trend} />
      </div>
    </div>
  );
}

function RiskPill({ risk }: { risk: 'Low' | 'Medium' | 'High' }) {
  const cls =
    risk === 'Low' ? 'pill-up' : risk === 'High' ? 'pill-down' : 'pill-warning';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[12px] font-medium ${cls}`}
    >
      {risk}
    </span>
  );
}

function deriveRisk(yieldCurr: number): 'Low' | 'Medium' | 'High' {
  const pct = yieldCurr * 100;
  if (pct >= 6.5) return 'Low';
  if (pct <= 4.5) return 'High';
  return 'Medium';
}

function TrendMultiFilter({
  label,
  description,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  value: TrendFilter;
  onChange: (v: TrendFilter) => void;
}) {
  const allSelected = value === 'any';
  return (
    <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {label}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {description}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          Direction
        </span>
        <div className="inline-flex overflow-hidden rounded-sm border border-[var(--border-color)] bg-[var(--bg-primary)]">
          <button
            type="button"
            onClick={() => onChange('any')}
            className={`h-8 px-2.5 text-xs font-medium transition-colors ${
              allSelected
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-pressed={allSelected}
          >
            Any
          </button>
          <div className="w-px bg-[var(--border-color)]" />
          <button
            type="button"
            onClick={() => onChange('up')}
            className={`h-8 px-2.5 text-xs font-medium transition-colors ${
              value === 'up'
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-pressed={value === 'up'}
          >
            Up
          </button>
          <div className="w-px bg-[var(--border-color)]" />
          <button
            type="button"
            onClick={() => onChange('flat')}
            className={`h-8 px-2.5 text-xs font-medium transition-colors ${
              value === 'flat'
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-pressed={value === 'flat'}
          >
            Flat
          </button>
          <div className="w-px bg-[var(--border-color)]" />
          <button
            type="button"
            onClick={() => onChange('down')}
            className={`h-8 px-2.5 text-xs font-medium transition-colors ${
              value === 'down'
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
            aria-pressed={value === 'down'}
          >
            Down
          </button>
        </div>
        {!allSelected && (
          <button
            type="button"
            onClick={() => onChange('any')}
            className="ml-auto text-xs font-medium text-[var(--text-muted)] underline-offset-4 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function downloadCsv(rows: { label: string; location: string; zhviCurr: number; zhviYoy: number; fmrCurr: number; fmrYoy: number; yieldCurr: number; yieldDeltaPp: number }[]) {
  const headers = ['Location', 'Area', 'Home value', 'Price YoY %', 'FMR/mo', 'FMR YoY %', 'Yield (%)', 'Yield change (%)'];
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        `"${(r.label || '').replace(/"/g, '""')}"`,
        `"${(r.location || '').replace(/"/g, '""')}"`,
        r.zhviCurr,
        r.zhviYoy.toFixed(1),
        r.fmrCurr,
        r.fmrYoy.toFixed(1),
        (r.yieldCurr * 100).toFixed(1),
        r.yieldDeltaPp.toFixed(1),
      ].join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `market-insights-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InsightsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [geoType, setGeoType] = useState<GeoType>(() => {
    const t = searchParams.get('type');
    return t === 'city' || t === 'county' ? t : 'zip';
  });
  const [stateFilter, setStateFilter] = useState<string>(() => searchParams.get('state') || '');
  const [priceDir, setPriceDir] = useState<TrendFilter>(() => (searchParams.get('price_dir') as TrendFilter) || 'any');
  const [fmrDir, setFmrDir] = useState<TrendFilter>(() => (searchParams.get('fmr_dir') as TrendFilter) || 'any');
  const [yieldDir, setYieldDir] = useState<TrendFilter>(() => (searchParams.get('yield_dir') as TrendFilter) || 'any');
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const s = searchParams.get('sort');
    if (s && SORT_OPTIONS.some((o) => o.value === s)) return s as SortBy;
    if (s === 'zhvi_yoy') return 'price_change';
    if (s === 'fmr_yoy') return 'fmr_change';
    if (s === 'yield_delta_pp') return 'yield_change';
    return 'yield_change';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc'));
  const [minPrice, setMinPrice] = useState<string>(() => searchParams.get('min_price') || '');
  const [maxPrice, setMaxPrice] = useState<string>(() => searchParams.get('max_price') || '');
  const [minYieldPct, setMinYieldPct] = useState<string>(() => searchParams.get('min_yield') || '');
  const [flatBandPct, setFlatBandPct] = useState<number>(() => getStoredInsightsSettings().flatBand);
  const [sortMode, setSortMode] = useState<SortMode>(() => getStoredInsightsSettings().sortMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const PAGE_SIZE = 50;
  const [screenerData, setScreenerData] = useState<{
    items: ScreenerItem[];
    totalMatched: number;
    hasMore: boolean;
    dataCoverage?: { geosUsed: number };
    range?: { priceMin: number; priceMax: number; yieldMax: number };
  } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [debouncedFetchKey, setDebouncedFetchKey] = useState(0);

  const replaceInProgressRef = useRef(false);
  const fetchIdRef = useRef(0);
  const lastFetchedKeyRef = useRef(0);

  const priceRange = useMemo(() => {
    const apiRange = screenerData?.range;
    const sliderMin = 0;
    if (apiRange) {
      const span = Math.max(apiRange.priceMax - apiRange.priceMin, 1);
      const buffer = Math.max(PRICE_BUFFER_FIXED, span * PRICE_BUFFER_PCT);
      const sliderMax = Math.min(MAX_PRICE, apiRange.priceMax + buffer);
      return { sliderMin, sliderMax, step: PRICE_SLIDER_STEP };
    }
    return { sliderMin, sliderMax: MAX_PRICE, step: PRICE_SLIDER_STEP };
  }, [screenerData?.range]);

  const roundTo1k = useCallback((n: number) => Math.round(n / 1000) * 1000, []);

  const yieldSliderMax = useMemo(() => {
    const apiRange = screenerData?.range;
    if (apiRange != null && Number.isFinite(apiRange.yieldMax)) return apiRange.yieldMax;
    return YIELD_SLIDER_MAX_FALLBACK;
  }, [screenerData?.range]);

  const [sliderPriceRange, setSliderPriceRange] = useState<[number, number] | null>(null);
  const [sliderYieldPct, setSliderYieldPct] = useState<number | null>(null);
  const [sliderFlatBandPct, setSliderFlatBandPct] = useState<number | null>(null);
  const [flatBandInputStr, setFlatBandInputStr] = useState<string | null>(null);

  const commitPriceRange = useCallback(
    (minVal: number, maxVal: number) => {
      const minT = roundTo1k(minVal);
      const maxT = roundTo1k(maxVal);
      setMinPrice(minT <= priceRange.sliderMin ? '' : String(minT));
      setMaxPrice(maxT >= priceRange.sliderMax ? '' : String(maxT));
      setSliderPriceRange(null);
    },
    [priceRange.sliderMin, priceRange.sliderMax, roundTo1k]
  );

  const commitYieldPct = useCallback((pct: number) => {
    const rounded = Math.round(pct * 10) / 10;
    setMinYieldPct(rounded <= 0 ? '' : String(rounded));
    setSliderYieldPct(null);
  }, []);

  const commitFlatBandPct = useCallback((pct: number) => {
    const rounded = Math.round(pct * 100) / 100;
    setFlatBandPct(Math.min(10, Math.max(0.5, rounded)));
    setSliderFlatBandPct(null);
    setFlatBandInputStr(null);
  }, []);

  const clampFlatBand = useCallback((n: number) => Math.min(10, Math.max(0.5, Math.round(n * 100) / 100)), []);

  const handleFlatBandBlur = useCallback(() => {
    if (flatBandInputStr === null) {
      return;
    }
    const raw = flatBandInputStr.trim();
    setFlatBandInputStr(null);
    if (raw === '') {
      setFlatBandPct(FLAT_BAND_DEFAULT_PCT);
      return;
    }
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) setFlatBandPct(clampFlatBand(n));
  }, [flatBandInputStr, clampFlatBand]);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'zip' || type === 'city' || type === 'county') setGeoType(type);
    const state = searchParams.get('state') ?? '';
    if (state !== stateFilter) setStateFilter(state);
    const pd = searchParams.get('price_dir') as TrendFilter | null;
    if (pd === 'any' || pd === 'up' || pd === 'flat' || pd === 'down') setPriceDir(pd);
    const fd = searchParams.get('fmr_dir') as TrendFilter | null;
    if (fd === 'any' || fd === 'up' || fd === 'flat' || fd === 'down') setFmrDir(fd);
    const yd = searchParams.get('yield_dir') as TrendFilter | null;
    if (yd === 'any' || yd === 'up' || yd === 'flat' || yd === 'down') setYieldDir(yd);
    const sort = searchParams.get('sort');
    if (sort && SORT_OPTIONS.some((o) => o.value === sort)) setSortBy(sort as SortBy);
    else if (sort === 'zhvi_yoy') setSortBy('price_change');
    else if (sort === 'fmr_yoy') setSortBy('fmr_change');
    else if (sort === 'yield_delta_pp') setSortBy('yield_change');
    if (searchParams.get('sort_dir') === 'asc') setSortDir('asc');
    else setSortDir('desc');
    setMinPrice(searchParams.get('min_price') ?? '');
    setMaxPrice(searchParams.get('max_price') ?? '');
    setMinYieldPct(searchParams.get('min_yield') ?? '');
  }, [searchParams]);

  useEffect(() => {
    if (replaceInProgressRef.current) return;
    const params = new URLSearchParams();
    params.set('type', geoType);
    if (stateFilter) params.set('state', stateFilter);
    params.set('price_dir', priceDir);
    params.set('fmr_dir', fmrDir);
    params.set('yield_dir', yieldDir);
    params.set('sort', sortBy);
    if (sortDir === 'asc') params.set('sort_dir', 'asc');
    if (minPrice.trim()) params.set('min_price', minPrice.trim());
    if (maxPrice.trim()) params.set('max_price', maxPrice.trim());
    if (minYieldPct.trim()) params.set('min_yield', minYieldPct.trim());
    params.set('limit', String(PAGE_SIZE));
    const next = params.toString();
    // Build current from URL in the same key order so comparison is semantic (avoids replace loop from param order differences)
    const currentParams = new URLSearchParams();
    const t = searchParams.get('type');
    currentParams.set('type', t === 'city' || t === 'county' ? t : 'zip');
    const st = searchParams.get('state') ?? '';
    if (st) currentParams.set('state', st);
    const pd = searchParams.get('price_dir') as TrendFilter | null;
    currentParams.set('price_dir', pd === 'any' || pd === 'up' || pd === 'flat' || pd === 'down' ? pd : 'any');
    const fd = searchParams.get('fmr_dir') as TrendFilter | null;
    currentParams.set('fmr_dir', fd === 'any' || fd === 'up' || fd === 'flat' || fd === 'down' ? fd : 'any');
    const yd = searchParams.get('yield_dir') as TrendFilter | null;
    currentParams.set('yield_dir', yd === 'any' || yd === 'up' || yd === 'flat' || yd === 'down' ? yd : 'any');
    const sortFromUrl = searchParams.get('sort');
    const sortNorm =
      sortFromUrl && SORT_OPTIONS.some((o) => o.value === sortFromUrl)
        ? sortFromUrl
        : sortFromUrl === 'zhvi_yoy'
          ? 'price_change'
          : sortFromUrl === 'fmr_yoy'
            ? 'fmr_change'
            : sortFromUrl === 'yield_delta_pp'
              ? 'yield_change'
              : 'yield_change';
    currentParams.set('sort', sortNorm);
    if (searchParams.get('sort_dir') === 'asc') currentParams.set('sort_dir', 'asc');
    if ((searchParams.get('min_price') ?? '').trim()) currentParams.set('min_price', (searchParams.get('min_price') ?? '').trim());
    if ((searchParams.get('max_price') ?? '').trim()) currentParams.set('max_price', (searchParams.get('max_price') ?? '').trim());
    if ((searchParams.get('min_yield') ?? '').trim()) currentParams.set('min_yield', (searchParams.get('min_yield') ?? '').trim());
    currentParams.set('limit', String(PAGE_SIZE));
    const current = currentParams.toString();
    if (next !== current) {
      replaceInProgressRef.current = true;
      router.replace(`${pathname}?${next}`, { scroll: false });
      setTimeout(() => {
        replaceInProgressRef.current = false;
      }, 0);
    }
  }, [geoType, stateFilter, priceDir, fmrDir, yieldDir, sortBy, sortDir, minPrice, maxPrice, minYieldPct, pathname, router]);

  // When sort mode (YoY vs Value) changes, map current sort column to the equivalent field in the new mode
  useEffect(() => {
    setSortBy((prev) => {
      if (sortMode === 'yoy') {
        if (prev === 'price_value') return 'price_change';
        if (prev === 'fmr_value') return 'fmr_change';
        if (prev === 'yield_value') return 'yield_change';
      } else {
        if (prev === 'price_change') return 'price_value';
        if (prev === 'fmr_change') return 'fmr_value';
        if (prev === 'yield_change') return 'yield_value';
      }
      return prev;
    });
  }, [sortMode]);

  useEffect(() => {
    setStoredInsightsSettings(flatBandPct, sortMode);
  }, [flatBandPct, sortMode]);

  const restoreSettingsDefaults = useCallback(() => {
    setFlatBandPct(FLAT_BAND_DEFAULT_PCT);
    setSortMode('yoy');
    setFlatBandInputStr(null);
    setStoredInsightsSettings(FLAT_BAND_DEFAULT_PCT, 'yoy');
  }, []);

  // Reset offset when filters change so next fetch is page 0
  useEffect(() => {
    setOffset(0);
  }, [geoType, stateFilter, priceDir, fmrDir, yieldDir, sortBy, sortDir, minPrice, maxPrice, minYieldPct, flatBandPct, sortMode, debouncedQuery]);

  const FETCH_DEBOUNCE_MS = 300;

  // Debounce search input: update debouncedQuery 300ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), FETCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Bump key 300ms after last filter change so we run one fetch per "settled" filter state (not on initial mount)
  const debounceInitialMountRef = useRef(true);
  useEffect(() => {
    if (debounceInitialMountRef.current) {
      debounceInitialMountRef.current = false;
      return;
    }
    const t = setTimeout(() => setDebouncedFetchKey((k) => k + 1), FETCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [geoType, stateFilter, priceDir, fmrDir, yieldDir, sortBy, sortDir, minPrice, maxPrice, minYieldPct, flatBandPct, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const isLoadMore = offset > 0;
    const skipDebouncedFetch =
      offset === 0 &&
      screenerData != null &&
      debouncedFetchKey === lastFetchedKeyRef.current;
    if (skipDebouncedFetch) return () => {};
    if (offset === 0) lastFetchedKeyRef.current = debouncedFetchKey;

    const runFetch = () => {
      const id = ++fetchIdRef.current;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setStatus('loading');
      }
      setError(null);
      const apiSort =
        sortBy === 'price_change'
          ? 'zhvi_yoy'
          : sortBy === 'fmr_change'
            ? 'fmr_yoy'
            : sortBy === 'yield_change'
              ? 'yield_delta_pp'
              : sortBy === 'price_value'
                ? 'zhvi_curr'
                : sortBy === 'fmr_value'
                  ? 'fmr_curr'
                  : sortBy === 'yield_value'
                    ? 'yield_curr'
                    : 'match';
      const sp = new URLSearchParams();
      sp.set('type', geoType);
      if (stateFilter) sp.set('state', stateFilter);
      sp.set('bedroom', '3');
      sp.set('price_dir', priceDir);
      sp.set('fmr_dir', fmrDir);
      sp.set('yield_dir', yieldDir);
      sp.set('sort', apiSort);
      sp.set('sort_dir', sortDir);
      sp.set('limit', String(PAGE_SIZE));
      sp.set('offset', String(offset));
      if (minPrice.trim() !== '') sp.set('min_price', minPrice.trim());
      if (maxPrice.trim() !== '') sp.set('max_price', maxPrice.trim());
      if (minYieldPct.trim() !== '') sp.set('min_yield', minYieldPct.trim());
      if (debouncedQuery.trim() !== '') sp.set('q', debouncedQuery.trim());
      sp.set('flat_band', String(flatBandPct));
      fetch(`/api/stats/insights-screener?${sp}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => {
          if (id !== fetchIdRef.current) return;
          if (json.error) {
            setError(json.error);
            setStatus('error');
            setLoadingMore(false);
            if (offset === 0) setScreenerData(null);
          } else {
            const newItems = json.items || [];
            const hasMore = Boolean(json.hasMore);
            if (offset === 0) {
              setScreenerData({
                items: newItems,
                totalMatched: json.totalMatched ?? 0,
                hasMore,
                dataCoverage: json.dataCoverage,
                range: json.range,
              });
              setStatus('success');
            } else {
              setScreenerData((prev) =>
                prev
                  ? {
                      ...prev,
                      items: [...prev.items, ...newItems],
                      hasMore,
                    }
                  : null
              );
              setLoadingMore(false);
            }
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            setStatus('idle');
            setLoadingMore(false);
            return;
          }
          if (id !== fetchIdRef.current) return;
          setError('Failed to load data');
          setStatus('error');
          setLoadingMore(false);
          if (offset === 0) setScreenerData(null);
        });
    };

    if (isLoadMore) {
      runFetch();
      return () => controller.abort();
    }

    const t = setTimeout(runFetch, FETCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [geoType, stateFilter, priceDir, fmrDir, yieldDir, sortBy, sortDir, minPrice, maxPrice, minYieldPct, flatBandPct, offset, debouncedFetchKey, debouncedQuery]);

  const hasMore = screenerData?.hasMore ?? false;
  const loadMore = useCallback(() => {
    if (status === 'loading' || loadingMore || !hasMore) return;
    setOffset((prev) => prev + PAGE_SIZE);
  }, [status, loadingMore, hasMore]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLDivElement>(null);
  const sortStateRef = useRef({ sortBy, sortDir });
  sortStateRef.current = { sortBy, sortDir };

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtersOpen]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && status !== 'loading' && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, status, loadingMore, loadMore]);

  const getItemLabel = useCallback((item: ScreenerItem): string => {
    if (item.zipCode) return item.zipCode;
    if (item.cityName) return item.cityName;
    return item.areaName || item.geoKey || '';
  }, []);

  const formatLocation = useCallback((item: ScreenerItem): string => {
    if (item.countyName && item.stateCode) {
      const county = item.countyName.includes('County') ? item.countyName : `${item.countyName} County`;
      return `${county}, ${item.stateCode}`;
    }
    return item.stateCode || '';
  }, []);

  const hrefForItem = useCallback(
    (item: ScreenerItem): string | null => {
      if (geoType === 'zip') {
        const zip = item.zipCode?.match(/\b(\d{5})\b/)?.[1];
        return zip ? `/zip/${zip}` : null;
      }
      if (geoType === 'city' && item.cityName && item.stateCode) {
        return `/city/${buildCitySlug(item.cityName, item.stateCode)}`;
      }
      if (geoType === 'county' && item.areaName && item.stateCode) {
        return `/county/${buildCountySlug(item.areaName, item.stateCode)}`;
      }
      return null;
    },
    [geoType]
  );

  const handleSearch = useCallback(
    (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => {
      if (type === 'state') {
        const state = (value || '').trim().toUpperCase();
        if (state && state.length === 2) {
          router.push(`/state/${state}`);
          return;
        }
      }
      if (type === 'zip') {
        const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
        if (zip) {
          fetch('/api/track/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'zip', query: zip, canonicalPath: `/zip/${zip}` }),
            keepalive: true,
          }).catch(() => {});
          router.push(`/zip/${zip}`);
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
            body: JSON.stringify({ type: 'city', query: q, canonicalPath: `/city/${slug}` }),
            keepalive: true,
          }).catch(() => {});
          router.push(`/city/${slug}`);
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
            body: JSON.stringify({ type: 'county', query: q, canonicalPath: `/county/${slug}` }),
            keepalive: true,
          }).catch(() => {});
          router.push(`/county/${slug}`);
          return;
        }
      }
      const params = new URLSearchParams();
      params.set('q', value);
      params.set('type', type);
      router.push(`/?${params.toString()}`);
    },
    [router]
  );

  const results = screenerData?.items ?? [];

  const totalFromApi = screenerData?.totalMatched ?? screenerData?.items?.length ?? 0;
  const activeFiltersCount =
    (debouncedQuery.trim().length ? 1 : 0) +
    (stateFilter ? 1 : 0) +
    (priceDir !== 'any' ? 1 : 0) +
    (fmrDir !== 'any' ? 1 : 0) +
    (yieldDir !== 'any' ? 1 : 0) +
    (minPrice.trim() ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0) +
    (minYieldPct.trim() ? 1 : 0);

  const filterPills = useMemo(() => {
    const pills: { id: string; label: string; value: string; onRemove: () => void }[] = [];
    if (debouncedQuery.trim()) {
      pills.push({
        id: 'search',
        label: 'Search',
        value: debouncedQuery,
        onRemove: () => {
          setQuery('');
          setDebouncedQuery('');
        },
      });
    }
    if (stateFilter) {
      const name = STATES.find((s) => s.code === stateFilter)?.name ?? stateFilter;
      pills.push({ id: 'state', label: 'State', value: name, onRemove: () => setStateFilter('') });
    }
    if (priceDir !== 'any') {
      pills.push({ id: 'priceDir', label: 'Price', value: priceDir === 'up' ? 'Up' : priceDir === 'down' ? 'Down' : 'Flat', onRemove: () => setPriceDir('any') });
    }
    if (fmrDir !== 'any') {
      pills.push({ id: 'fmrDir', label: 'FMR', value: fmrDir === 'up' ? 'Up' : fmrDir === 'down' ? 'Down' : 'Flat', onRemove: () => setFmrDir('any') });
    }
    if (yieldDir !== 'any') {
      pills.push({ id: 'yieldDir', label: 'Yield', value: yieldDir === 'up' ? 'Up' : yieldDir === 'down' ? 'Down' : 'Flat', onRemove: () => setYieldDir('any') });
    }
    if (minPrice.trim()) {
      pills.push({ id: 'minPrice', label: 'Min $', value: minPrice, onRemove: () => setMinPrice('') });
    }
    if (maxPrice.trim()) {
      pills.push({ id: 'maxPrice', label: 'Max $', value: maxPrice, onRemove: () => setMaxPrice('') });
    }
    if (minYieldPct.trim()) {
      pills.push({ id: 'minYield', label: 'Min yield %', value: minYieldPct, onRemove: () => setMinYieldPct('') });
    }
    return pills;
  }, [debouncedQuery, stateFilter, priceDir, fmrDir, yieldDir, minPrice, maxPrice, minYieldPct]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setStateFilter('');
    setPriceDir('any');
    setFmrDir('any');
    setYieldDir('any');
    setFlatBandPct(FLAT_BAND_DEFAULT_PCT);
    setMinPrice('');
    setMaxPrice('');
    setMinYieldPct('');
  }, []);

  const getSortFieldForColumn = useCallback(
    (column: 'price' | 'fmr' | 'yield'): SortBy => {
      if (column === 'price') return sortMode === 'yoy' ? 'price_change' : 'price_value';
      if (column === 'fmr') return sortMode === 'yoy' ? 'fmr_change' : 'fmr_value';
      return sortMode === 'yoy' ? 'yield_change' : 'yield_value';
    },
    [sortMode]
  );

  const isColumnActive = useCallback(
    (column: 'price' | 'fmr' | 'yield') => {
      const field = getSortFieldForColumn(column);
      return sortBy === field;
    },
    [sortBy, getSortFieldForColumn]
  );

  const handleSortColumn = useCallback((field: SortBy) => {
    const { sortBy: prevBy, sortDir: prevDir } = sortStateRef.current;
    const nextBy = prevBy === field ? prevBy : field;
    const nextDir = prevBy === field ? (prevDir === 'asc' ? 'desc' : 'asc') : 'desc';
    setSortBy(nextBy);
    setSortDir(nextDir);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [filtersOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [settingsOpen]);

  const deltaColor = (delta: number) =>
    delta > flatBandPct
      ? 'text-change-positive'
      : delta < -flatBandPct
        ? 'text-change-negative'
        : 'text-[var(--text-muted)]';

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Market explorer', item: 'https://fmr.fyi/insights' },
    ],
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-7xl mx-auto pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8 pt-6 sm:pt-8 md:pt-10 lg:pt-10">
        <AppHeader className="mb-4 sm:mb-6 lg:mb-4" showSearch onSearchSelect={handleSearch} />
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap mb-3 sm:mb-4">
          <a href="/" className="hover:text-[var(--text-primary)] transition-colors">
            Home
          </a>
          <span className="text-[var(--text-muted)]">/</span>
          <span aria-current="page" className="text-[var(--text-primary)] font-medium">
            Insights
          </span>
        </nav>
        <h2 className="sr-only">Market Movement</h2>
      </div>

      <div className="max-w-7xl mx-auto pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-8">
        {/* Market Overview (ZIP lists) */}
        <div className="mb-4">
          <ExplorerTopLists
            stateFilter={stateFilter || undefined}
            minPrice={minPrice || undefined}
            maxPrice={maxPrice || undefined}
            minYieldPct={minYieldPct || undefined}
          />
        </div>

        {/* Sticky toolbar */}
        <div className="sticky top-0 z-10 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-t-lg pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                Market Movement
              </h3>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5 hidden sm:block">
                Find markets with new opportunities in FY{new Date().getFullYear()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(results.map((m) => ({ label: getItemLabel(m), location: formatLocation(m), zhviCurr: m.zhviCurr, zhviYoy: m.zhviYoy, fmrCurr: m.fmrCurr, fmrYoy: m.fmrYoy, yieldCurr: m.yieldCurr, yieldDeltaPp: m.yieldDeltaPp })))}
                disabled={results.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs font-medium rounded-lg transition-colors bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
              <div ref={filtersButtonRef} className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs font-medium rounded-lg transition-colors ${
                    filtersOpen || activeFiltersCount > 0
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-expanded={filtersOpen}
                  aria-controls="insights-filters-panel"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filters{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
                </button>
                {filtersOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      aria-hidden
                      onClick={() => setFiltersOpen(false)}
                    />
                    <div
                      id="insights-filters-panel"
                      role="dialog"
                      aria-label="Filters"
                      className="fixed bottom-0 left-0 right-0 z-30 w-full max-h-[85vh] overflow-auto rounded-t-xl border border-b-0 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg p-4 space-y-3 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(360px,calc(100vw-2rem))] sm:max-h-[min(85vh,600px)] sm:rounded-lg sm:border-b"
                    >
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">State</label>
                        <select
                          value={stateFilter}
                          onChange={(e) => setStateFilter(e.target.value)}
                          className="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)]"
                          aria-label="State filter"
                        >
                          <option value="">All states</option>
                          {STATES.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <TrendMultiFilter
                        label="Home value"
                        description="Median sale price (YoY)"
                        icon={Building2}
                        value={priceDir}
                        onChange={setPriceDir}
                      />
                      <TrendMultiFilter
                        label="FMR"
                        description="Fair market rent (YoY)"
                        icon={DollarSign}
                        value={fmrDir}
                        onChange={setFmrDir}
                      />
                      <TrendMultiFilter
                        label="Yield"
                        description="Cap rate (trend proxy)"
                        icon={Percent}
                        value={yieldDir}
                        onChange={setYieldDir}
                      />
                      <Separator />
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                          Price range
                        </label>
                        <div className="mt-1.5">
                          <ReactSlider
                            min={priceRange.sliderMin}
                            max={priceRange.sliderMax}
                            step={priceRange.step}
                            value={
                              sliderPriceRange ?? [
                                minPrice.trim()
                                  ? roundTo1k(
                                      Math.min(
                                        Math.max(priceRange.sliderMin, parseFloat(minPrice) || priceRange.sliderMin),
                                        priceRange.sliderMax
                                      )
                                    )
                                  : priceRange.sliderMin,
                                maxPrice.trim()
                                  ? roundTo1k(
                                      Math.max(
                                        Math.min(priceRange.sliderMax, parseFloat(maxPrice) || priceRange.sliderMax),
                                        priceRange.sliderMin
                                      )
                                    )
                                  : priceRange.sliderMax,
                              ]
                            }
                            onChange={(v) => {
                              const [a, b] = Array.isArray(v) ? v : [v, v];
                              setSliderPriceRange([roundTo1k(Number(a)), roundTo1k(Number(b))]);
                            }}
                            onAfterChange={(v) => {
                              const [a, b] = Array.isArray(v) ? v : [v, v];
                              commitPriceRange(Number(a), Number(b));
                            }}
                            className="slider w-full h-6 flex items-center"
                            thumbClassName="insights-slider-thumb w-4 h-4 rounded-full border-2 border-[var(--primary-blue)] bg-[var(--bg-primary)] cursor-grab focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                            trackClassName="h-1 rounded bg-[var(--border-color)]"
                            renderTrack={(props, state) => (
                              <div
                                {...props}
                                className={`${props.className || ''} h-1 rounded ${state.index === 1 ? 'bg-[var(--primary-blue)]' : 'bg-[var(--border-color)]'}`}
                              />
                            )}
                            ariaLabel={['Minimum home value', 'Maximum home value']}
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="sr-only">Min ($)</label>
                            <Input
                              type="number"
                              min={priceRange.sliderMin}
                              max={priceRange.sliderMax}
                              step={priceRange.step}
                              value={
                                sliderPriceRange != null
                                  ? String(Math.trunc(sliderPriceRange[0]))
                                  : minPrice
                              }
                              onChange={(e) => {
                                setSliderPriceRange(null);
                                const raw = e.target.value;
                                if (raw === '' || raw === '-') setMinPrice(raw);
                                else {
                                  const n = parseFloat(raw);
                                  setMinPrice(Number.isNaN(n) ? raw : String(Math.trunc(n)));
                                }
                              }}
                              placeholder="Min"
                              className="h-9 bg-[var(--bg-primary)] text-sm"
                              aria-label="Min ($)"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="sr-only">Max ($)</label>
                            <Input
                              type="number"
                              min={priceRange.sliderMin}
                              step={priceRange.step}
                              value={
                                sliderPriceRange != null
                                  ? String(roundTo1k(sliderPriceRange[1]))
                                  : maxPrice
                              }
                              onChange={(e) => {
                                setSliderPriceRange(null);
                                const raw = e.target.value;
                                if (raw === '' || raw === '-') setMaxPrice(raw);
                                else {
                                  const n = parseFloat(raw);
                                  setMaxPrice(Number.isNaN(n) ? raw : String(Math.trunc(n)));
                                }
                              }}
                              placeholder="Max"
                              className="h-9 bg-[var(--bg-primary)] text-sm"
                              aria-label="Max ($)"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                          Min yield (%)
                        </label>
                        <div className="mt-1.5">
                          <ReactSlider
                            min={0}
                            max={yieldSliderMax}
                            step={YIELD_SLIDER_STEP}
                            value={
                              sliderYieldPct ??
                              (minYieldPct.trim()
                                ? Math.min(
                                    Math.max(0, parseFloat(minYieldPct) || 0),
                                    yieldSliderMax
                                  )
                                : 0)
                            }
                            onChange={(v) => setSliderYieldPct(Number(v))}
                            onAfterChange={(v) => commitYieldPct(Number(v))}
                            className="slider w-full h-6 flex items-center"
                            thumbClassName="insights-slider-thumb w-4 h-4 rounded-full border-2 border-[var(--primary-blue)] bg-[var(--bg-primary)] cursor-grab focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                            trackClassName="h-1 rounded bg-[var(--border-color)]"
                            renderTrack={(props, state) => (
                              <div
                                {...props}
                                className={`${props.className || ''} h-1 rounded ${state.index === 0 ? 'bg-[var(--primary-blue)]' : 'bg-[var(--border-color)]'}`}
                              />
                            )}
                            ariaLabel="Minimum yield percentage"
                          />
                        </div>
                        <div className="mt-2">
                          <label className="sr-only">Min yield (%)</label>
                          <Input
                            type="number"
                            min={0}
                            max={yieldSliderMax}
                            step={0.5}
                            value={
                              sliderYieldPct != null
                                ? String(Math.round(sliderYieldPct * 10) / 10)
                                : minYieldPct === ''
                                  ? ''
                                  : (() => {
                                      const n = parseFloat(minYieldPct);
                                      return Number.isNaN(n) ? minYieldPct : String(Math.round(n * 10) / 10);
                                    })()
                            }
                            onChange={(e) => {
                              setSliderYieldPct(null);
                              const raw = e.target.value;
                              if (raw === '' || raw === '-') setMinYieldPct(raw);
                              else {
                                const n = parseFloat(raw);
                                setMinYieldPct(Number.isNaN(n) ? raw : String(Math.round(n * 10) / 10));
                              }
                            }}
                            placeholder="Any"
                            className="h-9 w-full max-w-[120px] bg-[var(--bg-primary)] text-sm"
                            aria-label="Min yield (%)"
                          />
                        </div>
                      </div>
                      {activeFiltersCount > 0 && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="w-full h-9 px-3 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded border border-[var(--border-color)] transition-colors"
                        >
                          Reset all filters
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div ref={settingsButtonRef} className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-3 sm:py-1.5 min-h-[44px] sm:min-h-0 text-xs font-medium rounded-lg transition-colors ${
                    settingsOpen
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-expanded={settingsOpen}
                  aria-label="Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Settings
                </button>
                {settingsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      aria-hidden
                      onClick={() => setSettingsOpen(false)}
                    />
                    <div
                      role="dialog"
                      aria-label="Settings"
                      className="fixed bottom-0 left-0 right-0 z-30 w-full max-h-[85vh] overflow-auto rounded-t-xl border border-b-0 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg p-4 space-y-4 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(300px,calc(100vw-2rem))] sm:max-h-[min(85vh,400px)] sm:rounded-lg sm:border-b"
                    >
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                          Flat band ±%
                        </label>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <ReactSlider
                              min={0.5}
                              max={10}
                              step={0.5}
                              value={sliderFlatBandPct ?? flatBandPct}
                              onChange={(v) => setSliderFlatBandPct(Number(v))}
                              onAfterChange={(v) => commitFlatBandPct(Number(v))}
                              className="slider w-full h-6 flex items-center"
                              thumbClassName="insights-slider-thumb w-4 h-4 rounded-full border-2 border-[var(--primary-blue)] bg-[var(--bg-primary)] cursor-grab focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
                              trackClassName="h-1 rounded bg-[var(--border-color)]"
                              renderTrack={(props, state) => (
                                <div
                                  {...props}
                                  className={`${props.className || ''} h-1 rounded ${state.index === 0 ? 'bg-[var(--primary-blue)]' : 'bg-[var(--border-color)]'}`}
                                />
                              )}
                              ariaLabel="Flat band percentage"
                            />
                          </div>
                          <label className="sr-only">Flat within ± (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              flatBandInputStr !== null
                                ? flatBandInputStr
                                : sliderFlatBandPct != null
                                  ? sliderFlatBandPct.toFixed(2)
                                  : flatBandPct.toFixed(2)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                setFlatBandInputStr('');
                                return;
                              }
                              const m = raw.match(/^\d*\.?\d{0,2}$/);
                              if (m) setFlatBandInputStr(raw);
                            }}
                            onBlur={handleFlatBandBlur}
                            placeholder="3"
                            className="h-9 w-11 shrink-0 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            aria-label="Flat within ± (%)"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                          Sort by
                        </label>
                        <div className="mt-2 inline-flex overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)]">
                          <button
                            type="button"
                            onClick={() => setSortMode('yoy')}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              sortMode === 'yoy'
                                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            YoY %
                          </button>
                          <button
                            type="button"
                            onClick={() => setSortMode('value')}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              sortMode === 'value'
                                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                                : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            Value
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={restoreSettingsDefaults}
                        className="w-full py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        Restore defaults
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <GeoTabBar
            value={geoType}
            onChange={(t) => setGeoType(t as GeoType)}
            tabs={['zip', 'city', 'county']}
            getLabel={(t) => (t === 'zip' ? 'ZIP' : t === 'city' ? 'City' : 'County')}
            className="relative flex gap-1 mb-3 pb-0.5"
          />

          {filterPills.length > 0 && (
            <FilterPills pills={filterPills} onClearAll={clearFilters} />
          )}

          <SearchInput
            filterMode
            value={query}
            onChange={setQuery}
            placeholder="Search markets (city, state)"
          />

        </div>

        <div className="bg-[var(--bg-secondary)] border-x border-b border-[var(--border-color)] rounded-b-lg -mt-px">
            {status === 'error' && (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">Failed to load</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{error}</p>
              </div>
            )}
            {(status === 'loading' || status === 'success') && (
              <div className="divide-y divide-[var(--border-color)]" aria-busy={status === 'loading'} aria-live="polite">
                <div className="hidden sm:grid grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] gap-3 px-3 sm:px-4 py-2 bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-muted)]">
                  <div>Rank</div>
                  <div>Location</div>
                  <button type="button" onClick={() => handleSortColumn(getSortFieldForColumn('price'))} className="text-left hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                    Home value {isColumnActive('price') && (sortDir === 'desc' ? '↓' : '↑')}
                  </button>
                  <button type="button" onClick={() => handleSortColumn(getSortFieldForColumn('fmr'))} className="text-left hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                    FMR {isColumnActive('fmr') && (sortDir === 'desc' ? '↓' : '↑')}
                  </button>
                  <button type="button" onClick={() => handleSortColumn(getSortFieldForColumn('yield'))} className="text-left hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
                    Yield {isColumnActive('yield') && (sortDir === 'desc' ? '↓' : '↑')}
                  </button>
                  <div className="text-right">Risk</div>
                </div>
                {status === 'loading' && (screenerData?.items?.length ?? 0) === 0 && (
                  <>
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="px-3 sm:px-4 py-2 sm:py-4 md:py-5 grid grid-cols-1 gap-3 md:grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] md:items-center">
                        <div className="h-4 w-8 bg-[var(--border-color)] rounded animate-pulse hidden sm:block" aria-hidden />
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-[var(--border-color)] animate-pulse sm:hidden" aria-hidden />
                          <div className="h-4 w-32 bg-[var(--border-color)] rounded animate-pulse" aria-hidden />
                        </div>
                        <div className="h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
                        <div className="h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
                        <div className="h-14 bg-[var(--border-color)] rounded-md animate-pulse" aria-hidden />
                        <div className="h-6 w-12 bg-[var(--border-color)] rounded animate-pulse justify-end hidden md:flex" aria-hidden />
                      </div>
                    ))}
                    <div className="px-3 sm:px-4 py-3 text-xs text-[var(--text-muted)] text-center">
                      Loading…
                    </div>
                  </>
                )}
                {(status === 'success' || (status === 'loading' && (screenerData?.items?.length ?? 0) > 0)) && (
                  <>
                  {status === 'loading' && (screenerData?.items?.length ?? 0) > 0 && (
                    <div className="px-3 sm:px-4 py-2 text-xs text-[var(--text-muted)] text-center bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      Updating…
                    </div>
                  )}
                  {results.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        No locations match these filters
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Try broadening a signal or switching a trend to Any.
                      </p>
                      <Button variant="secondary" className="mt-4" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    results.map((m, idx) => {
                      const pTrend = trendFromDelta(m.zhviYoy, flatBandPct);
                      const rTrend = trendFromDelta(m.fmrYoy, flatBandPct);
                      const yTrend = trendFromYieldPp(m.yieldDeltaPp, flatBandPct);
                      const href = hrefForItem(m);
                      const risk = deriveRisk(m.yieldCurr);
                      return (
                        <div
                          key={m.geoKey}
                          className="group relative block px-3 sm:px-4 py-2.5 sm:py-4 md:py-5 hover:bg-[var(--bg-hover)] transition-all"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--text-primary)]/0 group-hover:bg-[var(--text-primary)]/20 transition-colors" aria-hidden />
                          <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-[50px_1.5fr_1fr_1fr_1fr_0.8fr] md:items-center">
                            <span className="hidden sm:block text-[11px] text-[var(--text-muted)] font-medium tabular-nums">
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-3 md:justify-start">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] text-[11px] font-medium text-[var(--text-muted)] tabular-nums sm:hidden">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      {href ? (
                                        <a
                                          href={href}
                                          className="truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
                                        >
                                          {getItemLabel(m)}, {m.stateCode}
                                        </a>
                                      ) : (
                                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                                          {getItemLabel(m)}, {m.stateCode}
                                        </span>
                                      )}
                                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                                        <span>{formatLocation(m)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="md:hidden">
                                  <RiskPill risk={risk} />
                                </div>
                              </div>
                            </div>
                            <SignalCell
                              valueMain={formatUSD(m.zhviCurr)}
                              delta={m.zhviYoy}
                              trend={pTrend}
                              deltaColorClass={deltaColor(m.zhviYoy)}
                            />
                            <SignalCell
                              valueMain={`${formatUSD(m.fmrCurr)}/mo`}
                              delta={m.fmrYoy}
                              trend={rTrend}
                              deltaColorClass={deltaColor(m.fmrYoy)}
                            />
                            <SignalCell
                              valueMain={formatPct(m.yieldCurr * 100)}
                              delta={m.yieldDeltaPp}
                              trend={yTrend}
                              deltaColorClass={
                                m.yieldDeltaPp > flatBandPct
                                  ? 'text-change-positive'
                                  : m.yieldDeltaPp < -flatBandPct
                                    ? 'text-change-negative'
                                    : 'text-[var(--text-muted)]'
                              }
                            />
                            <div className="hidden md:flex justify-end">
                              <RiskPill risk={risk} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                <div ref={sentinelRef} className="h-4 flex-shrink-0" aria-hidden="true" />
                {loadingMore && (screenerData?.items?.length ?? 0) > 0 && (
                  <div className="py-4 text-center text-sm text-[var(--text-muted)]">
                    Loading more…
                  </div>
                )}
                  </>
                )}
              </div>
            )}
        </div>

      </div>
      <div className="pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-10" />
    </main>
  );
}
