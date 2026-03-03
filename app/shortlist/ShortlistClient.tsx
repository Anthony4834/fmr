'use client';

import Link from 'next/link';
import { List } from 'lucide-react';

export default function ShortlistClient() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
            <List className="h-7 w-7 text-[var(--text-tertiary)]" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Your shortlist
        </h1>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          Save markets you are evaluating to compare and track them here. Add geos from Explorer, Map, or search results to get started.
        </p>
        <Link
          href="/explorer"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--primary-blue)' }}
        >
          Browse Explorer
        </Link>
      </div>
    </main>
  );
}
