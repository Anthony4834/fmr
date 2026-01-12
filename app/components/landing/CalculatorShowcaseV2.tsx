'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { Calculator, DollarSign, Percent, Home, FileText, Settings, ArrowRight, Check, MapPin, TrendingUp } from 'lucide-react';
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
  estimatedMonthlyExpenses: number;
  maxPurchasePrice: number;
};

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

// Animated counter hook
function useCountUp(end: number, duration: number = 1500, enabled: boolean = true, delay: number = 0) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    if (!enabled) return;
    
    const timeout = setTimeout(() => {
      const startTime = performance.now();
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * end));
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [end, duration, enabled, delay]);
  
  return count;
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
  const count = useCountUp(value, 1500, enabled, delay);

  return (
    <span 
      className={`font-mono font-semibold tabular-nums ${highlight ? 'text-2xl' : 'text-lg'}`}
      style={{ color: highlight ? 'hsl(192 85% 42%)' : 'hsl(220 30% 12%)' }}
    >
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

// Loading skeleton for the calculator
function CalculatorSkeleton() {
  return (
    <div 
      className="rounded-xl border p-6 animate-pulse"
      style={{ backgroundColor: '#ffffff', borderColor: 'hsl(220 15% 88%)' }}
    >
      {/* Mode toggle skeleton */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: 'hsl(220 15% 92%)' }} />
        <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: 'hsl(220 15% 95%)' }} />
      </div>
      
      {/* Header skeleton */}
      <div className="pb-3 border-b mb-4" style={{ borderColor: 'hsl(220 15% 92%)' }}>
        <div className="h-5 w-40 rounded mb-2" style={{ backgroundColor: 'hsl(220 15% 92%)' }} />
        <div className="h-3 w-56 rounded" style={{ backgroundColor: 'hsl(220 15% 95%)' }} />
      </div>
      
      {/* Lines skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex justify-between items-center py-2">
            <div className="h-4 rounded" style={{ width: `${80 + Math.random() * 60}px`, backgroundColor: 'hsl(220 15% 92%)' }} />
            <div className="h-4 rounded" style={{ width: `${50 + Math.random() * 30}px`, backgroundColor: 'hsl(220 15% 92%)' }} />
          </div>
        ))}
      </div>
      
      {/* Result skeleton */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'hsl(220 15% 88%)' }}>
        <div className="flex justify-between items-center">
          <div className="h-5 w-32 rounded" style={{ backgroundColor: 'hsl(220 15% 92%)' }} />
          <div className="h-7 w-20 rounded" style={{ backgroundColor: 'hsl(192 85% 42% / 0.2)' }} />
        </div>
      </div>
    </div>
  );
}

// Calculator demo component with V2 styling
function CalculatorDemoV2({ enabled, initialExample, onExampleChange }: { 
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
          if (!Number.isFinite(rent) || (rent as number) < 800) continue;

          const fmrYear = Number.isFinite(Number(fmr?.data?.year)) ? Number(fmr?.data?.year) : null;
          const marketCity = (typeof fmr?.data?.cityName === 'string' ? fmr.data.cityName : pick.cityName);
          const marketState = (typeof fmr?.data?.stateCode === 'string' ? fmr.data.stateCode : pick.stateCode);

          const taxRateAnnualPctRaw = tax?.found ? tax.effectiveTaxRatePct : null;
          const taxRateAnnualPct = Number.isFinite(taxRateAnnualPctRaw) && (taxRateAnnualPctRaw as number) > 0
            ? Number(taxRateAnnualPctRaw)
            : 1.2;

          const rentNum = Number(rent);
          const maintenanceMonthly = Math.round(rentNum * (DEFAULTS.maintenancePercentOfRent / 100));
          const propertyManagementMonthly = Math.round(rentNum * (DEFAULTS.propertyManagementPercentOfRent / 100));

          const basePriceFromRent = rentNum * 100;
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

          const cashFlowMonthly = Math.round(cash.monthlyCashFlow - maintenanceMonthly);
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

  // Re-trigger the "reveal" animation when mode changes or the real example loads.
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

  // Show skeleton while loading
  if (exampleLoading && !example) {
    return <CalculatorSkeleton />;
  }

  return (
    <div 
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: '#ffffff', borderColor: 'hsl(220 15% 88%)' }}
    >
      {/* Mode tabs */}
      <div className="flex border-b" style={{ borderColor: 'hsl(220 15% 88%)' }}>
        <button
          onClick={() => setMode('cashFlow')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mode === 'cashFlow'
              ? ''
              : ''
          }`}
          style={{ 
            backgroundColor: mode === 'cashFlow' ? 'hsl(192 85% 42% / 0.08)' : 'transparent',
            color: mode === 'cashFlow' ? 'hsl(192 85% 42%)' : 'hsl(220 15% 55%)',
          }}
        >
          Cash Flow Calculator
        </button>
        <button
          onClick={() => setMode('maxPrice')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors`}
          style={{ 
            backgroundColor: mode === 'maxPrice' ? 'hsl(192 85% 42% / 0.08)' : 'transparent',
            color: mode === 'maxPrice' ? 'hsl(192 85% 42%)' : 'hsl(220 15% 55%)',
          }}
        >
          Max Purchase Price
        </button>
      </div>

      {/* Calculator content */}
      <div className="p-6">
        {mode === 'cashFlow' ? (
          <div className="space-y-4">
            {/* Market header */}
            <div 
              className={`pb-3 border-b transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 92%)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4" style={{ color: 'hsl(220 15% 55%)' }} />
                <span className="font-medium" style={{ color: 'hsl(220 30% 12%)' }}>
                  {cashFlowData.city && cashFlowData.state
                    ? `${cashFlowData.city}, ${cashFlowData.state}`
                    : cashFlowData.zip}
                </span>
                <span className="text-sm" style={{ color: 'hsl(220 15% 55%)' }}>{cashFlowData.zip}</span>
              </div>
              <div className="text-xs" style={{ color: 'hsl(220 15% 55%)' }}>
                {exampleLoading ? 'Loading market data…' : 'Real market data • 20% down • 30-yr mortgage'}
              </div>
            </div>

            {/* Inputs */}
            <div className={`flex items-center justify-between py-2 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span style={{ color: 'hsl(220 15% 45%)' }}>Fair Market Rent (3BR)</span>
              <AnimatedValue value={cashFlowData.fmr} prefix="$" enabled={showResults} />
            </div>

            <div 
              className={`flex items-center justify-between py-2 border-b transition-all duration-500 delay-100 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 92%)' }}
            >
              <span style={{ color: 'hsl(220 15% 45%)' }}>Purchase Price</span>
              <AnimatedValue value={cashFlowData.propertyPrice} prefix="$" enabled={showResults} delay={100} />
            </div>

            {/* Expenses breakdown */}
            <div className={`space-y-2 pl-4 transition-all duration-500 delay-200 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center justify-between py-1 text-sm">
                <span style={{ color: 'hsl(220 15% 55%)' }}>Mortgage (P&I)</span>
                <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${cashFlowData.mortgage.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span style={{ color: 'hsl(220 15% 55%)' }}>Property Taxes</span>
                <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${cashFlowData.taxes.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span style={{ color: 'hsl(220 15% 55%)' }}>Insurance</span>
                <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${cashFlowData.insurance.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span style={{ color: 'hsl(220 15% 55%)' }}>Property Management</span>
                <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${cashFlowData.propertyManagement.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span style={{ color: 'hsl(220 15% 55%)' }}>Maintenance</span>
                <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${cashFlowData.maintenance.toLocaleString()}</span>
              </div>
            </div>

            {/* Result */}
            <div 
              className={`flex items-center justify-between pt-4 border-t transition-all duration-500 delay-400 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 88%)' }}
            >
              <span className="font-medium" style={{ color: 'hsl(220 30% 12%)' }}>Monthly Cash Flow</span>
              <AnimatedValue value={cashFlowData.cashFlow} prefix="$" enabled={showResults} delay={400} highlight />
            </div>

            {showResults && (
              <div 
                className="flex items-center gap-2 mt-4 transition-all duration-300"
                style={{ color: 'hsl(145 60% 40%)' }}
              >
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Positive cash flow property!</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Market header */}
            <div 
              className={`pb-3 border-b transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 92%)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4" style={{ color: 'hsl(220 15% 55%)' }} />
                <span className="font-medium" style={{ color: 'hsl(220 30% 12%)' }}>
                  {maxPriceData.city && maxPriceData.state
                    ? `${maxPriceData.city}, ${maxPriceData.state}`
                    : maxPriceData.zip}
                </span>
                <span className="text-sm" style={{ color: 'hsl(220 15% 55%)' }}>{maxPriceData.zip}</span>
              </div>
              <div className="text-xs" style={{ color: 'hsl(220 15% 55%)' }}>
                {exampleLoading ? 'Loading market data…' : 'Real market data • 20% down • 30-yr mortgage'}
              </div>
            </div>

            {/* Inputs */}
            <div className={`flex items-center justify-between py-2 transition-all duration-500 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span style={{ color: 'hsl(220 15% 45%)' }}>Fair Market Rent (3BR)</span>
              <AnimatedValue value={maxPriceData.fmr} prefix="$" enabled={showResults} />
            </div>

            <div className={`flex items-center justify-between py-2 transition-all duration-500 delay-100 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
              <span style={{ color: 'hsl(220 15% 45%)' }}>Target Cash Flow</span>
              <AnimatedValue value={maxPriceData.targetCashFlow} prefix="$" enabled={showResults} delay={100} />
            </div>

            <div 
              className={`flex items-center justify-between py-2 border-b transition-all duration-500 delay-200 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 92%)' }}
            >
              <span style={{ color: 'hsl(220 15% 45%)' }}>Est. Monthly Expenses</span>
              <span className="font-mono" style={{ color: 'hsl(220 15% 45%)' }}>-${maxPriceData.expenses.toLocaleString()}</span>
            </div>

            {/* Result */}
            <div 
              className={`flex items-center justify-between pt-4 border-t transition-all duration-500 delay-300 ${showResults ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'hsl(220 15% 88%)' }}
            >
              <span className="font-medium" style={{ color: 'hsl(220 30% 12%)' }}>Max Purchase Price</span>
              <AnimatedValue value={maxPriceData.maxPrice} prefix="$" enabled={showResults} delay={300} highlight />
            </div>

            {showResults && (
              <div 
                className="flex items-center gap-2 mt-4 transition-all duration-300"
                style={{ color: 'hsl(192 85% 42%)' }}
              >
                <DollarSign className="w-5 h-5" />
                <span className="text-sm font-medium">Your maximum offer price</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
    overrideTaxRate: true,
    overrideMortgageRate: true,
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

// Data source card
function DataSourceCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div 
      className="flex items-start gap-2 sm:gap-3 p-2 sm:p-4 rounded-lg border transition-all duration-200"
      style={{ 
        backgroundColor: '#ffffff',
        borderColor: 'hsl(220 15% 88%)',
      }}
    >
      <div 
        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: 'hsl(192 85% 42% / 0.1)' }}
      >
        <div className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: 'hsl(192 85% 42%)' }}>{icon}</div>
      </div>
      <div className="min-w-0">
        <div 
          className="font-medium text-xs sm:text-sm mb-0.5 sm:mb-1"
          style={{ color: 'hsl(220 30% 12%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {title}
        </div>
        <div 
          className="text-xs hidden sm:block"
          style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}

interface CalculatorShowcaseV2Props {
  initialExample?: LandingCalculatorExample | null;
}

export default function CalculatorShowcaseV2({ initialExample }: CalculatorShowcaseV2Props) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  const [currentExample, setCurrentExample] = useState<LandingCalculatorExample | null>(initialExample || null);
  
  const calculatorConfig = encodeCalculatorConfig(currentExample);
  const calculatorUrl = currentExample && calculatorConfig 
    ? `/zip/${currentExample.marketZip}?config=${calculatorConfig}`
    : '/';

  return (
    <section 
      ref={ref}
      className="py-8 sm:py-12 md:py-24 border-t sm:border-t-0"
      style={{ backgroundColor: 'hsl(210 20% 98%)', borderColor: 'hsl(220 15% 90%)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Mobile header */}
        <div className="sm:hidden text-center mb-4">
          <Badge className="mb-2">Cash Flow Calculator</Badge>
          <h2 
            className="font-display text-xl font-bold tracking-tight"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Know your numbers{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>before you buy</span>
          </h2>
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
            <Badge className="mb-3 sm:mb-4">Cash Flow Calculator</Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3 sm:mb-4"
            style={{ color: 'hsl(220 30% 12%)' }}
          >
            Know your numbers{' '}
            <span style={{ color: 'hsl(192 85% 42%)' }}>before you buy</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base sm:text-lg max-w-2xl mx-auto"
            style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Calculate monthly cash flow or find your maximum purchase price using real HUD rent data
          </motion.p>
        </motion.div>

        {/* Two column layout - reversed on mobile (calculator first) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          {/* Left: Explanation (shows second on mobile) */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col order-2 lg:order-1"
          >
            <div 
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium mb-4 w-fit"
              style={{ 
                backgroundColor: 'hsl(192 85% 42% / 0.1)',
                color: 'hsl(192 85% 42%)',
              }}
            >
              <Calculator className="w-4 h-4" />
              Real-time analysis
            </div>
            <h3 
              className="font-display text-lg sm:text-xl md:text-2xl font-semibold tracking-tight mb-2 sm:mb-3"
              style={{ color: 'hsl(220 30% 12%)' }}
            >
              Data-driven deal analysis
            </h3>
            <p 
              className="text-sm sm:text-base leading-relaxed mb-4 sm:mb-6"
              style={{ color: 'hsl(220 15% 45%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              Pick a market. We automatically pull HUD Fair Market Rent, local tax rates, and current mortgage rates. Enter a price — or a cash flow target — and get your answer instantly.
            </p>

            {/* Data sources */}
            <div 
              className="text-xs font-medium uppercase tracking-wider mb-3 sm:mb-4"
              style={{ color: 'hsl(220 15% 55%)' }}
            >
              Auto-filled from real data
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <DataSourceCard
                icon={<Home className="w-5 h-5" />}
                title="HUD FMR"
                description="Official rent limits"
              />
              <DataSourceCard
                icon={<FileText className="w-5 h-5" />}
                title="Census ACS"
                description="Property tax rates"
              />
              <DataSourceCard
                icon={<Percent className="w-5 h-5" />}
                title="Daily Rates"
                description="Current mortgage rates"
              />
              <DataSourceCard
                icon={<Settings className="w-5 h-5" />}
                title="Your Settings"
                description="Saved preferences"
              />
            </div>

            {/* CTA */}
            <div className="flex flex-wrap gap-4">
              <Link
                href={calculatorUrl}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg text-white transition-colors text-sm"
                style={{ backgroundColor: 'hsl(192 85% 42%)', fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(192 85% 38%)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(192 85% 42%)'}
              >
                Try the Calculator
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>

          {/* Right: Calculator Demo (shows first on mobile) */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 0.8 }}
            className="order-1 lg:order-2"
          >
            <div
              className="calculator-connector-target"
            >
              <CalculatorDemoV2 
                enabled={isInView} 
                initialExample={initialExample}
                onExampleChange={setCurrentExample}
              />
            </div>
            
            {/* Shadow effect */}
            <div
              className="absolute -bottom-4 left-4 right-4 h-8 rounded-xl blur-xl -z-10"
              style={{ 
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                opacity: isInView ? 1 : 0,
                transition: 'opacity 1s',
                transform: 'rotateY(-6deg)',
              }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
