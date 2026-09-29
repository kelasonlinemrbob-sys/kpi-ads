"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  dark: boolean;
  /** What the user picked; "system" follows the OS setting. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function getStoredTheme() {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "dark" || theme === "light" ? theme : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = React.useState(false);
  const [mode, setModeState] = React.useState<ThemeMode>("system");

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const storedTheme = getStoredTheme();
      const nextDark = storedTheme ? storedTheme === "dark" : media.matches;
      applyTheme(nextDark);
      setDark(nextDark);
      setModeState(storedTheme ?? "system");
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme") syncTheme();
    };
    const handleSystemTheme = () => {
      if (!getStoredTheme()) syncTheme();
    };

    syncTheme();
    window.addEventListener("storage", handleStorage);
    media.addEventListener("change", handleSystemTheme);
    return () => {
      window.removeEventListener("storage", handleStorage);
      media.removeEventListener("change", handleSystemTheme);
    };
  }, []);

  const setMode = React.useCallback((next: ThemeMode) => {
    const nextDark = next === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : next === "dark";
    applyTheme(nextDark);
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    setDark(nextDark);
    setModeState(next);
  }, []);

  const toggle = React.useCallback(() => {
    setMode(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setMode]);

  return (
    <ThemeContext.Provider value={{ dark, mode, setMode, toggle }}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster theme={dark ? "dark" : "light"} position="top-right" richColors closeButton />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = React.useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
