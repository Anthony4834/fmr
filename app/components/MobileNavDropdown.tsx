'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavItems } from '@/app/hooks/useNavItems';

interface MobileNavDropdownProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function MobileNavDropdown({
  open,
  onClose,
  anchorRef,
}: MobileNavDropdownProps) {
  const pathname = usePathname();
  const { primaryItems, bottomItems } = useNavItems();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || typeof document === 'undefined') {
      setPosition(null);
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const panelWidth = Math.min(280, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    setPosition({
      top: rect.bottom + 8,
      left,
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !position) return null;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  };

  const linkClass =
    'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors w-full text-left rounded-md ' +
    'text-[var(--modal-text)] hover:bg-[var(--modal-hover)] ' +
    (isActive ? '' : '');

  const content = (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label="Main navigation"
        className="fixed z-50 w-[min(280px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border shadow-lg"
        style={{
          top: position.top,
          left: position.left,
          backgroundColor: 'var(--modal-bg)',
          borderColor: 'var(--modal-border)',
        }}
      >
        <div className="py-2">
          {primaryItems.map((item) => {
            const showBadge =
              item.badge &&
              ((item.badge.type === 'dot') || (item.badge.type === 'count' && item.badge.value > 0));

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                role="menuitem"
                className={`${linkClass} ${isActive(item.href) ? 'bg-[var(--modal-hover)]' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {showBadge && item.badge?.type === 'count' && (
                  <span className="flex shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--bg-primary)] min-w-[1.25rem]">
                    {(item.badge as { type: 'count'; value: number }).value}
                  </span>
                )}
                {showBadge && item.badge?.type === 'dot' && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--text-primary)]"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
          <div className="my-2 border-t border-[var(--modal-border)]" role="separator" />
          {bottomItems.map((item) => {
            const showBadge =
              item.badge &&
              ((item.badge.type === 'dot') || (item.badge.type === 'count' && item.badge.value > 0));

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                role="menuitem"
                className={`${linkClass} ${isActive(item.href) ? 'bg-[var(--modal-hover)]' : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {showBadge && item.badge?.type === 'count' && (
                  <span className="flex shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--bg-primary)] min-w-[1.25rem]">
                    {(item.badge as { type: 'count'; value: number }).value}
                  </span>
                )}
                {showBadge && item.badge?.type === 'dot' && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--text-primary)]"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
