"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const THEME_STORAGE_KEY = "fourty-theme";

type ThemeState = { dark: boolean; toggle: () => void };

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Dark mode lives on `documentElement.classList` (the `dark` custom variant in
 * globals.css) and is mirrored into localStorage. This provider exists so more
 * than one control can read and flip it — the sidebar account menu and the
 * mobile top bar both do.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context)
    throw new Error("useTheme must be used within a ThemeProvider.");
  return context;
}
