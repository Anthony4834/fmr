'use client';

import { useState, useEffect } from 'react';

interface Summary {
  cities: {
    total_cities: number;
    cities_without_fmr: number;
    cities_with_fmr: number;
  };
  zips: {
    total_zips: number;
    zips_without_fmr: number;
    zips_with_safmr: number;
    zips_with_fmr_only: number;
  };
  counties: {
    total_counties: number;
    counties_without_fmr: number;
    counties_with_fmr: number;
  };
  mappings: {
    total_issues: number;
    zips_without_mapping: number;
    zips_with_multiple_mappings: number;
  };
  invalid_state_codes?: {
    invalid_cities: number;
    invalid_counties: number;
  };
}

interface CoverageItem {
  [key: string]: any;
}

export default function TestCoveragePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeTab, setActiveTab] = useState<'cities' | 'zips' | 'counties' | 'zip-mappings' | 'missing-mappings' | 'invalid-state-codes'>('cities');
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  const [selectedState, setSelectedState] = useState('');
  const [selectedIssueType, setSelectedIssueType] = useState<string>('');
  const [data, setData] = useState<CoverageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab, showMissingOnly, selectedState, selectedIssueType, page]);

  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/test-coverage?type=summary&_t=' + Date.now()); // Add cache busting
      const data = await response.json();
      // Convert string numbers to actual numbers
      const normalized = {
        cities: {
          total_cities: parseInt(data.cities?.total_cities || '0'),
          cities_without_fmr: parseInt(data.cities?.cities_without_fmr || '0'),
          cities_with_fmr: parseInt(data.cities?.cities_with_fmr || '0'),
        },
        zips: {
          total_zips: parseInt(data.zips?.total_zips || '0'),
          zips_without_fmr: parseInt(data.zips?.zips_without_fmr || '0'),
          zips_with_safmr: parseInt(data.zips?.zips_with_safmr || '0'),
          zips_with_fmr_only: parseInt(data.zips?.zips_with_fmr_only || '0'),
        },
        counties: {
          total_counties: parseInt(data.counties?.total_counties || '0'),
          counties_without_fmr: parseInt(data.counties?.counties_without_fmr || '0'),
          counties_with_fmr: parseInt(data.counties?.counties_with_fmr || '0'),
        },
          mappings: {
            total_issues: parseInt(data.mappings?.total_issues || '0'),
            zips_without_mapping: parseInt(data.mappings?.zips_without_mapping || '0'),
            zips_with_multiple_mappings: parseInt(data.mappings?.zips_with_multiple_mappings || '0'),
          },
          invalid_state_codes: {
            invalid_cities: parseInt(data.invalid_state_codes?.invalid_cities || '0'),
            invalid_counties: parseInt(data.invalid_state_codes?.invalid_counties || '0'),
          },
        };
      setSummary(normalized);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type: activeTab === 'missing-mappings' ? 'zip-mappings' : activeTab,
        missing: showMissingOnly.toString(),
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
        _t: Date.now().toString(), // Cache busting
      });
      
      // Don't add missing filter for invalid-state-codes
      if (activeTab === 'invalid-state-codes') {
        params.delete('missing');
      }
      if (selectedState) {
        params.append('state', selectedState);
      }
      if ((activeTab === 'zip-mappings' && selectedIssueType) || activeTab === 'missing-mappings') {
        params.append('issue_type', activeTab === 'missing-mappings' ? 'NO_MAPPING' : selectedIssueType);
      }
      const response = await fetch(`/api/test-coverage?${params}`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to fetch data');
      }
      
      setData(result.results || []);
      setTotal(result.total || 0);
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

  const getPercentage = (part: number, total: number) => {
    if (total === 0) return '0%';
    return ((part / total) * 100).toFixed(1) + '%';
  };

  const handleExportAll = async () => {
    try {
      const params = new URLSearchParams({
        type: activeTab === 'missing-mappings' ? 'zip-mappings' : activeTab,
        export: 'true',
        _t: Date.now().toString(),
      });
      
      // Add filters based on current tab
      if (activeTab === 'cities' || activeTab === 'zips' || activeTab === 'counties') {
        if (showMissingOnly) {
          params.append('missing', 'true');
        }
        if (selectedState) {
          params.append('state', selectedState);
        }
      }
      
      if (activeTab === 'zip-mappings' && selectedIssueType) {
        params.append('issue_type', selectedIssueType);
      }
      
      if (activeTab === 'missing-mappings') {
        params.append('issue_type', 'NO_MAPPING');
      }
      
      // Don't add filters for invalid-state-codes
      if (activeTab === 'invalid-state-codes') {
        params.delete('missing');
        params.delete('state');
      }

      const response = await fetch(`/api/test-coverage?${params}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `export-${activeTab}-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">FMR Data Coverage Test</h1>
            <p className="text-gray-600">
              {activeTab === 'missing-mappings' 
                ? 'ZIP codes in SAFMR data without county mappings'
                : activeTab === 'invalid-state-codes'
                ? 'Cities and counties with invalid (non-US) state codes'
                : 'View cities, ZIP codes, and counties with missing FMR data'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportAll}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
              title="Export all data for current tab"
            >
              📥 Export All
            </button>
            <button
              onClick={() => {
                fetchSummary();
                fetchData();
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Cities</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">{formatNumber(summary.cities.total_cities)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">With FMR:</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(summary.cities.cities_with_fmr)} ({getPercentage(summary.cities.cities_with_fmr, summary.cities.total_cities)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Without FMR:</span>
                  <span className="font-medium text-red-600">
                    {formatNumber(summary.cities.cities_without_fmr)} ({getPercentage(summary.cities.cities_without_fmr, summary.cities.total_cities)})
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">ZIP Codes</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">{formatNumber(summary.zips.total_zips)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">With SAFMR:</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(summary.zips.zips_with_safmr)} ({getPercentage(summary.zips.zips_with_safmr, summary.zips.total_zips)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600">With FMR only:</span>
                  <span className="font-medium text-blue-600">
                    {formatNumber(summary.zips.zips_with_fmr_only)} ({getPercentage(summary.zips.zips_with_fmr_only, summary.zips.total_zips)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Without FMR:</span>
                  <span className="font-medium text-red-600">
                    {formatNumber(summary.zips.zips_without_fmr)} ({getPercentage(summary.zips.zips_without_fmr, summary.zips.total_zips)})
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Counties</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">{formatNumber(summary.counties.total_counties)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">With FMR:</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(summary.counties.counties_with_fmr)} ({getPercentage(summary.counties.counties_with_fmr, summary.counties.total_counties)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Without FMR:</span>
                  <span className="font-medium text-red-600">
                    {formatNumber(summary.counties.counties_without_fmr)} ({getPercentage(summary.counties.counties_without_fmr, summary.counties.total_counties)})
                  </span>
                </div>
              </div>
            </div>

            {summary.mappings && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">ZIP Mapping Issues</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Issues:</span>
                    <span className="font-medium">{formatNumber(summary.mappings.total_issues)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-600">No Mapping:</span>
                    <span className="font-medium text-orange-600">
                      {formatNumber(summary.mappings.zips_without_mapping)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-600">Multiple Mappings:</span>
                    <span className="font-medium text-purple-600">
                      {formatNumber(summary.mappings.zips_with_multiple_mappings)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {summary.invalid_state_codes && (summary.invalid_state_codes.invalid_cities > 0 || summary.invalid_state_codes.invalid_counties > 0) && (
              <div className="bg-white rounded-lg shadow p-6 border-2 border-red-300">
                <h3 className="text-lg font-semibold text-red-700 mb-4">Invalid State Codes</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-red-600">Invalid Cities:</span>
                    <span className="font-medium text-red-600">
                      {formatNumber(summary.invalid_state_codes.invalid_cities)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">Invalid Counties:</span>
                    <span className="font-medium text-red-600">
                      {formatNumber(summary.invalid_state_codes.invalid_counties)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters and Tabs */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('cities')}
                className={`px-4 py-2 rounded ${activeTab === 'cities' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Cities
              </button>
              <button
                onClick={() => setActiveTab('zips')}
                className={`px-4 py-2 rounded ${activeTab === 'zips' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                ZIP Codes
              </button>
              <button
                onClick={() => setActiveTab('counties')}
                className={`px-4 py-2 rounded ${activeTab === 'counties' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Counties
              </button>
              <button
                onClick={() => setActiveTab('zip-mappings')}
                className={`px-4 py-2 rounded ${activeTab === 'zip-mappings' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                ZIP Mappings
              </button>
              <button
                onClick={() => setActiveTab('missing-mappings')}
                className={`px-4 py-2 rounded ${activeTab === 'missing-mappings' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Missing Mappings
              </button>
              <button
                onClick={() => setActiveTab('invalid-state-codes')}
                className={`px-4 py-2 rounded ${activeTab === 'invalid-state-codes' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                Invalid State Codes
              </button>
            </div>
            {activeTab !== 'zip-mappings' && activeTab !== 'missing-mappings' && activeTab !== 'invalid-state-codes' && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMissingOnly}
                  onChange={(e) => {
                    setShowMissingOnly(e.target.checked);
                    setPage(0);
                  }}
                  className="w-4 h-4"
                />
                <span>Show missing only</span>
              </label>
            )}
            {activeTab === 'zip-mappings' && (
              <select
                value={selectedIssueType}
                onChange={(e) => {
                  setSelectedIssueType(e.target.value);
                  setPage(0);
                }}
                className="px-3 py-2 border rounded"
              >
                <option value="">All Issues</option>
                <option value="NO_MAPPING">No Mapping</option>
                <option value="MULTIPLE_MAPPINGS">Multiple Mappings</option>
              </select>
            )}
            {activeTab !== 'zip-mappings' && activeTab !== 'missing-mappings' && activeTab !== 'invalid-state-codes' && (
              <input
                type="text"
                placeholder="Filter by state (e.g., WA)"
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value.toUpperCase());
                  setPage(0);
                }}
                className="px-3 py-2 border rounded w-32"
                maxLength={2}
              />
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {error && (
            <div className="p-6 bg-red-50 border-l-4 border-red-400">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700 font-medium">Error loading data</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                  <p className="text-xs text-red-500 mt-2">
                    Make sure to run: <code className="bg-red-100 px-1 rounded">bun scripts/create-test-views.ts</code> first
                  </p>
                </div>
              </div>
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : !error ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {activeTab === 'cities' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP Codes</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Has FMR</th>
                        </>
                      )}
                      {activeTab === 'zips' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">County</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FMR Source</th>
                        </>
                      )}
                      {activeTab === 'counties' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">County</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP Count</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Has FMR</th>
                        </>
                      )}
                      {(activeTab === 'zip-mappings' || activeTab === 'missing-mappings') && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">County Count</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Counties</th>
                        </>
                      )}
                      {activeTab === 'invalid-state-codes' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ZIP Codes</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {activeTab === 'cities' && (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.city_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.state_code}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {Array.isArray(item.zip_codes) ? item.zip_codes.slice(0, 3).join(', ') + (item.zip_codes.length > 3 ? '...' : '') : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {item.has_fmr_data ? (
                                <span className="text-green-600 font-medium">✓ Yes</span>
                              ) : (
                                <span className="text-red-600 font-medium">✗ No</span>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === 'zips' && (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.zip_code}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.county_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.state_code}</td>
                            <td className="px-4 py-3 text-sm">
                              {item.fmr_source === 'SAFMR' && <span className="text-green-600 font-medium">SAFMR</span>}
                              {item.fmr_source === 'FMR' && <span className="text-blue-600 font-medium">FMR</span>}
                              {item.fmr_source === 'NONE' && <span className="text-red-600 font-medium">None</span>}
                            </td>
                          </>
                        )}
                        {activeTab === 'counties' && (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.county_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.state_code}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatNumber(item.zip_count)}</td>
                            <td className="px-4 py-3 text-sm">
                              {item.has_fmr_data ? (
                                <span className="text-green-600 font-medium">✓ Yes</span>
                              ) : (
                                <span className="text-red-600 font-medium">✗ No</span>
                              )}
                            </td>
                          </>
                        )}
                        {(activeTab === 'zip-mappings' || activeTab === 'missing-mappings') && (
                          <>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.zip_code}</td>
                            <td className="px-4 py-3 text-sm">
                              {item.issue_type === 'NO_MAPPING' && (
                                <span className="text-orange-600 font-medium">No Mapping</span>
                              )}
                              {item.issue_type === 'MULTIPLE_MAPPINGS' && (
                                <span className="text-purple-600 font-medium">Multiple Mappings</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.county_count || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {item.counties ? (
                                <span className="max-w-md block truncate" title={item.counties}>
                                  {item.counties}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === 'invalid-state-codes' && (
                          <>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                item.type === 'city' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {item.type === 'city' ? 'City' : 'County'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className="text-red-600 font-medium">{item.state_code}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.state_name || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {Array.isArray(item.zip_codes) 
                                ? item.zip_codes.slice(0, 3).join(', ') + (item.zip_codes.length > 3 ? '...' : '')
                                : (item.zip_codes || 'N/A')}
                            </td>
                          </>
                        )}
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
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * pageSize >= total}
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

