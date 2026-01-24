'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface MarketRentRow {
  zipCode: string;
  bedroomCount: number;
  estimatedMonthlyRent: number | null;
  rentPerSqft: number | null;
  rentPerBedroom: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  dataStatus: string | null;
  scrapedAt: string;
  updatedAt: string;
  cityName: string | null;
  stateCode: string | null;
  countyName: string | null;
}

interface Props {
  initialData: MarketRentRow[];
  initialPage: number;
  initialTotal: number;
  initialTotalPages: number;
  initialSort: string;
  initialOrder: string;
  initialSearch: string;
  initialBedroom: number | null;
}

export default function MarketRentsAdminClient({
  initialData,
  initialPage,
  initialTotal,
  initialTotalPages,
  initialSort,
  initialOrder,
  initialSearch,
  initialBedroom,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [search, setSearch] = useState(initialSearch);
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(initialBedroom);
  const [sort, setSort] = useState(initialSort);
  const [order, setOrder] = useState(initialOrder);
  const [page, setPage] = useState(initialPage);

  const updateQuery = useCallback((updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    
    // Reset to page 1 when filters change
    if (updates.search !== undefined || updates.bedroom !== undefined || updates.sort !== undefined) {
      params.set('page', '1');
    }
    
    router.push(`/admin/market-rents?${params.toString()}`);
  }, [router, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateQuery({ search });
  };

  const handleSort = (column: string) => {
    const newOrder = sort === column && order === 'desc' ? 'asc' : 'desc';
    setSort(column);
    setOrder(newOrder);
    updateQuery({ sort: column, order: newOrder });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const SortButton = ({ column, label }: { column: string; label: string }) => {
    const isActive = sort === column;
    const currentOrder = isActive ? order : 'desc';
    
    return (
      <button
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 hover:text-blue-600"
        style={{ fontWeight: isActive ? 600 : 400 }}
      >
        {label}
        {isActive && (
          <span className="text-xs">
            {currentOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ backgroundColor: 'hsl(210 20% 98%)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'hsl(220 30% 12%)' }}>
                Market Rents Admin
              </h1>
              <p className="text-sm" style={{ color: 'hsl(220 15% 45%)' }}>
                Scraped market rent data from RentCast
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 text-sm rounded-lg border"
              style={{
                backgroundColor: '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
                color: 'hsl(220 30% 12%)',
              }}
            >
              ← Back to Site
            </Link>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ZIP, city, or state..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: 'hsl(220 15% 88%)',
                }}
              />
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded-lg text-white"
                style={{ backgroundColor: 'hsl(192 85% 42%)' }}
              >
                Search
              </button>
            </form>
            
            <select
              value={bedroomFilter === null ? '' : bedroomFilter}
              onChange={(e) => {
                const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                setBedroomFilter(value);
                updateQuery({ bedroom: value });
              }}
              className="px-3 py-2 border rounded-lg text-sm"
              style={{
                backgroundColor: '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              <option value="">All Bedrooms</option>
              <option value="0">Studio (0BR)</option>
              <option value="1">1BR</option>
              <option value="2">2BR</option>
              <option value="3">3BR</option>
              <option value="4">4BR</option>
            </select>
          </div>

          {/* Stats */}
          <div className="text-sm" style={{ color: 'hsl(220 15% 45%)' }}>
            Showing {initialData.length} of {initialTotal.toLocaleString()} records
            {initialSearch && ` matching "${initialSearch}"`}
            {initialBedroom !== null && ` (${initialBedroom}BR)`}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ backgroundColor: '#ffffff' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid hsl(220 15% 88%)' }}>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  <SortButton column="zip_code" label="ZIP" />
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  Location
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  <SortButton column="bedroom_count" label="BR" />
                </th>
                <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  <SortButton column="estimated_monthly_rent" label="Est. Rent" />
                </th>
                <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  <SortButton column="rent_per_sqft" label="$/sqft" />
                </th>
                <th className="text-right p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  Range
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  Status
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(220 15% 45%)' }}>
                  <SortButton column="scraped_at" label="Scraped" />
                </th>
              </tr>
            </thead>
            <tbody>
              {initialData.map((row, i) => (
                <tr
                  key={`${row.zipCode}-${row.bedroomCount}-${i}`}
                  style={{
                    borderBottom: '1px solid hsl(220 15% 92%)',
                  }}
                  className="hover:bg-gray-50"
                >
                  <td className="p-3">
                    <Link
                      href={`/zip/${row.zipCode}`}
                      className="font-mono text-sm font-semibold"
                      style={{ color: 'hsl(192 85% 42%)' }}
                    >
                      {row.zipCode}
                    </Link>
                  </td>
                  <td className="p-3 text-sm" style={{ color: 'hsl(220 30% 12%)' }}>
                    {row.cityName && row.stateCode ? (
                      <>
                        {row.cityName}, {row.stateCode}
                        {row.countyName && (
                          <span className="text-xs ml-1" style={{ color: 'hsl(220 15% 45%)' }}>
                            ({row.countyName})
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'hsl(220 15% 45%)' }}>—</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-center" style={{ color: 'hsl(220 30% 12%)' }}>
                    {row.bedroomCount}
                  </td>
                  <td className="p-3 text-sm text-right font-semibold" style={{ color: 'hsl(220 30% 12%)' }}>
                    {formatCurrency(row.estimatedMonthlyRent)}
                  </td>
                  <td className="p-3 text-sm text-right" style={{ color: 'hsl(220 15% 45%)' }}>
                    {row.rentPerSqft !== null ? `$${row.rentPerSqft.toFixed(2)}` : '—'}
                  </td>
                  <td className="p-3 text-sm text-right" style={{ color: 'hsl(220 15% 45%)' }}>
                    {row.lowEstimate && row.highEstimate ? (
                      <span>
                        {formatCurrency(row.lowEstimate)} - {formatCurrency(row.highEstimate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor:
                          row.dataStatus === 'available'
                            ? 'hsl(142 70% 45% / 0.1)'
                            : row.dataStatus === 'insufficient_comps'
                            ? 'hsl(45 85% 55% / 0.1)'
                            : 'hsl(220 15% 92%)',
                        color:
                          row.dataStatus === 'available'
                            ? 'hsl(142 70% 35%)'
                            : row.dataStatus === 'insufficient_comps'
                            ? 'hsl(45 85% 35%)'
                            : 'hsl(220 15% 45%)',
                      }}
                    >
                      {row.dataStatus || 'unknown'}
                    </span>
                  </td>
                  <td className="p-3 text-xs" style={{ color: 'hsl(220 15% 45%)' }}>
                    {formatDate(row.scrapedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {initialTotalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                const newPage = Math.max(1, page - 1);
                setPage(newPage);
                updateQuery({ page: newPage });
              }}
              disabled={page === 1}
              className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50"
              style={{
                backgroundColor: page === 1 ? 'hsl(220 15% 94%)' : '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              Previous
            </button>
            
            <span className="px-4 py-2 text-sm" style={{ color: 'hsl(220 15% 45%)' }}>
              Page {page} of {initialTotalPages}
            </span>
            
            <button
              onClick={() => {
                const newPage = Math.min(initialTotalPages, page + 1);
                setPage(newPage);
                updateQuery({ page: newPage });
              }}
              disabled={page === initialTotalPages}
              className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50"
              style={{
                backgroundColor: page === initialTotalPages ? 'hsl(220 15% 94%)' : '#ffffff',
                borderColor: 'hsl(220 15% 88%)',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
