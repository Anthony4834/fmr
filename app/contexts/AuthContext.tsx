'use client';

import { SessionProvider } from 'next-auth/react';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Auth context provider that wraps NextAuth's SessionProvider.
 * This enables useSession() hook throughout the app.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <SessionProvider>{children}</SessionProvider>
  );
}
