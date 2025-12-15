'use client';

import type { FMRResult } from '@/lib/types';
import { buildCitySlug, buildCountySlug } from '@/lib/location-slugs';

export default function ResultAbout({ data }: { data: FMRResult }) {
  const queriedType = data.queriedType;
  const queriedLocation = data.queriedLocation || data.areaName;
  const stateCode = data.stateCode;
  const yearLabel = `FY ${data.year}`;

  const parsedCity =
    queriedType === 'city' && typeof queriedLocation === 'string'
      ? (() => {
          const parts = queriedLocation.split(',').map((s) => s.trim());
          if (parts.length < 2) return null;
          const city = parts[0];
          const st = parts[1]?.toUpperCase();
          if (!city || !st || st.length !== 2) return null;
          return { city, st };
        })()
      : null;

  const parsedCounty =
    queriedType === 'county' && typeof queriedLocation === 'string'
      ? (() => {
          const parts = queriedLocation.split(',').map((s) => s.trim());
          if (parts.length < 2) return null;
          const county = parts[0];
          const st = parts[1]?.toUpperCase();
          if (!county || !st || st.length !== 2) return null;
          return { county, st };
        })()
      : null;

  const countyLink =
    data.countyName && stateCode
      ? `/county/${buildCountySlug(data.countyName, stateCode)}`
      : parsedCounty
        ? `/county/${buildCountySlug(parsedCounty.county, parsedCounty.st)}`
        : null;

  const cityLink = parsedCity ? `/city/${buildCitySlug(parsedCity.city, parsedCity.st)}` : null;

  return (
    <details className="rounded-lg border border-[#e5e5e5] bg-white">
      <summary className="cursor-pointer select-none px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#fafafa]">
        About this result
        <span className="ml-2 text-xs font-medium text-[#737373]">(HUD FMR/SAFMR details)</span>
      </summary>
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 text-sm text-[#525252] leading-relaxed">
        <p className="mt-2">
          This page shows <span className="font-semibold text-[#0a0a0a]">HUD Fair Market Rent</span> data for{' '}
          <span className="font-semibold text-[#0a0a0a]">{queriedLocation}</span>
          {stateCode ? ` (${stateCode})` : ''} for {yearLabel}. Fair Market Rent (FMR) is a HUD benchmark used to determine
          payment standards for programs like the Housing Choice Voucher (Section 8) program.
        </p>
        <p className="mt-2">
          Values are shown for 0–4 bedroom units. In some metro areas HUD publishes{' '}
          <span className="font-semibold text-[#0a0a0a]">Small Area FMR (SAFMR)</span> at the ZIP-code level; otherwise the
          county/metropolitan-area FMR applies. This result is labeled{' '}
          <span className="font-semibold text-[#0a0a0a]">{data.source === 'safmr' ? 'SAFMR' : 'FMR'}</span> based on HUD’s
          designation for the area and the available data.
        </p>
        <p className="mt-2">
          Tip: use these numbers as a starting point and confirm local program rules (payment standards may differ from
          HUD’s published FMR). If you’re comparing neighborhoods, SAFMR ZIP ranges can highlight variation within the same
          county.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a className="px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/what-is-fmr">
            What is FMR?
          </a>
          <a className="px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/what-is-fmr#safmr">
            What is SAFMR?
          </a>
          <a className="px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href="/data-sources">
            Data sources
          </a>
          {countyLink && queriedType !== 'county' && (
            <a className="px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href={countyLink}>
              View county page
            </a>
          )}
          {cityLink && queriedType !== 'city' && (
            <a className="px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa]" href={cityLink}>
              View city page
            </a>
          )}
        </div>

        {data.zipCodes && data.zipCodes.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-[#0a0a0a] mb-1">Related ZIPs</div>
            <div className="flex flex-wrap gap-2">
              {data.zipCodes.slice(0, 10).map((z) => {
                const zipHref = `/zip/${z}${data.stateCode ? `?state=${data.stateCode}` : ''}`;
                return (
                  <a
                    key={z}
                    className="text-xs px-2.5 py-1 rounded-md border border-[#e5e5e5] bg-white hover:bg-[#fafafa] font-mono"
                    href={zipHref}
                  >
                    {z}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}




