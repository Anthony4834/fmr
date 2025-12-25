import Link from 'next/link';
import AppHeader from '@/app/components/AppHeader';
import NewBadge from '@/app/components/NewBadge';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 sm:py-10">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="mb-2 sm:mb-3 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <AppHeader className="mb-0" showSearch={true} />
            </div>
            <a
              href="https://chromewebstore.google.com/detail/fmrfyi-%E2%80%93-fair-market-rent/gkemjakehildeolcagbibhmbcddkkflb"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 px-3 py-2 bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs sm:text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
            >
              <span className="flex items-center gap-1.5">
                <span className="hidden sm:inline">Get Chrome Extension</span>
                <span className="sm:hidden">Extension</span>
                <NewBadge />
              </span>
            </a>
          </div>
        </div>


        {/* 404 */}
        <section className="max-w-xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-3">
            Not found
          </p>

          <h2 className="text-lg font-normal text-[var(--text-primary)] mb-2">
            This page doesn't exist
          </h2>

          <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-6">
            The link may be outdated, or the page may have moved.
            You can search above or return to a known location.
          </p>

          <div className="flex items-center justify-center gap-4 text-sm">
            <Link
              href="/"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Home
            </Link>
            <span className="text-[var(--border-secondary)]">•</span>
            <Link
              href="/explorer"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Explorer
            </Link>
          </div>

          <div className="mt-8 text-xs text-[var(--text-muted)]">
            Common entry points:
            <div className="mt-2 flex justify-center gap-3">
              <Link href="/state/CA" className="hover:underline underline-offset-2">
                CA
              </Link>
              <Link href="/state/NY" className="hover:underline underline-offset-2">
                NY
              </Link>
              <Link href="/state/TX" className="hover:underline underline-offset-2">
                TX
              </Link>
              <Link href="/state/FL" className="hover:underline underline-offset-2">
                FL
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
