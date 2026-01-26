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
  const [isDark, setIsDark] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');

  // Constants - guest tier
  const limit = 50;
  const currentUsage = 50;
  const percentage = Math.min(100, (currentUsage / limit) * 100);
  const isLimitReached = currentUsage >= limit;

  // Check theme
  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDark(theme === 'dark');
    };
    
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setProgress(percentage), 150);
      return () => clearTimeout(timer);
    } else {
      setProgress(0);
    }
  }, [isOpen, percentage]);

  // Theme-aware colors
  const borderColor = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 88%)';
  const cardBg = isDark ? 'hsl(220 15% 12%)' : '#ffffff';
  const textForeground = isDark ? 'hsl(0 0% 98%)' : 'hsl(220 30% 12%)';
  const textMuted = isDark ? 'hsl(0 0% 60%)' : 'hsl(220 15% 45%)';
  const primaryColor = 'hsl(192 85% 42%)';
  const accentBg = isDark ? 'hsl(192 85% 42% / 0.15)' : 'hsl(192 85% 42% / 0.08)';
  const accentBorder = isDark ? 'hsl(192 85% 42% / 0.3)' : 'hsl(192 85% 42% / 0.2)';
  const secondaryBg = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 95%)';
  const destructiveColor = isDark ? 'hsl(0 70% 60%)' : 'hsl(0 65% 50%)';
  const destructiveBg = isDark ? 'hsl(0 70% 60% / 0.15)' : 'hsl(0 65% 50% / 0.05)';
  const destructiveBorder = isDark ? 'hsl(0 70% 60% / 0.3)' : 'hsl(0 65% 50% / 0.15)';

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
                style={{ 
                  backgroundColor: cardBg,
                  borderColor: borderColor,
                }}
              >
                <h2 
                  className="text-xl font-display font-bold"
                  style={{ color: textForeground }}
                >
                  {content.title}
                </h2>
                <p 
                  className="text-sm mt-1"
                  style={{ color: textMuted }}
                >
                  {content.description}
                </p>
              </div>

              {/* Body Section */}
              <div className="p-6 space-y-6" style={{ backgroundColor: cardBg }}>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span 
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: textMuted }}
                    >
                      Daily Usage
                    </span>
                    <div className="text-right flex items-baseline gap-1">
                      <span 
                        className="text-lg font-semibold tabular-nums"
                        style={{ color: isLimitReached ? destructiveColor : textForeground }}
                      >
                        {currentUsage}
                      </span>
                      <span className="text-sm" style={{ color: textMuted }}>/</span>
                      <span className="text-sm tabular-nums" style={{ color: textMuted }}>{limit}</span>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div 
                    className="h-3 rounded-full overflow-hidden"
                    style={{ backgroundColor: secondaryBg }}
                  >
                    <div 
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${progress}%`,
                        backgroundColor: isLimitReached ? destructiveColor : primaryColor,
                      }}
                    />
                  </div>
                  
                  {isLimitReached && resetTime && (
                    <div 
                      className="flex items-start gap-2.5 text-sm p-3.5 rounded-lg border"
                      style={{
                        color: destructiveColor,
                        backgroundColor: destructiveBg,
                        borderColor: destructiveBorder,
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
                    style={{
                      backgroundColor: primaryColor,
                      color: '#ffffff',
                    }}
                  >
                    {content.action}
                  </button>
                  
                  {/* Login option */}
                  <div className="text-center">
                    <span className="text-sm" style={{ color: textMuted }}>
                      {content.loginText}{' '}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setShowAuthModal(true);
                      }}
                      className="text-sm font-medium transition-colors hover:underline"
                      style={{
                        color: primaryColor,
                      }}
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
