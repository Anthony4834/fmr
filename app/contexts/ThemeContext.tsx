'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark'; // The actual theme being used (resolves 'system')
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize from localStorage immediately if available
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('theme') as Theme | null;
        return stored || 'system';
      } catch {
        return 'system';
      }
    }
    return 'system';
  });
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const initialTheme = stored || 'system';
    setThemeState(initialTheme);

    // Apply theme to document (backup in case inline script didn't run)
    const effective = getEffectiveTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', effective);

    setMounted(true);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const effective = getSystemTheme();
        document.documentElement.setAttribute('data-theme', effective);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  // Update document when theme changes
  useEffect(() => {
    if (mounted) {
      const effective = getEffectiveTheme(theme);
      document.documentElement.setAttribute('data-theme', effective);
      localStorage.setItem('theme', theme);
    }
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    // Toggle between light and dark, skipping system
    setThemeState((prev) => {
      if (prev === 'system') return 'light';
      return prev === 'light' ? 'dark' : 'light';
    });
  };

  const effectiveTheme = getEffectiveTheme(theme);

  // Prevent flash of unstyled content
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
