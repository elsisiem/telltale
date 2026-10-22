"use client";

import type { ReactNode } from "react";
import { cx, dayNumber, fmtDate, fmtShortDate, fmtStamp } from "./format";
import type { DisclosureRow, MessageRow, RequestSummary, UiState } from "./types";
import { TrailGraph } from "./TrailGraph";
import { SectionLabel, SimBadge, TagCode } from "./ui";

type Item = { key: string; at: string; order: number; tone: "alarm" | "pass" | "signal" | "muted" | "fg"; when: ReactNode; title: ReactNode; meta?: ReactNode; sim?: boolean };

function statusText(r: RequestSummary) {
  if (r.channel === "manual") return "ready to send · demo persona never emails real companies";
  return r.status;
}

export function buildTimeline(state: UiState): Item[] {
  const discById = new Map(state.disclosures.map((d) => [d.id, d]));
  const items: Item[] = [];
  const whenFor = (iso: string, replay: boolean, disc?: DisclosureRow) =>
    replay && disc ? <span className="text-signal">Day {dayNumber(disc.created_at, iso)}</span> : fmtStamp(iso);

  for (const d of state.disclosures) {
    const broker = d.broker_ids.length > 0;
    const shared = d.fields.filter((f) => f.action !== "withhold").length;
    items.push({
      key: `d-${d.id}`,
      at: d.created_at,
      order: 0,
      tone: broker ? "alarm" : "pass",
      when: fmtStamp(d.created_at),
      title: (
        <>
          Gave {shared} of {d.fields.length} fields to <span className="font-mono">{d.recipient_host}</span> <TagCode code={d.tag_code} size="sm" />
        </>
      ),
      meta: broker ? `Registered data broker · you chose each field${d.purpose ? ` · ${d.purpose}` : ""}` : `Passed silently · email tagged${d.purpose ? ` · ${d.purpose}` : ""}`,
    });
  }
  for (const r of state.requests) {
    const at = r.sent_at ?? r.created_at;
    items.push({
      key: `r-${r.id}`,
      at,
      order: 1,
      tone: "signal",
      when: fmtStamp(at),
      title:
        r.kind === "optout" ? (
          <>
            Opt-out of sale/sharing sent to <span className="font-mono">{r.target_domain}</span>
          </>
        ) : (
          <>
            Deletion request to <span className="font-mono">{r.target_domain}</span>
          </>
        ),
      meta: (
        <>
          deadline <span className="font-mono text-fg">{fmtDate(r.due_at)}</span> · {statusText(r)}
        </>
      ),
    });
  }
  const leakByMsg = new Map(state.leaks.map((l) => [l.message_id, l]));
  for (const m of state.messages) {
    const disc = m.disclosure_id ? discById.get(m.disclosure_id) : undefined;
    const label: Record<MessageRow["classification"], { t: string; tone: Item["tone"] }> = {
      "first-party": { t: "Expected mail from", tone: "pass" },
      affiliate: { t: "Mail from a registered affiliate", tone: "signal" },
      leak: { t: "Contact from a stranger", tone: "alarm" },
      untagged: { t: "Untagged mail from", tone: "muted" },
    };
    const c = label[m.classification];
    if (leakByMsg.has(m.id)) continue; // shown as the leak entry
    items.push({
      key: `m-${m.id}`,
      at: m.received_at,
      order: 2,
      tone: c.tone,
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
      tone: "alarm",
      sim: ev.observed.replay,
      when: whenFor(ev.observed.at, ev.observed.replay, disc),
      title: (
        <>
          <span className="font-semibold text-alarm">Leak traced.</span> <TagCode code={ev.tagCode} size="sm" /> given only to{" "}
          <span className="font-mono">{ev.issuedTo.domain}</span> was used by <span className="font-mono text-alarm">{l.sender_domain}</span>
        </>
      ),
      meta: (
        <>
          {ev.observed.subject ? `“${ev.observed.subject}”` : ""}
          {ev.violation && (
            <span className="text-alarm">
              {ev.observed.subject ? " · " : ""}after the opt-out deadline {fmtShortDate(ev.violation.deadlinePassed[0])}
            </span>
          )}
        </>
      ),
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
}

const TONE: Record<Item["tone"], string> = {
  alarm: "bg-alarm",
  pass: "bg-pass",
  signal: "bg-signal",
  muted: "bg-dim",
  fg: "bg-fg",
};

export function Timeline({ state }: { state: UiState }) {
  const items = buildTimeline(state);
  if (!items.length) return <p className="text-[14px] text-muted">Every disclosure, request, and message touching a tag lands here.</p>;
  return (
    <ol className="relative">
      <span className="absolute left-[132px] top-2 bottom-2 w-px bg-line" aria-hidden />
      {items.map((it) => (
        <li key={it.key} className="anim-row-in relative grid grid-cols-[120px_24px_1fr] items-start gap-x-1 py-2">
          <span className="pt-[2px] text-right font-mono text-[12px] text-muted">{it.when}</span>
          <span className="flex justify-center pt-[7px]">
            <span className={cx("relative z-10 size-2.5 rounded-full ring-4 ring-ink", TONE[it.tone])} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] leading-snug text-fg">
              {it.title} {it.sim && <SimBadge className="ml-1 align-[2px]" />}
            </div>
            {it.meta && <div className="mt-0.5 text-[13px] text-muted">{it.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Stats({ state }: { state: UiState }) {
  const toBrokers = state.disclosures.filter((d) => d.broker_ids.length).length;
  const optouts = state.requests.filter((r) => r.kind === "optout").length;
  const stats: { label: string; value: number; tone?: string }[] = [
    { label: "Disclosures", value: state.disclosures.length },
    { label: "To data brokers", value: toBrokers, tone: toBrokers ? "text-alarm" : undefined },
    { label: "Opt-outs sent", value: optouts, tone: optouts ? "text-signal" : undefined },
    { label: "Leaks traced", value: state.leaks.length, tone: state.leaks.length ? "text-alarm" : undefined },
  ];
  return (
    <div className="grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-panel">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-3">
          <div className={cx("text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums", s.tone ?? "text-fg")}>{s.value}</div>
          <div className="mt-1.5 text-[12px] text-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function DataTrail({ state }: { state: UiState }) {
  return (
    <div className="flex flex-col gap-4">
      <Stats state={state} />
      <div>
        <SectionLabel right={<span className="text-[12px] text-dim">{state.registry.brokers} brokers on the CA registry</span>}>Data trail</SectionLabel>
        <div className="rounded-xl border border-line bg-panel px-3 py-2">
          <TrailGraph state={state} />
        </div>
      </div>
      <div>
        <SectionLabel>Timeline</SectionLabel>
        <Timeline state={state} />
      </div>
    </div>
  );
}

