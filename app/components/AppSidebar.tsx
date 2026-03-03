'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Tooltip from './Tooltip';
import { useAnnouncements } from '@/app/hooks/useAnnouncements';
import { useNavItems, type NavItem } from '@/app/hooks/useNavItems';

const HOVER_SHOW_DELAY_MS = 0;

function formatAnnouncementDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const SIDEBAR_STORAGE_KEY = 'fmr-sidebar-collapsed';
const SIDEBAR_WIDTH_COLLAPSED = 56;
const SIDEBAR_WIDTH_EXPANDED = 248;

function AnnouncementsSidebarItem({
  linkClass,
  content,
  collapsed,
  isActive,
}: {
  linkClass: string;
  content: React.ReactNode;
  collapsed: boolean;
  isActive: boolean;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);
  const [popoverAnimatedIn, setPopoverAnimatedIn] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);

  const { announcements, loading } = useAnnouncements();
  const preview = announcements.slice(0, 3);

  useLayoutEffect(() => {
    if (!showPopover || !triggerRef.current || typeof document === 'undefined') {
      setPopoverRect(null);
      setPopoverAnimatedIn(false);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverRect({
      top: rect.top,
      left: rect.right + 12,
    });
    const raf = requestAnimationFrame(() => setPopoverAnimatedIn(true));
    return () => cancelAnimationFrame(raf);
  }, [showPopover]);

  const handleTriggerEnter = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => setShowPopover(true), HOVER_SHOW_DELAY_MS);
  };

  const handleTriggerLeave = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => setShowPopover(false), 150);
  };

  const handlePopoverEnter = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const handlePopoverLeave = () => {
    setShowPopover(false);
  };

  useEffect(() => () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const popoverContent =
    showPopover && popoverRect ? (
      <Link
        href="/announcements"
        className={`fixed z-[100] w-[280px] overflow-hidden rounded-lg border shadow-lg flex flex-col transition-opacity duration-150 ease-out ${
          popoverAnimatedIn ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          top: popoverRect.top,
          left: popoverRect.left,
          backgroundColor: 'var(--modal-bg)',
          borderColor: 'var(--modal-border)',
        }}
        onMouseEnter={handlePopoverEnter}
        onMouseLeave={handlePopoverLeave}
      >
        <div
          className="px-3 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--modal-border)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--modal-text-muted)' }}>
            Announcements
          </span>
        </div>
        <div className="p-2">
          {loading && preview.length === 0 ? (
            <div className="py-6 text-center text-sm" style={{ color: 'var(--modal-text-muted)' }}>Loading…</div>
          ) : preview.length === 0 ? (
            <div className="py-6 text-center text-sm" style={{ color: 'var(--modal-text-muted)' }}>No announcements.</div>
          ) : (
            <ul className="space-y-1">
              {preview.map((a) => (
                <li key={a.id}>
                  <span
                    className="block w-full text-left px-2 py-2 rounded-md text-sm transition-colors hover:bg-[var(--modal-hover)]"
                    style={{ color: 'var(--modal-text)' }}
                  >
                    <span className="font-medium block truncate" title={a.title}>
                      {a.title}
                    </span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--modal-text-muted)' }}>
                      {formatAnnouncementDate(a.publishedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div
            className="mt-1 rounded-md text-center py-2 text-sm font-medium transition-colors hover:bg-[var(--modal-hover)] border-t"
            style={{ color: 'var(--modal-text-muted)', borderColor: 'var(--modal-border)' }}
          >
            View all
          </div>
        </div>
      </Link>
    ) : null;

  return (
    <>
      <Link
        ref={triggerRef}
        href="/announcements"
        className={`relative ${linkClass}`}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        aria-current={isActive ? 'page' : undefined}
      >
        {content}
      </Link>
      {typeof document !== 'undefined' && popoverContent && createPortal(popoverContent, document.body)}
    </>
  );
}

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const showBadge =
    item.badge &&
    ((item.badge.type === 'dot') || (item.badge.type === 'count' && item.badge.value > 0));

  const content = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
        {item.icon}
      </span>
      {!collapsed && (
        <span className="flex flex-1 items-center gap-2 truncate transition-opacity duration-150">
          <span className="truncate">{item.label}</span>
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
        </span>
      )}
      {collapsed && showBadge && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--text-primary)]"
          aria-hidden
        />
      )}
    </>
  );

  const linkClass =
    'flex h-10 min-h-[2.5rem] w-full items-center gap-3 rounded-r-md pl-3 pr-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--modal-hover)] hover:text-[var(--text-primary)] ' +
    (isActive ? 'bg-[var(--modal-hover)] text-[var(--text-primary)]' : '');

  if (item.id === 'announcements') {
    return (
      <AnnouncementsSidebarItem linkClass={linkClass} content={content} collapsed={collapsed} isActive={isActive} />
    );
  }

  if (item.id === 'settings') {
    return (
      <Link href="/settings" className={`relative ${linkClass}`} aria-current={isActive ? 'page' : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <Link href={item.href} className={`relative ${linkClass}`} aria-current={isActive ? 'page' : undefined}>
      {content}
    </Link>
  );
}

export default function AppSidebar({
  collapsed,
  onCollapsedChange,
  isMobileDrawer = false,
  onDrawerClose,
}: {
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  isMobileDrawer?: boolean;
  onDrawerClose?: () => void;
}) {
  const pathname = usePathname();
  const { primaryItems, bottomItems, allItems } = useNavItems();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  };

  const activeIndex = allItems.findIndex((item) => isActive(item.href));
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const contentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    hover: { top: number; height: number } | null;
    active: { top: number; height: number } | null;
  }>({ hover: null, active: null });

  const updateIndicatorPositions = () => {
    const content = contentRef.current;
    if (!content) return;

    const measure = (index: number) => {
      const el = itemRefs.current[index];
      if (!el) return null;
      return { top: el.offsetTop, height: el.offsetHeight };
    };

    setIndicatorStyle({
      hover: hoveredIndex >= 0 ? measure(hoveredIndex) ?? null : null,
      active: activeIndex >= 0 ? measure(activeIndex) ?? null : null,
    });
  };

  useLayoutEffect(() => {
    updateIndicatorPositions();
  }, [hoveredIndex, activeIndex, collapsed, pathname]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const scrollEl = content.closest('nav');
    scrollEl?.addEventListener('scroll', updateIndicatorPositions);
    window.addEventListener('resize', updateIndicatorPositions);
    return () => {
      scrollEl?.removeEventListener('scroll', updateIndicatorPositions);
      window.removeEventListener('resize', updateIndicatorPositions);
    };
  }, [hoveredIndex, activeIndex]);

  const wrapWithTooltip = (node: React.ReactNode, label: string) =>
    collapsed ? (
      <Tooltip content={label} side="left">
        <span className="flex w-full">{node}</span>
      </Tooltip>
    ) : (
      node
    );

  return (
    <>
      <aside
        className="flex min-h-screen shrink-0 flex-col self-stretch border-r transition-[width] duration-150 ease-out"
        style={{
          width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
          backgroundColor: 'var(--modal-bg)',
          borderColor: 'var(--modal-divider)',
        }}
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        {/* Top: collapse toggle only */}
        <div
          className={`flex h-14 shrink-0 items-center border-b border-[var(--border-color)] px-2 ${collapsed && !isMobileDrawer ? 'justify-center' : 'justify-end'}`}
        >
          {isMobileDrawer && onDrawerClose ? (
            <button
              type="button"
              onClick={onDrawerClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--modal-hover)] hover:text-[var(--text-primary)]"
              aria-label="Close menu"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCollapsedChange(!collapsed)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--modal-hover)] hover:text-[var(--text-primary)]"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Primary nav */}
        <nav
          className="flex flex-1 flex-col min-h-0 overflow-y-auto px-2 py-3"
          aria-label="Main"
          onMouseLeave={() => setHoveredIndex(-1)}
        >
          <div ref={contentRef} className="relative flex flex-col gap-0.5">
            {/* Sliding indicators (Vercel-style) - inside scroll content so they move with it */}
            {indicatorStyle.hover != null && hoveredIndex !== activeIndex && (
              <div
                className="absolute left-0 z-10 w-[3px] rounded-r transition-all duration-200 ease-out pointer-events-none"
                style={{
                  top: indicatorStyle.hover.top,
                  height: indicatorStyle.hover.height,
                  backgroundColor: 'var(--text-tertiary)',
                  opacity: 0.5,
                }}
              />
            )}
            {indicatorStyle.active != null && (
              <div
                className="absolute left-0 z-10 w-[3px] rounded-r transition-all duration-200 ease-out pointer-events-none"
                style={{
                  top: indicatorStyle.active.top,
                  height: indicatorStyle.active.height,
                  backgroundColor: 'var(--text-primary)',
                }}
              />
            )}

            {primaryItems.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              className="relative z-0 flex items-center"
              onMouseEnter={() => setHoveredIndex(i)}
            >
              {wrapWithTooltip(
                <NavLink item={item} isActive={isActive(item.href)} collapsed={collapsed} />,
                item.label
              )}
            </div>
          ))}
          <div className="my-2 border-t border-[var(--border-color)]" role="separator" />
          {bottomItems.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[primaryItems.length + i] = el; }}
              className="relative z-0 flex items-center"
              onMouseEnter={() => setHoveredIndex(primaryItems.length + i)}
            >
              {item.id === 'announcements' ? (
                <NavLink item={item} isActive={isActive(item.href)} collapsed={collapsed} />
              ) : (
                wrapWithTooltip(
                  <NavLink item={item} isActive={isActive(item.href)} collapsed={collapsed} />,
                  item.label
                )
              )}
            </div>
          ))}
          </div>
        </nav>
      </aside>
    </>
  );
}

export { SIDEBAR_STORAGE_KEY, SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED };
