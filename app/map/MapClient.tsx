'use client';

import { useRouter } from 'next/navigation';
import SearchInput from '@/app/components/SearchInput';
import InvestorScoreInfoButton from '@/app/components/InvestorScoreInfoButton';
import ThemeSwitcher from '@/app/components/ThemeSwitcher';
import USStateMap from '@/app/components/USStateMap';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

export default function MapClient() {
  const router = useRouter();

  const handleSearch = (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => {
    if (type === 'state') {
      const state = (value || '').trim().toUpperCase();
      if (state && state.length === 2) {
        router.push(`/state/${state}`);
        return;
      }
    }

    if (type === 'zip') {
      const zip = value.trim().match(/\b(\d{5})\b/)?.[1];
      if (zip) {
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: zip, canonicalPath: `/zip/${zip}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/zip/${zip}`);
        return;
      }
    }

    if (type === 'city') {
      const [city, state] = value.split(',').map((s) => s.trim());
      if (city && state && state.length === 2) {
        const q = `${city}, ${state.toUpperCase()}`;
        const slug = buildCitySlug(city, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/city/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/city/${slug}`);
        return;
      }
    }

    if (type === 'county') {
      const [county, state] = value.split(',').map((s) => s.trim());
      if (county && state && state.length === 2) {
        const q = `${county}, ${state.toUpperCase()}`;
        const slug = buildCountySlug(county, state);
        fetch('/api/track/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type, query: q, canonicalPath: `/county/${slug}` }),
          keepalive: true,
        }).catch(() => {});
        router.push(`/county/${slug}`);
        return;
      }
    }

    const params = new URLSearchParams();
    params.set('q', value);
    params.set('type', type);
    router.push(`/?${params.toString()}`);
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fmr.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Map', item: 'https://fmr.fyi/map' },
    ],
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:py-8 md:py-10 lg:py-10">
        {/* Header */}
        <div className="mb-4 sm:mb-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
            <a href="/" className="block hover:opacity-70 transition-opacity min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight">
                fmr.fyi
              </h1>
              <p className="text-[10px] sm:text-xs text-[var(--text-tertiary)] font-medium tracking-wide uppercase mt-0.5">Fair Market Rent Data</p>
            </a>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <InvestorScoreInfoButton />
              <ThemeSwitcher />
            </div>
          </div>

          {/* Search Input - no wrapper card */}
          <SearchInput onSelect={handleSearch} />
        </div>

        <div className="flex flex-col gap-3 sm:gap-4">

          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] flex-wrap">
            <a href="/" className="hover:text-[var(--text-primary)] transition-colors">
              Home
            </a>
            <span className="text-[var(--text-muted)]">/</span>
            <span aria-current="page" className="text-[var(--text-primary)] font-medium">
              Map
            </span>
          </nav>

          <h2 className="sr-only">Investment Score Map</h2>

          <USStateMap />
        </div>
      </div>
    </main>
  );
}

