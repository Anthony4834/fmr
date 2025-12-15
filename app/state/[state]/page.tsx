import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StateDashboardClient from '@/app/components/StateDashboardClient';
import type { StateCode } from '@/lib/states';
import { STATES } from '@/lib/states';
import { getLatestFMRYear } from '@/lib/queries';

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export const revalidate = 86400;

export async function generateMetadata({ 
  params
}: { 
  params: { state: string };
}): Promise<Metadata> {
  const raw = params.state || '';
  const state = raw.toUpperCase();
  if (!ALLOWED_STATE_CODES.has(state)) return { title: 'State FMR | fmr.fyi' };
  
  const stateInfo = STATES.find(s => s.code === state);
  const stateName = stateInfo?.name || state;
  const year = await getLatestFMRYear();
  const yearText = `FY ${year}`;
  
  const canonical = `https://fmr.fyi/state/${state}`;
  
  const title = `${stateName} FMR Map & Dashboard – ${yearText} | fmr.fyi`;
  const description = `Interactive FMR map and dashboard for ${stateName}. View county-level Fair Market Rent data, investment scores, and rent trends for ${yearText}. Compare FMR across all counties in ${stateName}.`;
  
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { 
      title, 
      description, 
      url: canonical, 
      siteName: 'fmr.fyi', 
      type: 'website' 
    },
    twitter: { 
      card: 'summary_large_image', 
      title, 
      description 
    },
  };
}

export default function StatePage({ 
  params
}: { 
  params: { state: string };
}) {
  const raw = params.state || '';
  const state = raw.toUpperCase();
  if (!ALLOWED_STATE_CODES.has(state)) notFound();
  return <StateDashboardClient stateCode={state as StateCode} />;
}


