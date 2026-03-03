'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const G_TIMEOUT_MS = 500;

const ROUTES: Record<string, string> = {
  s: '/',
  l: '/shortlist',
  e: '/explorer',
  m: '/map',
  i: '/insights',
};

function isInputElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
  const isEditable = el.isContentEditable || role === 'textbox' || role === 'searchbox';
  return isInput || isEditable;
}

export function useSidebarKeyboardShortcuts(
  hasSidebar: boolean,
  collapsed: boolean,
  onCollapsedChange: (value: boolean) => void,
  shortlistEnabled = false
) {
  const router = useRouter();
  const lastGRef = useRef<number>(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!hasSidebar) return;
      if (isInputElement(e.target as EventTarget)) return;

      const key = e.key.toLowerCase();

      // [ or ] toggle collapse
      if (key === '[' || key === ']') {
        e.preventDefault();
        onCollapsedChange(!collapsed);
        return;
      }

      // g then s/l/e/m/i: navigate
      if (key === 'g') {
        lastGRef.current = Date.now();
        return;
      }

      const route = ROUTES[key];
      if (!route || Date.now() - lastGRef.current >= G_TIMEOUT_MS) return;
      if (key === 'l' && !shortlistEnabled) return;

      e.preventDefault();
      lastGRef.current = 0;
      router.push(route);
    },
    [hasSidebar, collapsed, onCollapsedChange, router, shortlistEnabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
