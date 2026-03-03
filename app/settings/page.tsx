import { Metadata } from 'next';
import SettingsClient from './SettingsClient';

export const metadata: Metadata = {
  title: 'Settings | fmr.fyi',
  description: 'Manage your fmr.fyi preferences.',
  robots: { index: false, follow: true },
};

export default function SettingsPage() {
  return <SettingsClient />;
}
