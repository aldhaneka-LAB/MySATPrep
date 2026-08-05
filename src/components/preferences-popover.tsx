"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectUserPreferences,
  selectIsAuthenticated,
} from "@/lib/redux/selectors";
import { debouncedSavePreferences } from "@/lib/utils/dataSync";
import { updatePreferences } from "@/lib/redux/slices/userDataSlice";
import type { UserPreferences } from "@/lib/types/userData";
import type { RootState } from "@/lib/redux/store";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Settings2Icon,
  SunIcon,
  MoonIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

type Theme = "light" | "dark";

/**
 * Fixed floating settings button in the bottom-right corner.
 * Hovering anywhere on the container (button + panel) keeps the panel open.
 * Uses pointer-events on the panel only when visible so it never blocks
 * underlying content when closed.
 */
export function FloatingPreferencesButton() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const reduxPrefs = useAppSelector(selectUserPreferences);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const [open, setOpen] = useState(false);

  // ── Resolve initial values ─────────────────────────────────────────────

  const resolveInitial = <T,>(key: keyof UserPreferences, fallback: T): T => {
    if (reduxPrefs?.[key] !== undefined) return reduxPrefs[key] as T;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("userPreferences");
        if (raw) {
          const parsed: UserPreferences = JSON.parse(raw);
          if (parsed[key] !== undefined) return parsed[key] as T;
        }
      } catch {
        // ignore
      }
    }
    return fallback;
  };

  const [theme, setTheme] = useState<Theme>(() =>
    resolveInitial<Theme>("theme", "light"),
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    resolveInitial<boolean>("soundEnabled", true),
  );

  // Sync from Redux after auth loads
  useEffect(() => {
    if (!reduxPrefs) return;
    if (reduxPrefs.theme) setTheme(reduxPrefs.theme as Theme);
    if (reduxPrefs.soundEnabled !== undefined)
      setSoundEnabled(reduxPrefs.soundEnabled);
  }, [reduxPrefs]);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    theme === "dark"
      ? root.classList.add("dark")
      : root.classList.remove("dark");
  }, [theme]);

  // ── Persist helper ─────────────────────────────────────────────────────

  const persist = (patch: Partial<UserPreferences>) => {
    const next: UserPreferences = {
      ...reduxPrefs,
      theme,
      soundEnabled,
      ...patch,
    };
    dispatch(updatePreferences(next));
    // Read state lazily so we don't subscribe to the entire store
    debouncedSavePreferences(next, dispatch, store.getState());
  };

  const handleThemeToggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    persist({ theme: next });
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    persist({ soundEnabled: enabled });
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    /*
     * The outer div is the single hover target. It's always sized to include
     * both the panel area and the button — we do this by making it a flex
     * column and giving the panel a fixed height slot (via min-h) so there's
     * no gap between the invisible panel and the button.
     * onMouseEnter/Leave on this single element is reliable.
     */
    <div
      onMouseLeave={() => setOpen(false)}
      className="fixed bottom-6 right-6 z-[300] flex flex-col items-end"
    >
      {/* Panel — always in layout flow above the button, hidden via opacity/scale */}
      <div
        className={`
          mb-2 w-64 rounded-2xl border border-border bg-background shadow-xl
          transition-all duration-200 origin-bottom-right
          ${
            open
              ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
              : "opacity-0 scale-95 translate-y-1 pointer-events-none"
          }
        `}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border rounded-t-2xl bg-muted/40">
          <p className="text-sm font-semibold">Quick Preferences</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Saved automatically
            {!isAuthenticated && (
              <span className="text-yellow-600 dark:text-yellow-400">
                {" · "}Sign in to sync
              </span>
            )}
          </p>
        </div>

        {/* Settings rows */}
        <div className="p-3 space-y-1">
          {/* Theme */}
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  theme === "dark"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {theme === "dark" ? (
                  <MoonIcon className="h-3.5 w-3.5" />
                ) : (
                  <SunIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <div>
                <Label
                  htmlFor="fpref-theme"
                  className="text-sm font-medium cursor-pointer"
                >
                  {theme === "dark" ? "Dark mode" : "Light mode"}
                </Label>
                <p className="text-xs text-muted-foreground leading-tight">
                  {theme === "dark" ? "Switch to light" : "Switch to dark"}
                </p>
              </div>
            </div>
            <Switch
              id="fpref-theme"
              checked={theme === "dark"}
              onCheckedChange={handleThemeToggle}
              aria-label="Toggle dark mode"
            />
          </div>

          <Separator />

          {/* Sound */}
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  soundEnabled
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {soundEnabled ? (
                  <Volume2Icon className="h-3.5 w-3.5" />
                ) : (
                  <VolumeXIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <div>
                <Label
                  htmlFor="fpref-sound"
                  className="text-sm font-medium cursor-pointer"
                >
                  Sound effects
                </Label>
                <p className="text-xs text-muted-foreground leading-tight">
                  {soundEnabled ? "Sounds are on" : "Sounds are muted"}
                </p>
              </div>
            </div>
            <Switch
              id="fpref-sound"
              checked={soundEnabled}
              onCheckedChange={handleSoundToggle}
              aria-label="Toggle sound effects"
            />
          </div>
        </div>

        {/* Footer */}
        {/* <div className="border-t border-border px-4 py-2.5 rounded-b-2xl">
          <a
            href="/dashboard/preferences"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline underline-offset-2"
          >
            All preferences →
          </a>
        </div> */}
      </div>

      {/* Floating trigger button */}
      <button
        onMouseEnter={() => setOpen(true)}
        type="button"
        aria-label="Quick preferences"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-background border border-border shadow-lg hover:shadow-xl text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
      >
        <Settings2Icon className="h-5 w-5" />
      </button>
    </div>
  );
}
