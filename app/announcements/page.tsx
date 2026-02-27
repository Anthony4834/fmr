import { Metadata } from 'next';
import AppHeader from '@/app/components/AppHeader';
import AnnouncementsClient from './AnnouncementsClient';

export const metadata: Metadata = {
  title: 'Announcements | fmr.fyi',
  description: 'Updates, change notes, and important notices from fmr.fyi',
};

export default function AnnouncementsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 sm:py-10">
        <AppHeader className="mb-6 sm:mb-8" showSearch />
        <AnnouncementsClient />
      </div>
    </main>
  );
}
