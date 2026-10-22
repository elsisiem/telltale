"use client";

import Link from "next/link";
import { useState } from "react";
import { api, cx, fmtDate, fmtStamp } from "./format";
import { Paper } from "./Paper";
import { useToast } from "./Toast";
import type { DisclosureRow, ReceiptResponse, RequestRow, RequestSummary, UiState } from "./types";
import { Button, Card, CardHeader, Empty, Icon, OutcomeTag, RiskTag, Tag, TagCode } from "./ui";

const KIND: Record<string, string> = {
  email: "email", phone: "phone", fullName: "name", firstName: "first", lastName: "last", street: "street", city: "city",
  state: "state", zip: "zip", dob: "dob", ssn: "ssn", governmentId: "gov id", financialAccount: "bank", other: "other",
};

function ReceiptCheck({ disclosureId }: { disclosureId: string }) {
  const toast = useToast();
  const [res, setRes] = useState<ReceiptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<ReceiptResponse>(`/api/receipts/${disclosureId}`);
      setRes(r);
      toast(r.verified ? "Receipt verified" : "Receipt failed verification", { detail: r.verified ? "Ed25519 signature matches the recorded consent." : "The receipt does not match its signature.", tone: r.verified ? "ok" : "error" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!res)
    return (
      <>
        <Button size="sm" onClick={verify} busy={busy}>
          Verify receipt
        </Button>
        {err && <span className="text-[11.5px] text-accent-ink">{err}</span>}
      </>
    );

  return (
    <div className="w-full">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 border border-ink px-2.5 py-1.5 text-left transition-colors hover:bg-hover" aria-expanded={open}>
        <span className={cx("flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]", res.verified ? "text-ink" : "text-accent-ink")}>
          {res.verified && <Icon name="check" />}
          {res.verified ? "Signature valid · Ed25519" : "Signature invalid"}
        </span>
        <span className="font-mono text-[10.5px] text-muted">{open ? "hide" : "json"}</span>
      </button>
      {open && <pre className="anim-fade mt-1.5 max-h-60 overflow-auto border border-line bg-well p-2.5 font-mono text-[10.5px] leading-relaxed text-ink-2">{JSON.stringify(res.receipt, null, 2)}</pre>}
    </div>
  );
}

function OptOut({ disc, existing, onChanged }: { disc: DisclosureRow; existing?: RequestSummary; onChanged: () => void }) {
  const toast = useToast();
  const [sent, setSent] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [letter, setLetter] = useState(false);
  const req = sent ?? existing;

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<RequestRow>("/api/requests/optout", { json: { disclosureId: disc.id } });
      setSent(r);
      toast("Opt-out prepared", { detail: r.channel === "manual" ? `Ready to send. Deadline ${fmtDate(r.due_at)}. The demo persona never emails real companies.` : `Sent from the tagged inbox. Deadline ${fmtDate(r.due_at)}.` });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!req)
    return (
      <>
        <Button size="sm" variant="secondary" onClick={send} busy={busy} className="border-accent text-accent-ink hover:border-accent-ink">
          Send opt-out
        </Button>
        {err && <span className="text-[11.5px] text-accent-ink">{err}</span>}
      </>
    );

  return (
    <div className="w-full border-l-2 border-accent bg-accent-wash/60 px-2.5 py-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">Opt-out of sale</span>
        <span className="font-mono text-[11px] text-ink-2">due {fmtDate(req.due_at)}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted">{req.channel === "manual" ? "Ready to send. The demo persona never emails real companies." : `Sent via ${req.channel} · ${fmtStamp(req.sent_at)}`}</p>
      {sent?.body && (
        <>
          <button onClick={() => setLetter((s) => !s)} className="mt-1 font-mono text-[11px] text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
            {letter ? "hide letter" : "read letter"}
          </button>
          {letter && <Paper body={sent.body} compact className="mt-2 max-h-72 overflow-auto" exhibit="Opt-out" />}
        </>
      )}
    </div>
  );
}

function Entry({ d, state, onChanged, focused, onInspect }: { d: DisclosureRow; state: UiState; onChanged: () => void; focused?: boolean; onInspect?: (id: string) => void }) {
  const broker = d.broker_ids.length > 0;
  const names = d.broker_ids.map((id) => state.brokerNames[id] ?? id);
  const optout = state.requests.find((r) => r.kind === "optout" && r.tag_code === d.tag_code);
  const leaked = state.leaks.some((l) => l.disclosure_id === d.id);
  return (
    <article className={cx("anim-rise border-b border-line px-4 py-3 transition-colors last:border-0", focused && "bg-hover", leaked ? "shadow-[inset_2px_0_0_0_var(--color-accent)]" : focused && "shadow-[inset_2px_0_0_0_var(--color-ink)]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-ink">{d.recipient_host}</h3>
          <p className="truncate text-[12px] text-muted">{d.purpose || "—"}</p>
          {broker && <p className="truncate font-mono text-[11px] text-accent-ink">{names.join(", ")}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <RiskTag level={d.risk_level} />
          {leaked && <Tag tone="accent">Leaked</Tag>}
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        {d.fields.map((f) => (
          <div key={f.selector + f.kind} className="contents">
            <dt className="truncate text-[12.5px] text-ink-2">
              {f.label} <span className="font-mono text-[10px] text-faint">{KIND[f.kind] ?? f.kind}</span>
            </dt>
            <dd>
              <OutcomeTag action={f.action} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-2.5 flex items-center gap-2 border border-line bg-well px-2 py-1.5" title={`Given ${fmtStamp(d.created_at)}`}>
        <TagCode code={d.tag_code} size="sm" accent={broker} />
        <span className="min-w-0 truncate font-mono text-[11.5px] text-ink" title={d.alias_email ?? undefined}>
          {d.alias_email ?? <span className="text-faint">no email given</span>}
        </span>
        <Link href={`/identities#${d.tag_code}`} className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink" title="See what this site received, next to your real details">
          identity
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ReceiptCheck disclosureId={d.id} />
        {onInspect && (
          <Button size="sm" variant="ghost" onClick={() => onInspect(d.id)} className={cx(focused && "bg-well text-ink")} title="Show this disclosure in the pipeline">
            {focused ? "In pipeline" : "Inspect"}
          </Button>
        )}
        {broker && <OptOut disc={d} existing={optout} onChanged={onChanged} />}
      </div>
    </article>
  );
}

export function Ledger({ state, onChanged, focusId, onInspect }: { state: UiState; onChanged: () => void; focusId?: string | null; onInspect?: (id: string) => void }) {
  const discs = [...state.disclosures].reverse();
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader title="Ledger" meta={<span className="font-mono text-[10.5px] text-faint">{discs.length} signed receipts</span>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {discs.length === 0 ? <Empty className="m-3">Each disclosure gets a tag and an Ed25519-signed consent receipt.</Empty> : discs.map((d) => <Entry key={d.id} d={d} state={state} onChanged={onChanged} focused={focusId === d.id} onInspect={onInspect} />)}
      </div>
    </Card>
  );
}
