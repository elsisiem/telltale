"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./format";
import type { UiState } from "./types";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="Telltale home">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h8.1a2.5 2.5 0 0 1 1.77.73l7.4 7.4a2.5 2.5 0 0 1 0 3.54l-8.1 8.1a2.5 2.5 0 0 1-3.54 0l-7.4-7.4A2.5 2.5 0 0 1 3 13.6Z" fill="#F5A524" />
        <circle cx="8.6" cy="8.6" r="2.1" fill="#0B0D10" />
      </svg>
      <span className="text-[22px] font-semibold tracking-[-0.02em] text-fg">Telltale</span>
    </Link>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/evidence") : path.startsWith(href);
  return (
    <Link
      href={href}
      className={cx(
        "rounded-md px-2.5 py-1 text-[14px] font-medium transition-colors",
        active ? "bg-white/[0.07] text-fg" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

export function IntegrationPills({ integrations }: { integrations: UiState["integrations"] }) {
  const items: { label: string; on: boolean; title: string }[] = [
    { label: "Model", on: !!integrations.model, title: integrations.model ? `Agent model: ${integrations.model}` : "No ANTHROPIC_API_KEY: the live agent is off" },
    { label: "AgentMail", on: integrations.agentmail, title: integrations.agentmail ? "Per-site inboxes via AgentMail" : "Falls back to plus-addressing" },
    { label: "Kernel", on: integrations.kernel, title: integrations.kernel ? "Hosted browser with live view" : "Falls back to local Playwright" },
    { label: "Exa", on: integrations.exa, title: integrations.exa ? "Domain → company lookups" : "Off" },
    { label: integrations.database === "neon" ? "Neon" : "PGlite", on: true, title: `Database: ${integrations.database}` },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((i) => (
        <span
          key={i.label}
          title={i.title}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] font-medium",
            i.on ? "border-line-2 text-fg" : "border-line text-dim",
          )}
        >
          <span className={cx("size-1.5 rounded-full", i.on ? "bg-pass" : "bg-dim/70")} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function SyntheticBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-signal/40 bg-signal/[0.08] px-3 py-[3px] text-[12px] font-medium text-signal"
      title="All personal details on this screen belong to a synthetic stage persona."
    >
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">Synthetic persona</span>
      <span className="text-signal/60">·</span>
      <span>{name}</span>
    </span>
  );
}

export function SiteHeader({ right, tagline = true }: { right?: ReactNode; tagline?: boolean }) {
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-6 border-b border-line px-6">
      <div className="flex min-w-0 items-center gap-5">
        <Wordmark />
        {tagline && (
          <p className="hidden truncate text-[14px] text-muted min-[1400px]:block">Know who gets your data. Mark it. Make them answer for it.</p>
        )}
        <nav className="flex items-center gap-1 border-l border-line pl-4">
          <NavLink href="/">Console</NavLink>
          <NavLink href="/daylight">Daylight</NavLink>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </header>
  );
}
