'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FMRResult } from '@/lib/types';
import { computeIdealPurchasePrice, type DownPaymentInput } from '@/lib/investment';

type MarketParams = {
  propertyTaxRateAnnualPct: number | null;
  propertyTaxSource: string;
  mortgageRateAnnualPct: number | null;
  mortgageRateSource: string;
  fetchedAt: string;
};

type PersistedPrefs = {
  bedrooms: number;
  cashOnCashAnnualPct: string;
  downPaymentMode: 'percent' | 'amount';
  downPaymentPercent: string;
  downPaymentAmount: string;
  insuranceMonthly: string;
  hoaMonthly: string;
  overrideTaxRate: boolean;
  overrideMortgageRate: boolean;
  taxRateAnnualPct: string;
  mortgageRateAnnualPct: string;
};

const LS_KEY = 'fmr_fyi_ideal_purchase_prefs_v1';

const DEFAULT_PREFS: PersistedPrefs = {
  bedrooms: 2,
  cashOnCashAnnualPct: '10',
  downPaymentMode: 'percent',
  downPaymentPercent: '20',
  downPaymentAmount: '50000',
  insuranceMonthly: '175',
  hoaMonthly: '0',
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

  useEffect(() => {
    setPrefs(safeParsePrefs());
    setPrefsLoaded(true);
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

  const rentMonthly = useMemo(() => (data ? getRentForBedrooms(data, prefs.bedrooms) : null), [data, prefs.bedrooms]);

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
    // While market values are loading and we aren't overriding, show a loading state instead of computing.
    if (marketLoading && !prefs.overrideTaxRate && !prefs.overrideMortgageRate) return null;

    return computeIdealPurchasePrice({
      rentMonthly,
      bedrooms: prefs.bedrooms,
      interestRateAnnualPct: mortgageRateAnnualPct,
      propertyTaxRateAnnualPct: taxRateAnnualPct,
      insuranceMonthly: parseNumberOrZero(prefs.insuranceMonthly),
      hoaMonthly: parseNumberOrZero(prefs.hoaMonthly),
      cashFlowMonthlyPct: parseNumberOrZero(prefs.cashOnCashAnnualPct),
      downPayment,
      termMonths: 360,
    });
  }, [data, rentMonthly, taxRateAnnualPct, mortgageRateAnnualPct, prefs, downPayment, marketLoading]);

  const downPaymentPctForDisplay =
    prefs.downPaymentMode === 'amount' ? 20 : parseNumberOrZero(prefs.downPaymentPercent);
  const downPaymentDollars = result ? (result.purchasePrice * (downPaymentPctForDisplay / 100)) : null;
  if (!data || !canRenderForData(data)) return null;

  return (
    <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-lg border border-[#e5e5e5] p-4 sm:p-6 md:p-8">
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-[#0a0a0a] mb-1">Ideal Purchase Price</h3>
        <p className="text-xs text-[#737373]">Based on HUD rent + your assumptions</p>
      </div>

      {/* Output */}
      <div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 sm:p-4">
        <div className="text-xs text-[#737373] mb-1">Ideal purchase price</div>
        <div className="text-2xl font-semibold text-[#0a0a0a] tabular-nums">
          {result ? formatCurrency(result.purchasePrice) : '—'}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#525252]">
          <div>
            <div className="text-[#737373]">Rent</div>
            <div className="font-medium tabular-nums">{rentMonthly ? formatCurrency(rentMonthly) : '—'}</div>
          </div>
          <div>
            <div className="text-[#737373]">Loan</div>
            <div className="font-medium tabular-nums">{result ? formatCurrency(result.loanAmount) : '—'}</div>
          </div>
          <div>
            <div className="text-[#737373]">Down</div>
            <div className="font-medium tabular-nums">
              {result ? `${formatCurrency(downPaymentDollars)}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Cash flow</div>
            <div className="font-medium tabular-nums">
              {result ? `${formatCurrency(result.monthlyCashFlowRequired)}/mo` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Tax rate</div>
            <div className="font-medium tabular-nums">
              {marketLoading && !prefs.overrideTaxRate ? 'Loading…' : formatPct(taxRateAnnualPct)}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Rate (30Y)</div>
            <div className="font-medium tabular-nums">
              {marketLoading && !prefs.overrideMortgageRate ? 'Loading…' : formatPct(mortgageRateAnnualPct)}
            </div>
          </div>
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

          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Cash flow %</div>
            <input
              type="text"
              inputMode="decimal"
              value={prefs.cashOnCashAnnualPct}
              onChange={(e) => setPrefs((p) => ({ ...p, cashOnCashAnnualPct: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
            />
          </label>
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
                onChange={(e) => setPrefs((p) => ({ ...p, downPaymentPercent: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
              />
            </label>
          ) : (
            <label className="block">
              <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Down $ (assumes 20%)</div>
              <input
                type="text"
                inputMode="numeric"
                value={result ? String(Math.round(downPaymentDollars || 0)) : ''}
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-sm tabular-nums"
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
              onChange={(e) => setPrefs((p) => ({ ...p, insuranceMonthly: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">HOA / mo</div>
            <input
              type="text"
              inputMode="numeric"
              value={prefs.hoaMonthly}
              onChange={(e) => setPrefs((p) => ({ ...p, hoaMonthly: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums"
            />
          </label>
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
              onChange={(e) => setPrefs((p) => ({ ...p, taxRateAnnualPct: e.target.value }))}
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
              onChange={(e) => setPrefs((p) => ({ ...p, mortgageRateAnnualPct: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e5e5] bg-white text-sm tabular-nums disabled:bg-[#fafafa]"
            />
            <div className="text-xs text-[#737373] truncate"> </div>
          </div>
        </div>
      </div>
    </div>
  );
}


