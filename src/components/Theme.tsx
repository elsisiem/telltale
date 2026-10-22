"use client";

import { useEffect, useState } from "react";
import { cx } from "./format";
import { THEME_KEY } from "./theme-script";

// Light/dark theme. The choice is per browser (localStorage); with none saved, the system
// preference decides (see theme-script.ts, which runs before paint).

type Theme = "light" | "dark";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    setTheme(next);
  };
  return [theme, toggle];
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="5.5" y="5.5" width="5" height="5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  );
}

/** Sidebar row (or compact icon when collapsed) that flips the theme. */
export function ThemeToggle({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cx("flex h-10 shrink-0 items-center gap-2 border-t border-line font-mono text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-ink", collapsed ? "justify-center" : "px-3.5", className)}
    >
      <ThemeIcon dark={dark} />
      {!collapsed && (
        <>
          {dark ? "Dark mode" : "Light mode"}
          <span className={cx("relative ml-auto h-4 w-7 border transition-colors", dark ? "border-ink bg-ink" : "border-line-strong bg-surface")} aria-hidden>
            <span className={cx("absolute top-[2px] size-2.5 transition-[left] duration-150", dark ? "left-[14px] bg-on-ink" : "left-[2px] bg-line-strong")} />
          </span>
        </>
      )}
    </button>
  );
}

/** Compact button for pages without the sidebar (landing, tour). */
export function ThemeButton() {
  const [theme, toggle] = useTheme();
  return (
    <button onClick={toggle} className="flex size-8 items-center justify-center border border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle dark mode">
      <ThemeIcon dark={theme === "dark"} />
    </button>
  );
}
