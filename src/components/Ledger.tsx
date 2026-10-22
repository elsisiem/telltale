"use client";

import { useState } from "react";
import { api, cx, fmtDate, fmtStamp } from "./format";
import { Paper } from "./Paper";
import type { DisclosureRow, ReceiptResponse, RequestRow, RequestSummary, UiState } from "./types";
import { Button, OutcomePill, RiskBadge, SectionLabel, TagCode } from "./ui";

const KIND_LABEL: Record<string, string> = {
  email: "email",
  phone: "phone",
  fullName: "name",
  firstName: "first name",
  lastName: "last name",
  street: "street",
  city: "city",
  state: "state",
  zip: "zip",
  dob: "date of birth",
  ssn: "SSN",
  governmentId: "gov. ID",
  financialAccount: "bank acct",
  other: "other",
};

function ReceiptCheck({ disclosureId }: { disclosureId: string }) {
  const [res, setRes] = useState<ReceiptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<ReceiptResponse>(`/api/receipts/${disclosureId}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!res)
    return (
      <div>
        <Button size="sm" onClick={verify} busy={busy}>
          Verify receipt
        </Button>
        {err && <p className="mt-1 text-[12px] text-alarm">{err}</p>}
      </div>
    );

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium",
          res.verified ? "border-pass/40 bg-pass/[0.07] text-pass" : "border-alarm/50 bg-alarm/[0.08] text-alarm",
        )}
      >
        <span className="flex items-center gap-2">
          {res.verified ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5l3.2 3L13 4.5" />
            </svg>
          ) : (
            <span aria-hidden>✕</span>
          )}
          {res.verified ? "Signature valid · Ed25519" : "Signature INVALID"}
        </span>
        <span className="font-mono text-[11px] text-muted">{open ? "hide" : "receipt json"}</span>
      </button>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-line bg-ink p-3 font-mono text-[11px] leading-relaxed text-muted">
          {JSON.stringify(res.receipt, null, 2)}
        </pre>
      )}
    </div>
  );
}

function OptOut({ disc, existing, onChanged }: { disc: DisclosureRow; existing?: RequestSummary; onChanged: () => void }) {
  const [sent, setSent] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const req = sent ?? existing;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      setSent(await api<RequestRow>("/api/requests/optout", { json: { disclosureId: disc.id } }));
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!req)
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={send} busy={busy} className="border-signal/40 text-signal hover:border-signal/70">
          Send opt-out
        </Button>
        {err && <p className="mt-1 text-[12px] text-alarm">{err}</p>}
      </div>
    );

  return (
    <div className="w-full rounded-lg border border-signal/30 bg-signal/[0.05] px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-medium text-signal">Opt-out of sale/sharing</span>
        <span className="whitespace-nowrap text-[12px] text-muted">
          deadline <span className="font-mono text-fg">{fmtDate(req.due_at)}</span>
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {req.channel === "manual" ? "Ready to send. The demo persona never emails real companies." : `Sent via ${req.channel} · ${fmtStamp(req.sent_at)}`}
      </p>
      {sent?.body && (
        <>
          <button onClick={() => setShowLetter((s) => !s)} className="mt-1 text-[12px] text-fg underline decoration-line-2 underline-offset-2 hover:decoration-fg">
            {showLetter ? "Hide letter" : "Read the letter"}
          </button>
          {showLetter && <Paper body={sent.body} compact className="mt-2 max-h-80 overflow-auto" exhibit="Opt-out" />}
        </>
      )}
    </div>
  );
}

function LedgerCard({ d, state, onChanged }: { d: DisclosureRow; state: UiState; onChanged: () => void }) {
  const broker = d.broker_ids.length > 0;
  const names = d.broker_ids.map((id) => state.brokerNames[id] ?? id);
  const optout = state.requests.find((r) => r.kind === "optout" && r.tag_code === d.tag_code);
  const leaked = state.leaks.some((l) => l.disclosure_id === d.id);
  return (
    <article className={cx("anim-slide-up rounded-xl border bg-panel", leaked ? "border-alarm/50" : "border-line")}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[15px] font-medium text-fg">{d.recipient_host}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{d.purpose || "—"}</div>
          {broker && <div className="mt-1 truncate text-[13px] text-alarm">{names.join(", ")}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <RiskBadge level={d.risk_level} />
          <span className="font-mono text-[11px] text-dim">{fmtStamp(d.created_at)}</span>
        </div>
      </header>

      <ul className="divide-y divide-line/70 px-4">
        {d.fields.map((f) => (
          <li key={f.selector} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate text-[14px] text-fg">
              {f.label} <span className="font-mono text-[11px] text-dim">{KIND_LABEL[f.kind] ?? f.kind}</span>
            </span>
            <OutcomePill action={f.action} />
          </li>
        ))}
      </ul>

      <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2">
        <TagCode code={d.tag_code} />
        <span className="min-w-0 truncate font-mono text-[13px] text-fg" title={d.alias_email ?? undefined}>
          {d.alias_email ?? <span className="text-dim">no email given</span>}
        </span>
      </div>

      <footer className="flex flex-col gap-2 px-4 py-3">
        <ReceiptCheck disclosureId={d.id} />
        {broker && <OptOut disc={d} existing={optout} onChanged={onChanged} />}
      </footer>
    </article>
  );
}

export function Ledger({ state, onChanged }: { state: UiState; onChanged: () => void }) {
  const discs = [...state.disclosures].reverse();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionLabel right={<span className="font-mono text-[12px] text-dim">{discs.length} receipts</span>}>Ledger</SectionLabel>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {discs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted">
            Each disclosure gets a tag code and an Ed25519-signed consent receipt.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {discs.map((d) => (
              <LedgerCard key={d.id} d={d} state={state} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
