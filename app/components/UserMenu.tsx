'use client';

import { useState, useEffect, useRef, useContext } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { ThemeContext } from '@/app/contexts/ThemeContext';
import Tooltip from '@/app/components/Tooltip';
interface UserMenuProps {
  onSignInClick: () => void;
}

// Icon component props
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// Icon components
const UserIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const LogOutIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const ChevronDownIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const SparklesIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const SunIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const MonitorIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const CheckIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ShieldIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const TrashIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const SettingsIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ChevronRightIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const InfoIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function UserMenu({ onSignInClick }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Get theme context
  const themeContext = useContext(ThemeContext);
  const theme = themeContext?.theme ?? 'system';
  const setTheme = themeContext?.setTheme ?? (() => {});

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset image error when session image changes
  useEffect(() => {
    setImageError(false);
  }, [session?.user?.image]);

  // CSS var references — all theming via globals.css
  const C = {
    bg:          'var(--modal-bg)',
    border:      'var(--modal-border)',
    hover:       'var(--modal-hover)',
    overlay:     'var(--modal-overlay)',
    text:        'var(--modal-text)',
    textMuted:   'var(--modal-text-muted)',
    primary:     'var(--primary-blue)',
    destructive: 'var(--destructive)',
  } as const;

  // Loading state
  if (status === 'loading') {
    return (
      <div 
        className="w-9 h-9 rounded-full animate-pulse flex-shrink-0"
        style={{ backgroundColor: C.hover }}
      />
    );
  }

  // Not authenticated - show sign in button with theme switcher dropdown
  if (!session) {
    return (
      <div className="relative flex items-center gap-1.5 sm:gap-2" ref={menuRef}>
        {/* Theme switcher button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex-shrink-0"
          aria-label="Theme options"
          aria-expanded={isOpen}
        >
          {theme === 'dark' ? (
            <MoonIcon className="w-4 h-4" />
          ) : theme === 'light' ? (
            <SunIcon className="w-4 h-4" />
          ) : (
            <MonitorIcon className="w-4 h-4" />
          )}
        </button>
        
        {/* Sign in button */}
        <button
          onClick={onSignInClick}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 h-9 rounded-lg font-medium transition-all duration-200 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
          style={{ backgroundColor: C.primary, color: '#ffffff' }}
        >
          <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Sign in</span>
        </button>

        {/* Theme dropdown for logged-out users */}
        {isOpen && (
          <div 
            className="absolute right-0 top-full mt-2 w-48 border rounded-lg shadow-lg z-50"
            style={{ backgroundColor: C.bg, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              <div className="text-xs font-semibold uppercase tracking-wide px-2 py-1.5" style={{ color: C.textMuted }}>
                Theme
              </div>
              <div className="space-y-0.5">
                {([
                  { t: 'light',  Icon: SunIcon },
                  { t: 'dark',   Icon: MoonIcon },
                  { t: 'system', Icon: MonitorIcon },
                ] as const).map(({ t, Icon }) => (
                  <button
                    key={t}
                    onClick={() => { setTheme(t); setIsOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: theme === t ? C.hover : undefined,
                      color: C.text,
                    }}
                    onMouseEnter={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.backgroundColor = C.hover; }}
                    onMouseLeave={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: C.textMuted }} />
                    <span className="flex-1 text-left capitalize">{t}</span>
                    {theme === t && <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: C.primary }} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Authenticated - show user menu
  const userInitials = session.user?.name
    ? session.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : session.user?.email?.[0]?.toUpperCase() || '?';

  const tierLabel =
    session.user?.tier === 'paid'
      ? 'Pro'
      : session.user?.tier === 'free_forever'
        ? 'Free Forever'
        : 'Free';
  const tierColor =
    session.user?.tier === 'paid' || session.user?.tier === 'free_forever'
      ? 'hsl(45 93% 47%)'
      : C.primary;
  const freeForeverTooltip =
    'Thank you for being an early member. You have permanent access to Pro features at no charge.';

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 sm:gap-2 p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10 h-9"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {session.user?.image && !imageError ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex-shrink-0"
            onError={() => setImageError(true)}
          />
        ) : (
          <div 
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: C.primary, color: '#ffffff' }}
          >
            {userInitials}
          </div>
        )}
        <ChevronDownIcon 
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: C.textMuted }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-64 rounded-lg border shadow-lg z-50"
          style={{ backgroundColor: C.bg, borderColor: C.border }}
        >
          {/* User info header */}
          <div 
            className="p-4 border-b"
            style={{ borderColor: C.border }}
          >
            <div className="flex items-center gap-3">
              {session.user?.image && !imageError ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-9 h-9 rounded-full flex-shrink-0"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                  style={{ backgroundColor: C.primary, color: '#ffffff' }}
                >
                  {userInitials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div 
                  className="font-medium truncate text-sm"
                  style={{ color: C.text }}
                >
                  {session.user?.name || 'User'}
                </div>
                <div 
                  className="text-xs truncate mt-0.5"
                  style={{ color: C.textMuted }}
                >
                  {session.user?.email}
                </div>
              </div>
            </div>
            
            {/* Tier badge */}
            <div className="mt-3 inline-flex items-center gap-1.5">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${tierColor}15`,
                  color: tierColor,
                }}
              >
                <SparklesIcon className="w-3.5 h-3.5 flex-shrink-0" />
                {tierLabel} Plan
              </div>
              {session.user?.tier === 'free_forever' && (
                <Tooltip content={freeForeverTooltip} side="top" maxWidthPx={260}>
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help"
                    style={{ color: tierColor, backgroundColor: `${tierColor}20` }}
                    aria-label="Free Forever plan info"
                  >
                    <InfoIcon className="w-3 h-3" />
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Theme switcher section */}
            <div className="p-2 border-b" style={{ borderColor: C.border }}>
              <div className="text-xs font-semibold uppercase tracking-wide px-2 py-1.5" style={{ color: C.textMuted }}>
                Theme
              </div>
              <div className="space-y-0.5">
                {([
                  { t: 'light',  Icon: SunIcon },
                  { t: 'dark',   Icon: MoonIcon },
                  { t: 'system', Icon: MonitorIcon },
                ] as const).map(({ t, Icon }) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors"
                    style={{
                      backgroundColor: theme === t ? C.hover : undefined,
                      color: C.text,
                    }}
                    onMouseEnter={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.backgroundColor = C.hover; }}
                    onMouseLeave={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: C.textMuted }} />
                    <span className="flex-1 text-left capitalize">{t}</span>
                    {theme === t && <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: C.primary }} />}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Admin Dashboard (only for admins) */}
            {session.user?.role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left"
                style={{ color: C.text }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.hover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
              >
                <ShieldIcon className="w-4 h-4 flex-shrink-0" style={{ color: C.textMuted }} />
                Admin Dashboard
              </Link>
            )}
            
            {/* Settings submenu */}
            <div className="border-t" style={{ borderColor: C.border }}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left"
                style={{ color: C.text }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.hover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
              >
                <SettingsIcon className="w-4 h-4 flex-shrink-0" style={{ color: C.textMuted }} />
                <span className="flex-1">Settings</span>
                <ChevronRightIcon 
                  className={`w-4 h-4 flex-shrink-0 transition-transform ${showSettings ? 'rotate-90' : ''}`}
                  style={{ color: C.textMuted }}
                />
              </button>
              
              {showSettings && (
                <div className="pl-4 pr-2 py-2 space-y-1" style={{ backgroundColor: C.hover }}>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowSettings(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left rounded"
                    style={{ color: C.destructive }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.border; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <TrashIcon className="w-4 h-4 flex-shrink-0" />
                    Delete account
                  </button>
                </div>
              )}
            </div>
            
            {/* Sign out */}
            <button
              onClick={() => { setIsOpen(false); signOut({ callbackUrl: '/' }); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left"
              style={{ color: C.text }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.hover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
            >
              <LogOutIcon className="w-4 h-4 flex-shrink-0" style={{ color: C.textMuted }} />
              Sign out
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
