'use client';

import { SessionProvider } from 'next-auth/react';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth context provider that wraps NextAuth's SessionProvider.
 * This enables useSession() hook throughout the app.
 * 
 * refetchInterval: Refetch session every 30 seconds to pick up role/tier changes
 * made in the admin dashboard. This ensures the UI updates when a user's role
 * is changed without requiring a full page refresh or sign-out.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <SessionProvider refetchInterval={30}>{children}</SessionProvider>
  );
}
