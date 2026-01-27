'use client';

import { useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SearchInput from './SearchInput';
import VirtualizedRankingList from './VirtualizedRankingList';
import FilterPills from './FilterPills';
import MarketOverview from './MarketOverview';
import AuthModal from './AuthModal';
import { useGeographicRankings } from '@/app/hooks/useGeographicRankings';

type GeoType = 'state' | 'county' | 'city' | 'zip';
type SortField = 'score' | 'yield' | 'cashFlow' | 'appreciation' | 'affordability' | 'heat' | 'fmr' | 'name';
type AffordabilityTier = 'all' | 'affordable' | 'midMarket' | 'premium';
type YieldRange = 'all' | 'low' | 'moderate' | 'high';
type BedroomCount = 2 | 3 | 4 | 'all';

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

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'score', label: 'Investment Score' },
  { value: 'yield', label: 'Yield (High → Low)' },
  { value: 'cashFlow', label: 'Cash Flow' },
  { value: 'affordability', label: 'Affordability' },
  { value: 'fmr', label: 'FMR (High → Low)' },
  { value: 'name', label: 'Alphabetical' },
];

const AFFORDABILITY_OPTIONS: { value: AffordabilityTier; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'affordable', label: 'Under $150K' },
  { value: 'midMarket', label: '$150K - $350K' },
  { value: 'premium', label: 'Over $350K' },
];

const YIELD_OPTIONS: { value: YieldRange; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'high', label: 'High (7%+)' },
  { value: 'moderate', label: 'Moderate (5-7%)' },
  { value: 'low', label: 'Low (<5%)' },
];

const BEDROOM_OPTIONS: { value: BedroomCount; label: string }[] = [
  { value: 'all', label: 'Any (Median)' },
  { value: 2, label: '2 Bedroom' },
  { value: 3, label: '3 Bedroom' },
  { value: 4, label: '4 Bedroom' },
];

// Format currency compact
function formatCurrencyCompact(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value)}`;
}

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

  // Filter states
  const [stateFilter, setStateFilter] = useState(
    () => searchParams.get('geoState') || ''
  );
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [affordabilityTier, setAffordabilityTier] = useState<AffordabilityTier>('all');
  const [yieldRange, setYieldRange] = useState<YieldRange>('all');
  const [minScore, setMinScore] = useState<number | null>(null);
  const [bedroom, setBedroom] = useState<BedroomCount>(3);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileView, setMobileView] = useState<'overview' | 'explorer'>('overview');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Check authentication
  const { data: session, status: sessionStatus } = useSession();

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };

    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMobileMenu]);

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
    sort: sortField,
    sortDirection,
    affordabilityTier,
    yieldRange,
    minScore,
    bedroom,
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

  // Check if any filters are active (exclude sort - it's handled by column headers)
  const hasActiveFilters = useMemo(() => {
    return affordabilityTier !== 'all' || 
           yieldRange !== 'all' || 
           minScore !== null ||
           bedroom !== 3 ||
           (activeTab !== 'state' && stateFilter !== '');
  }, [affordabilityTier, yieldRange, minScore, bedroom, activeTab, stateFilter]);

  // Count active filters for button display (exclude sort - it's handled by column headers)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (affordabilityTier !== 'all') count++;
    if (yieldRange !== 'all') count++;
    if (minScore !== null) count++;
    if (bedroom !== 3) count++;
    if (activeTab !== 'state' && stateFilter !== '') count++;
    return count;
  }, [affordabilityTier, yieldRange, minScore, bedroom, activeTab, stateFilter]);

  // Generate filter pills (exclude sort since it's handled by column headers)
  const filterPills = useMemo(() => {
    const pills: { id: string; label: string; value: string; onRemove: () => void }[] = [];
    
    if (affordabilityTier !== 'all') {
      const priceLabel = AFFORDABILITY_OPTIONS.find(o => o.value === affordabilityTier)?.label || affordabilityTier;
      pills.push({
        id: 'price',
        label: 'Property Value',
        value: priceLabel,
        onRemove: () => setAffordabilityTier('all'),
      });
    }
    
    if (yieldRange !== 'all') {
      const yieldLabel = YIELD_OPTIONS.find(o => o.value === yieldRange)?.label || yieldRange;
      pills.push({
        id: 'yield',
        label: 'Yield',
        value: yieldLabel,
        onRemove: () => setYieldRange('all'),
      });
    }
    
    if (minScore !== null) {
      pills.push({
        id: 'minScore',
        label: 'Min Score',
        value: String(minScore),
        onRemove: () => setMinScore(null),
      });
    }
    
    if (bedroom !== 3) {
      const bedroomLabel = BEDROOM_OPTIONS.find(o => o.value === bedroom)?.label || `${bedroom} Bedroom`;
      pills.push({
        id: 'bedroom',
        label: 'Bedroom',
        value: bedroomLabel,
        onRemove: () => setBedroom(3),
      });
    }
    
    if (activeTab !== 'state' && stateFilter !== '') {
      pills.push({
        id: 'state',
        label: 'State',
        value: stateFilter,
        onRemove: () => handleStateFilterChange(''),
      });
    }
    
    return pills;
  }, [sortField, affordabilityTier, yieldRange, minScore, bedroom, activeTab, stateFilter]);

  // Handle column header sorting - memoized to prevent header rerenders
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field clicked
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      // Set new field with default direction (desc for most, asc for affordability)
      setSortField(field);
      setSortDirection(field === 'affordability' ? 'asc' : 'desc');
    }
  }, [sortField]);

  // Reset all filters
  const resetFilters = () => {
    setSortField('score');
    setSortDirection('desc');
    setAffordabilityTier('all');
    setYieldRange('all');
    setMinScore(null);
    setBedroom(3);
    if (activeTab !== 'state') {
      handleStateFilterChange('');
    }
  };

  // Export function
  const handleExport = useCallback(async () => {
    // Check if user is authenticated
    if (sessionStatus === 'loading') {
      return; // Still loading, wait
    }

    if (!session || sessionStatus === 'unauthenticated') {
      setShowAuthModal(true);
      return;
    }

    setIsExporting(true);
    try {
      // Build query parameters
      const params = new URLSearchParams({
        type: activeTab,
        year: String(year),
        sort: sortField,
        sortDirection,
        bedroom: String(bedroom),
      });

      if (searchQuery) params.set('search', searchQuery);
      if (activeTab !== 'state' && stateFilter) params.set('state', stateFilter);
      if (affordabilityTier !== 'all') params.set('affordabilityTier', affordabilityTier);
      if (yieldRange !== 'all') params.set('yieldRange', yieldRange);
      if (minScore !== null) params.set('minScore', String(minScore));

      // Fetch export data
      const response = await fetch(`/api/export/data?${params.toString()}`);
      
      if (response.status === 401) {
        setShowAuthModal(true);
        setIsExporting(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      // Create blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Try to get filename from Content-Disposition header, fallback to generated name
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `fmr-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      if (contentDisposition) {
        // Extract filename from Content-Disposition header
        // Format: attachment; filename="filename.xlsx"
        const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
        const unquotedMatch = contentDisposition.match(/filename=([^;]+)/i);
        
        if (quotedMatch && quotedMatch[1]) {
          filename = quotedMatch[1].trim();
        } else if (unquotedMatch && unquotedMatch[1]) {
          filename = unquotedMatch[1].trim();
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [session, sessionStatus, activeTab, year, sortField, sortDirection, bedroom, searchQuery, stateFilter, affordabilityTier, yieldRange, minScore]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Mobile View Tabs - Only on mobile */}
      <div className="lg:hidden mb-4">
        <div className="flex gap-2 border-b border-[var(--border-color)]">
          <button
            onClick={() => setMobileView('overview')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mobileView === 'overview'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setMobileView('explorer')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mobileView === 'explorer'
                ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Explorer
          </button>
        </div>
      </div>

      {/* Market Overview - Above Market Explorer on desktop, conditional on mobile */}
      <div className={`mb-4 ${mobileView === 'explorer' ? 'lg:block hidden' : 'block'}`}>
        <MarketOverview year={year} />
      </div>

      {/* Sticky Header */}
      <div className={`sticky top-0 z-10 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-t-lg px-3 sm:px-4 py-2.5 sm:py-3 ${mobileView === 'overview' ? 'lg:block hidden' : 'block'}`}>
        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
              Market Explorer
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 hidden sm:block">
              Discover investment opportunities by geo
            </p>
          </div>
          
          {/* Desktop: Individual buttons */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={isExporting || sessionStatus === 'loading'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to Excel (requires login)"
            >
              {isExporting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </>
              )}
            </button>

            {/* Filter toggle button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          {/* Mobile: Dropdown menu */}
          <div className="relative sm:hidden" ref={mobileMenuRef}>
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showMobileMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowMobileMenu(false)}
                />
                {/* Menu */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-30">
                  <div className="py-1">
                    {/* Export option */}
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        handleExport();
                      }}
                      disabled={isExporting || sessionStatus === 'loading'}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isExporting ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Exporting...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>Export</span>
                        </>
                      )}
                    </button>

                    {/* Filters option */}
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        setShowFilters(!showFilters);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                        showFilters || hasActiveFilters
                          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

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

        {/* Active Filter Pills (shown when filters are active but panel is closed) */}
        {!showFilters && filterPills.length > 0 && (
          <FilterPills pills={filterPills} onClearAll={resetFilters} />
        )}

        {/* Search Bar */}
        <SearchInput
          filterMode={true}
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={getSearchPlaceholder()}
        />

        {/* Filter Bar (collapsible) */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
            {/* Mobile: Stacked layout */}
            <div className="sm:hidden space-y-3">
              {/* Affordability dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="affordability-filter-mobile">
                  Property Value
                </label>
                <select
                  id="affordability-filter-mobile"
                  value={affordabilityTier}
                  onChange={(e) => setAffordabilityTier(e.target.value as AffordabilityTier)}
                  className="h-9 px-3 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {AFFORDABILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Yield dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="yield-filter-mobile">
                  Yield
                </label>
                <select
                  id="yield-filter-mobile"
                  value={yieldRange}
                  onChange={(e) => setYieldRange(e.target.value as YieldRange)}
                  className="h-9 px-3 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {YIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Min Score input */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="min-score-filter-mobile">
                  Min Score
                </label>
                <input
                  type="number"
                  id="min-score-filter-mobile"
                  value={minScore ?? ''}
                  onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : null)}
                  placeholder="0"
                  min="0"
                  max="200"
                  className="h-9 px-3 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                />
              </div>

              {/* Bedroom dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="bedroom-filter-mobile">
                  Bedroom
                </label>
                <select
                  id="bedroom-filter-mobile"
                  value={bedroom}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBedroom(value === 'all' ? 'all' : Number(value) as BedroomCount);
                  }}
                  className="h-9 px-3 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {BEDROOM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* State filter (for non-state tabs) */}
              {activeTab !== 'state' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="state-filter-mobile">
                    State
                  </label>
                  <select
                    id="state-filter-mobile"
                    value={stateFilter}
                    onChange={(e) => handleStateFilterChange(e.target.value)}
                    className="h-9 px-3 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
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

              {/* Reset button */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="w-full h-9 px-3 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded border border-[var(--border-color)] transition-colors"
                >
                  Reset All Filters
                </button>
              )}
            </div>

            {/* Desktop: Horizontal layout */}
            <div className="hidden sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-3">
              {/* Affordability dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="affordability-filter">
                  Property Value
                </label>
                <select
                  id="affordability-filter"
                  value={affordabilityTier}
                  onChange={(e) => setAffordabilityTier(e.target.value as AffordabilityTier)}
                  className="h-7 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {AFFORDABILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Yield dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="yield-filter">
                  Yield
                </label>
                <select
                  id="yield-filter"
                  value={yieldRange}
                  onChange={(e) => setYieldRange(e.target.value as YieldRange)}
                  className="h-7 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {YIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Min Score input */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="min-score-filter">
                  Min Score
                </label>
                <input
                  type="number"
                  id="min-score-filter"
                  value={minScore ?? ''}
                  onChange={(e) => setMinScore(e.target.value ? Number(e.target.value) : null)}
                  placeholder="0"
                  min="0"
                  max="200"
                  className="h-7 w-16 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                />
              </div>

              {/* Bedroom dropdown */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="bedroom-filter">
                  Bedroom
                </label>
                <select
                  id="bedroom-filter"
                  value={bedroom}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBedroom(value === 'all' ? 'all' : Number(value) as BedroomCount);
                  }}
                  className="h-7 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
                >
                  {BEDROOM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* State filter (for non-state tabs) */}
              {activeTab !== 'state' && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-[var(--text-muted)]" htmlFor="state-filter">
                    State
                  </label>
                  <select
                    id="state-filter"
                    value={stateFilter}
                    onChange={(e) => handleStateFilterChange(e.target.value)}
                    className="h-7 px-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]"
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

              {/* Reset button */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="h-7 px-2.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Content Container */}
      <div className={`bg-[var(--bg-secondary)] border-x border-b border-[var(--border-color)] rounded-b-lg -mt-px ${mobileView === 'overview' ? 'lg:block hidden' : 'block'}`}>
        <VirtualizedRankingList
          type={activeTab}
          items={items}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          error={error}
          enhancedMode={true}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode="login"
      />
    </div>
  );
}
