'use client';

import { useRef, useState, useLayoutEffect, useEffect } from 'react';

export interface GeoTabBarProps {
  value: string;
  onChange: (tab: string) => void;
  tabs: readonly string[];
  getLabel: (tab: string) => string;
  className?: string;
}

export default function GeoTabBar({
  value,
  onChange,
  tabs,
  getLabel,
  className = 'relative flex gap-1 pb-0.5',
}: GeoTabBarProps) {
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabBarStyle, setTabBarStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const updateTabBar = () => {
      if (!tabBarRef.current || tabRefs.current.length === 0) return;
      const activeIndex = tabs.indexOf(value);
      const activeTabEl = tabRefs.current[activeIndex];
      const container = tabBarRef.current;
      if (!activeTabEl || !container) return;

      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTabEl.getBoundingClientRect();
      setTabBarStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });
    };

    requestAnimationFrame(() => updateTabBar());
    window.addEventListener('resize', updateTabBar);
    return () => window.removeEventListener('resize', updateTabBar);
  }, [value, tabs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tabBarRef.current && tabRefs.current.some(Boolean)) {
        const activeIndex = tabs.indexOf(value);
        const activeTabEl = tabRefs.current[activeIndex];
        const container = tabBarRef.current;
        if (activeTabEl && container) {
          const containerRect = container.getBoundingClientRect();
          const tabRect = activeTabEl.getBoundingClientRect();
          setTabBarStyle({
            left: tabRect.left - containerRect.left,
            width: tabRect.width,
          });
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={tabBarRef} className={className}>
      {tabs.map((tab, index) => (
        <button
          key={tab}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type="button"
          onClick={() => onChange(tab)}
          className={`px-3 py-2.5 sm:py-1.5 text-xs font-medium rounded transition-colors relative ${
            value === tab
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
          role="tab"
          aria-selected={value === tab}
        >
          {getLabel(tab)}
        </button>
      ))}
      <div
        className="absolute bottom-0 h-0.5 bg-[var(--text-primary)] transition-all duration-300 ease-out"
        style={{
          left: `${tabBarStyle.left}px`,
          width: `${tabBarStyle.width}px`,
        }}
      />
    </div>
  );
}
