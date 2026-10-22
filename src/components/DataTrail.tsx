"use client";

import type { ReactNode } from "react";
import { cx, dayNumber, fmtDate, fmtShortDate, fmtStamp } from "./format";
import { TrailGraph } from "./TrailGraph";
import type { DisclosureRow, MessageRow, RequestSummary, UiState } from "./types";
import { Card, CardHeader, Empty, SimTag, TagCode } from "./ui";

type Tone = "accent" | "ink" | "muted";
type Item = { key: string; at: string; order: number; tone: Tone; kind: string; when: ReactNode; title: ReactNode; meta?: ReactNode; sim?: boolean };

const statusText = (r: RequestSummary) => (r.channel === "manual" ? "ready to send · demo persona never emails real companies" : r.status);

export function buildTimeline(state: UiState): Item[] {
  const discById = new Map(state.disclosures.map((d) => [d.id, d]));
  const items: Item[] = [];
  const whenFor = (iso: string, replay: boolean, disc?: DisclosureRow) => (replay && disc ? <span className="text-accent-ink">Day {dayNumber(disc.created_at, iso)}</span> : fmtStamp(iso));

  for (const d of state.disclosures) {
    const broker = d.broker_ids.length > 0;
    const shared = d.fields.filter((f) => f.action !== "withhold").length;
    items.push({
      key: `d-${d.id}`,
      at: d.created_at,
      order: 0,
      tone: broker ? "accent" : "ink",
      kind: "Release",
      when: fmtStamp(d.created_at),
      title: (
        <>
          {shared} of {d.fields.length} fields to <span className="font-mono">{d.recipient_host}</span> <TagCode code={d.tag_code} size="sm" accent={broker} />
        </>
      ),
      meta: broker ? `Registered broker · you chose each field${d.purpose ? ` · ${d.purpose}` : ""}` : `Passed silently · email tagged${d.purpose ? ` · ${d.purpose}` : ""}`,
    });
  }
  for (const r of state.requests) {
    const at = r.sent_at ?? r.created_at;
    items.push({
      key: `r-${r.id}`,
      at,
      order: 1,
      tone: "ink",
      kind: r.kind === "optout" ? "Opt-out" : "Delete",
      when: fmtStamp(at),
      title:
        r.kind === "optout" ? (
          <>
            Opt-out of sale/sharing to <span className="font-mono">{r.target_domain}</span>
          </>
        ) : (
          <>
            Deletion request to <span className="font-mono">{r.target_domain}</span>
          </>
        ),
      meta: (
        <>
          deadline <span className="font-mono text-ink">{fmtDate(r.due_at)}</span> · {statusText(r)}
        </>
      ),
    });
  }
  const leakByMsg = new Map(state.leaks.map((l) => [l.message_id, l]));
  const label: Record<MessageRow["classification"], { t: string; tone: Tone }> = {
    "first-party": { t: "Expected mail from", tone: "muted" },
    affiliate: { t: "Mail from a registered affiliate", tone: "ink" },
    leak: { t: "Contact from a stranger", tone: "accent" },
    untagged: { t: "Untagged mail from", tone: "muted" },
  };
  for (const m of state.messages) {
    if (leakByMsg.has(m.id)) continue; // shown as the leak entry
    const disc = m.disclosure_id ? discById.get(m.disclosure_id) : undefined;
    const c = label[m.classification];
    items.push({
      key: `m-${m.id}`,
      at: m.received_at,
      order: 2,
      tone: c.tone,
      kind: "Inbound",
      sim: m.replay,
      when: whenFor(m.received_at, m.replay, disc),
      title: (
        <>
          {c.t} <span className="font-mono">{m.from_domain ?? m.from_addr}</span>
        </>
      ),
      meta: m.subject ? `“${m.subject}”` : undefined,
    });
  }
  for (const l of state.leaks) {
    const disc = discById.get(l.disclosure_id);
    const ev = l.evidence;
    items.push({
      key: `l-${l.id}`,
      at: ev.observed.at,
      order: 3,
      tone: "accent",
      kind: "Leak",
      sim: ev.observed.replay,
      when: whenFor(ev.observed.at, ev.observed.replay, disc),
      title: (
        <>
          <TagCode code={ev.tagCode} size="sm" accent /> given only to <span className="font-mono">{ev.issuedTo.domain}</span> used by{" "}
          <span className="font-mono text-accent-ink">{l.sender_domain}</span>
        </>
      ),
      meta: (
        <>
          {ev.observed.subject ? `“${ev.observed.subject}”` : ""}
          {ev.violation && (
            <span className="text-accent-ink">
              {ev.observed.subject ? " · " : ""}after the opt-out deadline {fmtShortDate(ev.violation.deadlinePassed[0])}
            </span>
          )}
        </>
      ),
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
}

export function Timeline({ state }: { state: UiState }) {
  const items = buildTimeline(state);
  if (!items.length) return <Empty className="m-4">Every disclosure, request and message touching a tag lands here.</Empty>;
  return (
    <ol className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.key} className="anim-rise grid grid-cols-[110px_68px_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2 transition-colors hover:bg-hover">
          <span className="font-mono text-[11px] tabular-nums text-muted">{it.when}</span>
          <span className={cx("font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em]", it.tone === "accent" ? "text-accent-ink" : it.tone === "ink" ? "text-ink" : "text-faint")}>
            {it.kind}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] leading-snug text-ink">
              {it.title} {it.sim && <SimTag className="ml-1 align-[1px]" />}
            </div>
            {it.meta && <div className="mt-0.5 text-[12px] text-muted">{it.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TrailCard({ state }: { state: UiState }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader title="Data trail" meta={<span className="font-mono text-[10.5px] text-faint">{state.registry.brokers} brokers on the CA registry</span>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-line">
          <TrailGraph state={state} />
        </div>
        <div className="flex h-8 items-center justify-between border-b border-line px-4">
          <span className="label">Timeline</span>
          <span className="font-mono text-[10.5px] text-faint">oldest first</span>
        </div>
        <Timeline state={state} />
      </div>
    </Card>
  );
}
