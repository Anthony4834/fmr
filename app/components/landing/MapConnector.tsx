'use client';

import { useEffect, useState } from 'react';

export default function MapConnector() {
  const [coords, setCoords] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const updateCoords = () => {
      const source = document.querySelector('.map-connector-source');
      const target = document.querySelector('.map-connector-target');
      const main = document.querySelector('main');
      
      if (!source || !target || !main) {
        setCoords(null);
        return;
      }

      // Get positions relative to main container
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();

      // Calculate positions relative to main container
      // Start from BOTTOM-CENTER of source card (horizontal center X, bottom edge Y)
      const startX = sourceRect.left + sourceRect.width / 2 - mainRect.left;
      const startY = sourceRect.bottom - mainRect.top;
      // End at left-center of target card (left edge, vertically centered)
      const endX = targetRect.left - mainRect.left;
      const endY = targetRect.top + targetRect.height / 2 - mainRect.top;

      setCoords({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY }
      });
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords);

    const timer = setTimeout(updateCoords, 500);
    const timer2 = setTimeout(updateCoords, 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords);
    };
  }, []);


  // Hide on mobile/tablet (lg breakpoint = 1024px)
  const [isMobile, setIsMobile] = useState(true);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!coords || isMobile) return null;

  // Path: Start (BOTTOM-CENTER of source) → down → turn left → down → End (left side of map)
  const dropDistance = 300; // Initial drop from bottom of source card (much further down)
  const leftOffset = 80; // How far left to go to avoid clipping through the map

  // 5 points: start at BOTTOM-CENTER, down, turn left, down to target Y, enter target
  const p1 = { x: coords.start.x, y: coords.start.y }; // Start: BOTTOM-CENTER (horizontal center X, bottom edge Y)
  const p2 = { x: coords.start.x, y: coords.start.y + dropDistance }; // Go DOWN from bottom-center
  const p3 = { x: coords.end.x - leftOffset, y: coords.start.y + dropDistance }; // Turn left (right angle), go far left
  const p4 = { x: coords.end.x - leftOffset, y: coords.end.y }; // Go down to target Y
  const p5 = { x: coords.end.x, y: coords.end.y }; // Enter target at left edge, vertically centered

  const allPoints = [p1, p2, p3, p4, p5];

  // Calculate bounding box
  const minX = Math.min(...allPoints.map(p => p.x)) - 20;
  const maxX = Math.max(...allPoints.map(p => p.x)) + 20;
  const minY = Math.min(...allPoints.map(p => p.y)) - 20;
  const maxY = Math.max(...allPoints.map(p => p.y)) + 20;
  const width = maxX - minX;
  const height = maxY - minY;

  // Adjust points relative to bounding box
  const adj = (p: { x: number; y: number }) => ({ x: p.x - minX, y: p.y - minY });
  const a1 = adj(p1);
  const a2 = adj(p2);
  const a3 = adj(p3);
  const a4 = adj(p4);
  const a5 = adj(p5);

  // Path: down → turn left → down → enter target
  const adjustedPathData = `M ${a1.x} ${a1.y} L ${a2.x} ${a2.y} L ${a3.x} ${a3.y} L ${a4.x} ${a4.y} L ${a5.x} ${a5.y}`;

  return (
    <div 
      className="absolute pointer-events-none" 
      style={{ 
        zIndex: 0,
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${width}px`,
        height: `${height}px`
      }}
    >
      <svg
        className="pointer-events-none w-full h-full"
        style={{ overflow: 'visible' }}
      >
        {/* Dashed line */}
        <path
          d={adjustedPathData}
          fill="none"
          stroke="rgb(230, 230, 230)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          strokeOpacity="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot at start */}
        <circle
          cx={a1.x}
          cy={a1.y}
          r="4"
          fill="hsl(192 85% 42%)"
          fillOpacity="0.12"
        />
        {/* Dot at end */}
        <circle
          cx={a5.x}
          cy={a5.y}
          r="4"
          fill="hsl(192 85% 42%)"
          fillOpacity="0.12"
        />
      </svg>
    </div>
  );
}
