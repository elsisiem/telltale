"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, dayNumber, fmtDate, fmtShortDate } from "./format";
import type { ComplaintDoc, LeakRow, RequestRow, UiState } from "./types";
import { useToast } from "./Toast";
import { Button, SimTag, Tag, TagCode } from "./ui";

export function complaintKey(leakId: string) {
  return `telltale:complaint:${leakId}`;
}

/** Incident strip shown above the console when a tagged identifier surfaces somewhere it was never given. */
export function LeakAlert({ leak, state, onChanged }: { leak: LeakRow; state: UiState; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"complaint" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<RequestRow | null>(null);
  const ev = leak.evidence;
  const disc = state.disclosures.find((d) => d.id === leak.disclosure_id);
  const original = disc?.recipient_host ?? ev.issuedTo.domain;
  const sender = ev.senderRegistry[0]?.name ? `${ev.senderRegistry[0].name} (${leak.sender_domain})` : leak.sender_domain;
  const existingDelete = state.requests.find((r) => r.kind === "delete" && r.target_domain === leak.sender_domain && r.tag_code === ev.tagCode);
  const del = deletion ?? existingDelete;
  const sim = ev.observed.replay;

  async function draft() {
    setBusy("complaint");
    setErr(null);
    try {
      const doc = await api<ComplaintDoc>(`/api/leaks/${leak.id}/complaint`, { method: "POST" });
      try {
        sessionStorage.setItem(complaintKey(leak.id), JSON.stringify(doc));
      } catch {}
      router.push(`/evidence/${leak.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  async function requestDeletion() {
    setBusy("delete");
    setErr(null);
    try {
      const r = await api<RequestRow>(`/api/leaks/${leak.id}/delete`, { method: "POST" });
      setDeletion(r);
      toast("Deletion request ready", { detail: `Addressed to ${leak.sender_domain}. Due ${fmtDate(r.due_at)}.` });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="anim-rise flex flex-col gap-3 border border-accent bg-surface py-3 pl-4 pr-3 shadow-[inset_3px_0_0_0_var(--color-accent)] xl:flex-row xl:items-center xl:justify-between" aria-live="polite">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="accent">Leak traced</Tag>
          <TagCode code={ev.tagCode} size="sm" accent />
          {sim && <SimTag />}
          {sim && disc && <span className="font-mono text-[11px] text-accent-ink">Day {dayNumber(disc.created_at, ev.observed.at)}</span>}
          {state.leaks.length > 1 && <span className="font-mono text-[11px] text-muted">+{state.leaks.length - 1} more</span>}
        </div>
        <p className="mt-1.5 text-[15px] leading-snug text-ink">
          An identifier given only to <span className="font-mono font-medium">{original}</span> reached <span className="font-mono font-medium text-accent-ink">{sender}</span>
          {ev.violation && <span className="text-accent-ink"> after the opt-out deadline {fmtShortDate(ev.violation.deadlinePassed[0])}</span>}.
        </p>
        {err && <p className="mt-1 text-[12px] text-accent-ink">{err}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {del ? (
          <span className="border border-line-strong px-2.5 py-1.5 font-mono text-[11.5px] text-ink-2">deletion request ready · due {fmtDate(del.due_at)}</span>
        ) : (
          <Button onClick={requestDeletion} busy={busy === "delete"} disabled={!!busy}>
            Request deletion
          </Button>
        )}
        <Button variant="accent" onClick={draft} busy={busy === "complaint"} disabled={!!busy}>
          Draft complaint
        </Button>
      </div>
    </section>
  );
}
