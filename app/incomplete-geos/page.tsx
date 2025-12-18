'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

interface IncompleteGeo {
  rank: number;
  name: string;
  stateCode: string;
  countyName?: string;
  medianScore: number | null;
  zipCount: number;
}

type GeoType = 'city' | 'county';

const STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

export default function IncompleteGeosPage() {
  const [type, setType] = useState<GeoType>('city');
  const [stateFilter, setStateFilter] = useState('');
  const [items, setItems] = useState<IncompleteGeo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ type });
    if (stateFilter) params.set('state', stateFilter);

    fetch(`/api/stats/incomplete-geos?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [type, stateFilter]);

  const getGeoUrl = (item: IncompleteGeo) => {
    if (type === 'city') {
      return `/city/${buildCitySlug(item.name, item.stateCode)}`;
    }
    return `/county/${buildCountySlug(item.name, item.stateCode)}`;
  };

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="block hover:opacity-70 transition-opacity mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0a0a0a] tracking-tight">
              fmr.fyi
            </h1>
            <p className="text-xs text-[#737373] font-medium tracking-wide uppercase">Fair Market Rent Data</p>
          </Link>

          <div className="flex items-center gap-2 text-xs text-[#737373] mb-4">
            <Link href="/" className="hover:text-[#0a0a0a] transition-colors">Home</Link>
            <span className="text-[#a3a3a3]">/</span>
            <span className="text-[#0a0a0a] font-medium">Incomplete Data</span>
          </div>

          <h2 className="text-xl font-semibold text-[#0a0a0a] mb-2">Incomplete Geos</h2>
          <p className="text-sm text-[#737373]">
            These locations have investment score data but are missing full FMR rent limit data.
            They will show a limited view when visited.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#525252]">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as GeoType)}
              className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a]"
            >
              <option value="city">Cities</option>
              <option value="county">Counties</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#525252]">State</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-[#e5e5e5] bg-white text-xs text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a]"
            >
              <option value="">All States</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-xs text-[#737373]">
            {total.toLocaleString()} incomplete {type === 'city' ? 'cities' : 'counties'}
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg border border-[#e5e5e5] overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#737373]">Loading...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#737373]">
              No incomplete {type === 'city' ? 'cities' : 'counties'} found
              {stateFilter ? ` in ${stateFilter}` : ''}.
            </div>
          ) : (
            <div className="divide-y divide-[#e5e5e5]">
              {items.map((item) => (
                <Link
                  key={`${item.name}-${item.stateCode}`}
                  href={getGeoUrl(item)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#a3a3a3] w-8 shrink-0">#{item.rank}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#0a0a0a] truncate">
                          {item.name}
                        </div>
                        <div className="text-xs text-[#737373]">
                          {item.countyName && type === 'city' ? `${item.countyName}, ` : ''}{item.stateCode}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[#0a0a0a]">
                        {item.medianScore !== null ? Math.round(item.medianScore) : '—'}
                      </div>
                      <div className="text-xs text-[#737373]">score</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[#525252]">{item.zipCount}</div>
                      <div className="text-xs text-[#737373]">ZIPs</div>
                    </div>
                    <span className="px-2 py-1 bg-[#fffbeb] text-[#d97706] text-xs font-medium rounded">
                      Limited
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        <div className="mt-6 p-4 bg-[#f5f5f5] rounded-lg">
          <h3 className="text-sm font-semibold text-[#525252] mb-1">Why are these incomplete?</h3>
          <p className="text-xs text-[#737373]">
            These locations exist in our investment score database (based on ZHVI property values and estimated rents)
            but don&apos;t have a proper mapping to HUD&apos;s FMR data. This usually happens when the city/county naming
            differs between data sources, or when the location is a smaller area not directly tracked by HUD.
          </p>
        </div>
      </div>
    </main>
  );
}
