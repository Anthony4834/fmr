'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useIntersectionObserver } from '@/app/hooks/useIntersectionObserver';
import { useCountUp } from '@/app/hooks/useCountUp';
import { computeCashFlow, type DownPaymentInput } from '@/lib/investment';

// Calculator mode type
type CalculatorMode = 'cashFlow' | 'maxPrice';

type GeoRankingsResponse = {
  year: number;
  type: 'zip' | 'city' | 'county' | 'state';
  items: Array<{
    rank: number;
    zipCode?: string;
    cityName?: string | null;
    countyName?: string | null;
    stateCode?: string | null;
    medianScore?: number | null;
  }>;
};

type FmrApiResponse = {
  data?: {
    source?: string;
    year?: number;
    zipCode?: string;
    cityName?: string;
    countyName?: string;
    stateCode?: string;
    bedroom3?: number;
  };
};

type TaxRateApiResponse = {
  zip: string;
  found: boolean;
  effectiveTaxRatePct: number | null;
};

export type LandingCalculatorExample = {
  marketZip: string;
  marketCity: string | null;
  marketState: string | null;
  marketRank: number | null;

  fmr3Br: number;
  fmrYear: number | null;
  taxRateAnnualPct: number;

  // Shared assumptions
  downPaymentPercent: number;
  mortgageRateAnnualPct: number;
  insuranceMonthly: number;
  maintenancePercentOfRent: number;
  propertyManagementPercentOfRent: number;

  // Cash flow mode (user enters purchase price)
  purchasePrice: number;
  mortgageMonthly: number;
  taxesMonthly: number;
  maintenanceMonthly: number;
  propertyManagementMonthly: number;
  cashFlowMonthly: number;

  // Max price mode (user enters target cash flow)
  targetCashFlowMonthly: number;
  estimatedMonthlyExpenses: number; // taxes + insurance + maintenance + PM
  maxPurchasePrice: number;
};

function randomInt(minInclusive: number, maxInclusive: number) {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundToNearest(n: number, step: number) {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return n;
  return Math.round(n / step) * step;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return json as T;
}

// Animated value display
function AnimatedValue({ value, prefix = '', suffix = '', enabled, delay = 0, highlight = false }: {
  value: number;
  prefix?: string;
  suffix?: string;
  enabled: boolean;
  delay?: number;
  highlight?: boolean;
}) {
  const { count } = useCountUp({
    end: value,
    duration: 1500,
    delay,
    enabled,
    easing: 'easeOut',
  });

  return (
    <span className={`font-mono font-semibold tabular-nums ${highlight ? 'text-[#44e37e] text-2xl' : 'text-white text-lg'}`}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

// Loading skeleton for the calculator
function CalculatorSkeleton() {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 animate-pulse">
      {/* Mode toggle skeleton */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 h-10 bg-white/10 rounded-lg" />
        <div className="flex-1 h-10 bg-white/5 rounded-lg" />
      </div>
      
      {/* Header skeleton */}
      <div className="pb-3 border-b border-white/10 mb-4">
        <div className="h-5 w-40 bg-white/10 rounded mb-2" />
        <div className="h-3 w-56 bg-white/5 rounded" />
      </div>
      
      {/* Lines skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex justify-between items-center py-2">
            <div className="h-4 bg-white/10 rounded" style={{ width: `${80 + Math.random() * 60}px` }} />
            <div className="h-4 bg-white/10 rounded" style={{ width: `${50 + Math.random() * 30}px` }} />
          </div>
        ))}
      </div>
      
      {/* Result skeleton */}
      <div className="mt-4 pt-4 border-t border-white/20">
        <div className="flex justify-between items-center">
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-7 w-20 bg-[#44e37e]/20 rounded" />
        </div>
      </div>
    </div>
  );
}

// Calculator demo component
function CalculatorDemo({ enabled, initialExample, onExampleChange }: { 
  enabled: boolean; 
  initialExample?: LandingCalculatorExample | null;
  onExampleChange?: (example: LandingCalculatorExample | null) => void;
}) {
  const [mode, setMode] = useState<CalculatorMode>('cashFlow');
  const [showResults, setShowResults] = useState(false);
  const [example, setExample] = useState<LandingCalculatorExample | null>(initialExample || null);
  const [exampleLoading, setExampleLoading] = useState(!initialExample);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const didInitRef = useRef(!!initialExample);
  
  // Notify parent when example changes
  useEffect(() => {
    if (onExampleChange) {
      onExampleChange(example);
    }
  }, [example, onExampleChange]);

  // If we have initial example, trigger results immediately
  useEffect(() => {
    if (initialExample && enabled) {
      setExampleLoading(false);
      const timer = setTimeout(() => setShowResults(true), 300);
      return () => clearTimeout(timer);
    }
  }, [initialExample, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    const controller = new AbortController();
    const signal = controller.signal;

    const load = async () => {
      setExampleLoading(true);
      setExampleError(null);
      try {
        const rankings = await fetchJson<GeoRankingsResponse>(
          '/api/stats/geo-rankings?type=zip&limit=100&offset=0',
          signal
        );

        const candidates = (rankings?.items || [])
          .filter((i) => typeof i.zipCode === 'string' && /^\d{5}$/.test(i.zipCode))
          .map((i) => ({
            zip: i.zipCode as string,
            cityName: (typeof i.cityName === 'string' ? i.cityName : null),
            stateCode: (typeof i.stateCode === 'string' ? i.stateCode : null),
            rank: Number.isFinite(Number(i.rank)) ? Number(i.rank) : null,
          }));

        // Shuffle candidates and try until we find one with usable 3BR rent and realistic numbers.
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);

        const DEFAULTS = {
          downPaymentPercent: 20,
          mortgageRateAnnualPct: 6.5,
          insuranceMonthly: 150,
          maintenancePercentOfRent: 5,
          propertyManagementPercentOfRent: 10,
          bedrooms: 3,
          hoaMonthly: 0,
        } as const;

        const downPayment: DownPaymentInput = { mode: 'percent', percent: DEFAULTS.downPaymentPercent };

        for (const pick of shuffled.slice(0, 20)) {
          const zip = pick.zip;

          const [fmrSettled, taxSettled] = await Promise.allSettled([
            fetchJson<FmrApiResponse>(`/api/search/fmr?zip=${encodeURIComponent(zip)}`, signal),
            fetchJson<TaxRateApiResponse>(`/api/stats/tax-rate/zip?zip=${encodeURIComponent(zip)}`, signal),
          ]);

          const fmr = fmrSettled.status === 'fulfilled' ? fmrSettled.value : null;
          const tax: TaxRateApiResponse =
            taxSettled.status === 'fulfilled'
              ? taxSettled.value
              : { zip, found: false, effectiveTaxRatePct: null };

          const rent = fmr?.data?.bedroom3;
          if (!Number.isFinite(rent) || (rent as number) < 800) continue; // Need decent rent for realistic example

          const fmrYear = Number.isFinite(Number(fmr?.data?.year)) ? Number(fmr?.data?.year) : null;
          const marketCity = (typeof fmr?.data?.cityName === 'string' ? fmr.data.cityName : pick.cityName);
          const marketState = (typeof fmr?.data?.stateCode === 'string' ? fmr.data.stateCode : pick.stateCode);

          const taxRateAnnualPctRaw = tax?.found ? tax.effectiveTaxRatePct : null;
          const taxRateAnnualPct = Number.isFinite(taxRateAnnualPctRaw) && (taxRateAnnualPctRaw as number) > 0
            ? Number(taxRateAnnualPctRaw)
            : 1.2; // fallback assumption if unavailable

          const rentNum = Number(rent);
          const maintenanceMonthly = Math.round(rentNum * (DEFAULTS.maintenancePercentOfRent / 100));
          const propertyManagementMonthly = Math.round(rentNum * (DEFAULTS.propertyManagementPercentOfRent / 100));

          // Pick a realistic purchase price range based on rent (rough 1% rule guideline, with variance)
          // Properties in high-score areas often have rent-to-price > 1%, so aim for 80-150k range
          const basePriceFromRent = rentNum * 100; // 1% rule baseline
          const minPrice = Math.max(60000, basePriceFromRent * 0.6);
          const maxPrice = Math.min(200000, basePriceFromRent * 1.2);
          const purchasePrice = roundToNearest(randomInt(Math.round(minPrice), Math.round(maxPrice)), 5000);

          const cash = computeCashFlow({
            purchasePrice,
            rentMonthly: rentNum,
            bedrooms: DEFAULTS.bedrooms,
            interestRateAnnualPct: DEFAULTS.mortgageRateAnnualPct,
            propertyTaxRateAnnualPct: taxRateAnnualPct,
            insuranceMonthly: DEFAULTS.insuranceMonthly,
            hoaMonthly: DEFAULTS.hoaMonthly,
            propertyManagementMonthly,
            downPayment,
            termMonths: 360,
          });

          if (!cash) continue;

          const cashFlowMonthly = Math.round(cash.monthlyCashFlow - maintenanceMonthly); // subtract maintenance
          // Only accept positive, realistic cash flow
          if (cashFlowMonthly < 100 || cashFlowMonthly > 900) continue;

          const mortgageMonthly = Math.round(cash.monthlyMortgagePayment);
          const taxesMonthly = Math.round(cash.monthlyTaxes);
          const estimatedMonthlyExpenses = Math.round(
            taxesMonthly + DEFAULTS.insuranceMonthly + maintenanceMonthly + propertyManagementMonthly
          );

          const out: LandingCalculatorExample = {
            marketZip: zip,
            marketCity: marketCity || null,
            marketState: marketState || null,
            marketRank: pick.rank,

            fmr3Br: Math.round(rentNum),
            fmrYear,
            taxRateAnnualPct,

            downPaymentPercent: DEFAULTS.downPaymentPercent,
            mortgageRateAnnualPct: DEFAULTS.mortgageRateAnnualPct,
            insuranceMonthly: DEFAULTS.insuranceMonthly,
            maintenancePercentOfRent: DEFAULTS.maintenancePercentOfRent,
            propertyManagementPercentOfRent: DEFAULTS.propertyManagementPercentOfRent,

            purchasePrice: Math.round(purchasePrice),
            mortgageMonthly,
            taxesMonthly,
            maintenanceMonthly,
            propertyManagementMonthly,
            cashFlowMonthly,

            targetCashFlowMonthly: cashFlowMonthly,
            estimatedMonthlyExpenses,
            maxPurchasePrice: Math.round(purchasePrice),
          };

          setExample(out);
          return;
        }

        throw new Error('Could not build a real-data example (missing rent/tax data).');
      } catch (e) {
        if (signal.aborted) return;
        setExampleError(e instanceof Error ? e.message : 'Failed to load real example');
      } finally {
        if (!signal.aborted) setExampleLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [enabled]);

  // Re-trigger the “reveal” animation when mode changes or the real example loads.
  useEffect(() => {
    if (!enabled) return;
    if (!example) return;
    setShowResults(false);
    const timer = setTimeout(() => setShowResults(true), 300);
    return () => clearTimeout(timer);
  }, [enabled, mode, example?.marketZip]);

  const fallbackCashFlowData = useMemo(() => ({
    fmr: 1285,
    propertyPrice: 95000,
    mortgage: 480,
    taxes: 95,
    insurance: 150,
    maintenance: 64,
    propertyManagement: 129,
    cashFlow: 367,
    taxRateAnnualPct: 1.2,
    zip: '43952',
    city: 'Steubenville' as string | null,
    state: 'OH' as string | null,
    fmrYear: 2026 as number | null,
  }), []);

  const cashFlowData = example ? {
    fmr: example.fmr3Br,
    propertyPrice: example.purchasePrice,
    mortgage: example.mortgageMonthly,
    taxes: example.taxesMonthly,
    insurance: example.insuranceMonthly,
    maintenance: example.maintenanceMonthly,
    propertyManagement: example.propertyManagementMonthly,
    cashFlow: example.cashFlowMonthly,
    taxRateAnnualPct: example.taxRateAnnualPct,
    zip: example.marketZip,
    city: example.marketCity,
    state: example.marketState,
    fmrYear: example.fmrYear,
  } : fallbackCashFlowData;

  const fallbackMaxPriceData = useMemo(() => ({
    fmr: 1285,
    targetCashFlow: 367,
    expenses: 438,
    maxPrice: 95000,
    taxRateAnnualPct: 1.2,
    zip: '43952',
    city: 'Steubenville' as string | null,
    state: 'OH' as string | null,
    fmrYear: 2026 as number | null,
  }), []);

  const maxPriceData = example ? {
    fmr: example.fmr3Br,
    targetCashFlow: example.targetCashFlowMonthly,
    expenses: example.estimatedMonthlyExpenses,
    maxPrice: example.maxPurchasePrice,
    taxRateAnnualPct: example.taxRateAnnualPct,
    zip: example.marketZip,
    city: example.marketCity,
    state: example.marketState,
    fmrYear: example.fmrYear,
  } : fallbackMaxPriceData;

  // Show skeleton while loading (only if no initial example provided)
  if (exampleLoading && !example) {
    return <CalculatorSkeleton />;
  }

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      {/* Mode tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setMode('cashFlow')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'cashFlow'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Cash Flow Calculator
        </button>
        <button
          onClick={() => setMode('maxPrice')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'maxPrice'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Max Purchase Price
        </button>
      </div>

      {/* Calculator content */}
      <div className="p-6">
        {mode === 'cashFlow' ? (
          <div className="space-y-4">
            {/* Market header */}
            <div className={`pb-3 border-b border-white/10 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="text-white font-medium">
                  {cashFlowData.city && cashFlowData.state
                    ? `${cashFlowData.city}, ${cashFlowData.state}`
                    : cashFlowData.zip}
                </span>
                <span className="text-white/40 text-sm">{cashFlowData.zip}</span>
              </div>
              <div className="text-xs text-white/40">
                {exampleLoading ? 'Loading market data…' : 'Real market data • 20% down • 30-yr mortgage'}
              </div>
            </div>

            {/* Inputs */}
            <div className={`flex items-center justify-between py-2 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white/70">Fair Market Rent (3BR)</span>
              <AnimatedValue value={cashFlowData.fmr} prefix="$" enabled={showResults} />
            </div>

            <div className={`flex items-center justify-between py-2 border-b border-white/10 transition-all duration-500 delay-100 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white/70">Purchase Price</span>
              <AnimatedValue value={cashFlowData.propertyPrice} prefix="$" enabled={showResults} delay={100} />
            </div>

            {/* Expenses breakdown */}
            <div className={`space-y-2 pl-4 transition-all duration-500 delay-200 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-white/50">Mortgage (P&I)</span>
                <span className="text-white/70 font-mono">-${cashFlowData.mortgage.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-white/50">Property Taxes</span>
                <span className="text-white/70 font-mono">-${cashFlowData.taxes.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-white/50">Insurance</span>
                <span className="text-white/70 font-mono">-${cashFlowData.insurance.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-white/50">Property Management</span>
                <span className="text-white/70 font-mono">-${cashFlowData.propertyManagement.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-white/50">Maintenance</span>
                <span className="text-white/70 font-mono">-${cashFlowData.maintenance.toLocaleString()}</span>
              </div>
            </div>

            {/* Result */}
            <div className={`flex items-center justify-between pt-4 border-t border-white/20 transition-all duration-500 delay-400 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white font-medium">Monthly Cash Flow</span>
              <AnimatedValue value={cashFlowData.cashFlow} prefix="$" enabled={showResults} delay={400} highlight />
            </div>

            {showResults && (
              <div className="flex items-center gap-2 text-[#44e37e] mt-4 transition-all duration-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-medium">Positive cash flow property!</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Market header */}
            <div className={`pb-3 border-b border-white/10 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="text-white font-medium">
                  {maxPriceData.city && maxPriceData.state
                    ? `${maxPriceData.city}, ${maxPriceData.state}`
                    : maxPriceData.zip}
                </span>
                <span className="text-white/40 text-sm">{maxPriceData.zip}</span>
              </div>
              <div className="text-xs text-white/40">
                {exampleLoading ? 'Loading market data…' : 'Real market data • 20% down • 30-yr mortgage'}
              </div>
            </div>

            {/* Inputs */}
            <div className={`flex items-center justify-between py-2 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white/70">Fair Market Rent (3BR)</span>
              <AnimatedValue value={maxPriceData.fmr} prefix="$" enabled={showResults} />
            </div>

            <div className={`flex items-center justify-between py-2 transition-all duration-500 delay-100 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white/70">Target Cash Flow</span>
              <AnimatedValue value={maxPriceData.targetCashFlow} prefix="$" enabled={showResults} delay={100} />
            </div>

            <div className={`flex items-center justify-between py-2 border-b border-white/10 transition-all duration-500 delay-200 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white/70">Est. Monthly Expenses</span>
              <span className="text-white/70 font-mono">-${maxPriceData.expenses.toLocaleString()}</span>
            </div>

            {/* Result */}
            <div className={`flex items-center justify-between pt-4 border-t border-white/20 transition-all duration-500 delay-300 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-white font-medium">Max Purchase Price</span>
              <AnimatedValue value={maxPriceData.maxPrice} prefix="$" enabled={showResults} delay={300} highlight />
            </div>

            {showResults && (
              <div className="flex items-center gap-2 text-[#44e37e] mt-4 transition-all duration-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-medium">Your maximum offer price</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface InvestmentShowcaseProps {
  initialExample?: LandingCalculatorExample | null;
}

// Encode calculator example data into ExtensionConfig format for URL
function encodeCalculatorConfig(example: LandingCalculatorExample | null): string | null {
  if (!example) return null;
  
  const config = {
    downPaymentMode: 'percent' as const,
    downPaymentPercent: example.downPaymentPercent,
    downPaymentAmount: Math.round(example.purchasePrice * (example.downPaymentPercent / 100)),
    insuranceMonthly: example.insuranceMonthly,
    hoaMonthly: 0,
    propertyManagementMode: 'percent' as const,
    propertyManagementPercent: example.propertyManagementPercentOfRent,
    propertyManagementAmount: example.propertyManagementMonthly,
    overrideTaxRate: true, // Override to use our example tax rate
    overrideMortgageRate: true, // Override to use our example mortgage rate
    propertyTaxRateAnnualPct: example.taxRateAnnualPct,
    mortgageRateAnnualPct: example.mortgageRateAnnualPct,
    customLineItems: [
      {
        id: 'maintenance',
        label: 'Maintenance',
        method: 'percent' as const,
        percentOf: 'rent' as const,
        value: example.maintenancePercentOfRent,
      }
    ],
    purchasePrice: example.purchasePrice,
    bedrooms: 3,
  };
  
  try {
    const json = JSON.stringify(config);
    const encoded = encodeURIComponent(btoa(json));
    return encoded;
  } catch {
    return null;
  }
}

export default function InvestmentShowcase({ initialExample }: InvestmentShowcaseProps) {
  const { ref, hasBeenInView } = useIntersectionObserver<HTMLElement>({ threshold: 0.2, mobileThreshold: 0.35 });
  
  // Track the current example (starts with initial, may be updated by CalculatorDemo)
  const [currentExample, setCurrentExample] = useState<LandingCalculatorExample | null>(initialExample || null);
  
  const calculatorConfig = encodeCalculatorConfig(currentExample);
  const calculatorUrl = currentExample && calculatorConfig 
    ? `/zip/${currentExample.marketZip}?config=${calculatorConfig}`
    : '/';

  return (
    <section ref={ref} className="py-12 sm:py-20 md:py-28 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className={`text-center mb-8 sm:mb-12 md:mb-16 transition-all duration-700 ${hasBeenInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/70 mb-3 sm:mb-4">
            <span className="text-base font-bold">$</span>
            Analyze Deals
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">
            Know Your Numbers Before You Buy
          </h2>
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
            Our cash flow calculator helps you make data-driven decisions with real FMR data
          </p>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Calculator Demo */}
          <div className={`transition-all duration-700 delay-200 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            <CalculatorDemo 
              enabled={hasBeenInView} 
              initialExample={initialExample}
              onExampleChange={setCurrentExample}
            />
          </div>

          {/* Right: Explanation and Use Cases */}
          <div className={`transition-all duration-700 delay-400 ${hasBeenInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
            <div className="space-y-8">
              {/* What it does */}
              <div>
                <h3 className="text-2xl font-bold text-white mb-4">
                  Excellerate Your Research
                </h3>
                <p className="text-white/60">
                  Pick a market. We automatically pull HUD Fair Market Rent, local tax rates, and current mortgage rates. Just enter a price — or a cash flow target — and get your answer.
                </p>
              </div>

              {/* Auto-filled data */}
              <div className="space-y-4">
                <div className="text-sm font-medium text-white/40 uppercase tracking-wide">Auto-filled from real data</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
                    <div className="text-xs text-white/50 mb-1">Rent</div>
                    <div className="text-sm text-white font-medium">HUD FMR</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
                    <div className="text-xs text-white/50 mb-1">Taxes</div>
                    <div className="text-sm text-white font-medium">Census ACS</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
                    <div className="text-xs text-white/50 mb-1">Mortgage Rate</div>
                    <div className="text-sm text-white font-medium">Daily updated</div>
                  </div>
                </div>
              </div>

              {/* Optional customization note */}
              <div className="flex gap-3 bg-white/5 rounded-lg p-4 border border-white/10">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/40 shrink-0 mt-0.5">
                  <path d="M12 20V10M18 20V4M6 20v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <div className="text-sm text-white font-medium mb-1">Fine-tune your numbers</div>
                  <div className="text-sm text-white/50">Override any default to match your actual deal, we'll save your preferences for next time.</div>
                </div>
              </div>

              {/* CTA */}
              <div className="pt-2">
                <Link
                  href={calculatorUrl}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#0a0a0a] font-medium rounded-lg hover:bg-white/90 transition-colors"
                >
                  Try the Calculator
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
