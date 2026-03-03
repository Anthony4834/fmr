'use client';

import { createContext, useContext, ReactNode } from 'react';

export type TierKey = 'off' | 'admin' | 'users' | 'ga';

/** Computed boolean per feature for current actor. */
const TogglesContext = createContext<Record<string, boolean>>({});

export function TogglesProvider({
  toggles,
  children,
}: {
  toggles: Record<string, boolean>;
  children: ReactNode;
}) {
  return (
    <TogglesContext.Provider value={toggles ?? {}}>
      {children}
    </TogglesContext.Provider>
  );
}

export function useToggles(): Record<string, boolean> {
  return useContext(TogglesContext) ?? {};
}
