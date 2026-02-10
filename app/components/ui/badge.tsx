import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'secondary', ...props }, ref) => {
    const variantClasses = {
      default:
        'bg-[var(--primary-blue)] text-white border-transparent',
      secondary:
        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)]',
      outline:
        'bg-transparent text-[var(--text-secondary)] border-[var(--border-color)]',
    };
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium',
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
