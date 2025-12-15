'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FMRResult } from '@/lib/types';
import { computeIdealPurchasePrice, computeCashFlow, computeMaxPriceForCashFlow, type DownPaymentInput } from '@/lib/investment';
import type { IdealPurchasePriceResult } from '@/lib/investment';

type MarketParams = {
  propertyTaxRateAnnualPct: number | null;
  propertyTaxSource: string;
  mortgageRateAnnualPct: number | null;
  mortgageRateSource: string;
  fetchedAt: string;
};

type PersistedPrefs = {
  mode: 'cashflow' | 'maxprice';
  purchasePrice: string; // For cash flow mode
  desiredCashFlow: string; // For max price mode
  bedrooms: number;
  cashOnCashAnnualPct: string;
  downPaymentMode: 'percent' | 'amount';
  downPaymentPercent: string;
  downPaymentAmount: string;
  insuranceMonthly: string;
  hoaMonthly: string;
  propertyManagementMode: 'percent' | 'amount';
  propertyManagementPercent: string;
  propertyManagementAmount: string;
  overrideTaxRate: boolean;
  overrideMortgageRate: boolean;
  taxRateAnnualPct: string;
  mortgageRateAnnualPct: string;
};

const LS_KEY = 'fmr_fyi_ideal_purchase_prefs_v1';
const LS_KEY_DETAILS_EXPANDED = 'fmr_fyi_calc_details_expanded';

const DEFAULT_PREFS: PersistedPrefs = {
  mode: 'maxprice',
  purchasePrice: '200000',
  desiredCashFlow: '200',
  bedrooms: 2,
  cashOnCashAnnualPct: '10',
  downPaymentMode: 'percent',
  downPaymentPercent: '20',
  downPaymentAmount: '50000',
  insuranceMonthly: '175',
  hoaMonthly: '0',
  propertyManagementMode: 'percent',
  propertyManagementPercent: '10',
  propertyManagementAmount: '0',
  overrideTaxRate: false,
  overrideMortgageRate: false,
  taxRateAnnualPct: '1.2',
  mortgageRateAnnualPct: '6.5',
};

function safeParsePrefs(): PersistedPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const j = JSON.parse(raw);
    const merged: any = { ...DEFAULT_PREFS, ...(j || {}) };
    // Migrate numeric -> string if needed
    const toStr = (v: any, fallback: string) => (typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v));
    merged.cashOnCashAnnualPct = toStr(merged.cashOnCashAnnualPct, DEFAULT_PREFS.cashOnCashAnnualPct);
    merged.downPaymentPercent = toStr(merged.downPaymentPercent, DEFAULT_PREFS.downPaymentPercent);
    merged.downPaymentAmount = toStr(merged.downPaymentAmount, DEFAULT_PREFS.downPaymentAmount);
    merged.insuranceMonthly = toStr(merged.insuranceMonthly, DEFAULT_PREFS.insuranceMonthly);
    merged.hoaMonthly = toStr(merged.hoaMonthly, DEFAULT_PREFS.hoaMonthly);
    merged.taxRateAnnualPct = toStr(merged.taxRateAnnualPct, DEFAULT_PREFS.taxRateAnnualPct);
    merged.mortgageRateAnnualPct = toStr(merged.mortgageRateAnnualPct, DEFAULT_PREFS.mortgageRateAnnualPct);
    merged.bedrooms = Number.isFinite(Number(merged.bedrooms)) ? Number(merged.bedrooms) : DEFAULT_PREFS.bedrooms;
    merged.mode = merged.mode === 'maxprice' || merged.mode === 'cashflow' ? merged.mode : DEFAULT_PREFS.mode;
    merged.purchasePrice = toStr(merged.purchasePrice, DEFAULT_PREFS.purchasePrice);
    merged.desiredCashFlow = toStr(merged.desiredCashFlow, DEFAULT_PREFS.desiredCashFlow);
    merged.propertyManagementMode = merged.propertyManagementMode === 'amount' || merged.propertyManagementMode === 'percent' ? merged.propertyManagementMode : DEFAULT_PREFS.propertyManagementMode;
    merged.propertyManagementPercent = toStr(merged.propertyManagementPercent, DEFAULT_PREFS.propertyManagementPercent);
    merged.propertyManagementAmount = toStr(merged.propertyManagementAmount, DEFAULT_PREFS.propertyManagementAmount);
    return merged as PersistedPrefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

function persistPrefs(p: PersistedPrefs) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function sanitizeNumericInput(value: string, allowDecimal: boolean = false): string {
  // Remove all non-numeric characters, optionally allowing decimal point
  if (allowDecimal) {
    // Allow digits and one decimal point
    const cleaned = value.replace(/[^\d.]/g, '');
    // Ensure only one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  } else {
    // Only allow digits
    return value.replace(/[^\d]/g, '');
  }
}

function parseNumberOrZero(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getRentForBedrooms(data: FMRResult, bedrooms: number): number | null {
  const b = Math.max(0, Math.min(8, Math.round(bedrooms)));
  
  // If SAFMR with exactly one ZIP in zipFMRData, use that ZIP's values
  if (data.source === 'safmr' && data.zipFMRData && data.zipFMRData.length === 1) {
    const zipData = data.zipFMRData[0];
    const base =
      b === 0 ? zipData.bedroom0 :
      b === 1 ? zipData.bedroom1 :
      b === 2 ? zipData.bedroom2 :
      b === 3 ? zipData.bedroom3 :
      b === 4 ? zipData.bedroom4 :
      undefined;
    if (base !== undefined && base !== null) return base;
    if (b > 4 && zipData.bedroom4) {
      return Math.round(zipData.bedroom4 * Math.pow(1.15, b - 4));
    }
    return null;
  }
  
  // Otherwise use top-level data
  const base =
    b === 0 ? data.bedroom0 :
    b === 1 ? data.bedroom1 :
    b === 2 ? data.bedroom2 :
    b === 3 ? data.bedroom3 :
    b === 4 ? data.bedroom4 :
    undefined;
  if (base !== undefined && base !== null) return base;
  if (b > 4 && data.bedroom4) {
    return Math.round(data.bedroom4 * Math.pow(1.15, b - 4));
  }
  return null;
}

function canRenderForData(data: FMRResult | null): boolean {
  if (!data) return false;
  if (data.source === 'fmr') return true;
  // SAFMR drilldown: single ZIP view (zip or address query), not an aggregate zip list
  if (data.source === 'safmr' && (data.queriedType === 'zip' || data.queriedType === 'address') && !!data.zipCode && !data.zipFMRData) return true;
  // SAFMR city/county with exactly one ZIP: treat as single-ZIP view
  if (data.source === 'safmr' && data.zipFMRData && data.zipFMRData.length === 1) return true;
  return false;
}

function marketQueryForData(data: FMRResult): { zip?: string; county?: string; state?: string } {
  // Prefer zip when present; else fall back to county+state.
  if (data.zipCode && /^\d{5}$/.test(String(data.zipCode))) return { zip: String(data.zipCode) };
  // If SAFMR with exactly one ZIP in zipFMRData, use that ZIP
  if (data.source === 'safmr' && data.zipFMRData && data.zipFMRData.length === 1) {
    const zip = data.zipFMRData[0].zipCode;
    if (zip && /^\d{5}$/.test(String(zip))) return { zip: String(zip) };
  }
  if (data.queriedType === 'zip' && data.queriedLocation) {
    const m = String(data.queriedLocation).match(/\b(\d{5})\b/);
    if (m) return { zip: m[1] };
  }
  if (data.countyName && data.stateCode) {
    const cleaned = String(data.countyName).replace(/\s+county\s*$/i, '').trim();
    return { county: cleaned || String(data.countyName), state: data.stateCode };
  }
  return {};
}

export default function IdealPurchasePriceCard({ data }: { data: FMRResult | null }) {
  const [prefs, setPrefs] = useState<PersistedPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [market, setMarket] = useState<MarketParams | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useEffect(() => {
    setPrefs(safeParsePrefs());
    setPrefsLoaded(true);
    // Load details expanded state
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(LS_KEY_DETAILS_EXPANDED);
        if (saved !== null) {
          setDetailsExpanded(saved === 'true');
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (!data || !canRenderForData(data)) return;
    const q = marketQueryForData(data);
    const sp = new URLSearchParams();
    if (q.zip) sp.set('zip', q.zip);
    if (q.county && q.state) {
      sp.set('county', q.county);
      sp.set('state', q.state);
    }
    if ([...sp.keys()].length === 0) {
      setMarket(null);
      setMarketError('Missing location inputs for market data.');
      return;
    }

    const url = `/api/investment/market-params?${sp.toString()}`;
    setMarketLoading(true);
    setMarketError(null);
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Failed to load market inputs');
        return j?.data as MarketParams;
      })
      .then((m) => setMarket(m))
      .catch((e) => setMarketError(e instanceof Error ? e.message : 'Failed to load market inputs'))
      .finally(() => setMarketLoading(false));
  }, [data?.zipCode, data?.countyName, data?.stateCode, data?.queriedType, data?.source]);


  // Persist “likely static” values (as requested)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!prefsLoaded) return;
    persistPrefs(prefs);
  }, [prefs, prefsLoaded]);

  // Persist details expanded state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LS_KEY_DETAILS_EXPANDED, String(detailsExpanded));
    } catch {
      // ignore
    }
  }, [detailsExpanded]);

  const rentMonthlyRaw = useMemo(() => (data ? getRentForBedrooms(data, prefs.bedrooms) : null), [data, prefs.bedrooms]);
  
  // Calculate property management cost (not subtracted from rent, but added to expenses)
  const propertyManagementCost = useMemo(() => {
    if (rentMonthlyRaw === null) return 0;
    if (prefs.propertyManagementMode === 'percent') {
      const pct = parseNumberOrZero(prefs.propertyManagementPercent);
      return rentMonthlyRaw * (pct / 100);
    } else {
      return parseNumberOrZero(prefs.propertyManagementAmount);
    }
  }, [rentMonthlyRaw, prefs.propertyManagementMode, prefs.propertyManagementPercent, prefs.propertyManagementAmount]);
  
  // Use full rent (not subtracting PM)
  const rentMonthly = rentMonthlyRaw;

  // If market fetch succeeds but parsing yields null, fall back to saved defaults so the calculator still works.
  const savedTaxRate = parseNumberOrZero(prefs.taxRateAnnualPct);
  const savedMortgageRate = parseNumberOrZero(prefs.mortgageRateAnnualPct);
  const taxRateAnnualPct = prefs.overrideTaxRate ? savedTaxRate : (market?.propertyTaxRateAnnualPct ?? savedTaxRate);
  const mortgageRateAnnualPct = prefs.overrideMortgageRate ? savedMortgageRate : (market?.mortgageRateAnnualPct ?? savedMortgageRate);

  const downPayment: DownPaymentInput =
    // If user chooses $-mode, per request we assume 20% down for the calculation.
    prefs.downPaymentMode === 'amount'
      ? { mode: 'percent', percent: 20 }
      : { mode: 'percent', percent: parseNumberOrZero(prefs.downPaymentPercent) };

  const result = useMemo(() => {
    if (!data || !canRenderForData(data)) return null;
    if (rentMonthly === null) return null;
    
    if (prefs.mode === 'cashflow') {
      // Calculate cash flow given purchase price
      if (marketLoading && !prefs.overrideTaxRate && !prefs.overrideMortgageRate) return null;
      
      const purchasePrice = parseNumberOrZero(prefs.purchasePrice);
      if (purchasePrice <= 0) return null;
      
      return computeCashFlow({
        purchasePrice,
        rentMonthly,
        bedrooms: prefs.bedrooms,
        interestRateAnnualPct: mortgageRateAnnualPct,
        propertyTaxRateAnnualPct: taxRateAnnualPct,
        insuranceMonthly: parseNumberOrZero(prefs.insuranceMonthly),
        hoaMonthly: parseNumberOrZero(prefs.hoaMonthly),
        propertyManagementMonthly: propertyManagementCost,
        downPayment,
        termMonths: 360,
      });
    } else {
      // Calculate max purchase price given desired cash flow
      if (marketLoading && !prefs.overrideTaxRate && !prefs.overrideMortgageRate) return null;
      
      const desiredCashFlow = parseNumberOrZero(prefs.desiredCashFlow);
      if (desiredCashFlow < 0) return null;
      
      return computeMaxPriceForCashFlow({
        rentMonthly,
        bedrooms: prefs.bedrooms,
        interestRateAnnualPct: mortgageRateAnnualPct,
        propertyTaxRateAnnualPct: taxRateAnnualPct,
        insuranceMonthly: parseNumberOrZero(prefs.insuranceMonthly),
        hoaMonthly: parseNumberOrZero(prefs.hoaMonthly),
        propertyManagementMonthly: propertyManagementCost,
        desiredCashFlowMonthly: desiredCashFlow,
        downPayment,
        termMonths: 360,
      });
    }
  }, [data, rentMonthly, taxRateAnnualPct, mortgageRateAnnualPct, prefs, downPayment, marketLoading, propertyManagementCost]);

  const downPaymentPctForDisplay = parseNumberOrZero(prefs.downPaymentPercent);
  const purchasePriceForCalc = prefs.mode === 'cashflow' 
    ? parseNumberOrZero(prefs.purchasePrice)
    : (result && 'purchasePrice' in result ? result.purchasePrice : 0);
  
  const downPaymentDollars = prefs.downPaymentMode === 'amount'
    ? parseNumberOrZero(prefs.downPaymentAmount)
    : purchasePriceForCalc * (downPaymentPctForDisplay / 100);
  if (!data || !canRenderForData(data)) return null;

  return (
    <div className="w-full bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8">
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-1">Purchase Price Calculator</h3>
        <p className="text-xs text-[#737373]">Based on HUD rent + your assumptions</p>
      </div>

      {/* Mode selector */}
      <div className="mb-4">
        <label className="block">
          <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Calculation mode</div>
          <select
            value={prefs.mode}
            onChange={(e) => setPrefs((p) => ({ ...p, mode: e.target.value as 'cashflow' | 'maxprice' }))}
            className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm"
          >
            <option value="cashflow">Calculate Cash Flow</option>
            <option value="maxprice">Calculate Max Price</option>
          </select>
        </label>
      </div>

      {/* Output */}
      <div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 sm:p-4">
        {prefs.mode === 'cashflow' ? (
          <>
            <div className="text-xs text-[#737373] mb-1">Monthly cash flow</div>
            <div className="text-2xl font-semibold text-[#0a0a0a] tabular-nums">
              {result && 'monthlyCashFlow' in result 
                ? formatCurrency((result as any).monthlyCashFlow)
                : '—'}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-[#737373] mb-1">Maximum purchase price</div>
            <div className="text-2xl font-semibold text-[#0a0a0a] tabular-nums">
              {result && 'purchasePrice' in result ? formatCurrency((result as any).purchasePrice) : '—'}
            </div>
          </>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#525252]">
          <div>
            <div className="text-[#737373]">Rent</div>
            <div className="font-medium tabular-nums">{rentMonthlyRaw ? formatCurrency(rentMonthlyRaw) : '—'}</div>
          </div>
          <div>
            <div className="text-[#737373]">Down payment</div>
            <div className="font-medium tabular-nums">
              {result ? formatCurrency(downPaymentDollars) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Loan</div>
            <div className="font-medium tabular-nums">
              {result 
                ? (prefs.mode === 'cashflow' && 'loanAmount' in result
                    ? formatCurrency((result as any).loanAmount)
                    : formatCurrency(result.loanAmount))
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Mortgage</div>
            <div className="font-medium tabular-nums">
              {result 
                ? (prefs.mode === 'cashflow' && 'monthlyMortgagePayment' in result
                    ? formatCurrency((result as any).monthlyMortgagePayment)
                    : 'maxMortgagePayment' in result
                    ? formatCurrency((result as IdealPurchasePriceResult).maxMortgagePayment)
                    : '—')
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Expenses</div>
            <div className="font-medium tabular-nums">
              {result 
                ? (prefs.mode === 'cashflow' && 'monthlyExpenses' in result
                    ? formatCurrency((result as any).monthlyExpenses)
                    : result && 'purchasePrice' in result
                    ? formatCurrency(
                        parseNumberOrZero(prefs.insuranceMonthly) +
                        parseNumberOrZero(prefs.hoaMonthly) +
                        propertyManagementCost +
                        ((taxRateAnnualPct / 100) / 12 * result.purchasePrice)
                      )
                    : '—')
                : '—'}
            </div>
          </div>
        </div>

        {/* Collapsible details section */}
        <div className="mt-3 border-t border-[#e5e5e5] pt-3">
          <button
            type="button"
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="w-full flex items-center justify-between text-xs text-[#525252] hover:text-[#0a0a0a] transition-colors"
          >
            <span>Details</span>
            <span className="tabular-nums">{detailsExpanded ? '−' : '+'}</span>
          </button>
          {detailsExpanded && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#525252]">
              <div>
                <div className="text-[#737373]">Insurance</div>
                <div className="font-medium tabular-nums">
                  {formatCurrency(parseNumberOrZero(prefs.insuranceMonthly))}
                </div>
              </div>
              <div>
                <div className="text-[#737373]">HOA</div>
                <div className="font-medium tabular-nums">
                  {formatCurrency(parseNumberOrZero(prefs.hoaMonthly))}
                </div>
              </div>
              <div>
                <div className="text-[#737373]">Property management</div>
                <div className="font-medium tabular-nums">
                  {formatCurrency(propertyManagementCost)}
                </div>
              </div>
              <div>
                <div className="text-[#737373]">Taxes</div>
                <div className="font-medium tabular-nums">
                  {result && 'monthlyTaxes' in result
                    ? formatCurrency((result as any).monthlyTaxes)
                    : result && 'purchasePrice' in result
                    ? formatCurrency(((taxRateAnnualPct / 100) / 12) * result.purchasePrice)
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[#737373]">Tax rate</div>
                <div className="font-medium tabular-nums">
                  {marketLoading && !prefs.overrideTaxRate ? 'Loading…' : formatPct(taxRateAnnualPct)}
                </div>
              </div>
              <div>
                <div className="text-[#737373]">Mortgage rate</div>
                <div className="font-medium tabular-nums">
                  {marketLoading && !prefs.overrideMortgageRate ? 'Loading…' : formatPct(mortgageRateAnnualPct)}
                </div>
              </div>
            </div>
          )}
        </div>

        {!result && (
          <div className="mt-3 text-xs text-[#737373] leading-relaxed">
            {rentMonthly === null
              ? 'Missing rent for the selected bedroom count.'
              : (marketLoading && !prefs.overrideTaxRate && !prefs.overrideMortgageRate)
                ? 'Loading market tax + mortgage rates…'
              : 'No positive price is feasible with the current assumptions.'}
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Bedrooms</div>
            <select
              value={prefs.bedrooms}
              onChange={(e) => setPrefs((p) => ({ ...p, bedrooms: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm"
            >
              {Array.from({ length: 9 }, (_, i) => i).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          {prefs.mode === 'cashflow' ? (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Purchase price</div>
              <input
                type="text"
                inputMode="numeric"
                value={prefs.purchasePrice}
                onChange={(e) => setPrefs((p) => ({ ...p, purchasePrice: sanitizeNumericInput(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          ) : (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Cash flow</div>
              <input
                type="text"
                inputMode="numeric"
                value={prefs.desiredCashFlow}
                onChange={(e) => setPrefs((p) => ({ ...p, desiredCashFlow: sanitizeNumericInput(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Down payment</div>
            <select
              value={prefs.downPaymentMode}
              onChange={(e) => setPrefs((p) => ({ ...p, downPaymentMode: e.target.value as any }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm"
            >
              <option value="percent">%</option>
              <option value="amount">$</option>
            </select>
          </label>

          {prefs.downPaymentMode === 'percent' ? (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Down %</div>
              <input
                type="text"
                inputMode="decimal"
                value={prefs.downPaymentPercent}
                onChange={(e) => setPrefs((p) => ({ ...p, downPaymentPercent: sanitizeNumericInput(e.target.value, true) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          ) : (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Down $</div>
              <input
                type="text"
                inputMode="numeric"
                value={prefs.downPaymentAmount}
                onChange={(e) => setPrefs((p) => ({ ...p, downPaymentAmount: sanitizeNumericInput(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Insurance / mo</div>
            <input
              type="text"
              inputMode="numeric"
              value={prefs.insuranceMonthly}
              onChange={(e) => setPrefs((p) => ({ ...p, insuranceMonthly: sanitizeNumericInput(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">HOA / mo</div>
            <input
              type="text"
              inputMode="numeric"
              value={prefs.hoaMonthly}
              onChange={(e) => setPrefs((p) => ({ ...p, hoaMonthly: sanitizeNumericInput(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Property management</div>
            <select
              value={prefs.propertyManagementMode}
              onChange={(e) => setPrefs((p) => ({ ...p, propertyManagementMode: e.target.value as 'percent' | 'amount' }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm"
            >
              <option value="percent">%</option>
              <option value="amount">$</option>
            </select>
          </label>

          {prefs.propertyManagementMode === 'percent' ? (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">PM %</div>
              <input
                type="text"
                inputMode="decimal"
                value={prefs.propertyManagementPercent}
                onChange={(e) => setPrefs((p) => ({ ...p, propertyManagementPercent: sanitizeNumericInput(e.target.value, true) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          ) : (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">PM $ / mo</div>
              <input
                type="text"
                inputMode="numeric"
                value={prefs.propertyManagementAmount}
                onChange={(e) => setPrefs((p) => ({ ...p, propertyManagementAmount: sanitizeNumericInput(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          )}
        </div>

        <div className="pt-2 border-t border-[#e5e5e5] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[#0a0a0a]">Market inputs</div>
            <div
              className="flex items-center"
              title={
                marketLoading
                  ? 'Fetching mortgage + property tax inputs…'
                  : marketError
                    ? `Failed to fetch market inputs: ${marketError}`
                    : market
                      ? 'Market inputs fetched'
                      : 'Market inputs not requested'
              }
            >
              <span
                className={[
                  'inline-block h-2.5 w-2.5 rounded-full',
                  marketLoading ? 'bg-[#f59e0b] animate-pulse' : marketError ? 'bg-[#ef4444]' : market ? 'bg-[#22c55e]' : 'bg-[#d4d4d4]',
                ].join(' ')}
              />
            </div>
          </div>

          {marketError && <div className="text-xs text-[#dc2626]">{marketError}</div>}
          {!marketError && market && (market.propertyTaxRateAnnualPct === null || market.mortgageRateAnnualPct === null) && (
            <div className="text-xs text-[#737373]">
              Market data loaded, but one or more values couldn’t be parsed — using your saved defaults (toggle override to change).
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-[#525252]">
            <input
              type="checkbox"
              checked={prefs.overrideTaxRate}
              onChange={(e) => setPrefs((p) => ({ ...p, overrideTaxRate: e.target.checked }))}
            />
            Override tax rate
          </label>
          <div className="grid grid-cols-2 gap-2 items-center">
            <input
              type="text"
              inputMode="decimal"
              value={prefs.taxRateAnnualPct}
              disabled={!prefs.overrideTaxRate}
              onChange={(e) => setPrefs((p) => ({ ...p, taxRateAnnualPct: sanitizeNumericInput(e.target.value, true) }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums disabled:bg-[#fafafa]"
            />
            <div className="text-xs text-[#737373] truncate"> </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[#525252]">
            <input
              type="checkbox"
              checked={prefs.overrideMortgageRate}
              onChange={(e) => setPrefs((p) => ({ ...p, overrideMortgageRate: e.target.checked }))}
            />
            Override mortgage rate
          </label>
          <div className="grid grid-cols-2 gap-2 items-center">
            <input
              type="text"
              inputMode="decimal"
              value={prefs.mortgageRateAnnualPct}
              disabled={!prefs.overrideMortgageRate}
              onChange={(e) => setPrefs((p) => ({ ...p, mortgageRateAnnualPct: sanitizeNumericInput(e.target.value, true) }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums disabled:bg-[#fafafa]"
            />
            <div className="text-xs text-[#737373] truncate"> </div>
          </div>
        </div>
      </div>
    </div>
  );
}


