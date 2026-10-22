"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./format";
import { Logo } from "./Logo";
import type { UiState } from "./types";
import { Icon, Indicator, Tag } from "./ui";

type NavKey = "console" | "daylight" | "evidence";

const SIDEBAR_KEY = "telltale:sidebar-collapsed";

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

function NavItem({ href, icon, label, active, collapsed, disabled, hint }: { href: string; icon: "console" | "daylight" | "evidence"; label: string; active: boolean; collapsed: boolean; disabled?: boolean; hint?: string }) {
  const body = (
    <>
      <span className={cx("absolute inset-y-1.5 left-0 w-[2px]", active ? "bg-accent" : "bg-transparent")} aria-hidden />
      <Icon name={icon} className={cx("shrink-0", active ? "text-ink" : "text-muted group-hover:text-ink")} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && hint && <span className="ml-auto font-mono text-[10.5px] text-faint">{hint}</span>}
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
          <li key={r.name} className="flex items-center gap-2 text-[12px]">
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) toggle();
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
        <NavItem href="/daylight" icon="daylight" label="Daylight" active={active === "daylight"} collapsed={collapsed} hint="603" />
        <NavItem
          href={latestLeak ? `/evidence/${latestLeak.id}` : "#"}
          icon="evidence"
          label="Evidence"
          active={active === "evidence"}
          collapsed={collapsed}
          disabled={!latestLeak && active !== "evidence"}
          hint={state?.leaks.length ? String(state.leaks.length) : undefined}
        />
      </nav>

      <div className="mt-auto flex flex-col gap-4 border-t border-line py-4">
        <Connectivity state={state} connected={connected} collapsed={collapsed} />
        {state && !collapsed && (
          <div className="border-t border-line px-3 pt-4">
            <div className="label mb-2">Persona</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-ink">{state.person.firstName}</span>
              {state.person.synthetic && <Tag tone="accent">Synthetic</Tag>}
            </div>
          </div>
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

export type Metric = { label: string; value: ReactNode; accent?: boolean };

export function metricsFor(state: UiState | null): Metric[] {
  if (!state) return [];
  const hosts = new Set(state.disclosures.map((d) => d.recipient_host));
  const brokerHosts = new Set(state.disclosures.filter((d) => d.broker_ids.length).map((d) => d.recipient_host));
  return [
    { label: "Disclosures", value: state.disclosures.length },
    { label: "Endpoints", value: <>{hosts.size}<span className="text-faint"> / {brokerHosts.size} broker</span></>, accent: brokerHosts.size > 0 },
    { label: "Consent tokens", value: <>{state.disclosures.length}<span className="text-faint"> signed</span>{state.pending.length ? <span className="text-accent-ink"> · {state.pending.length} pending</span> : null}</> },
    { label: "Inbound", value: <>{state.messages.length}<span className="text-faint"> msg</span>{state.leaks.length ? <span className="text-accent-ink"> · {state.leaks.length} leak</span> : null}</> },
  ];
}

function TopBar({ crumbs, metrics, actions }: { crumbs: string[]; metrics: Metric[]; actions?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-surface px-5">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[13px]">
        {crumbs.map((c, i) => (
          <span key={c} className="flex items-center gap-2">
            {i > 0 && <span className="text-line-strong">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-ink" : "text-muted"}>{c}</span>
          </span>
        ))}
      </div>
      {metrics.length > 0 && (
        <dl className="ml-auto hidden items-stretch divide-x divide-line border-x border-line lg:flex">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col justify-center px-4 py-1">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{m.label}</dt>
              <dd className={cx("font-mono text-[13px] font-medium tabular-nums", m.accent ? "text-accent-ink" : "text-ink")}>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={cx("flex shrink-0 items-center gap-2", metrics.length === 0 && "ml-auto")}>{actions}</div>
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
  return (
    <div className="flex h-screen min-h-[600px] overflow-hidden bg-canvas">
      <Sidebar active={active} state={state} connected={connected} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar crumbs={crumbs} metrics={metricsFor(state)} actions={actions} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
