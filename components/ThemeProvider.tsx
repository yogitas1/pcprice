'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem('pcprice-theme') as Theme) ?? 'dark';
    setThemeState(stored);
    document.documentElement.setAttribute('data-theme', stored);
    setMounted(true);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('pcprice-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  // Avoid flash: render children even before mount (server renders dark by default)
  return (
    <ThemeContext.Provider value={{ theme: mounted ? theme : 'dark', setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
