"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, cx, dayNumber, fmtDate, fmtStamp } from "./format";
import { useDashboard } from "./hooks";
import { complaintKey } from "./LeakAlert";
import { Paper } from "./Paper";
import { SiteHeader, SyntheticBadge } from "./SiteHeader";
import type { ComplaintDoc } from "./types";
import { Button, SimBadge, TagCode } from "./ui";

const CPPA_FORM = "https://cppa.ca.gov/webapplications/complaint";

function Fact({ n, label, when, tone, children, last }: { n: number; label: string; when: ReactNode; tone: "fg" | "signal" | "alarm"; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[36px_1fr] gap-x-4">
      {!last && <span className="absolute left-[17px] top-9 bottom-0 w-px bg-line" aria-hidden />}
      <span
        className={cx(
          "z-10 flex size-9 items-center justify-center rounded-full border-2 font-mono text-[14px] font-semibold",
          tone === "fg" && "border-line-2 bg-panel text-fg",
          tone === "signal" && "border-signal/70 bg-signal/10 text-signal",
          tone === "alarm" && "border-alarm bg-alarm/15 text-alarm",
        )}
      >
        {n}
      </span>
      <div className="pb-7">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>
          <span className="font-mono text-[13px] text-fg">{when}</span>
        </div>
        <div className="mt-1.5 text-[15px] leading-relaxed text-fg">{children}</div>
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
    <div className="min-h-screen">
      <SiteHeader right={state?.person.synthetic ? <SyntheticBadge name={state.person.firstName} /> : null} />
      <main className="mx-auto max-w-[1360px] px-6 py-8">
        <Link href="/" className="text-[14px] text-muted hover:text-fg">
          ← Console
        </Link>

        {!state ? (
          <p className="mt-10 text-muted">{error ? `Could not load: ${error}` : "Loading evidence…"}</p>
        ) : !leak || !ev ? (
          <div className="mt-10 rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">No leak with id <span className="font-mono">{leakId}</span>.</div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-alarm">Exhibit · leak traced</span>
                  {sim && <SimBadge />}
                </div>
                <h1 className="mt-2 text-[40px] font-semibold leading-[1.1] tracking-[-0.02em]">
                  <span className="font-mono text-[36px]">{ev.issuedTo.domain}</span> <span className="text-muted">→</span>{" "}
                  <span className="font-mono text-[36px] text-alarm">{leak.sender_domain}</span>
                </h1>
                <p className="mt-2 text-[16px] text-muted">One identifier, issued to one company, used by another. The tag says where it started.</p>
              </div>
              <TagCode code={ev.tagCode} size="lg" />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
              <section>
                <ol>
                  <Fact n={1} label="Issued" when={fmtStamp(ev.issuedTo.at)} tone="fg">
                    <span className="font-mono text-signal">{ev.observed.to}</span> was created for <span className="font-mono">{ev.issuedTo.domain}</span> only.
                    {ev.issuedTo.receiptId && (
                      <span className="mt-1 block text-[13px] text-muted">
                        Signed consent receipt <span className="font-mono text-fg">{ev.issuedTo.receiptId}</span>
                      </span>
                    )}
                  </Fact>
                  {optout ? (
                    <Fact n={2} label="Opt-out sent" when={fmtStamp(optout.sent_at)} tone="signal">
                      Directed <span className="font-mono">{optout.target_domain}</span> not to sell or share. Legal deadline (15 business days):{" "}
                      <span className="font-mono text-signal">{fmtDate(optout.due_at)}</span>
                      <span className="mt-1 block text-[13px] text-muted">{optout.channel === "manual" ? "Prepared for the person to send; the demo persona never emails real companies." : `Sent via ${optout.channel}.`}</span>
                    </Fact>
                  ) : (
                    <Fact n={2} label="Opt-out" when="none on file" tone="fg">
                      No opt-out request covered this identifier.
                    </Fact>
                  )}
                  <Fact n={3} label="Contact observed" when={sim && day !== null ? <span className="text-signal">Day {day}</span> : fmtStamp(ev.observed.at)} tone="alarm">
                    <span className="font-mono text-alarm">{ev.observed.from}</span> wrote to <span className="font-mono">{ev.observed.to}</span> via {ev.observed.channel}
                    {ev.observed.subject && <span className="mt-1 block text-muted">Subject: “{ev.observed.subject}”</span>}
                    {sim && <span className="mt-1 block text-[13px] text-signal">Replayed from a fictional sender for the demo. Not a real event.</span>}
                  </Fact>
                  <Fact n={4} label="Finding" when={ev.violation ? "violation" : "leak"} tone="alarm" last>
                    {ev.violation ? (
                      <>
                        First third-party use came <span className="font-semibold text-alarm">{lateBy} days after</span> the opt-out deadline of{" "}
                        <span className="font-mono">{fmtDate(ev.violation.deadlinePassed[0])}</span>.
                      </>
                    ) : (
                      <>The identifier reached a company it was never given to.</>
                    )}
                    {ev.senderRegistry.length > 0 ? (
                      <span className="mt-1 block text-[13px] text-muted">Sender is on the CA data broker registry as {ev.senderRegistry.map((s) => s.name).join(", ")}.</span>
                    ) : (
                      <span className="mt-1 block text-[13px] text-muted">Sender is not on the CA data broker registry.</span>
                    )}
                    {ev.senderFindings.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-[13px] text-muted">
                        {ev.senderFindings.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </Fact>
                </ol>

              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">Telltale drafts; the person files. Nothing is submitted automatically.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={copy} disabled={!doc}>
                      {copied ? "Copied" : "Copy text"}
                    </Button>
                    <Button size="sm" onClick={download} disabled={!doc}>
                      Download .txt
                    </Button>
                    <a
                      href={CPPA_FORM}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-lg bg-fg px-3 text-[13px] font-medium text-ink hover:bg-white"
                    >
                      Open CPPA complaint form
                      <svg width="12" height="12" viewBox="0 0 12 12" className="ml-1.5" aria-hidden>
                        <path d="M4 2h6v6M10 2L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </div>
                </div>
                {doc ? (
                  <Paper
                    title={doc.title}
                    body={doc.body}
                    exhibit={`Exhibit · ${ev.tagCode}`}
                    stamp={sim ? "Simulation —\ndo not file" : undefined}
                    footer={<p className="font-mono text-[12px] text-[#6b6455]">Drafted {fmtDate(new Date().toISOString())} · tag {ev.tagCode} · receipt {ev.issuedTo.receiptId ?? "n/a"}</p>}
                  />
                ) : (
                  <div className="paper flex h-[480px] items-center justify-center rounded-[3px] text-[16px] text-[#6b6455]">{docErr ? `Could not draft: ${docErr}` : "Drafting complaint…"}</div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
