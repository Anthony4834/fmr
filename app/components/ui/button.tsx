import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline';
  size?: 'default' | 'sm';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      default:
        'bg-[var(--primary-blue)] text-white border border-[var(--primary-blue)] hover:opacity-90',
      secondary:
        'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)]',
      outline:
        'bg-transparent text-[var(--text-primary)] border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]',
    };
    const sizeClasses = {
      default: 'min-h-9 px-4 py-2 rounded-md text-sm',
      sm: 'h-8 px-3 rounded-md text-xs',
    };
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary-blue)] disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
