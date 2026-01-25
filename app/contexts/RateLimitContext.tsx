'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import RateLimitModal from '@/app/components/RateLimitModal';

interface RateLimitContextType {
  isRateLimited: boolean;
  resetTime: number | null;
  showRateLimitModal: (resetTime: number) => void;
  dismissModal: () => void;
}

export const RateLimitContext = createContext<RateLimitContextType | undefined>(undefined);

export function RateLimitProvider({ children }: { children: React.ReactNode }) {
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [resetTime, setResetTime] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const showRateLimitModal = useCallback((resetTimestamp: number) => {
    setResetTime(resetTimestamp);
    setIsRateLimited(true);
    setIsModalOpen(true);
  }, []);

  const dismissModal = useCallback(() => {
    setIsModalOpen(false);
    // Keep resetTime and isRateLimited set so we can show it again if needed
  }, []);

  // Listen for rate limit events from fetch interceptor
  useEffect(() => {
    const handleRateLimitExceeded = (event: CustomEvent<{ resetTime: number }>) => {
      showRateLimitModal(event.detail.resetTime);
    };

    window.addEventListener('rate-limit-exceeded', handleRateLimitExceeded as EventListener);

    return () => {
      window.removeEventListener('rate-limit-exceeded', handleRateLimitExceeded as EventListener);
    };
  }, [showRateLimitModal]);

  // Global fetch interceptor - catches 429 from any fetch() call
  // Note: An inline script in layout.tsx sets this up earlier for direct navigation,
  // but we set it up here too to ensure it's active after React hydration
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;

    window.fetch = async function (input, init) {
      // Extract URL from input (handles string, URL, or Request object)
      let url: string | null = null;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input instanceof Request) {
        url = input.url;
      }

      const response = await originalFetch(input, init);

      // Only intercept our API routes (not external APIs)
      // Check for relative URLs starting with /api/ or absolute URLs containing /api/
      const isApiRoute = url && (url.startsWith('/api/') || url.includes('/api/'));
      
      if (response.status === 429 && isApiRoute) {
        try {
          const resetTimeHeader = response.headers.get('X-RateLimit-Reset');
          
          if (resetTimeHeader) {
            const resetTime = parseInt(resetTimeHeader, 10);
            if (!isNaN(resetTime) && resetTime > 0) {
              // Dispatch event to trigger modal
              window.dispatchEvent(
                new CustomEvent('rate-limit-exceeded', {
                  detail: { resetTime },
                })
              );
            }
          }
        } catch (error) {
          console.error('Error handling rate limit:', error);
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <RateLimitContext.Provider
      value={{
        isRateLimited,
        resetTime,
        showRateLimitModal,
        dismissModal,
      }}
    >
      {children}
      <RateLimitModal isOpen={isModalOpen} onClose={dismissModal} resetTime={resetTime} />
    </RateLimitContext.Provider>
  );
}

export function useRateLimit() {
  const context = useContext(RateLimitContext);
  if (context === undefined) {
    throw new Error('useRateLimit must be used within a RateLimitProvider');
  }
  return context;
}
