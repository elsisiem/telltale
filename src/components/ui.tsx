"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";
import type { Action, RiskLevel } from "./types";

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function SimBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[4px] border border-signal/60 bg-signal/10 px-1.5 py-[1px] font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-signal",
        className,
      )}
      title="Replayed for the demo from a fictional sender. Not a real event."
    >
      Simulated
    </span>
  );
}

export function TagCode({ code, size = "md" }: { code: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[5px] border border-signal/50 bg-signal/10 font-mono font-semibold tracking-[0.14em] text-signal",
        size === "sm" && "px-1.5 text-[12px]",
        size === "md" && "px-2 py-[1px] text-[14px]",
        size === "lg" && "px-2.5 py-0.5 text-[20px]",
      )}
    >
      {code}
    </span>
  );
}

export function Dot({ tone, pulse }: { tone: "alarm" | "pass" | "signal" | "muted"; pulse?: boolean }) {
  return (
    <span
      className={cx(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "alarm" && "bg-alarm",
        tone === "pass" && "bg-pass",
        tone === "signal" && "bg-signal",
        tone === "muted" && "bg-dim",
        pulse && "anim-pulse",
      )}
    />
  );
}

const ACTION_STYLE: Record<Action, { label: string; cls: string; icon: string }> = {
  send: { label: "Sent", cls: "border-line-2 text-fg bg-white/[0.04]", icon: "→" },
  tag: { label: "Tagged", cls: "border-signal/50 text-signal bg-signal/10", icon: "◆" },
  withhold: { label: "Withheld", cls: "border-line text-muted bg-transparent", icon: "∅" },
};

export function OutcomePill({ action }: { action: Action }) {
  const s = ACTION_STYLE[action];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-[1px] text-[12px] font-medium", s.cls)}>
      <span aria-hidden className="text-[10px]">
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  if (level === "none")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pass/40 bg-pass/10 px-2 py-[1px] text-[12px] font-medium text-pass">
        <Dot tone="pass" /> Not a broker
      </span>
    );
  const label = level === "high" ? "High risk" : level === "elevated" ? "Elevated risk" : "Registered broker";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-alarm/50 bg-alarm/10 px-2 py-[1px] text-[12px] font-medium text-alarm">
      <Dot tone="alarm" /> {label}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; busy?: boolean };

export function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-[14px]",
        size === "lg" && "h-12 px-6 text-[16px]",
        variant === "primary" && "bg-fg text-ink hover:bg-white",
        variant === "secondary" && "border border-line-2 bg-panel-2 text-fg hover:border-muted/60 hover:bg-[#1d222a]",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-white/[0.04]",
        variant === "danger" && "bg-alarm text-white hover:bg-[#ff6668]",
        className,
      )}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-line bg-panel", className)}>{children}</section>;
}
