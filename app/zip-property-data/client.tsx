"use client";

import { useEffect, useRef, useState } from "react";

interface ZipPropertyData {
  zipCode: string;
  stateCode: string | null;
  cityName: string | null;
  countyName: string | null;
  zhvi1BR: number | null;
  zhvi2BR: number | null;
  zhvi3BR: number | null;
  zhvi4BR: number | null;
  effectiveTaxRate: number | null;
  effectiveTaxRatePct: number | null;
  medianHomeValue: number | null;
  medianRealEstateTaxesPaid: number | null;
  acsVintage: number | null;
  // Investment score data
  investmentScore: number | null;
  normalizedPropertyValue: number | null;
  normalizedAnnualRent: number | null;
  netYield: number | null;
  netYieldPct: number | null;
  normalizedRentToPriceRatio: number | null;
  normalizedRentToPriceRatioPct: number | null;
  rawZhvi: number | null;
  countyZhviMedian: number | null;
  blendedZhvi: number | null;
  priceFloorApplied: boolean;
  rentCapApplied: boolean;
  countyBlendingApplied: boolean;
  rawRentToPriceRatio: number | null;
  rawRentToPriceRatioPct: number | null;
  scoreBedroomCount: number | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ApiResponse {
  rows: ZipPropertyData[];
  pagination: Pagination;
  latestMonth: string | null;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

export default function ZipPropertyDataClient() {
  const [data, setData] = useState<ZipPropertyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 100,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = async (page: number, searchTerm: string, state: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
      });
      if (searchTerm) {
        params.set("search", searchTerm);
      }
      if (state) {
        params.set("state", state);
      }

      const res = await fetch(
        `/api/stats/zip-property-data?${params.toString()}`,
        {
          signal: abortControllerRef.current.signal,
        }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch data");
      }

      const json: ApiResponse = await res.json();
      setData(json.rows);
      setPagination(json.pagination);
      setLatestMonth(json.latestMonth);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Failed to load data");
        console.error("Error fetching zip property data:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchData(1, search, stateFilter);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search, stateFilter]);

  useEffect(() => {
    fetchData(pagination.page, search, stateFilter);
  }, [pagination.page]);

  return (
    <main className="min-h-screen bg-[#fafafa] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <a
          href="/"
          className="text-sm font-medium text-[#0a0a0a] hover:opacity-70"
        >
          ← Back to search
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#0a0a0a]">
          ZIP Code Property Data
        </h1>
        <p className="mt-3 text-base text-[#525252]">
          View property values (ZHVI), tax rates, and Investment Scores for all ZIP codes. 
          Data includes 1-4 bedroom property values, effective property tax rates from ACS, 
          and Section 8 investment viability scores with normalization tracking.
        </p>
        <p className="mt-2 text-sm text-[#737373]">
          <strong>Note:</strong> Some ZIP codes may not have data for all
          bedroom counts. This occurs when Zillow doesn't have sufficient sample
          size to generate reliable statistics for that bedroom type in that
          area. Missing values are shown as "—".
        </p>
        <p className="mt-2 text-sm text-[#737373]">
          <strong>Investment Scores:</strong> Scores are normalized (100 = median yield). 
          Property values may be adjusted with price floors ($100k minimum), county blending 
          (for low-value ZIPs), and rent-to-price caps (18% max). Flags indicate which 
          normalizations were applied.
        </p>

        {latestMonth && (
          <p className="mt-2 text-sm text-[#737373]">
            Latest property value data:{" "}
            {new Date(latestMonth).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
            })}
          </p>
        )}

        {/* Filters */}
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label
              htmlFor="search"
              className="block text-sm font-medium text-[#0a0a0a] mb-1"
            >
              Search ZIP code
            </label>
            <input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g., 90210"
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            />
          </div>
          <div className="sm:w-48">
            <label
              htmlFor="state"
              className="block text-sm font-medium text-[#0a0a0a] mb-1"
            >
              State
            </label>
            <input
              id="state"
              type="text"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
              placeholder="e.g., CA"
              maxLength={2}
              className="w-full px-3 py-2 border border-[#e5e5e5] rounded-md bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            />
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="mt-4 text-sm text-[#737373]">
            Showing {data.length} of {pagination.total.toLocaleString()} ZIP
            codes
            {pagination.totalPages > 1 &&
              ` (page ${pagination.page} of ${pagination.totalPages})`}
          </p>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="mt-6 overflow-x-auto bg-white border border-[#e5e5e5] rounded-lg">
          {loading ? (
            <div className="p-8 text-center text-[#737373]">Loading...</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-[#737373]">No data found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#fafafa] border-b border-[#e5e5e5]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    ZIP Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Tax Rate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    1BR Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    2BR Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    3BR Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    4BR Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Net Yield
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider">
                    Normalizations
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e5e5]">
                {data.map((row) => (
                  <>
                    <tr key={row.zipCode} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3 text-sm font-mono text-[#0a0a0a]">
                      <a
                        href={`/zip/${row.zipCode}`}
                        className="text-[#0a0a0a] hover:text-[#525252] hover:underline"
                      >
                        {row.zipCode}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#525252]">
                      {row.cityName && (
                        <div className="font-medium text-[#0a0a0a]">
                          {row.cityName}
                        </div>
                      )}
                      {row.countyName && (
                        <div className="text-xs text-[#737373]">
                          {row.countyName}
                          {row.stateCode && `, ${row.stateCode}`}
                        </div>
                      )}
                      {!row.cityName && !row.countyName && row.stateCode && (
                        <div className="text-xs text-[#737373]">
                          {row.stateCode}
                        </div>
                      )}
                      {!row.cityName && !row.countyName && !row.stateCode && (
                        <span className="text-[#a3a3a3]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {formatPercent(row.effectiveTaxRatePct)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.zhvi1BR === null ? (
                        <span
                          className="text-[#a3a3a3]"
                          title="Data not available from Zillow for this ZIP code"
                        >
                          —
                        </span>
                      ) : (
                        formatCurrency(row.zhvi1BR)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.zhvi2BR === null ? (
                        <span
                          className="text-[#a3a3a3]"
                          title="Data not available from Zillow for this ZIP code"
                        >
                          —
                        </span>
                      ) : (
                        formatCurrency(row.zhvi2BR)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.zhvi3BR === null ? (
                        <span
                          className="text-[#a3a3a3]"
                          title="Data not available from Zillow for this ZIP code"
                        >
                          —
                        </span>
                      ) : (
                        formatCurrency(row.zhvi3BR)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.zhvi4BR === null ? (
                        <span
                          className="text-[#a3a3a3]"
                          title="Data not available from Zillow for this ZIP code"
                        >
                          —
                        </span>
                      ) : (
                        formatCurrency(row.zhvi4BR)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.investmentScore === null ? (
                        <span className="text-[#a3a3a3]">—</span>
                      ) : (
                        <span
                          className={
                            row.investmentScore >= 125
                              ? "font-semibold text-green-700"
                              : row.investmentScore >= 100
                              ? "text-green-600"
                              : row.investmentScore >= 75
                              ? "text-[#0a0a0a]"
                              : "text-[#737373]"
                          }
                          title={`Investment Score: ${row.investmentScore.toFixed(1)} (100 = median yield)`}
                        >
                          {row.investmentScore.toFixed(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-[#0a0a0a] font-mono">
                      {row.netYieldPct === null ? (
                        <span className="text-[#a3a3a3]">—</span>
                      ) : (
                        <span
                          className={
                            row.netYieldPct >= 8
                              ? "font-semibold text-green-700"
                              : row.netYieldPct >= 6
                              ? "text-green-600"
                              : row.netYieldPct >= 4
                              ? "text-[#0a0a0a]"
                              : "text-[#737373]"
                          }
                        >
                          {formatPercent(row.netYieldPct)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {row.investmentScore === null ? (
                        <span className="text-[#a3a3a3]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {row.priceFloorApplied && (
                            <span
                              className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded"
                              title="Price floor ($100k) was applied"
                            >
                              Floor
                            </span>
                          )}
                          {row.rentCapApplied && (
                            <span
                              className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-800 rounded"
                              title="Rent-to-price cap (18%) was applied"
                            >
                              Rent Cap
                            </span>
                          )}
                          {row.countyBlendingApplied && (
                            <span
                              className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded"
                              title="County blending (60% ZIP + 40% County) was applied"
                            >
                              Blended
                            </span>
                          )}
                          {!row.priceFloorApplied &&
                            !row.rentCapApplied &&
                            !row.countyBlendingApplied && (
                              <span className="text-[#a3a3a3] text-xs">None</span>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* Detail row for normalization data */}
                  {row.investmentScore !== null && (
                    <tr
                      key={`${row.zipCode}-detail`}
                      data-detail-row
                      className="bg-[#fafafa] hidden"
                    >
                      <td colSpan={8} className="px-4 py-3 text-xs">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="font-semibold text-[#0a0a0a] mb-1">
                              Property Value
                            </div>
                            <div className="text-[#737373]">
                              Raw:{" "}
                              {row.rawZhvi !== null
                                ? formatCurrency(row.rawZhvi)
                                : "—"}
                            </div>
                            {row.blendedZhvi !== null && (
                              <div className="text-[#737373]">
                                Blended: {formatCurrency(row.blendedZhvi)}
                              </div>
                            )}
                            <div className="text-[#0a0a0a] font-medium">
                              Final:{" "}
                              {row.normalizedPropertyValue !== null
                                ? formatCurrency(row.normalizedPropertyValue)
                                : "—"}
                            </div>
                            {row.countyZhviMedian !== null && (
                              <div className="text-[#737373] text-xs mt-1">
                                County median:{" "}
                                {formatCurrency(row.countyZhviMedian)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0a0a0a] mb-1">
                              Rent-to-Price Ratio
                            </div>
                            <div className="text-[#737373]">
                              Raw:{" "}
                              {row.rawRentToPriceRatioPct !== null
                                ? formatPercent(row.rawRentToPriceRatioPct)
                                : "—"}
                            </div>
                            <div className="text-[#0a0a0a] font-medium">
                              Final:{" "}
                              {row.normalizedRentToPriceRatioPct !== null
                                ? formatPercent(
                                    row.normalizedRentToPriceRatioPct
                                  )
                                : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-[#0a0a0a] mb-1">
                              Annual Rent
                            </div>
                            <div className="text-[#0a0a0a]">
                              {row.normalizedAnnualRent !== null
                                ? formatCurrency(row.normalizedAnnualRent)
                                : "—"}
                            </div>
                            {row.scoreBedroomCount !== null && (
                              <div className="text-[#737373] text-xs mt-1">
                                Based on {row.scoreBedroomCount}BR FMR
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0a0a0a] mb-1">
                              Score Details
                            </div>
                            <div className="text-[#737373] text-xs">
                              Score: {row.investmentScore?.toFixed(1)} (100 =
                              median)
                            </div>
                            <div className="text-[#737373] text-xs">
                              Net Yield:{" "}
                              {row.netYieldPct !== null
                                ? formatPercent(row.netYieldPct)
                                : "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div>
              {pagination.page > 1 && (
                <button
                  onClick={() =>
                    setPagination({ ...pagination, page: pagination.page - 1 })
                  }
                  className="px-4 py-2 border border-[#e5e5e5] bg-white rounded-md text-sm font-medium text-[#0a0a0a] hover:bg-[#f5f5f5]"
                >
                  ← Previous
                </button>
              )}
            </div>
            <div className="text-sm text-[#737373]">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div>
              {pagination.page < pagination.totalPages && (
                <button
                  onClick={() =>
                    setPagination({ ...pagination, page: pagination.page + 1 })
                  }
                  className="px-4 py-2 border border-[#e5e5e5] bg-white rounded-md text-sm font-medium text-[#0a0a0a] hover:bg-[#f5f5f5]"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}



