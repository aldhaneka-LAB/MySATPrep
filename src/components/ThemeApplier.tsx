"use client";

/**
 * ThemeApplier
 *
 * Watches `userData.preferences.theme` in the Redux store and immediately
 * applies it to <html> by toggling the "dark" class. This runs whenever the
 * theme value changes — including right after `fetchUserData/fulfilled`
 * populates preferences from the server.
 *
 * For unauthenticated users whose theme is only in localStorage, reads it on
 * mount so dark mode is applied without requiring a visit to the preferences page.
 *
 * Renders nothing. Must be placed inside <ReduxProvider>.
 */

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserPreferences } from "@/lib/redux/selectors";

export function ThemeApplier() {
  const preferences = useAppSelector(selectUserPreferences);

  // On mount: apply theme from localStorage for unauthenticated users
  // (Redux won't have it yet, or ever, for users who haven't signed in)
  useEffect(() => {
    if (preferences?.theme) return; // Redux has it — the other effect handles it
    try {
      const raw = localStorage.getItem("userPreferences");
      if (raw) {
        const parsed = JSON.parse(raw) as { theme?: string };
        if (parsed.theme === "dark") {
          document.documentElement.classList.add("dark");
        } else if (parsed.theme === "light") {
          document.documentElement.classList.remove("dark");
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever Redux theme changes (authenticated user or after login), apply it
  useEffect(() => {
    const root = document.documentElement;
    if (preferences?.theme === "dark") {
      root.classList.add("dark");
    } else if (preferences?.theme === "light") {
      root.classList.remove("dark");
    }
    // If theme is undefined, leave whatever is already set (e.g. from localStorage)
  }, [preferences?.theme]);

  return null;
}
