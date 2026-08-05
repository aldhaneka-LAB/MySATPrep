"use client";

import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants2 } from "@/components/ui/banner";

export interface Announcement {
  id: string;
  content: React.ReactNode;
}

interface AnnouncementBannerProps {
  announcements: Announcement[];
  /** ms between slides — default 4000 */
  interval?: number;
  height?: string;
  className?: string;
  rainbowColors?: string[];
  /** Storage key prefix — dismissed banners are remembered per-id */
  storagePrefix?: string;
}

const maskImage =
  "linear-gradient(to bottom,white,transparent), radial-gradient(circle at top center, white, transparent)";

function RainbowFlow({ colors }: { colors: string[] }) {
  return (
    <>
      <div
        className="absolute inset-0 z-[-1]"
        style={
          {
            maskImage,
            maskComposite: "intersect",
            animation: "fd-moving-banner 20s linear infinite",
            backgroundImage: `repeating-linear-gradient(70deg, ${[...colors, colors[0]].map((color, i) => `${color} ${(i * 50) / colors.length}%`).join(", ")})`,
            backgroundSize: "200% 100%",
            filter: "saturate(2)",
          } as React.CSSProperties
        }
      />
      <style>{`
        @keyframes fd-moving-banner {
          from { background-position: 0% 0; }
          to   { background-position: 100% 0; }
        }
        @keyframes slide-up-in {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes slide-up-out {
          from { transform: translateY(0);     opacity: 1; }
          to   { transform: translateY(-100%); opacity: 0; }
        }
        .announce-enter { animation: slide-up-in  0.45s cubic-bezier(0.4,0,0.2,1) forwards; }
        .announce-exit  { animation: slide-up-out 0.45s cubic-bezier(0.4,0,0.2,1) forwards; }
      `}</style>
    </>
  );
}

export function AnnouncementBanner({
  announcements,
  interval = 4000,
  height = "3rem",
  className,
  rainbowColors = [
    "rgba(255,210,50,0.77)",
    "rgba(255,210,50,0.77)",
    "transparent",
    "rgba(255,210,50,0.77)",
    "transparent",
    "rgba(255,210,50,0.77)",
    "transparent",
  ],
  storagePrefix = "nd-banner",
}: AnnouncementBannerProps) {
  // Filter out already-dismissed announcements
  const [visible, setVisible] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState(0);
  const [animState, setAnimState] = useState<"idle" | "exit" | "enter">("idle");
  const [dismissed, setDismissed] = useState(false);

  // Initialise from localStorage on mount (client-only)
  useEffect(() => {
    const remaining = announcements.filter(
      (a) => localStorage.getItem(`${storagePrefix}-${a.id}`) !== "true",
    );
    setVisible(remaining);
  }, [announcements, storagePrefix]);

  // Auto-cycle
  useEffect(() => {
    if (visible.length <= 1 || dismissed) return;

    const timer = setInterval(() => {
      // start exit animation
      setAnimState("exit");

      setTimeout(() => {
        setCurrent((c) => (c + 1) % visible.length);
        setAnimState("enter");

        // reset to idle after enter animation completes
        setTimeout(() => setAnimState("idle"), 460);
      }, 460);
    }, interval);

    return () => clearInterval(timer);
  }, [visible.length, interval, dismissed]);

  const handleDismiss = useCallback(() => {
    if (!visible[current]) return;
    const id = visible[current].id;
    localStorage.setItem(`${storagePrefix}-${id}`, "true");

    const next = visible.filter((_, i) => i !== current);
    if (next.length === 0) {
      setDismissed(true);
      setVisible([]);
      return;
    }
    setCurrent((c) => (c >= next.length ? 0 : c));
    setVisible(next);
    setAnimState("enter");
    setTimeout(() => setAnimState("idle"), 460);
  }, [visible, current, storagePrefix]);

  if (dismissed || visible.length === 0) return null;

  const activeAnnouncement = visible[current];

  return (
    <div
      className={cn(
        "sticky top-0 z-40 flex flex-row items-center justify-center overflow-hidden px-4 text-center text-sm font-medium bg-fd-background",
        className,
      )}
      style={{ height }}
    >
      <RainbowFlow colors={rainbowColors} />

      {/* Dot indicators — only shown when there are multiple */}
      {visible.length > 1 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
          {visible.map((_, i) => (
            <span
              key={i}
              className={cn(
                "block h-1 w-1 rounded-full transition-colors duration-300",
                i === current ? "bg-foreground/70" : "bg-foreground/20",
              )}
            />
          ))}
        </div>
      )}

      {/* Animated announcement text */}
      <span
        key={activeAnnouncement.id}
        className={cn(
          "block",
          animState === "exit" && "announce-exit",
          animState === "enter" && "announce-enter",
        )}
      >
        {activeAnnouncement.content}
      </span>

      {/* Dismiss button */}
      <button
        type="button"
        aria-label="Close announcement"
        onClick={handleDismiss}
        className={cn(
          buttonVariants2({
            variant: "ghost",
            size: "icon",
          }),
          "absolute end-2 md:end-20 top-1/2 -translate-y-1/2 text-fd-muted-foreground/50 cursor-pointer",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
