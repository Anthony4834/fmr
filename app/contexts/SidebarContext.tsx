'use client';

import { createContext, useContext } from 'react';

export interface SidebarContextValue {
  hasSidebar: boolean;
}

export const SidebarContext = createContext<SidebarContextValue>({ hasSidebar: false });

export function useSidebar() {
  return useContext(SidebarContext);
}
