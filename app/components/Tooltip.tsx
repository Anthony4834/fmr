'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';
type TooltipAlign = 'start' | 'center' | 'end';

export default function Tooltip(props: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
  offsetPx?: number;
  maxWidthPx?: number;
}) {
  const side = props.side ?? 'bottom';
  const align = props.align ?? 'center';
  const offsetPx = props.offsetPx ?? 8;
  const maxWidthPx = props.maxWidthPx ?? 280;

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: TooltipSide;
    arrowLeft?: number;
    arrowTop?: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const computeCoords = (preferredSide: TooltipSide) => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return null;

    const r = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    if (preferredSide === 'left' || preferredSide === 'right') {
      // Vertical anchor for left/right
      let top: number;
      if (align === 'start') top = r.top;
      else if (align === 'end') top = r.bottom - tipRect.height;
      else top = r.top + r.height / 2 - tipRect.height / 2;

      const clampedTop = Math.max(pad, Math.min(top, vh - tipRect.height - pad));

      const leftPos = preferredSide === 'left' ? r.left - tipRect.width - offsetPx : r.right + offsetPx;
      const fitsLeft = leftPos >= pad;
      const fitsRight = leftPos + tipRect.width + pad <= vw;
      let placement = preferredSide;
      let finalLeft = leftPos;
      if (preferredSide === 'left' && !fitsLeft && fitsRight) {
        placement = 'right';
        finalLeft = r.right + offsetPx;
      } else if (preferredSide === 'right' && !fitsRight && fitsLeft) {
        placement = 'left';
        finalLeft = r.left - tipRect.width - offsetPx;
      }
      finalLeft = Math.max(pad, Math.min(finalLeft, vw - tipRect.width - pad));

      const triggerCenterY = r.top + r.height / 2;
      const arrowTop = triggerCenterY - clampedTop;

      return { top: clampedTop, left: finalLeft, placement, arrowTop };
    }

    // top / bottom
    let left: number;
    if (align === 'start') left = r.left;
    else if (align === 'end') left = r.right - tipRect.width;
    else left = r.left + r.width / 2 - tipRect.width / 2;

    const clampedLeft = Math.max(pad, Math.min(left, vw - tipRect.width - pad));
    const triggerCenterX = r.left + r.width / 2;
    const arrowLeft = triggerCenterX - clampedLeft;

    const topBottom = r.bottom + offsetPx;
    const topTop = r.top - offsetPx - tipRect.height;
    const fitsBottom = topBottom + tipRect.height + pad <= vh;
    const fitsTop = topTop >= pad;

    let placement: TooltipSide = preferredSide;
    if (preferredSide === 'bottom' && !fitsBottom && fitsTop) placement = 'top';
    if (preferredSide === 'top' && !fitsTop && fitsBottom) placement = 'bottom';

    const top = placement === 'bottom' ? Math.min(topBottom, vh - tipRect.height - pad) : Math.max(topTop, pad);

    return { top, left: clampedLeft, placement, arrowLeft };
  };

  // Close on Escape / outside click (helps on mobile click-to-toggle).
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
    };
  }, [open]);

  // Reposition on open + on scroll/resize (capture scroll from any container).
  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const next = computeCoords(side);
      if (next) setCoords(next);
    };

    // Initial position (after tooltip exists in DOM)
    update();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side, align, offsetPx]);

  const arrow = useMemo(() => {
    if (!coords) return null;
    const placement = coords.placement;
    const arrowSize = 8;

    if (placement === 'left' || placement === 'right') {
      const tooltipHeight = tooltipRef.current?.offsetHeight ?? 40;
      const arrowTop = coords.arrowTop ?? 0;
      const clampedArrowTop = Math.max(arrowSize, Math.min(arrowTop, tooltipHeight - arrowSize));
      return (
        <div
          className={`absolute top-0 w-2 h-2 rotate-45 ${placement === 'left' ? '-right-1' : '-left-1'}`}
          style={{ top: `${clampedArrowTop}px`, transform: 'translateY(-50%) rotate(45deg)', backgroundColor: 'var(--tooltip-bg)' }}
        />
      );
    }

    const arrowLeft = coords.arrowLeft ?? 0;
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 280;
    const clampedArrowLeft = Math.max(arrowSize, Math.min(arrowLeft, tooltipWidth - arrowSize));
    return placement === 'bottom' ? (
      <div
        className="absolute -top-1 w-2 h-2 rotate-45"
        style={{ left: `${clampedArrowLeft}px`, transform: 'translateX(-50%) rotate(45deg)', backgroundColor: 'var(--tooltip-bg)' }}
      />
    ) : (
      <div
        className="absolute -bottom-1 w-2 h-2 rotate-45"
        style={{ left: `${clampedArrowLeft}px`, transform: 'translateX(-50%) rotate(45deg)', backgroundColor: 'var(--tooltip-bg)' }}
      />
    );
  }, [coords]);

  const portal =
    mounted && open
      ? createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: 'fixed',
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              maxWidth: `${maxWidthPx}px`,
            }}
            className="z-[9999] pointer-events-none"
          >
            <div
            className="relative rounded-md text-xs px-2 py-1.5 shadow-lg whitespace-normal leading-snug"
            style={{ backgroundColor: 'var(--tooltip-bg)', color: 'var(--tooltip-text)' }}
          >
              {arrow}
              {props.content}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(e) => {
          // Toggle on tap/click; prevent immediate outside-click close
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        tabIndex={0}
        aria-label="Help"
      >
        {props.children}
      </span>
      {portal}
    </>
  );
}


