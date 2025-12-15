import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StateDashboardClient from '@/app/components/StateDashboardClient';
import type { StateCode } from '@/lib/states';

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const raw = params.state || '';
  const state = raw.toUpperCase();
  if (!ALLOWED_STATE_CODES.has(state)) return { title: 'State FMR | fmr.fyi' };
  const canonical = `https://fmr.fyi/state/${state}`;
  return {
    title: `${state} FMR Dashboard (Mock) – fmr.fyi`,
    description: `Investor-style HUD Fair Market Rent (FMR/SAFMR) dashboard for ${state}. (Mock data in Phase 1.)`,
    alternates: { canonical },
    openGraph: { title: `${state} FMR Dashboard (Mock) – fmr.fyi`, description: `Investor-style HUD Fair Market Rent dashboard for ${state}.`, url: canonical, siteName: 'fmr.fyi', type: 'website' },
    twitter: { card: 'summary', title: `${state} FMR Dashboard (Mock) – fmr.fyi`, description: `Investor-style HUD Fair Market Rent dashboard for ${state}.` },
  };
}

export default function StatePage({ params }: { params: { state: string } }) {
  const raw = params.state || '';
  const state = raw.toUpperCase();
  if (!ALLOWED_STATE_CODES.has(state)) notFound();
  return <StateDashboardClient stateCode={state as StateCode} />;
}


