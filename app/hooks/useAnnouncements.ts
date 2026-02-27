'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const STORAGE_LAST_READ = 'announcements:lastReadAt';
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export interface Announcement {
  id: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: string;
}

function getLocalLastReadAt(): string {
  if (typeof window === 'undefined') return EPOCH_ISO;
  const v = localStorage.getItem(STORAGE_LAST_READ);
  if (!v) return EPOCH_ISO;
  const d = new Date(v);
  return isNaN(d.getTime()) ? EPOCH_ISO : d.toISOString();
}

function setLocalLastReadAt(iso: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_LAST_READ, iso);
}

function maxIso(a: string, b: string): string {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return da >= db ? a : b;
}

export interface UseAnnouncementsResult {
  announcements: Announcement[];
  latestPublishedAt: string | null;
  effectiveLastReadAt: string;
  hasUnread: boolean;
  loading: boolean;
  markAllRead: (lastReadAt?: string) => void;
  refetch: () => void;
}

export function useAnnouncements(): UseAnnouncementsResult {
  const { data: session, status } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [latestPublishedAt, setLatestPublishedAt] = useState<string | null>(null);
  const [effectiveLastReadAt, setEffectiveLastReadAt] = useState<string>(() =>
    getLocalLastReadAt()
  );
  const [loading, setLoading] = useState(true);

  const hasUnread =
    latestPublishedAt != null &&
    new Date(latestPublishedAt) > new Date(effectiveLastReadAt);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements');
      if (!res.ok) return;
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
      setLatestPublishedAt(data.latestPublishedAt ?? null);
      return data;
    } catch {
      // leave state unchanged
    }
  }, []);

  const markAllRead = useCallback(
    (lastReadAt?: string) => {
      const toUse =
        lastReadAt ??
        (latestPublishedAt || new Date().toISOString());
      const next = maxIso(effectiveLastReadAt, toUse);
      setLocalLastReadAt(next);
      setEffectiveLastReadAt(next);

      if (status === 'authenticated' && session?.user?.id) {
        fetch('/api/announcements/mark-all-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastReadAt: next }),
        }).catch(() => {});
      }
    },
    [effectiveLastReadAt, latestPublishedAt, status, session?.user?.id]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchList();
    setLoading(false);
  }, [fetchList]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      const local = getLocalLastReadAt();
      setEffectiveLastReadAt(local);

      const data = await fetchList();
      if (cancelled) return;
      if (!data) {
        setLoading(false);
        return;
      }

      if (status === 'authenticated' && session?.user?.id) {
        try {
          const res = await fetch('/api/announcements/read-state');
          if (!res.ok || cancelled) {
            setLoading(false);
            return;
          }
          const state = await res.json();
          const dbLastReadAt =
            state.lastReadAt && !isNaN(new Date(state.lastReadAt).getTime())
              ? state.lastReadAt
              : EPOCH_ISO;
          const merged = maxIso(local, dbLastReadAt);
          setLocalLastReadAt(merged);
          setEffectiveLastReadAt(merged);

          if (new Date(local) > new Date(dbLastReadAt)) {
            await fetch('/api/announcements/mark-all-read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lastReadAt: merged }),
            });
          }
        } catch {
          // offline or error: keep local
        }
      }
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, fetchList]);

  return {
    announcements,
    latestPublishedAt,
    effectiveLastReadAt,
    hasUnread,
    loading,
    markAllRead,
    refetch,
  };
}
