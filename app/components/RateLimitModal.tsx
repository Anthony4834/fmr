'use client';

import { useEffect, useState } from 'react';
import BaseModal from './BaseModal';
import AuthModal from './AuthModal';

interface RateLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  resetTime: number | null;
}

// Icon component props
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// Lock icon from lucide-react style
const LockIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

// AlertCircle icon from lucide-react style
const AlertCircleIcon = ({ className, style }: IconProps) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

function formatResetTime(resetTime: number): string {
  const resetDate = new Date(resetTime);
  const now = new Date();
  
  // Calculate time difference
  const diffMs = resetTime - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  // If reset is within 24 hours, show relative time for clarity
  if (diffMs < 24 * 60 * 60 * 1000 && diffMs > 0) {
    if (diffHours > 0) {
      return `Resets in ${diffHours} hour${diffHours !== 1 ? 's' : ''}${diffMinutes > 0 ? ` and ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}` : ''}`;
    } else if (diffMinutes > 0) {
      return `Resets in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else {
      return `Resets soon`;
    }
  }
  
  // For longer durations, show absolute time in UTC
  const resetUTC = new Date(resetDate.getTime());
  const nowUTC = new Date(now.getTime());
  
  const resetDateStr = resetUTC.toISOString().split('T')[0];
  const todayStr = nowUTC.toISOString().split('T')[0];
  const tomorrowUTC = new Date(nowUTC);
  tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
  const tomorrowStr = tomorrowUTC.toISOString().split('T')[0];
  
  // Format time in UTC to avoid confusion
  const timeStrUTC = resetUTC.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
  
  if (resetDateStr === todayStr) {
    return `Resets today at ${timeStrUTC} UTC`;
  } else if (resetDateStr === tomorrowStr) {
    return `Resets tomorrow at ${timeStrUTC} UTC`;
  } else {
    // Format as "Resets on [Day], [Month] [Date] at [Time] UTC"
    const dateStr = resetUTC.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return `Resets on ${dateStr} at ${timeStrUTC} UTC`;
  }
}

export default function RateLimitModal({ isOpen, onClose, resetTime }: RateLimitModalProps) {
  const [progress, setProgress] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');

  // Constants - guest tier
  const limit = 50;
  const currentUsage = 50;
  const percentage = Math.min(100, (currentUsage / limit) * 100);
  const isLimitReached = currentUsage >= limit;

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setProgress(percentage), 150);
      return () => clearTimeout(timer);
    } else {
      setProgress(0);
    }
  }, [isOpen, percentage]);


  const content = {
    title: "Daily Limit Exceeded",
    description: "You have reached the daily query limit for guest users. Create a free account to continue accessing market data.",
    action: "Create a free account",
    loginText: "Already have an account?",
    subtext: "Includes 200 daily requests and basic reporting.",
  };

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} maxWidth="420px">
              {/* Header Section */}
              <div 
                className="border-b p-6"
                style={{ backgroundColor: 'var(--modal-bg)', borderColor: 'var(--modal-border)' }}
              >
                <h2 
                  className="text-xl font-display font-bold"
                  style={{ color: 'var(--modal-text)' }}
                >
                  {content.title}
                </h2>
                <p 
                  className="text-sm mt-1"
                  style={{ color: 'var(--modal-text-muted)' }}
                >
                  {content.description}
                </p>
              </div>

              {/* Body Section */}
              <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--modal-bg)' }}>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span 
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--modal-text-muted)' }}
                    >
                      Daily Usage
                    </span>
                    <div className="text-right flex items-baseline gap-1">
                      <span 
                        className="text-lg font-semibold tabular-nums"
                        style={{ color: isLimitReached ? 'var(--destructive)' : 'var(--modal-text)' }}
                      >
                        {currentUsage}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--modal-text-muted)' }}>/</span>
                      <span className="text-sm tabular-nums" style={{ color: 'var(--modal-text-muted)' }}>{limit}</span>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div 
                    className="h-3 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--modal-hover)' }}
                  >
                    <div 
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${progress}%`,
                        backgroundColor: isLimitReached ? 'var(--destructive)' : 'var(--primary-blue)',
                      }}
                    />
                  </div>
                  
                  {isLimitReached && resetTime && (
                    <div 
                      className="flex items-start gap-2.5 text-sm p-3.5 rounded-lg border"
                      style={{
                        color: 'var(--destructive)',
                        backgroundColor: 'var(--destructive-muted)',
                        borderColor: 'color-mix(in srgb, var(--destructive) 25%, transparent)',
                      }}
                    >
                      <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                      <span className="font-medium leading-relaxed">Queries paused. {formatResetTime(resetTime)}.</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Create account button - primary */}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setShowAuthModal(true);
                    }}
                    className="w-full px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--primary-blue)', color: '#ffffff' }}
                  >
                    {content.action}
                  </button>
                  
                  {/* Login option */}
                  <div className="text-center">
                    <span className="text-sm" style={{ color: 'var(--modal-text-muted)' }}>
                      {content.loginText}{' '}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setShowAuthModal(true);
                      }}
                      className="text-sm font-medium transition-colors hover:underline"
                      style={{ color: 'var(--primary-blue)' }}
                    >
                      Log in
                    </button>
                  </div>
                </div>
              </div>
      </BaseModal>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />
    </>
  );
}
