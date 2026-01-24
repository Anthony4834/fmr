'use client';

import { useEffect, useState } from 'react';

export default function CalculatorConnector() {
  const [coords, setCoords] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const updateCoords = () => {
      const source = document.querySelector('.calculator-connector-source');
      const target = document.querySelector('.calculator-connector-target');
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
      // Start from RIGHT-CENTER of source card (right edge X, vertical center Y)
      const startX = sourceRect.right - mainRect.left;
      const startY = sourceRect.top + sourceRect.height / 2 - mainRect.top;
      // End at right-center of target card (right edge, vertically centered)
      const endX = targetRect.right - mainRect.left;
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

  // Remove connectors completely - they're causing issues on desktop
  return null;
  
  if (!coords || isMobile) return null;

  // Path: Start (RIGHT-CENTER of source) → right → down → right past target → left into target
  const rightExtension = 80; // How far right past the target before coming back in (about 8 dashes)

  // 5 points: start at RIGHT-CENTER, go right past target, go down to target Y, come back left to enter target
  const p1 = { x: coords.start.x, y: coords.start.y }; // Start: RIGHT-CENTER (right edge X, vertical center Y)
  const p2 = { x: coords.end.x + rightExtension, y: coords.start.y }; // Go RIGHT horizontally past the target
  const p3 = { x: coords.end.x + rightExtension, y: coords.end.y }; // Go DOWN vertically to target Y level
  const p4 = { x: coords.end.x, y: coords.end.y }; // Come back LEFT to enter target at right edge

  const allPoints = [p1, p2, p3, p4];

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

  // Path: right → down → enter target
  const adjustedPathData = `M ${a1.x} ${a1.y} L ${a2.x} ${a2.y} L ${a3.x} ${a3.y} L ${a4.x} ${a4.y}`;

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
          cx={a4.x}
          cy={a4.y}
          r="4"
          fill="hsl(192 85% 42%)"
          fillOpacity="0.12"
        />
      </svg>
    </div>
  );
}
