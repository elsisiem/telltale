"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./format";
import { Guide } from "./Guide";
import { Logo } from "./Logo";

import type { UiState } from "./types";
import { Button, Icon, Indicator, Tag, type IconName } from "./ui";

type NavKey = "console" | "daylight" | "evidence" | "profile";

const SIDEBAR_KEY = "telltale:sidebar-collapsed";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SIDEBAR_KEY);
    } catch {}
    // No saved preference: start collapsed on narrower screens so the console keeps three columns.
    setCollapsed(saved ? saved === "1" : window.innerWidth < 1400);
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  return [collapsed, toggle] as const;
}

function NavItem({ href, icon, label, active, collapsed, disabled, hint, hintAccent }: { href: string; icon: IconName; label: string; active: boolean; collapsed: boolean; disabled?: boolean; hint?: string; hintAccent?: boolean }) {
  const body = (
    <>
      <span className={cx("absolute inset-y-1.5 left-0 w-[2px]", active ? "bg-accent" : "bg-transparent")} aria-hidden />
      <Icon name={icon} className={cx("shrink-0", active ? "text-ink" : "text-muted group-hover:text-ink")} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && hint && <span className={cx("ml-auto font-mono text-[10.5px]", hintAccent ? "text-accent-ink" : "text-faint")}>{hint}</span>}
      {collapsed && hintAccent && <span className="anim-blink absolute right-2 top-2 size-[5px] bg-accent" aria-hidden />}
    </>
  );
  const cls = cx(
    "group relative flex h-8 items-center gap-2.5 pl-3 pr-2 font-mono text-[12.5px] transition-colors",
    active ? "bg-well text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
    disabled && "pointer-events-none opacity-40",
    collapsed && "justify-center pl-0 pr-0",
  );
  return disabled ? (
    <span className={cls} title={collapsed ? label : undefined}>
      {body}
    </span>
  ) : (
    <Link href={href} className={cls} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );
}

function Connectivity({ state, connected, collapsed }: { state: UiState | null; connected?: boolean; collapsed: boolean }) {
  const i = state?.integrations;
  const rows: { name: string; on: boolean; value: string }[] = [
    { name: "Model", on: !!i?.model, value: i?.model ? i.model.replace(/^claude-/, "").replace(/-(\d)-(\d)$/, " $1.$2") : "off" },
    { name: "AgentMail", on: !!i?.agentmail, value: i?.agentmail ? "inboxes" : "off" },
    { name: "Kernel", on: !!i?.kernel, value: i?.kernel ? "browser" : "off" },
    { name: "Exa", on: !!i?.exa, value: i?.exa ? "lookup" : "off" },
    { name: "Database", on: !!state, value: i?.database ?? "…" },
  ];
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-2" title="Connectivity">
        {rows.map((r) => (
          <span key={r.name} title={`${r.name}: ${r.value}`}>
            <Indicator on={r.on} />
          </span>
        ))}
        {connected !== undefined && (
          <span title={connected ? "Event stream live" : "Event stream reconnecting"}>
            <Indicator on={connected} tone="accent" live={connected} />
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="px-3">
      <div className="label mb-2">Connectivity</div>
      <ul className="flex flex-col gap-[7px]">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-[12px]" title={r.on ? `${r.name} is connected` : `${r.name} is not configured; Telltale uses a local fallback`}>
            <Indicator on={r.on} />
            <span className="font-mono text-ink-2">{r.name}</span>
            <span className="ml-auto truncate font-mono text-[11px] text-faint">{r.value}</span>
          </li>
        ))}
        {connected !== undefined && (
          <li className="flex items-center gap-2 border-t border-line pt-[7px] text-[12px]">
            <Indicator on={connected} tone="accent" live={connected} />
            <span className="font-mono text-ink-2">Event stream</span>
            <span className={cx("ml-auto font-mono text-[11px]", connected ? "text-accent-ink" : "text-faint")}>{connected ? "live" : "reconnecting"}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function Sidebar({ active, state, connected }: { active: NavKey; state: UiState | null; connected?: boolean }) {
  const [collapsed, toggle] = useCollapsed();
  const latestLeak = state?.leaks.at(-1);
  const sweep = state?.sweep;
  const sweepPct = sweep ? Math.round((sweep.done / Math.max(sweep.total, 1)) * 100) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!typing(e) && e.key === "[" && !e.metaKey && !e.ctrlKey) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <aside className={cx("flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-[52px]" : "w-[228px]")}>
      <div className={cx("flex h-14 shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "gap-2.5 px-3.5")}>
        <Logo size={22} />
        {!collapsed && (
          <div className="min-w-0 leading-none">
            <div className="font-mono text-[14px] font-semibold tracking-[-0.01em] text-ink">Telltale</div>
            <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">Consent layer</div>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 py-3" aria-label="Primary">
        {!collapsed && <div className="label mb-1.5 px-3">Workspace</div>}
        <NavItem href="/" icon="console" label="Console" active={active === "console"} collapsed={collapsed} />
        <NavItem
          href="/daylight"
          icon="daylight"
          label="Daylight"
          active={active === "daylight"}
          collapsed={collapsed}
          hint={sweepPct !== null ? `${sweepPct}%` : "603"}
          hintAccent={sweepPct !== null}
        />
        <NavItem
          href={latestLeak ? `/evidence/${latestLeak.id}` : "#"}
          icon="evidence"
          label="Evidence"
          active={active === "evidence"}
          collapsed={collapsed}
          disabled={!latestLeak && active !== "evidence"}
          hint={state?.leaks.length ? String(state.leaks.length) : undefined}
        />
        {!collapsed && <div className="label mb-1.5 mt-4 px-3">You</div>}
        {collapsed && <div className="mx-3 my-2 border-t border-line" />}
        <NavItem href="/profile" icon="profile" label="Profile" active={active === "profile"} collapsed={collapsed} hint={state ? (state.person.synthetic ? "demo" : "yours") : undefined} />
      </nav>

      <div className="mt-auto flex flex-col gap-4 border-t border-line py-4">
        <Connectivity state={state} connected={connected} collapsed={collapsed} />
        {state && !collapsed && (
          <Link href="/profile" className="group mx-1.5 block border-t border-line px-1.5 pt-4">
            <div className="label mb-2">Persona</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-ink group-hover:underline group-hover:underline-offset-2">{state.person.firstName}</span>
              {state.person.synthetic ? <Tag tone="accent">Synthetic</Tag> : <Tag tone="ink">Real</Tag>}
            </div>
            <p className="mt-1 font-mono text-[10.5px] text-faint">{state.person.dryRun ? "dry run · forms are never submitted" : "submits after your consent"}</p>
          </Link>
        )}
      </div>

      <button
        onClick={toggle}
        className={cx("flex h-10 shrink-0 items-center gap-2 border-t border-line font-mono text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-ink", collapsed ? "justify-center" : "px-3.5")}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title="Toggle sidebar ( [ )"
      >
        <Icon name="collapse" />
        {!collapsed && (
          <>
            Collapse <span className="kbd ml-auto">[</span>
          </>
        )}
      </button>
    </aside>
  );
}

export type Metric = { label: string; value: ReactNode; accent?: boolean; title?: string };

export function metricsFor(state: UiState | null): Metric[] {
  if (!state) return [];
  const hosts = new Set(state.disclosures.map((d) => d.recipient_host));
  const brokerHosts = new Set(state.disclosures.filter((d) => d.broker_ids.length).map((d) => d.recipient_host));
  return [
    { label: "Disclosures", value: state.disclosures.length, title: "Forms your agent filled through Telltale" },
    {
      label: "Endpoints",
      value: (
        <>
          {hosts.size}
          <span className="text-faint"> / {brokerHosts.size} broker</span>
        </>
      ),
      accent: brokerHosts.size > 0,
      title: "Distinct sites that received your data, and how many are registered brokers",
    },
    {
      label: "Consent tokens",
      value: (
        <>
          {state.disclosures.length}
          <span className="text-faint"> signed</span>
          {state.pending.length ? <span className="text-accent-ink"> · {state.pending.length} pending</span> : null}
        </>
      ),
      title: "Ed25519-signed consent receipts, and cards waiting for your decision",
    },
    {
      label: "Inbound",
      value: (
        <>
          {state.messages.length}
          <span className="text-faint"> msg</span>
          {state.leaks.length ? <span className="text-accent-ink"> · {state.leaks.length} leak</span> : null}
        </>
      ),
      title: "Mail received on tagged addresses, and how many came from strangers",
    },
  ];
}

function SweepBadge({ state }: { state: UiState | null }) {
  const s = state?.sweep;
  if (!s) return null;
  const pct = Math.round((s.done / Math.max(s.total, 1)) * 100);
  return (
    <Link href="/daylight" className="flex h-7 items-center gap-2 border border-accent px-2 font-mono text-[11px] text-accent-ink transition-colors hover:bg-accent-wash" title="A Daylight sweep is running on the server">
      <span className="anim-blink size-[6px] bg-accent" aria-hidden />
      Sweep {pct}%
    </Link>
  );
}

function TopBar({ crumbs, state, actions, onGuide, showSweep }: { crumbs: string[]; state: UiState | null; actions?: ReactNode; onGuide: () => void; showSweep: boolean }) {
  const metrics = metricsFor(state);
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[13px]">
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span className="text-line-strong">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-ink" : "text-muted"}>{c}</span>
          </span>
        ))}
      </div>
      {metrics.length > 0 && (
        <dl className="ml-auto hidden items-stretch divide-x divide-line border-x border-line lg:flex">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col justify-center px-4 py-1" title={m.title}>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{m.label}</dt>
              <dd className={cx("font-mono text-[13px] font-medium tabular-nums", m.accent ? "text-accent-ink" : "text-ink")}>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={cx("flex shrink-0 items-center gap-2", metrics.length === 0 && "ml-auto")}>
        {showSweep && <SweepBadge state={state} />}
        {actions}
        <Button size="sm" variant="ghost" onClick={onGuide} title="How Telltale works (?)">
          <Icon name="help" className="size-3.5" />
          Guide
        </Button>
      </div>
    </header>
  );
}

export function AppShell({
  active,
  state,
  connected,
  crumbs,
  actions,
  children,
}: {
  active: NavKey;
  state: UiState | null;
  connected?: boolean;
  crumbs: string[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!typing(e) && e.key === "?") setGuide((g) => !g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex h-screen min-h-[600px] overflow-hidden bg-canvas">
        <Sidebar active={active} state={state} connected={connected} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar crumbs={crumbs} state={state} actions={actions} onGuide={() => setGuide(true)} showSweep={active !== "daylight"} />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
      <Guide open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
