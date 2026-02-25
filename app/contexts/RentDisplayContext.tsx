'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export type RentDisplayMode = 'effective' | 'fmr';

interface RentDisplayContextType {
  rentDisplayMode: RentDisplayMode;
  setRentDisplayMode: (mode: RentDisplayMode) => Promise<void>;
  isLoading: boolean;
}

const RentDisplayContext = createContext<RentDisplayContextType>({
  rentDisplayMode: 'effective',
  setRentDisplayMode: async () => {},
  isLoading: false,
});

export function RentDisplayProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [rentDisplayMode, setRentDisplayModeState] = useState<RentDisplayMode>('effective');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch preference from DB when user logs in
  useEffect(() => {
    if (!session?.user) {
      setRentDisplayModeState('effective');
      return;
    }
    setIsLoading(true);
    fetch('/api/user/preferences')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.rentDisplayMode === 'effective' || data?.rentDisplayMode === 'fmr') {
          setRentDisplayModeState(data.rentDisplayMode);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [session?.user?.id]);

  const setRentDisplayMode = useCallback(async (mode: RentDisplayMode) => {
    setRentDisplayModeState(mode);
    if (!session?.user) return;
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentDisplayMode: mode }),
      });
    } catch {
      // Optimistic update already applied; ignore save failure
    }
  }, [session?.user?.id]);

  return (
    <RentDisplayContext.Provider value={{ rentDisplayMode, setRentDisplayMode, isLoading }}>
      {children}
    </RentDisplayContext.Provider>
  );
}

export function useRentDisplay() {
  return useContext(RentDisplayContext);
}
