'use client';

import { useContext, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import { ThemeContext } from '@/app/contexts/ThemeContext';
import { useRentDisplay } from '@/app/contexts/RentDisplayContext';
import Link from 'next/link';

export default function SettingsClient() {
  const { data: session } = useSession();
  const themeContext = useContext(ThemeContext);
  const theme = themeContext?.theme ?? 'system';
  const setTheme = themeContext?.setTheme ?? (() => {});
  const { rentDisplayMode, setRentDisplayMode, isLoading } = useRentDisplay();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const C = {
    bg: 'var(--modal-bg)',
    border: 'var(--modal-border)',
    overlay: 'var(--modal-overlay)',
    text: 'var(--modal-text)',
    textMuted: 'var(--modal-text-muted)',
    hover: 'var(--modal-hover)',
    destructive: 'var(--destructive)',
  } as const;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          ← Back
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-6">Settings</h1>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Appearance</h2>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${
                  theme === t
                    ? 'text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
                style={theme === t ? { backgroundColor: 'var(--primary-blue)' } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
            Rent display
          </h2>
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            How rent is shown in tables and cards (Effective vs FMR).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRentDisplayMode('effective')}
              disabled={isLoading}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                rentDisplayMode === 'effective'
                  ? 'text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
              style={rentDisplayMode === 'effective' ? { backgroundColor: 'var(--primary-blue)' } : undefined}
            >
              Effective
            </button>
            <button
              type="button"
              onClick={() => setRentDisplayMode('fmr')}
              disabled={isLoading}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                rentDisplayMode === 'fmr'
                  ? 'text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
              style={rentDisplayMode === 'fmr' ? { backgroundColor: 'var(--primary-blue)' } : undefined}
            >
              FMR
            </button>
          </div>
        </div>

        {session && (
          <div>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Account</h2>
            <p className="text-xs text-[var(--text-tertiary)] mb-2">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.destructive }}
            >
              Delete account
            </button>
          </div>
        )}
      </section>

      {/* Delete account confirmation dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: C.overlay }}
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="rounded-lg border shadow-lg max-w-md w-full p-6"
            style={{ backgroundColor: C.bg, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: C.text }}>
              Delete Account
            </h3>
            <p className="text-sm mb-6" style={{ color: C.textMuted }}>
              Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: C.text, backgroundColor: C.hover }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const response = await fetch('/api/user/delete', { method: 'DELETE' });
                    if (!response.ok) {
                      const data = await response.json();
                      throw new Error(data.error || 'Failed to delete account');
                    }
                    await signOut({ callbackUrl: '/' });
                  } catch (error) {
                    console.error('Delete account error:', error);
                    alert(error instanceof Error ? error.message : 'Failed to delete account. Please try again.');
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
                style={{ backgroundColor: isDeleting ? C.textMuted : C.destructive }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
