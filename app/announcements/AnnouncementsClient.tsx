'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import AnnouncementCard from '@/app/components/AnnouncementCard';
import { useAnnouncements } from '@/app/hooks/useAnnouncements';

export default function AnnouncementsClient() {
  const {
    announcements,
    latestPublishedAt,
    loading,
    markAllRead,
  } = useAnnouncements();

  // When user opens the announcements tab: mark all read with latestPublishedAt (per spec)
  useEffect(() => {
    if (latestPublishedAt) markAllRead(latestPublishedAt);
  }, [latestPublishedAt, markAllRead]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-1">
          Announcements
        </h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Updates, change notes, and important notices
        </p>
      </div>

      {loading && announcements.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
          Loading…
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            No announcements yet. Check back later.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Back to home
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              title={ann.title}
              body={ann.bodyMarkdown}
              publishedAt={ann.publishedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
