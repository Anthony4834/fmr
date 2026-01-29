'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Guest {
  id: number;
  guest_id: string;
  ip_hash: string;
  ua_hash: string;
  first_seen: string;
  last_seen: string;
  request_count: number;
  limit_hit_at: string | null;
  converted_user_id: string | null;
  conversion_reason: string | null;
  user_email: string | null;
}

interface GuestsAdminClientProps {
  initialPage: number;
  initialSearch: string;
  initialLimitHit: string;
  initialConverted: string;
}

export default function GuestsAdminClient({
  initialPage,
  initialSearch,
  initialLimitHit,
  initialConverted,
}: GuestsAdminClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [pagination, setPagination] = useState({
    page: initialPage,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [stats, setStats] = useState({
    total: 0,
    limitHit: 0,
    converted: 0,
    organic: 0,
    afterLimitHit: 0,
    extension: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [limitHitFilter, setLimitHitFilter] = useState(initialLimitHit);
  const [convertedFilter, setConvertedFilter] = useState(initialConverted);
  const [resetting, setResetting] = useState<string | null>(null); // guestId or 'all'
  const [resetError, setResetError] = useState<string | null>(null);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);
  const [routeHits, setRouteHits] = useState<Record<string, Array<{ path: string; hit_at: string }>>>({});
  const [routeHitsLoading, setRouteHitsLoading] = useState<string | null>(null);

  // Get my own guest_id from cookies
  useEffect(() => {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'guest_id') {
        setMyGuestId(value);
        break;
      }
    }
  }, []);

  useEffect(() => {
    fetchGuests();
  }, [initialPage, initialSearch, initialLimitHit, initialConverted]);

  const fetchGuests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', initialPage.toString());
      if (initialSearch) params.set('search', initialSearch);
      if (initialLimitHit) params.set('limit_hit', initialLimitHit);
      if (initialConverted) params.set('converted', initialConverted);

      const response = await fetch(`/api/admin/guests?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch guests');
      }

      const data = await response.json();
      setGuests(data.guests);
      setPagination(data.pagination);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching guests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      router.push(`/admin/guests?search=${encodeURIComponent(search)}&page=1&limit_hit=${limitHitFilter}&converted=${convertedFilter}`);
    });
  };

  const handleFilterChange = (filterType: 'limit_hit' | 'converted', value: string) => {
    if (filterType === 'limit_hit') {
      setLimitHitFilter(value);
      startTransition(() => {
        router.push(`/admin/guests?search=${encodeURIComponent(search)}&page=1&limit_hit=${value}&converted=${convertedFilter}`);
      });
    } else {
      setConvertedFilter(value);
      startTransition(() => {
        router.push(`/admin/guests?search=${encodeURIComponent(search)}&page=1&limit_hit=${limitHitFilter}&converted=${value}`);
      });
    }
  };

  const handleResetLimit = async (guestId?: string) => {
    if (!confirm(guestId 
      ? `Reset rate limit for guest ${guestId.substring(0, 8)}...?`
      : 'Reset rate limits for ALL guests? This action cannot be undone.')) {
      return;
    }

    setResetting(guestId || 'all');
    setResetError(null);

    try {
      const response = await fetch('/api/admin/guests/reset-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestId ? { guestId } : { resetAll: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset rate limit');
      }

      // Refresh the guest list
      await fetchGuests();
      setResetError(null);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Failed to reset rate limit');
    } finally {
      setResetting(null);
    }
  };

  const toggleRoutes = async (guestId: string) => {
    if (expandedGuestId === guestId) {
      setExpandedGuestId(null);
      return;
    }
    setExpandedGuestId(guestId);
    if (routeHits[guestId]) return;
    setRouteHitsLoading(guestId);
    try {
      const res = await fetch(`/api/admin/guests/routes?guest_id=${encodeURIComponent(guestId)}`);
      if (!res.ok) throw new Error('Failed to fetch routes');
      const data = await res.json();
      setRouteHits((prev) => ({ ...prev, [guestId]: data.routes ?? [] }));
    } catch (e) {
      console.error(e);
      setRouteHits((prev) => ({ ...prev, [guestId]: [] }));
    } finally {
      setRouteHitsLoading(null);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Guest Management
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Track guest users, rate limit hits, and conversions
        </p>
      </div>

      {/* Your own Guest ID - for testing */}
      {myGuestId && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Your Guest ID (this browser):
              </p>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-300 mt-1">
                {myGuestId}
              </p>
            </div>
            <button
              onClick={() => handleResetLimit(myGuestId)}
              disabled={resetting !== null}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting === myGuestId ? 'Resetting...' : 'Reset My Limit'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Guests</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Limit Hit</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.limitHit}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Converted</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{stats.converted}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Conversion Rate</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">
                    {stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : '0'}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset All Limits Button */}
      {stats.limitHit > 0 && (
        <div className="mb-6">
          <button
            onClick={() => handleResetLimit()}
            disabled={resetting === 'all'}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
          >
            {resetting === 'all' ? 'Resetting...' : `Reset All Limits (${stats.limitHit} guests)`}
          </button>
          {resetError && resetting === 'all' && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{resetError}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest_id..."
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
          >
            {isPending ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="flex gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Limit Hit
            </label>
            <select
              value={limitHitFilter}
              onChange={(e) => handleFilterChange('limit_hit', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="true">Hit Limit</option>
              <option value="false">Not Hit</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Converted
            </label>
            <select
              value={convertedFilter}
              onChange={(e) => handleFilterChange('converted', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="true">Converted</option>
              <option value="false">Not Converted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Conversion breakdown */}
      {stats.converted > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-800 shadow rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Conversion Breakdown</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Organic:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">{stats.organic}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">After Limit Hit:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">{stats.afterLimitHit}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Extension:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">{stats.extension}</span>
            </div>
          </div>
        </div>
      )}

      {/* Guests table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {guests.map((guest) => (
              <li key={guest.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRoutes(guest.guest_id)}
                      className="mt-0.5 p-0.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      title={expandedGuestId === guest.guest_id ? 'Collapse routes' : 'View routes'}
                      aria-expanded={expandedGuestId === guest.guest_id}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedGuestId === guest.guest_id ? 'rotate-90' : ''}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate font-mono">
                      {guest.guest_id}
                    </p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>First seen: {new Date(guest.first_seen).toLocaleString()}</span>
                      <span>Last seen: {new Date(guest.last_seen).toLocaleString()}</span>
                      <span>Requests: {guest.request_count}</span>
                    </div>
                    {guest.limit_hit_at && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Limit hit: {new Date(guest.limit_hit_at).toLocaleString()}
                      </p>
                    )}
                    {guest.converted_user_id && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Converted ({guest.conversion_reason || 'unknown'}): {guest.user_email || guest.converted_user_id}
                      </p>
                    )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {guest.limit_hit_at && (
                      <>
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded">
                          Limit Hit
                        </span>
                        <button
                          onClick={() => handleResetLimit(guest.guest_id)}
                          disabled={resetting === guest.guest_id}
                          className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
                          title="Reset rate limit for this guest"
                        >
                          {resetting === guest.guest_id ? 'Resetting...' : 'Reset Limit'}
                        </button>
                        {resetError && resetting === guest.guest_id && (
                          <span className="text-xs text-red-600 dark:text-red-400">{resetError}</span>
                        )}
                      </>
                    )}
                    {guest.converted_user_id && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        Converted
                      </span>
                    )}
                  </div>
                </div>
                {expandedGuestId === guest.guest_id && (
                  <div className="mt-3 ml-6 border-l-2 border-gray-200 dark:border-gray-600 pl-4">
                    <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">FE routes hit</h4>
                    {routeHitsLoading === guest.guest_id ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Loading...</p>
                    ) : !routeHits[guest.guest_id]?.length ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">No route data</p>
                    ) : (
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                              <th className="py-1 pr-4">Path</th>
                              <th className="py-1">Last seen</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700 dark:text-gray-300">
                            {routeHits[guest.guest_id].map((r, i) => (
                              <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                                <td className="py-1 pr-4 font-mono">{r.path}</td>
                                <td className="py-1 whitespace-nowrap">{new Date(r.hit_at).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            {pagination.page > 1 && (
              <a
                href={`/admin/guests?page=${pagination.page - 1}${search ? `&search=${encodeURIComponent(search)}` : ''}${limitHitFilter ? `&limit_hit=${limitHitFilter}` : ''}${convertedFilter ? `&converted=${convertedFilter}` : ''}`}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Previous
              </a>
            )}
            {pagination.page < pagination.totalPages && (
              <a
                href={`/admin/guests?page=${pagination.page + 1}${search ? `&search=${encodeURIComponent(search)}` : ''}${limitHitFilter ? `&limit_hit=${limitHitFilter}` : ''}${convertedFilter ? `&converted=${convertedFilter}` : ''}`}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
