import { NextResponse } from 'next/server';
import { getFeatureFlags, VALUE_TO_TIER } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

/**
 * GET /api/toggles
 * Returns active flags as key -> tier. Always 200 OK. Returns {} when no flags or table missing.
 */
export async function GET() {
  try {
    const flags = await getFeatureFlags();
    const obj: Record<string, string> = {};
    for (const [key, { isEnabled, rolloutTier }] of Array.from(flags.entries())) {
      obj[key] = isEnabled ? (VALUE_TO_TIER[rolloutTier] ?? 'ga') : 'off';
    }
    return NextResponse.json(obj);
  } catch {
    return NextResponse.json({});
  }
}
