'use client';

import { useState, useEffect } from 'react';

interface MissingDataEvent {
  id: number;
  zip_code: string | null;
  address: string | null;
  bedrooms: number | null;
  price: string | null;
  missing_fields: string[];
  source: string;
  occurrence_count: number;
  last_seen: string;
  first_seen: string;
}

interface Summary {
  totalEvents: number;
  uniqueCombinations: number;
  uniqueZips: number;
  uniqueSources: number;
  missingTaxRate: number;
  missingMortgageRate: number;
  missingFmrData: number;
  missingFmrBedroom: number;
  missingZipCode: number;
  missingBedrooms: number;
  missingPrice: number;
  missingAddress: number;
}

export default function MissingDataPage() {
  const [data, setData] = useState<MissingDataEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [zipFilter, setZipFilter] = useState('');
  const [missingFieldFilter, setMissingFieldFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const pageSize = 50;

  useEffect(() => {
    fetchData();
  }, [page, zipFilter, missingFieldFilter, sourceFilter]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });

      if (zipFilter) params.append('zip_code', zipFilter);
      if (missingFieldFilter) params.append('missing_field', missingFieldFilter);
      if (sourceFilter) params.append('source', sourceFilter);

      const response = await fetch(`/api/debug/missing-data-events?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result.data || []);
      setTotal(result.total || 0);
      setSummary(result.summary || null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error fetching data';
      setError(errorMessage);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      property_tax_rate: 'Property Tax Rate',
      mortgage_rate: 'Mortgage Rate',
      fmr_data: 'FMR Data',
      fmr_bedroom: 'FMR Bedroom',
      zip_code: 'ZIP Code',
      bedrooms: 'Bedrooms',
      price: 'Price',
      address: 'Address',
    };
    return labels[field] || field;
  };

  const getFieldColor = (field: string) => {
    const colors: Record<string, string> = {
      property_tax_rate: 'bg-red-100 text-red-800',
      mortgage_rate: 'bg-orange-100 text-orange-800',
      fmr_data: 'bg-purple-100 text-purple-800',
      fmr_bedroom: 'bg-pink-100 text-pink-800',
      zip_code: 'bg-blue-100 text-blue-800',
      bedrooms: 'bg-green-100 text-green-800',
      price: 'bg-yellow-100 text-yellow-800',
      address: 'bg-gray-100 text-gray-800',
    };
    return colors[field] || 'bg-gray-100 text-gray-800';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Missing Data Events</h1>
            <p className="text-gray-600">
              Fire-and-forget logging of missing data required for cash flow calculations. Results are deduplicated and sorted by frequency.
            </p>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded">
            <p className="text-sm text-red-700 font-medium">Error loading data</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Overview</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Events:</span>
                  <span className="font-medium">{formatNumber(summary.totalEvents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600">Unique Issues:</span>
                  <span className="font-medium text-blue-600">{formatNumber(summary.uniqueCombinations)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unique ZIPs:</span>
                  <span className="font-medium">{formatNumber(summary.uniqueZips)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sources:</span>
                  <span className="font-medium">{formatNumber(summary.uniqueSources)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Market Data</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-red-600">Tax Rate:</span>
                  <span className="font-medium text-red-600">{formatNumber(summary.missingTaxRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-orange-600">Mortgage Rate:</span>
                  <span className="font-medium text-orange-600">{formatNumber(summary.missingMortgageRate)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">FMR Data</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-purple-600">FMR Data:</span>
                  <span className="font-medium text-purple-600">{formatNumber(summary.missingFmrData)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pink-600">FMR Bedroom:</span>
                  <span className="font-medium text-pink-600">{formatNumber(summary.missingFmrBedroom)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Property Data</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-blue-600">ZIP Code:</span>
                  <span className="font-medium text-blue-600">{formatNumber(summary.missingZipCode)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Bedrooms:</span>
                  <span className="font-medium text-green-600">{formatNumber(summary.missingBedrooms)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-600">Price:</span>
                  <span className="font-medium text-yellow-600">{formatNumber(summary.missingPrice)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="text"
              placeholder="Filter by ZIP code"
              value={zipFilter}
              onChange={(e) => {
                setZipFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 border rounded w-40"
            />
            <select
              value={missingFieldFilter}
              onChange={(e) => {
                setMissingFieldFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Fields</option>
              <option value="property_tax_rate">Property Tax Rate</option>
              <option value="mortgage_rate">Mortgage Rate</option>
              <option value="fmr_data">FMR Data</option>
              <option value="fmr_bedroom">FMR Bedroom</option>
              <option value="zip_code">ZIP Code</option>
              <option value="bedrooms">Bedrooms</option>
              <option value="price">Price</option>
              <option value="address">Address</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Sources</option>
              <option value="chrome-extension">Chrome Extension</option>
              <option value="chrome-extension-fmr-only">Chrome Extension (FMR Only)</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beds</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Missing Fields</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {formatNumber(item.occurrence_count)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(item.last_seen)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {item.zip_code || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={item.address || ''}>
                          {item.address || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.bedrooms !== null ? item.bedrooms : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.price ? `$${formatNumber(parseFloat(item.price))}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap gap-1">
                            {item.missing_fields.map((field) => (
                              <span
                                key={field}
                                className={`px-2 py-1 rounded text-xs font-medium ${getFieldColor(field)}`}
                              >
                                {getFieldLabel(field)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  No data found
                </div>
              )}
              {/* Pagination */}
              {total > pageSize && (
                <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of {formatNumber(total)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * pageSize >= total}
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
