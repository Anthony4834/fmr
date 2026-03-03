'use client';

import {
  Search,
  List,
  Compass,
  Map,
  TrendingUp,
  Megaphone,
  Settings,
} from 'lucide-react';
import { useAnnouncements } from '@/app/hooks/useAnnouncements';
import { useShortlistCount } from '@/app/hooks/useShortlistCount';
import { useToggles } from '@/app/contexts/TogglesContext';

export type NavItemId =
  | 'search'
  | 'shortlist'
  | 'explorer'
  | 'map'
  | 'insights'
  | 'announcements'
  | 'settings';

export interface NavItemBase {
  id: NavItemId;
  label: string;
  href: string;
  icon: React.ReactNode;
}

export interface NavItemWithDotBadge extends NavItemBase {
  badge?: { type: 'dot' };
}

export interface NavItemWithCountBadge extends NavItemBase {
  badge?: { type: 'count'; value: number };
}

export type NavItem = NavItemWithDotBadge | NavItemWithCountBadge;

export function useNavItems() {
  const shortlistCount = useShortlistCount();
  const toggles = useToggles();
  const { hasUnread } = useAnnouncements();
  const shortlistEnabled = toggles?.shortlist === true;

  const primaryItems: NavItem[] = [
    { id: 'search', label: 'Search', href: '/', icon: <Search className="h-5 w-5" /> },
    ...(shortlistEnabled
      ? [{
          id: 'shortlist' as const,
          label: 'Shortlist',
          href: '/shortlist',
          icon: <List className="h-5 w-5" />,
          badge: shortlistCount > 0 ? { type: 'count' as const, value: shortlistCount } : undefined,
        }]
      : []),
    { id: 'explorer', label: 'Explorer', href: '/explorer', icon: <Compass className="h-5 w-5" /> },
    { id: 'map', label: 'Map', href: '/map', icon: <Map className="h-5 w-5" /> },
    { id: 'insights', label: 'Insights', href: '/insights', icon: <TrendingUp className="h-5 w-5" /> },
  ];

  const bottomItems: NavItem[] = [
    {
      id: 'announcements',
      label: 'Announcements',
      href: '/announcements',
      icon: <Megaphone className="h-5 w-5" />,
      badge: hasUnread ? { type: 'dot' } : undefined,
    },
    { id: 'settings', label: 'Settings', href: '/settings', icon: <Settings className="h-5 w-5" /> },
  ];

  return { primaryItems, bottomItems, allItems: [...primaryItems, ...bottomItems] };
}
