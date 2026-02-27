'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import BaseModal from './BaseModal';
import MarkdownBody from './MarkdownBody';
import { useAnnouncements, type Announcement } from '@/app/hooks/useAnnouncements';

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
      />
    </svg>
  );
}

function formatDateAndTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AnnouncementsButton() {
  const {
    announcements,
    latestPublishedAt,
    effectiveLastReadAt,
    hasUnread,
    loading,
    markAllRead,
    refetch,
  } = useAnnouncements();

  const [isOpen, setIsOpen] = useState(false);
  const [detailAnnouncement, setDetailAnnouncement] = useState<Announcement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const didMarkOnOpenRef = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // When panel opens: mark all read with latestPublishedAt (per spec) and record views
  useEffect(() => {
    if (!isOpen) {
      didMarkOnOpenRef.current = false;
      return;
    }
    if (didMarkOnOpenRef.current) return;
    didMarkOnOpenRef.current = true;
    markAllRead(latestPublishedAt ?? undefined);
    announcements.forEach((a) => {
      fetch('/api/announcements/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId: a.id }),
      }).catch(() => {});
    });
  }, [isOpen, latestPublishedAt, markAllRead, announcements]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors"
        title="Announcements"
        aria-label={hasUnread ? 'Unread announcements' : 'Announcements'}
        aria-expanded={isOpen}
      >
        <MegaphoneIcon className="w-5 h-5" />
        {hasUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--text-primary)]"
            aria-hidden
          />
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-2rem))] max-h-[min(70vh,420px)] overflow-hidden rounded-lg border shadow-lg z-50 flex flex-col"
          style={{
            backgroundColor: 'var(--modal-bg)',
            borderColor: 'var(--modal-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--modal-border)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--modal-text-muted)' }}>
              Announcements
            </span>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 p-2">
            {loading && announcements.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--modal-text-muted)' }}>
                Loading…
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--modal-text-muted)' }}>
                No announcements.
              </div>
            ) : (
              <ul className="space-y-1">
                {announcements.map((a) => {
                  const isNew = new Date(a.publishedAt) > new Date(effectiveLastReadAt);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailAnnouncement(a);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-2 py-2 rounded-md text-sm transition-colors hover:bg-[var(--modal-hover)]"
                        style={{ color: 'var(--modal-text)' }}
                      >
                        <span className="font-medium flex items-center gap-2 min-w-0" title={a.title}>
                          <span className="truncate min-w-0">{a.title}</span>
                          {isNew && (
                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}
                            >
                              New
                            </span>
                          )}
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--modal-text-muted)' }}>
                          {formatDateAndTime(a.publishedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="p-2 border-t shrink-0" style={{ borderColor: 'var(--modal-border)' }}>
            <Link
              href="/announcements"
              onClick={() => setIsOpen(false)}
              className="block w-full text-center py-2 text-sm font-medium rounded-md transition-colors hover:bg-[var(--modal-hover)]"
              style={{ color: 'var(--modal-text)' }}
            >
              View all
            </Link>
          </div>
        </div>
      )}

      <BaseModal
        isOpen={detailAnnouncement !== null}
        onClose={() => setDetailAnnouncement(null)}
        maxWidth="min(560px, 100%)"
        className="max-h-[85vh] flex flex-col"
      >
        {detailAnnouncement && (
          <>
            <div className="shrink-0 flex items-start justify-between gap-3 p-4 sm:p-5 border-b" style={{ borderColor: 'var(--modal-border)' }}>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl font-semibold leading-tight" style={{ color: 'var(--modal-text)' }}>
                  {detailAnnouncement.title}
                </h2>
                <time
                  dateTime={detailAnnouncement.publishedAt}
                  className="text-xs sm:text-sm mt-1.5 block"
                  style={{ color: 'var(--modal-text-muted)' }}
                >
                  {formatDateAndTime(detailAnnouncement.publishedAt)}
                </time>
              </div>
              <button
                type="button"
                onClick={() => setDetailAnnouncement(null)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--modal-hover)]"
                style={{ color: 'var(--modal-text-muted)' }}
                aria-label="Close"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--modal-text)' }}>
              <MarkdownBody content={detailAnnouncement.bodyMarkdown} />
            </div>
            <div className="shrink-0 p-3 border-t" style={{ borderColor: 'var(--modal-border)' }}>
              <Link
                href="/announcements"
                onClick={() => setDetailAnnouncement(null)}
                className="block w-full text-center py-2 text-sm font-medium rounded-md transition-colors hover:bg-[var(--modal-hover)]"
                style={{ color: 'var(--modal-text)' }}
              >
                View all announcements
              </Link>
            </div>
          </>
        )}
      </BaseModal>
    </div>
  );
}
