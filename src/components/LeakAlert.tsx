"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, dayNumber, fmtDate, fmtShortDate } from "./format";
import type { ComplaintDoc, LeakRow, RequestRow, UiState } from "./types";
import { Button, SimBadge, TagCode } from "./ui";

export function complaintKey(leakId: string) {
  return `telltale:complaint:${leakId}`;
}

export function LeakAlert({ leak, state, onChanged }: { leak: LeakRow; state: UiState; onChanged: () => void }) {
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
      setDeletion(await api<RequestRow>(`/api/leaks/${leak.id}/delete`, { method: "POST" }));
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="anim-slide-up relative overflow-hidden border-b border-alarm/60 bg-[linear-gradient(90deg,#3a1215_0%,#22100f_60%,#160d0e_100%)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-alarm" aria-hidden />
      <div className="flex items-center justify-between gap-6 px-6 py-3.5 pl-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-alarm">Leak traced</span>
            <TagCode code={ev.tagCode} size="sm" />
            {sim && <SimBadge />}
            {sim && disc && <span className="font-mono text-[12px] text-signal">Day {dayNumber(disc.created_at, ev.observed.at)}</span>}
            {state.leaks.length > 1 && <span className="text-[12px] text-muted">+{state.leaks.length - 1} more</span>}
          </div>
          <p className="mt-1 text-[19px] font-medium leading-snug text-fg">
            An identifier given only to <span className="font-mono">{original}</span> reached <span className="font-mono text-alarm">{sender}</span>
            {ev.violation && (
              <>
                {" "}
                <span className="text-alarm">after the opt-out deadline {fmtShortDate(ev.violation.deadlinePassed[0])}</span>
              </>
            )}
            .
          </p>
          {err && <p className="mt-1 text-[13px] text-alarm">{err}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {del ? (
            <span className="rounded-lg border border-signal/40 bg-signal/[0.08] px-3 py-2 text-[13px] text-signal">
              Deletion request ready · due {fmtDate(del.due_at)}
            </span>
          ) : (
            <Button variant="secondary" onClick={requestDeletion} busy={busy === "delete"} disabled={!!busy}>
              Request deletion
            </Button>
          )}
          <Button variant="danger" onClick={draft} busy={busy === "complaint"} disabled={!!busy}>
            Draft complaint →
          </Button>
        </div>
      </div>
    </div>
  );
}
