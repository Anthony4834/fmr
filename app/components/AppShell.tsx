'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Menu } from 'lucide-react';
import { SidebarContext } from '@/app/contexts/SidebarContext';
import AppSidebar, { SIDEBAR_STORAGE_KEY } from './AppSidebar';
import MobileNavDropdown from './MobileNavDropdown';
import FooterV2 from './landing/FooterV2';
import { useSidebarKeyboardShortcuts } from '@/app/hooks/useSidebarKeyboardShortcuts';
import { useToggles } from '@/app/contexts/TogglesContext';

const MOBILE_BREAKPOINT_PX = 768;

function getStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return v === 'true';
  } catch {
    return true;
  }
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const [collapsed, setCollapsedState] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCollapsedState(getStoredCollapsed());
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
    } catch {}
  }, []);

  const toggles = useToggles();
  useSidebarKeyboardShortcuts(true, collapsed, setCollapsed, toggles?.shortlist === true);

  const mainContent = (
    <>
      <div className="flex-1 min-h-0 min-w-0 overflow-auto">{children}</div>
      <FooterV2 />
    </>
  );

  if (isMobile) {
    return (
      <SidebarContext.Provider value={{ hasSidebar: true }}>
        <div className="flex min-h-screen w-full flex-col">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-3">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
          </header>
          <main className="flex flex-1 flex-col min-w-0">
            {mainContent}
          </main>

          <MobileNavDropdown
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={hamburgerRef}
          />
        </div>
      </SidebarContext.Provider>
    );
  }

  return (
    <SidebarContext.Provider value={{ hasSidebar: true }}>
      <div className="flex min-h-screen w-full">
        <AppSidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <main className="flex flex-1 flex-col min-w-0 min-h-0">
          {mainContent}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
