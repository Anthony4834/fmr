'use client';

import { useState, useRef, useLayoutEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import SearchBar from './SearchBar';
import VirtualizedRankingList from './VirtualizedRankingList';
import { useGeographicRankings } from '@/app/hooks/useGeographicRankings';

type GeoType = 'state' | 'county' | 'city' | 'zip';

interface GeographicRankingsProps {
  year: number;
}

// State options for dropdown
const STATE_OPTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

export default function GeographicRankings({ year }: GeographicRankingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tab state (persisted in URL as ?geoTab=state|county|city|zip)
  const [activeTab, setActiveTab] = useState<GeoType>(() => {
    const tab = searchParams.get('geoTab');
    return tab === 'county' || tab === 'city' || tab === 'zip' ? tab : 'state';
  });

  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabBarStyle, setTabBarStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // Update tab bar position when active tab changes or window resizes
  useLayoutEffect(() => {
    const updateTabBar = () => {
      if (!tabBarRef.current || tabRefs.current.length === 0) return;
      const activeIndex = (['state', 'county', 'city', 'zip'] as GeoType[]).indexOf(activeTab);
      const activeTabEl = tabRefs.current[activeIndex];
      const container = tabBarRef.current;
      if (!activeTabEl || !container) return;

      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTabEl.getBoundingClientRect();
      setTabBarStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    };

    updateTabBar();
    window.addEventListener('resize', updateTabBar);
    return () => window.removeEventListener('resize', updateTabBar);
  }, [activeTab]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state (persisted in URL)
  const [stateFilter, setStateFilter] = useState(
    () => searchParams.get('geoState') || ''
  );

  // Data fetching hook
  const {
    items,
    loading,
    hasMore,
    error,
    loadMore,
  } = useGeographicRankings({
    type: activeTab,
    year,
    search: searchQuery,
    stateFilter: activeTab !== 'state' ? stateFilter : undefined,
    limit: 100,
  });

  // Tab change handler
  const handleTabChange = (tab: GeoType) => {
    setActiveTab(tab);
    setSearchQuery(''); // Clear search when switching tabs
    const params = new URLSearchParams(searchParams.toString());
    params.set('geoTab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Search handlers
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // State filter handler
  const handleStateFilterChange = (value: string) => {
    setStateFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('geoState', value);
    } else {
      params.delete('geoState');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const getTabLabel = (tab: GeoType) => {
    if (tab === 'state') return 'States';
    if (tab === 'county') return 'Counties';
    if (tab === 'city') return 'Cities';
    return 'ZIPs';
  };

  const getSearchPlaceholder = () => {
    if (activeTab === 'state') return 'Search states...';
    if (activeTab === 'county') return 'Search counties...';
    if (activeTab === 'city') return 'Search cities...';
    return 'Search ZIP codes...';
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col max-h-[56vh] sm:max-h-[600px] lg:max-h-[70vh]">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] flex-shrink-0">
        <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] mb-2">
          Market Explorer
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] -mt-1 mb-3">
          Ranked by Investment Score
        </p>

        {/* Tabs */}
        <div ref={tabBarRef} className="relative flex gap-1 mb-3 pb-0.5">
          {(['state', 'county', 'city', 'zip'] as GeoType[]).map((tab, index) => (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              onClick={() => handleTabChange(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors relative ${
                activeTab === tab
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {getTabLabel(tab)}
            </button>
          ))}
          {/* Animated bottom bar */}
          <div
            className="absolute bottom-0 h-0.5 bg-[var(--text-primary)] transition-all duration-300 ease-out"
            style={{
              left: `${tabBarStyle.left}px`,
              width: `${tabBarStyle.width}px`,
            }}
          />
        </div>

        {/* Search Bar */}
        <SearchBar
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={getSearchPlaceholder()}
        />

        {/* Contextual Filters */}
        {activeTab !== 'state' && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="state-filter">
              State
            </label>
            <select
              id="state-filter"
              value={stateFilter}
              onChange={(e) => handleStateFilterChange(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)] focus:border-transparent"
            >
              <option value="">All States</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Virtualized List */}
      <VirtualizedRankingList
        type={activeTab}
        items={items}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        error={error}
      />
    </div>
  );
}
