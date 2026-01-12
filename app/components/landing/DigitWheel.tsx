import { useId } from 'react';

interface DigitWheelProps {
  targetDigit: number;
  delay: number;
  isFirstAnimation?: boolean;
  previousDigit?: number;
}

export function DigitWheel({ targetDigit, delay, previousDigit }: DigitWheelProps) {
  // Position 0 = X, positions 1-10 = digits 0-9
  const targetPosition = targetDigit + 1;
  const initialPosition = previousDigit !== undefined ? previousDigit + 1 : 0;
  
  // Generate unique ID for this component's animation
  const id = useId().replace(/:/g, '');

  const items = ['X', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const startY = -initialPosition * 1.1;
  const endY = -targetPosition * 1.1;
  const animDelay = delay + 150;

  return (
    <div
      className="relative h-[1.1em] overflow-hidden inline-block"
      style={{ width: '0.6em' }}
    >
      <style>{`
        @keyframes roll-${id} {
          0% { transform: translateY(${startY}em); }
          100% { transform: translateY(${endY}em); }
        }
        .wheel-${id} {
          transform: translateY(${startY}em);
          animation: roll-${id} 1000ms cubic-bezier(0.16, 1, 0.3, 1) ${animDelay}ms forwards;
        }
      `}</style>
      <div
        className={`wheel-${id}`}
        style={{
          fontFamily: 'var(--font-display), system-ui, sans-serif',
        }}
      >
        {items.map((item, i) => (
          <div 
            key={i} 
            className="h-[1.1em] flex items-center justify-center font-bold tabular-nums"
            style={{
              fontFamily: 'var(--font-display), system-ui, sans-serif',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
