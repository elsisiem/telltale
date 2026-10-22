"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "./AppShell";
import { api, cx, dayNumber, fmtDate, fmtStamp } from "./format";
import { useDashboard } from "./hooks";
import { complaintKey } from "./LeakAlert";
import { Paper } from "./Paper";
import type { ComplaintDoc } from "./types";
import { Button, Card, CardHeader, Empty, Icon, SimTag, Skeleton, Tag, TagCode } from "./ui";

const CPPA_FORM = "https://cppa.ca.gov/webapplications/complaint";

function Fact({ n, label, when, accent, children, last }: { n: number; label: string; when: ReactNode; accent?: boolean; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-x-4">
      {!last && <span className="absolute bottom-0 left-[13.5px] top-7 w-px bg-line-strong" aria-hidden />}
      <span className={cx("z-10 flex size-7 items-center justify-center border font-mono text-[12px] font-semibold", accent ? "border-accent bg-accent text-white" : "border-ink bg-surface text-ink")}>{n}</span>
      <div className="pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="label text-ink">{label}</span>
          <span className="font-mono text-[11.5px] text-muted">{when}</span>
        </div>
        <div className="mt-1.5 text-[14px] leading-relaxed text-ink">{children}</div>
      </div>
    </li>
  );
}

export function EvidenceView({ leakId }: { leakId: string }) {
  const { state, error } = useDashboard();
  const [doc, setDoc] = useState<ComplaintDoc | null>(null);
  const [docErr, setDocErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    try {
      const cached = sessionStorage.getItem(complaintKey(leakId));
      if (cached) {
        setDoc(JSON.parse(cached) as ComplaintDoc);
        return;
      }
    } catch {}
    api<ComplaintDoc>(`/api/leaks/${leakId}/complaint`, { method: "POST" })
      .then((d) => {
        setDoc(d);
        try {
          sessionStorage.setItem(complaintKey(leakId), JSON.stringify(d));
        } catch {}
      })
      .catch((e: Error) => setDocErr(e.message));
  }, [leakId]);

  const leak = state?.leaks.find((l) => l.id === leakId);
  const disc = leak && state?.disclosures.find((d) => d.id === leak.disclosure_id);
  const ev = leak?.evidence;
  const optout = ev && state?.requests.find((r) => r.kind === "optout" && r.tag_code === ev.tagCode);
  const sim = !!ev?.observed.replay;
  const day = disc && ev ? dayNumber(disc.created_at, ev.observed.at) : null;
  const lateBy = ev?.violation ? dayNumber(ev.violation.deadlinePassed[0], ev.observed.at) : null;

  function copy() {
    if (!doc) return;
    void navigator.clipboard.writeText(doc.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }
  function download() {
    if (!doc) return;
    const blob = new Blob([`${doc.title}\n\n${doc.body}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `telltale-complaint-${ev?.tagCode ?? leakId.slice(0, 8)}${sim ? "-SIMULATION" : ""}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <AppShell
      active="evidence"
      state={state}
      crumbs={["Telltale", "Evidence", ev?.tagCode ?? leakId.slice(0, 8)]}
      actions={
        <Link href="/" className="inline-flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11.5px] text-muted transition-colors hover:bg-well hover:text-ink">
          Back to console
        </Link>
      }
    >
      <div className="mx-auto max-w-[1320px] p-6">
        {!state ? (
          error ? (
            <p className="border-l-2 border-accent pl-3 text-[13px] text-accent-ink">Could not load: {error}</p>
          ) : (
            <Skeleton className="h-[420px]" />
          )
        ) : !leak || !ev ? (
          <Empty>
            No leak with id <span className="font-mono">{leakId}</span>.
          </Empty>
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Tag tone="accent">Exhibit · leak traced</Tag>
                  {sim && <SimTag />}
                </div>
                <h1 className="mt-3 flex flex-wrap items-center gap-x-3 text-[28px] font-semibold leading-tight">
                  <span>{ev.issuedTo.domain}</span>
                  <Icon name="arrow" className="size-5 text-muted" />
                  <span className="text-accent-ink">{leak.sender_domain}</span>
                </h1>
                <p className="mt-1.5 text-[14px] text-muted">One identifier, issued to one company, used by another. The tag says where it started.</p>
              </div>
              <TagCode code={ev.tagCode} size="lg" accent />
            </header>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <Card>
                <CardHeader title="Chain of facts" meta={<span className="font-mono text-[10.5px] text-faint">4 entries</span>} />
                <ol className="px-5 pt-5">
                  <Fact n={1} label="Issued" when={fmtStamp(ev.issuedTo.at)}>
                    <span className="font-mono text-[13px]">{ev.observed.to}</span> was created for <span className="font-mono text-[13px]">{ev.issuedTo.domain}</span> only.
                    {ev.issuedTo.receiptId && (
                      <span className="mt-1 block font-mono text-[11.5px] text-muted">
                        receipt {ev.issuedTo.receiptId} · ed25519
                      </span>
                    )}
                  </Fact>
                  {optout ? (
                    <Fact n={2} label="Opt-out sent" when={fmtStamp(optout.sent_at)}>
                      Directed <span className="font-mono text-[13px]">{optout.target_domain}</span> not to sell or share. Legal deadline, 15 business days:{" "}
                      <span className="font-mono text-[13px] font-semibold">{fmtDate(optout.due_at)}</span>
                      <span className="mt-1 block text-[12px] text-muted">{optout.channel === "manual" ? "Prepared for the person to send; the demo persona never emails real companies." : `Sent via ${optout.channel}.`}</span>
                    </Fact>
                  ) : (
                    <Fact n={2} label="Opt-out" when="none on file">
                      No opt-out request covered this identifier.
                    </Fact>
                  )}
                  <Fact n={3} label="Contact observed" when={sim && day !== null ? <span className="text-accent-ink">Day {day}</span> : fmtStamp(ev.observed.at)} accent>
                    <span className="font-mono text-[13px] text-accent-ink">{ev.observed.from}</span> wrote to <span className="font-mono text-[13px]">{ev.observed.to}</span> via {ev.observed.channel}
                    {ev.observed.subject && <span className="mt-1 block text-muted">Subject: “{ev.observed.subject}”</span>}
                    {sim && <span className="mt-1 block text-[12px] text-accent-ink">Replayed from a fictional sender for the demo. Not a real event.</span>}
                  </Fact>
                  <Fact n={4} label="Finding" when={ev.violation ? "violation" : "leak"} accent last>
                    {ev.violation ? (
                      <>
                        First third-party use came <span className="font-semibold text-accent-ink">{lateBy} days after</span> the opt-out deadline of{" "}
                        <span className="font-mono text-[13px]">{fmtDate(ev.violation.deadlinePassed[0])}</span>.
                      </>
                    ) : (
                      <>The identifier reached a company it was never given to.</>
                    )}
                    <span className="mt-1 block text-[12px] text-muted">
                      {ev.senderRegistry.length > 0 ? `Sender is on the CA data broker registry as ${ev.senderRegistry.map((s) => s.name).join(", ")}.` : "Sender is not on the CA data broker registry."}
                    </span>
                    {ev.senderFindings.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 border-l border-line-strong pl-3 text-[12px] text-muted">
                        {ev.senderFindings.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </Fact>
                </ol>
              </Card>

              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[11.5px] text-muted">Telltale drafts; the person files. Nothing is submitted automatically.</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={copy} disabled={!doc}>
                      {copied ? "Copied" : "Copy text"}
                    </Button>
                    <Button size="sm" onClick={download} disabled={!doc}>
                      Download .txt
                    </Button>
                    <a href={CPPA_FORM} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-[3px] bg-ink px-2.5 font-mono text-[11.5px] font-medium text-white transition-colors hover:bg-[#2a2e36]">
                      CPPA complaint form
                      <Icon name="external" className="size-3.5" />
                    </a>
                  </div>
                </div>
                {doc ? (
                  <Paper
                    title={doc.title}
                    body={doc.body}
                    exhibit={`Exhibit · ${ev.tagCode}`}
                    stamp={sim ? "Simulation\ndo not file" : undefined}
                    footer={<p className="font-mono text-[11px] text-[#6b6455]">drafted {fmtDate(new Date().toISOString())} · tag {ev.tagCode} · receipt {ev.issuedTo.receiptId ?? "n/a"}</p>}
                  />
                ) : (
                  <div className="paper flex h-[480px] items-center justify-center font-mono text-[13px] text-[#6b6455]">{docErr ? `Could not draft: ${docErr}` : "Drafting complaint…"}</div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
