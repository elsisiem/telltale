"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";
import type { Action, RiskLevel } from "./types";

/* ---------- Status tags: square, mono, 1px border, no fill ---------- */

type TagTone = "default" | "accent" | "ink" | "muted";

export function Tag({ children, tone = "default", className, title }: { children: ReactNode; tone?: TagTone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("tag", tone === "accent" && "tag-accent", tone === "ink" && "tag-ink", tone === "muted" && "tag-muted", className)}>
      {children}
    </span>
  );
}

/** KEY:VALUE status, e.g. RISK:HIGH. */
export function KeyTag({ k, v, tone = "default" }: { k: string; v: string; tone?: TagTone }) {
  return (
    <Tag tone={tone}>
      <span className="opacity-60">{k}</span>
      <span>{v}</span>
    </Tag>
  );
}

const OUTCOME: Record<Action, { label: string; tone: TagTone }> = {
  send: { label: "Sent", tone: "default" },
  tag: { label: "Tagged", tone: "accent" },
  withhold: { label: "Withheld", tone: "muted" },
};

export function OutcomeTag({ action }: { action: Action }) {
  return <Tag tone={OUTCOME[action].tone}>{OUTCOME[action].label}</Tag>;
}

export function RiskTag({ level }: { level: RiskLevel }) {
  if (level === "none") return <KeyTag k="Broker" v="No" />;
  const v = level === "high" ? "High" : level === "elevated" ? "Elevated" : "Registered";
  return <KeyTag k="Risk" v={v} tone="accent" />;
}

export function SimTag({ className }: { className?: string }) {
  return (
    <Tag tone="accent" className={className} title="Replayed for the demo from a fictional sender. Not a real event.">
      Simulated
    </Tag>
  );
}

/** A tag code is an identity mark, so it gets its own heavier treatment. */
export function TagCode({ code, size = "md", accent }: { code: string; size?: "sm" | "md" | "lg"; accent?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center border font-mono font-semibold tracking-[0.16em]",
        accent ? "border-accent text-accent-ink" : "border-ink text-ink",
        size === "sm" && "h-[18px] px-1 text-[10.5px]",
        size === "md" && "h-[22px] px-1.5 text-[12px]",
        size === "lg" && "h-9 px-3 text-[18px]",
      )}
    >
      {code}
    </span>
  );
}

/** Small square indicator: filled = on, outline = off, blinking = live activity. */
export function Indicator({ on, tone = "ink", live }: { on: boolean; tone?: "ink" | "accent"; live?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-[7px] shrink-0",
        on ? (tone === "accent" ? "bg-accent" : "bg-ink") : "border border-line-strong",
        live && "anim-blink",
      )}
    />
  );
}

/* ---------- Layout primitives ---------- */

export function Card({ children, className, accent }: { children: ReactNode; className?: string; accent?: boolean }) {
  return <section className={cx("border bg-surface", accent ? "border-accent" : "border-line", className)}>{children}</section>;
}

export function CardHeader({ title, meta, className }: { title: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <header className={cx("flex h-10 items-center justify-between gap-3 border-b border-line px-4", className)}>
      <h2 className="label truncate">{title}</h2>
      {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
    </header>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("scanline bg-well", className)} />;
}

/* ---------- Buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
};

export function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[3px] font-mono font-medium transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-7 px-2.5 text-[11.5px]",
        size === "md" && "h-9 px-3.5 text-[12.5px]",
        size === "lg" && "h-11 px-5 text-[13.5px]",
        variant === "primary" && "bg-ink text-white hover:bg-[#2a2e36]",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:border-ink",
        variant === "ghost" && "text-muted hover:bg-well hover:text-ink",
        variant === "accent" && "bg-accent text-white hover:bg-accent-ink",
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span aria-hidden className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />;
}

/* ---------- Icons (16px line, square caps) ---------- */

const ICON = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4 } as const;

export function Icon({ name, className }: { name: "close" | "console" | "daylight" | "evidence" | "chevron" | "external" | "collapse" | "check" | "arrow"; className?: string }) {
  switch (name) {
    case "close":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      );
    case "console":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" />
          <rect x="9" y="2.5" width="4.5" height="4.5" />
          <rect x="2.5" y="9" width="4.5" height="4.5" />
          <rect x="9" y="9" width="4.5" height="4.5" />
        </svg>
      );
    case "daylight":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M2.5 13.5h11M4 11V7M8 11V3.5M12 11V5.5" />
        </svg>
      );
    case "evidence":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M3.5 2.5h6l3 3v8h-9z" />
          <path d="M9.5 2.5v3h3M5.5 8.5h5M5.5 11h3" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M6 4l4 4-4 4" />
        </svg>
      );
    case "external":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5L7.5 8.5" />
        </svg>
      );
    case "collapse":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <rect x="2.5" y="2.5" width="11" height="11" />
          <path d="M6 2.5v11" />
        </svg>
      );
    case "check":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...ICON} className={className} aria-hidden>
          <path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" />
        </svg>
      );
  }
}
