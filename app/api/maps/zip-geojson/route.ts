import { NextRequest, NextResponse } from 'next/server';
import { STATES } from '@/lib/states';

export const dynamic = 'force-dynamic';

const CDN_BASE =
  'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master';

function normalizeZip(value: unknown): string | null {
  if (value == null) return null;
  const digits = String(value).match(/\d/g)?.join('') ?? '';
  if (!digits) return null;
  return digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, '0');
}

function getZipFromFeature(feature: any): string | null {
  const p = feature.properties || {};
  const raw =
    p.ZCTA5CE10 ??
    p.ZIP_CODE ??
    p.ZIPCODE ??
    p.zip_code ??
    p.ZIP ??
    feature.id ??
    null;
  return normalizeZip(raw);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stateCode = searchParams.get('state')?.toUpperCase();
  const zipsParam = searchParams.get('zips') ?? '';

  if (!stateCode || stateCode.length !== 2) {
    return NextResponse.json({ error: 'state required' }, { status: 400 });
  }

  const requestedZips = new Set(
    zipsParam
      .split(',')
      .map((z) => normalizeZip(z.trim()))
      .filter(Boolean),
  );

  const stateInfo = STATES.find((s) => s.code === stateCode);
  if (!stateInfo) {
    return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
  }

  const stateNameSlug = stateInfo.name.toLowerCase().replace(/\s+/g, '_');
  const url = `${CDN_BASE}/${stateCode.toLowerCase()}_${stateNameSlug}_zip_codes_geo.min.json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`CDN returned ${res.status}`);

    const geojson = await res.json();

    const features =
      requestedZips.size > 0
        ? (geojson.features ?? []).filter((f: any) => {
            const zip = getZipFromFeature(f);
            return zip !== null && requestedZips.has(zip);
          })
        : (geojson.features ?? []);

    const matchedZips = new Set(
      features
        .map((f: any) => getZipFromFeature(f))
        .filter((z: string | null): z is string => !!z),
    );
    const missingZips =
      requestedZips.size > 0
        ? Array.from(requestedZips).filter((z) => !matchedZips.has(z))
        : [];

    return NextResponse.json(
      {
        type: 'FeatureCollection',
        features,
        missingZips,
        requestedZipCount: requestedZips.size,
        matchedZipCount: matchedZips.size,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      },
    );
  } catch (err) {
    console.error('zip-geojson error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch ZIP GeoJSON' },
      { status: 500 },
    );
  }
}
