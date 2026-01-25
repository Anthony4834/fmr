'use client';

import { useEffect, useState } from 'react';
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
  
  // Check if reset is today or tomorrow
  const resetDateStr = resetDate.toDateString();
  const todayStr = now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toDateString();
  
  const timeStr = resetDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  if (resetDateStr === todayStr) {
    return `Resets today at ${timeStr}`;
  } else if (resetDateStr === tomorrowStr) {
    return `Resets tomorrow at ${timeStr}`;
  } else {
    // Format as "Resets on [Day], [Month] [Date] at [Time]"
    const dateStr = resetDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return `Resets on ${dateStr} at ${timeStr}`;
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

  // Theme-aware colors matching landing page
  const bgOverlay = isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
  const cardBg = isDark ? 'hsl(220 15% 12%)' : '#ffffff';
  const borderColor = isDark ? 'hsl(0 0% 20%)' : 'hsl(220 15% 88%)';
  const textForeground = isDark ? 'hsl(0 0% 98%)' : 'hsl(220 30% 12%)';
  const textMuted = isDark ? 'hsl(0 0% 60%)' : 'hsl(220 15% 45%)';
  const primaryColor = 'hsl(192 85% 42%)';
  const primaryHover = 'hsl(192 85% 38%)';
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50"
      style={{ backgroundColor: bgOverlay }}
      onClick={onClose}
    >
      <div 
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-lg"
        style={{ 
          backgroundColor: cardBg,
          borderColor: borderColor,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div 
          className="border-b p-6 flex flex-col items-center text-center sm:text-left sm:flex-row sm:items-start gap-5"
          style={{ 
            backgroundColor: cardBg,
            borderColor: borderColor,
          }}
        >
          <div 
            className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border"
            style={{
              backgroundColor: accentBg,
              borderColor: accentBorder,
            }}
          >
            <LockIcon className="w-6 h-6" style={{ color: primaryColor }} />
          </div>

          <div className="space-y-1.5 flex-1">
            <h2 
              className="text-xl font-display font-bold"
              style={{ color: textForeground }}
            >
              {content.title}
            </h2>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: textMuted }}
            >
              {content.description}
            </p>
          </div>
        </div>

        {/* Body Section */}
        <div className="p-6 space-y-6" style={{ backgroundColor: cardBg }}>
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span 
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: textMuted }}
              >
                Daily Usage
              </span>
              <div className="text-right">
                <span 
                  className="text-sm font-medium tabular-nums"
                  style={{ color: isLimitReached ? destructiveColor : textForeground }}
                >
                  {currentUsage}
                </span>
                <span className="text-sm mx-1" style={{ color: textMuted }}>/</span>
                <span className="text-sm tabular-nums" style={{ color: textMuted }}>{limit}</span>
              </div>
            </div>
            
            {/* Progress bar */}
            <div 
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: secondaryBg }}
            >
              <div 
                className="h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${progress}%`,
                  backgroundColor: isLimitReached ? destructiveColor : primaryColor,
                }}
              />
            </div>
            
            {isLimitReached && resetTime && (
              <div 
                className="flex items-start gap-2 text-xs p-3 rounded-md border"
                style={{
                  color: destructiveColor,
                  backgroundColor: destructiveBg,
                  borderColor: destructiveBorder,
                }}
              >
                <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-medium">Queries paused. {formatResetTime(resetTime)}.</span>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2">
            {/* Create account button - primary */}
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setShowAuthModal(true);
              }}
              className="w-full px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:opacity-90 text-sm sm:text-base"
              style={{
                backgroundColor: primaryColor,
                color: '#ffffff',
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                boxShadow: `0 4px 14px ${primaryColor}40`,
              }}
            >
              {content.action}
            </button>
            
            {/* Login option */}
            <div className="text-center">
              <span className="text-xs sm:text-sm" style={{ color: textMuted }}>
                {content.loginText}{' '}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="text-xs sm:text-sm font-medium transition-colors hover:underline"
                style={{
                  color: primaryColor,
                }}
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />
    </div>
  );
}
