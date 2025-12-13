import { redirect } from 'next/navigation';

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export default function StatePage({ params }: { params: { state: string } }) {
  const raw = params.state || '';
  const state = raw.toUpperCase();
  if (!ALLOWED_STATE_CODES.has(state)) {
    redirect('/');
  }
  // The home dashboard supports state + BR filters via query params.
  redirect(`/?state=${state}`);
}


