'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import InvestorScoreInfoButton from './InvestorScoreInfoButton';
import ThemeSwitcher from './ThemeSwitcher';
import SearchInput from './SearchInput';

export function AppHeaderSkeleton({ 
  showSearch = false, 
  showDescription = false,
  className = ''
}: { 
  showSearch?: boolean; 
  showDescription?: boolean;
  className?: string;
}) {
  return (
    <div className={`mb-4 sm:mb-5 flex-shrink-0 ${className}`}>
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="min-w-0">
          <div className="h-8 sm:h-10 md:h-12 bg-[var(--border-color)] rounded w-32 sm:w-40 animate-pulse mb-1" />
          <div className="h-3 sm:h-4 bg-[var(--border-color)] rounded w-40 sm:w-48 animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="h-9 w-9 rounded bg-[var(--border-color)] animate-pulse" />
          <div className="h-9 w-9 rounded bg-[var(--border-color)] animate-pulse" />
        </div>
      </div>

      {showSearch && (
        <div className="mb-3 sm:mb-4">
          <div className="h-10 sm:h-12 bg-[var(--border-color)] rounded-xl animate-pulse" />
        </div>
      )}

      {showDescription && (
        <div className="flex items-center justify-between gap-4 flex-wrap mt-3 sm:mt-4">
          <div className="h-4 bg-[var(--border-color)] rounded w-64 sm:w-80 animate-pulse" />
        </div>
      )}
    </div>
  );
}

interface AppHeaderProps {
  /** Optional onClick handler for the title. If provided, uses a button instead of a link */
  onTitleClick?: () => void;
  /** Optional href for the title link. Defaults to "/" */
  titleHref?: string;
  /** Optional search input handler */
  onSearchSelect?: (value: string, type: 'zip' | 'city' | 'county' | 'address' | 'state') => void;
  /** Whether to show the search input */
  showSearch?: boolean;
  /** Optional additional content to show below the title row */
  children?: ReactNode;
  /** Optional className for the header container */
  className?: string;
}

export default function AppHeader({
  onTitleClick,
  titleHref = '/',
  onSearchSelect,
  showSearch = false,
  children,
  className = '',
}: AppHeaderProps) {
  const TitleComponent = onTitleClick ? 'button' : Link;
  const titleProps = onTitleClick
    ? { onClick: onTitleClick, className: 'text-left hover:opacity-70 transition-opacity min-w-0' }
    : { href: titleHref, className: 'block hover:opacity-70 transition-opacity min-w-0' };

  return (
    <div className={`mb-4 sm:mb-5 flex-shrink-0 ${className}`}>
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <TitleComponent {...titleProps}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight">
            fmr.fyi
          </h1>
          <p className="text-[10px] sm:text-xs text-[var(--text-tertiary)] font-medium tracking-wide uppercase mt-0.5">
            Fair Market Rent Data
          </p>
        </TitleComponent>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <InvestorScoreInfoButton />
          <ThemeSwitcher />
        </div>
      </div>

      {showSearch && (
        <div className="mb-3 sm:mb-4">
          <SearchInput onSelect={onSearchSelect} />
        </div>
      )}

      {children}
    </div>
  );
}

