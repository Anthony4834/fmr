import { Metadata } from 'next';
import MapClient from './MapClient';

export const metadata: Metadata = {
  title: 'Interactive Investment Score Map | Section 8 Housing Analysis | fmr.fyi',
  description:
    'Explore Section 8 housing investment opportunities with our interactive US map. View Investment Scores by state and identify high-potential markets.',
  keywords:
    'section 8 map, housing investment map, rental investment scores, fair market rent map',
  alternates: { canonical: '/map' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Interactive Investment Score Map',
    description:
      'Explore Section 8 housing investment opportunities with our interactive US map. View Investment Scores by state and identify high-potential markets.',
    url: '/map',
    siteName: 'fmr.fyi',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Interactive Investment Score Map',
    description:
      'Explore Section 8 housing investment opportunities with our interactive US map. View Investment Scores by state and identify high-potential markets.',
  },
};

export default function MapPage() {
  return <MapClient />;
}
