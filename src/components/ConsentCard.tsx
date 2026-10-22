"use client";

import { useEffect, useMemo, useState } from "react";
import { api, cx } from "./format";
import type { Action, CardView } from "./types";
import { Button, Dot } from "./ui";

const ACTION_LABEL: Record<Action, string> = { send: "Send", tag: "Tag", withhold: "Withhold" };
const ACTION_ACTIVE: Record<Action, string> = {
  send: "bg-fg text-ink",
  tag: "bg-signal text-ink",
  withhold: "bg-[#3a424d] text-fg",
};

const KIND_LABEL: Record<string, string> = {
  email: "email", phone: "phone", fullName: "full name", firstName: "first name", lastName: "last name", street: "street",
  city: "city", state: "state", zip: "zip", dob: "date of birth", ssn: "SSN", governmentId: "government ID",
  financialAccount: "financial account", other: "other",
};

function Segmented({ allowed, value, onChange }: { allowed: Action[]; value: Action; onChange: (a: Action) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line-2 bg-ink p-0.5" role="radiogroup">
      {/* Every control has three slots so columns line up; options a field can't take stay empty. */}
      {(["send", "tag", "withhold"] as Action[]).map((a) =>
        allowed.includes(a) ? (
          <button
            key={a}
            role="radio"
            aria-checked={value === a}
            onClick={() => onChange(a)}
            className={cx("h-8 w-[84px] rounded-md text-[13px] font-semibold transition-colors", value === a ? ACTION_ACTIVE[a] : "text-muted hover:text-fg")}
          >
            {ACTION_LABEL[a]}
          </button>
        ) : (
          <span key={a} className="flex h-8 w-[84px] items-center justify-center text-[12px] text-dim/50" title={`${ACTION_LABEL[a]} isn't available for this kind of field`} aria-hidden>
            —
          </span>
        ),
      )}
    </div>
  );
}

export function ConsentCard({ view, readOnly, onClose }: { view: CardView; readOnly?: boolean; onClose: () => void }) {
  const initial = useMemo(() => Object.fromEntries(view.decision.fields.map((f) => [f.selector, f.action])) as Record<string, Action>, [view]);
  const [actions, setActions] = useState(initial);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  useEffect(() => setActions(initial), [initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && readOnly) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, onClose]);

  const brokers = view.recipient.brokers;
  const isBroker = brokers.length > 0;
  const primary = brokers[0];
  const counts = { send: 0, tag: 0, withhold: 0 } as Record<Action, number>;
  for (const a of Object.values(actions)) counts[a]++;

  async function submit(approved: boolean) {
    if (!view.id) return;
    setBusy(approved ? "approve" : "deny");
    setErr(null);
    try {
      await api(`/api/consent/${view.id}`, { json: approved ? { approved, actions } : { approved } });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#05070a]/80 p-6 backdrop-blur-[6px]" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="anim-slide-up flex max-h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-8 py-3">
          <span className="flex items-center gap-2.5 text-[13px] font-medium text-muted">
            <Dot tone={isBroker ? "alarm" : "signal"} pulse={!readOnly} />
            {readOnly ? "Preview · what Telltale would ask. Nothing is shared." : "Telltale paused your agent before it typed anything"}
          </span>
          <span className="font-mono text-[12px] text-dim">
            {view.recipient.matchedBy === "none" ? "no registry match" : `matched by ${view.recipient.matchedBy.replace("registry-", "registry ")}`}
          </span>
        </div>

        <div className="min-h-0 overflow-y-auto px-8 pt-6 pb-4">
          <h1 id="consent-title" className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            Your agent wants to give your data to <span className="font-mono text-[30px] font-medium">{view.recipient.host}</span>
          </h1>
          {view.request.purpose && view.request.purpose !== "Preview" && <p className="mt-1.5 text-[16px] text-muted">Purpose: {view.request.purpose}</p>}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
            {/* WHO */}
            <section>
              {isBroker ? (
                <div className="overflow-hidden rounded-xl border border-alarm/50">
                  <div className="flex items-center gap-2.5 bg-alarm px-4 py-2.5 text-[14px] font-semibold uppercase tracking-[0.08em] text-white">
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                      <path d="M8 1.5L15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M8 6v3.5M8 11.6v.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Registered data broker · California
                  </div>
                  <div className="bg-alarm/[0.06] px-4 py-4">
                    <p className="text-[16px] text-fg">
                      In its filing with the State of California, <span className="font-semibold">{primary.name}</span>
                      {primary.dba ? <span className="text-muted"> (dba {primary.dba})</span> : null} said it:
                    </p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {view.risk.findings.length === 0 && <li className="text-[15px] text-muted">reported no flagged practices.</li>}
                      {view.risk.findings.map((f) => (
                        <li key={f.key + f.entity} className="flex gap-3">
                          <span className="pt-[9px]">
                            <Dot tone={f.severity === "high" ? "alarm" : f.severity === "medium" ? "signal" : "muted"} />
                          </span>
                          <div>
                            <p className="text-[16px] leading-snug text-fg">{f.text}</p>
                            {(brokers.length > 1 || f.source === "daylight") && (
                              <p className="text-[12px] text-dim">
                                {f.entity}
                                {f.source === "daylight" ? " · Daylight scan" : ""}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-pass/40 bg-pass/[0.06] px-4 py-4">
                  <div className="flex items-center gap-2.5 text-[17px] font-semibold text-pass">
                    <Dot tone="pass" /> Not a registered data broker
                  </div>
                  <p className="mt-2 text-[15px] text-fg">{view.decision.why}</p>
                  <p className="mt-1 text-[14px] text-muted">Ordinary sites pass silently. Telltale stops only for brokers and sensitive identifiers.</p>
                </div>
              )}

              <p className="mt-3 text-[13px] text-muted">
                Source: <span className="text-fg">CPPA Data Broker Registry</span> (2026 filings, self-reported)
              </p>
              <button onClick={() => setLimitsOpen((o) => !o)} className="mt-1 flex items-center gap-1.5 text-[13px] text-muted hover:text-fg" aria-expanded={limitsOpen}>
                <span className={cx("inline-block transition-transform", limitsOpen && "rotate-90")}>›</span>
                What this data can&apos;t tell you
              </button>
              {limitsOpen && (
                <ul className="anim-fade-in mt-2 flex list-disc flex-col gap-1 pl-8 text-[13px] text-muted">
                  {view.risk.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* WHAT */}
            <section>
              <div className="mb-3 grid grid-cols-3 gap-2 text-[12px] leading-snug">
                <div className="rounded-lg border border-line px-2.5 py-2">
                  <span className="font-semibold text-fg">Send</span>
                  <span className="block text-muted">your real value</span>
                </div>
                <div className="rounded-lg border border-signal/40 px-2.5 py-2">
                  <span className="font-semibold text-signal">Tag</span>
                  <span className="block text-muted">a working value marked for this site</span>
                </div>
                <div className="rounded-lg border border-line px-2.5 py-2">
                  <span className="font-semibold text-fg">Withhold</span>
                  <span className="block text-muted">left blank</span>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                {view.decision.fields.map((f, i) => {
                  const a = actions[f.selector] ?? f.action;
                  const warn = f.required && a === "withhold";
                  return (
                    <div key={f.selector} className={cx("flex items-center justify-between gap-4 px-4 py-2.5", i > 0 && "border-t border-line", warn && "bg-signal/[0.05]")}>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-medium text-fg">{f.label}</span>
                          {f.required && <span className="text-[11px] font-semibold uppercase tracking-wider text-signal">required</span>}
                          <span className="font-mono text-[11px] text-dim">{KIND_LABEL[f.kind] ?? f.kind}</span>
                        </div>
                        <p className={cx("text-[12px] leading-snug", warn ? "text-signal" : "text-muted")}>
                          {warn ? "Required: the site may reject this." : f.reason}
                        </p>
                      </div>
                      <Segmented allowed={f.allowed} value={a} onChange={(v) => setActions((s) => ({ ...s, [f.selector]: v }))} />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-4 border-t border-line bg-panel-2 px-8 py-4">
          <p className="text-[14px] text-muted">
            <span className="text-fg">{counts.send}</span> sent · <span className="text-signal">{counts.tag}</span> tagged · <span className="text-fg">{counts.withhold}</span>{" "}
            withheld. A signed receipt records this choice.
          </p>
          <div className="flex items-center gap-3">
            {err && <span className="text-[13px] text-alarm">{err}</span>}
            {readOnly ? (
              <Button variant="primary" size="lg" onClick={onClose}>
                Close preview
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="lg" onClick={() => submit(false)} busy={busy === "deny"} disabled={!!busy}>
                  Don&apos;t share
                </Button>
                <Button variant="primary" size="lg" onClick={() => submit(true)} busy={busy === "approve"} disabled={!!busy}>
                  Share with these choices
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
