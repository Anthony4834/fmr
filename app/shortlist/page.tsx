import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getFeatureFlags, getActorAccessLevel, isFeatureEnabledForLevels } from '@/lib/feature-flags';
import ShortlistClient from './ShortlistClient';

export const metadata: Metadata = {
  title: 'Saved Geos | fmr.fyi',
  description: 'Your shortlisted markets for investment. Compare and track geos you are evaluating.',
  alternates: { canonical: '/shortlist' },
  robots: { index: true, follow: true },
};

export default async function ShortlistPage() {
  const [session, flags] = await Promise.all([auth(), getFeatureFlags()]);
  const shortlistFlag = flags.get('SHORTLIST_FEATURE');
  const shortlistEnabled = shortlistFlag
    ? isFeatureEnabledForLevels(
        shortlistFlag.isEnabled,
        shortlistFlag.rolloutTier,
        getActorAccessLevel(session?.user ?? null)
      )
    : false;
  if (!shortlistEnabled) redirect('/');
  return <ShortlistClient />;
}
