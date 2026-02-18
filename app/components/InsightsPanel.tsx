'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface InsightsPanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  ariaLabel: string;
  id?: string;
  children: React.ReactNode;
  maxWidthPx?: number;
  maxHeightPx?: number;
  contentSpacing?: 'sm' | 'md';
}

const SM_BREAKPOINT = 640;

export default function InsightsPanel({
  open,
  onClose,
  anchorRef,
  ariaLabel,
  id,
  children,
  maxWidthPx = 360,
  maxHeightPx = 600,
  contentSpacing = 'sm',
}: InsightsPanelProps) {
  const spacingClass = contentSpacing === 'md' ? 'space-y-4' : 'space-y-3';
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [desktopPosition, setDesktopPosition] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = () => {
    if (typeof window === 'undefined') return;
    setIsMobile(window.innerWidth < SM_BREAKPOINT);
    if (window.innerWidth >= SM_BREAKPOINT && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setDesktopPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    } else {
      setDesktopPosition(null);
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const ro = new ResizeObserver(updatePosition);
    ro.observe(document.documentElement);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-20 bg-black/50 dark:bg-black/70"
      aria-hidden
      onClick={onClose}
    />
  );

  const panel = isMobile ? (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      className="fixed bottom-0 left-0 right-0 z-30 w-full max-h-[85vh] overflow-auto rounded-t-xl border-2 border-b-0 border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl"
      style={{ color: 'var(--text-primary)' }}
    >
      <div className={`px-6 py-4 ${spacingClass}`}>
        {children}
      </div>
    </div>
  ) : desktopPosition ? (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      className="fixed z-30 overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl"
      style={{
        top: desktopPosition.top,
        right: desktopPosition.right,
        width: `min(${maxWidthPx}px, calc(100vw - 2rem))`,
        maxHeight: `min(85vh, ${maxHeightPx}px)`,
        color: 'var(--text-primary)',
      }}
    >
      <div className={`p-4 ${spacingClass}`}>
        {children}
      </div>
    </div>
  ) : null;

  return createPortal(
    <>
      {overlay}
      {panel}
    </>,
    document.body
  );
}
