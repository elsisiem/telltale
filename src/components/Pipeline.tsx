"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Finding } from "@/lib/risk";
import { api, cx, fmtTime } from "./format";
import type { Action, CardView, DisclosureRow, UiState } from "./types";
import { Button, Icon, OutcomeTag, Tag, TagCode } from "./ui";

// The story of one disclosure, left to right: the agent's request is intercepted, the recipient is
// inspected against its own legal filing, each field is sanitized, and only then is data released.

type StepState = "idle" | "active" | "held" | "done";

const KIND: Record<string, string> = {
  email: "email", phone: "phone", fullName: "name", firstName: "first name", lastName: "last name", street: "street",
  city: "city", state: "state", zip: "zip", dob: "birth date", ssn: "SSN", governmentId: "gov ID", financialAccount: "bank", other: "other",
};

function Step({ n, title, state, children }: { n: string; title: string; state: StepState; children: ReactNode }) {
  const status: Record<StepState, ReactNode> = {
    idle: <Tag tone="muted">Idle</Tag>,
    active: (
      <Tag tone="accent">
        <span className="anim-blink size-[5px] bg-accent" aria-hidden />
        Active
      </Tag>
    ),
    held: <Tag tone="accent">Awaiting consent</Tag>,
    done: <Tag>Done</Tag>,
  };
  return (
    <div className={cx("relative flex min-w-0 flex-col bg-surface", (state === "active" || state === "held") && "shadow-[inset_0_2px_0_0_var(--color-accent)]")}>
      <div className="flex h-10 items-center justify-between gap-2 border-b border-line px-4">
        <span className="flex items-baseline gap-2 font-mono">
          <span className="text-[11px] text-faint">{n}</span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">{title}</span>
        </span>
        {status[state]}
      </div>
      <div className={cx("min-h-0 flex-1 px-4 py-3", state === "idle" && "opacity-55")}>{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="relative hidden w-6 shrink-0 items-center justify-center bg-canvas xl:flex" aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      <Icon name="chevron" className="relative bg-canvas text-muted" />
    </div>
  );
}

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-[3px] text-[13px]">
      <span className="w-[64px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">{k}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{children}</span>
    </div>
  );
}

type Subject = {
  host: string;
  purpose: string | null;
  at?: string;
  fields: { label: string; kind: string; action: Action }[];
  brokers: string[];
  findings: Finding[] | null;
  tagCode?: string;
  alias?: string | null;
  receiptId?: string | null;
  optout?: { due: string | null } | null;
  mode: "held" | "released";
};

/** Findings for a past disclosure come from a registry preview of the same host. */
function useFindings(d: DisclosureRow | undefined): Finding[] | null {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const host = d?.recipient_host;
  const broker = !!d?.broker_ids.length;
  useEffect(() => {
    setFindings(null);
    if (!host || !broker) return;
    let live = true;
    api<CardView>("/api/preview", { json: { url: `https://${host}` } })
      .then((v) => live && setFindings(v.risk.findings))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [host, broker]);
  return findings;
}

export function Pipeline({ state, pending, running, focusId, onClearFocus, onReview }: { state: UiState; pending: CardView | null; running: boolean; focusId?: string | null; onClearFocus?: () => void; onReview: () => void }) {
  const focused = focusId ? state.disclosures.find((d) => d.id === focusId) : undefined;
  const latest = focused ?? state.disclosures.at(-1);
  const findings = useFindings(pending ? undefined : latest);

  let subject: Subject | null = null;
  if (pending) {
    subject = {
      host: pending.recipient.host,
      purpose: pending.request.purpose,
      at: pending.createdAt,
      fields: pending.decision.fields.map((f) => ({ label: f.label, kind: f.kind, action: f.action })),
      brokers: pending.recipient.brokers.map((b) => b.name),
      findings: pending.risk.findings,
      mode: "held",
    };
  } else if (latest) {
    const optout = state.requests.find((r) => r.kind === "optout" && r.tag_code === latest.tag_code);
    subject = {
      host: latest.recipient_host,
      purpose: latest.purpose,
      at: latest.created_at,
      fields: latest.fields,
      brokers: latest.broker_ids.map((id) => state.brokerNames[id] ?? id),
      findings,
      tagCode: latest.tag_code,
      alias: latest.alias_email,
      receiptId: latest.receipt_id,
      optout: optout ? { due: optout.due_at } : null,
      mode: "released",
    };
  }

  const watching = running && !pending;
  const s: Record<"intercept" | "inspect" | "sanitize" | "release", StepState> = !subject
    ? { intercept: watching ? "active" : "idle", inspect: "idle", sanitize: "idle", release: "idle" }
    : subject.mode === "held"
      ? { intercept: "done", inspect: "done", sanitize: "held", release: "idle" }
      : { intercept: watching ? "active" : "done", inspect: "done", sanitize: "done", release: "done" };

  const counts = { send: 0, tag: 0, withhold: 0 } as Record<Action, number>;
  for (const f of subject?.fields ?? []) counts[f.action]++;
  const isBroker = !!subject?.brokers.length;

  return (
    <section aria-label="Disclosure pipeline" className="border border-line bg-canvas">
      <div className="flex h-9 items-center justify-between gap-3 border-b border-line bg-surface px-4">
        <h2 className="label">Sentry pipeline</h2>
        <span className="flex items-center gap-2 font-mono text-[11px] text-faint">
          {subject ? (
            <>
              {subject.mode === "held" ? <span className="text-accent-ink">live interception</span> : focused ? <span className="text-ink">inspecting {subject.host}</span> : "last disclosure"} · {fmtTime(subject.at)}
            </>
          ) : watching ? (
            "watching the agent"
          ) : (
            "no disclosures yet"
          )}
          {focused && !pending && onClearFocus && (
            <button onClick={onClearFocus} className="border border-line-strong px-1.5 py-px text-ink-2 transition-colors hover:border-ink hover:text-ink">
              back to latest
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-2 xl:flex xl:gap-0 xl:bg-canvas xl:[&>div:not([aria-hidden])]:flex-1 xl:[&>div:not([aria-hidden])]:basis-0">
        <Step n="01" title="Intercept" state={s.intercept}>
          {subject ? (
            <>
              <Line k="Agent to">
                <span className="font-mono">{subject.host}</span>
              </Line>
              <Line k="Purpose">{subject.purpose && subject.purpose !== "Preview" ? subject.purpose : "—"}</Line>
              <div className="mt-2 flex flex-wrap gap-1">
                {subject.fields.map((f) => (
                  <Tag key={f.label + f.kind} tone="muted">
                    {KIND[f.kind] ?? f.kind}
                  </Tag>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">The model asked for field types only. It never saw a value.</p>
            </>
          ) : (
            <p className="text-[13px] text-muted">{watching ? "The agent is browsing. Telltale steps in the moment it reaches a form." : "Run the agent. Every form it tries to fill is stopped here first."}</p>
          )}
        </Step>
        <Connector />
        <Step n="02" title="Inspect" state={s.inspect}>
          {subject ? (
            isBroker ? (
              <>
                <div className="flex items-center gap-2">
                  <Tag tone="accent">Registered broker</Tag>
                  <span className="font-mono text-[10.5px] text-faint">CPPA · 2026</span>
                </div>
                <p className="mt-2 truncate text-[13.5px] font-medium text-ink">{subject.brokers[0]}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {(subject.findings ?? []).slice(0, 2).map((f) => (
                    <li key={f.key} className="flex gap-2 text-[12.5px] leading-snug text-ink-2">
                      <span className={cx("mt-[6px] size-[5px] shrink-0", f.severity === "high" ? "bg-accent" : "bg-ink-2")} />
                      <span className="line-clamp-2">{f.text}</span>
                    </li>
                  ))}
                  {subject.findings === null && <li className="h-8 w-full scanline bg-well" />}
                  {subject.findings && subject.findings.length > 2 && <li className="font-mono text-[11px] text-faint">+{subject.findings.length - 2} more in filing</li>}
                </ul>
              </>
            ) : (
              <>
                <Tag>Not a broker</Tag>
                <p className="mt-2 text-[13px] text-ink-2">No match among 603 registered brokers.</p>
                <p className="mt-1 text-[12px] text-muted">Ordinary sites pass without a prompt; email is still tagged.</p>
              </>
            )
          ) : (
            <p className="text-[13px] text-muted">Each recipient is checked against its own sworn filing with the State of California, plus the live Daylight sweep.</p>
          )}
        </Step>
        <Connector />
        <Step n="03" title="Sanitize" state={s.sanitize}>
          {subject ? (
            <>
              <div className="flex gap-4 font-mono text-[11px] text-muted">
                <span>
                  <span className="text-[15px] font-semibold text-ink">{counts.send}</span> sent
                </span>
                <span>
                  <span className="text-[15px] font-semibold text-accent-ink">{counts.tag}</span> tagged
                </span>
                <span>
                  <span className="text-[15px] font-semibold text-ink">{counts.withhold}</span> withheld
                </span>
              </div>
              <ul className="mt-2 flex flex-col">
                {subject.fields.slice(0, 4).map((f) => (
                  <li key={f.label + f.kind} className="flex items-center justify-between gap-2 border-t border-line py-[3px] text-[12.5px] first:border-0">
                    <span className="truncate text-ink-2">{f.label}</span>
                    <OutcomeTag action={f.action} />
                  </li>
                ))}
                {subject.fields.length > 4 && <li className="font-mono text-[11px] text-faint">+{subject.fields.length - 4} more</li>}
              </ul>
            </>
          ) : (
            <p className="text-[13px] text-muted">Per field: send the real value, send a working value tagged to this site, or withhold it.</p>
          )}
        </Step>
        <Connector />
        <Step n="04" title="Release" state={s.release}>
          {subject?.mode === "held" ? (
            <>
              <p className="text-[13px] text-ink-2">Nothing has been typed. The agent waits for your decision.</p>
              <Button variant="accent" size="sm" className="mt-3" onClick={onReview}>
                Review and release
              </Button>
            </>
          ) : subject ? (
            <>
              <div className="flex items-center gap-2">
                {subject.tagCode && <TagCode code={subject.tagCode} accent={isBroker} />}
                <span className="font-mono text-[11px] text-faint">tag</span>
              </div>
              <Line k="Inbox">
                <span className="font-mono text-[12px]">{subject.alias ?? "no email given"}</span>
              </Line>
              <Line k="Receipt">
                <span className="font-mono text-[12px]">{subject.receiptId ? `${subject.receiptId.slice(0, 8)}… ed25519` : "—"}</span>
              </Line>
              {isBroker && (
                <Line k="Opt-out">
                  {subject.optout ? <span className="font-mono text-[12px]">due {subject.optout.due?.slice(0, 10)}</span> : <span className="text-accent-ink">not sent yet</span>}
                </Line>
              )}
            </>
          ) : (
            <p className="text-[13px] text-muted">Only what you approved is typed, under a tag, with a signed consent receipt.</p>
          )}
        </Step>
      </div>
    </section>
  );
}
