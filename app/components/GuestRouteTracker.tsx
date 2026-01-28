'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const TRACK_PATH = '/api/track/guest-route';

export default function GuestRouteTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    // Fire-and-forget: do not await; do not block navigation or render
    fetch(TRACK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      credentials: 'same-origin',
    }).catch(() => {});
  }, [pathname]);

  return null;
}
