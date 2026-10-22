"use client";

import { useEffect, useMemo, useState } from "react";
import { api, cx } from "./format";
import type { Action, CardView } from "./types";
import { useToast } from "./Toast";
import { Button, Icon, Tag } from "./ui";

const ACTIONS: Action[] = ["send", "tag", "withhold"];
const ACTION_LABEL: Record<Action, string> = { send: "Send", tag: "Tag", withhold: "Withhold" };
const ACTION_ACTIVE: Record<Action, string> = {
  send: "bg-ink text-white",
  tag: "bg-accent text-white",
  withhold: "bg-well text-ink shadow-[inset_0_0_0_1px_var(--color-ink)]",
};

const KIND: Record<string, string> = {
  email: "email", phone: "phone", fullName: "full name", firstName: "first name", lastName: "last name", street: "street",
  city: "city", state: "state", zip: "zip", dob: "date of birth", ssn: "SSN", governmentId: "government ID",
  financialAccount: "financial account", other: "other",
};

/** Brokers often list a dozen brand names; two are enough to recognise them. */
function shortDba(dba: string): string {
  const names = dba.split(/;\s*/).map((s) => s.trim()).filter(Boolean);
  return names.length > 2 ? `${names.slice(0, 2).join("; ")} +${names.length - 2} more` : names.join("; ");
}

function Segmented({ allowed, value, onChange, disabled }: { allowed: Action[]; value: Action; onChange: (a: Action) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex border border-line-strong" role="radiogroup">
      {/* Three fixed slots so columns line up; options a field can't take stay empty. */}
      {ACTIONS.map((a, i) =>
        allowed.includes(a) ? (
          <button
            key={a}
            role="radio"
            aria-checked={value === a}
            disabled={disabled}
            onClick={() => onChange(a)}
            className={cx(
              "h-7 w-[76px] font-mono text-[11.5px] font-medium transition-colors disabled:cursor-default",
              i > 0 && "border-l border-line-strong",
              value === a ? ACTION_ACTIVE[a] : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {ACTION_LABEL[a]}
          </button>
        ) : (
          <span key={a} className={cx("flex h-7 w-[76px] items-center justify-center font-mono text-[11px] text-line-strong", i > 0 && "border-l border-line-strong")} title={`${ACTION_LABEL[a]} isn't available for this kind of field`} aria-hidden>
            —
          </span>
        ),
      )}
    </div>
  );
}

export function ConsentCard({ view, readOnly, onClose }: { view: CardView; readOnly?: boolean; onClose: () => void }) {
  const toast = useToast();
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
  const filed = view.risk.findings.filter((f) => f.source === "ca-registry");
  const observed = view.risk.findings.filter((f) => f.source === "daylight");

  async function submit(approved: boolean) {
    if (!view.id) return;
    setBusy(approved ? "approve" : "deny");
    setErr(null);
    try {
      await api(`/api/consent/${view.id}`, { json: approved ? { approved, actions } : { approved } });
      toast(approved ? `Released to ${view.recipient.host}` : "Not shared", {
        detail: approved ? `${counts.send} sent · ${counts.tag} tagged · ${counts.withhold} withheld. A signed receipt is in the ledger.` : "The agent was told you declined. Nothing was typed.",
        tone: approved ? "ok" : "accent",
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="anim-rise flex max-h-full w-full max-w-[1120px] flex-col border border-ink bg-surface shadow-[0_24px_60px_-24px_rgba(17,19,24,0.35)]">
        {/* status strip */}
        <div className={cx("flex h-10 shrink-0 items-center justify-between gap-4 border-b px-6", isBroker ? "border-accent bg-accent text-white" : "border-line bg-well text-ink")}>
          <span className="flex items-center gap-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em]">
            <span className={cx("size-[7px]", isBroker ? "bg-white" : "bg-ink", !readOnly && "anim-blink")} />
            {readOnly ? "Preview · nothing is shared" : "Intercepted · awaiting your consent"}
          </span>
          <span className={cx("font-mono text-[11px]", isBroker ? "text-white/80" : "text-muted")}>
            {view.recipient.matchedBy === "none" ? "no registry match" : `matched by ${view.recipient.matchedBy.replace("registry-", "registry ")}`}
            {!readOnly && view.createdAt && <WaitTimer since={view.createdAt} />}
          </span>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <div className="border-b border-line px-6 py-5">
            <p className="label">Your agent wants to give personal data to</p>
            <h1 id="consent-title" className="mt-1.5 text-[26px] font-semibold leading-tight text-ink">
              {view.recipient.host}
            </h1>
            {view.request.purpose && view.request.purpose !== "Preview" && <p className="mt-1 text-[14px] text-muted">for “{view.request.purpose}”</p>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* INSPECT */}
            <section className="border-b border-line px-6 py-5 lg:border-r lg:border-b-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="label">02 · Inspect</h2>
                {isBroker ? <Tag tone="accent">Registered data broker</Tag> : <Tag>Not a broker</Tag>}
              </div>
              {isBroker ? (
                <>
                  <p className="text-[14.5px] leading-snug text-ink">
                    In its filing with the State of California, <span className="font-semibold">{primary.name}</span>
                    {primary.dba ? <span className="text-muted"> (dba {shortDba(primary.dba)})</span> : null} said it:
                  </p>
                  <ul className="mt-3 flex flex-col border-t border-line">
                    {filed.length === 0 && <li className="py-2 text-[13.5px] text-muted">reported no flagged practices.</li>}
                    {filed.map((f) => (
                      <li key={f.key + f.entity} className="flex gap-3 border-b border-line py-2">
                        <span className={cx("mt-[7px] size-[6px] shrink-0", f.severity === "high" ? "bg-accent" : "bg-ink-2")} aria-label={f.severity} />
                        <div className="min-w-0">
                          <p className="text-[14px] leading-snug text-ink">{f.text}</p>
                          {brokers.length > 1 && <p className="font-mono text-[10.5px] text-faint">{f.entity}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {observed.length > 0 && (
                    <div className="mt-4">
                      <div className="label mb-1.5">Observed by Daylight</div>
                      {observed.map((f) => (
                        <p key={f.key + f.entity} className="border-l-2 border-accent pl-3 text-[13.5px] leading-snug text-ink">
                          {f.text}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[14.5px] text-ink">{view.decision.why}</p>
                  <p className="mt-1 text-[13px] text-muted">Ordinary sites pass silently. Telltale stops only for registered brokers and sensitive identifiers.</p>
                </>
              )}
              <p className="mt-4 font-mono text-[11px] text-muted">source: CPPA Data Broker Registry · 2026 filings · self-reported</p>
              <button onClick={() => setLimitsOpen((o) => !o)} className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-ink-2 hover:text-ink" aria-expanded={limitsOpen}>
                <Icon name="chevron" className={cx("size-3 transition-transform", limitsOpen && "rotate-90")} />
                what this data can&apos;t tell you
              </button>
              {limitsOpen && (
                <ul className="anim-fade mt-2 flex flex-col gap-1 border-l border-line-strong pl-3 text-[12.5px] text-muted">
                  {view.risk.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* SANITIZE */}
            <section className="px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="label">03 · Sanitize</h2>
                <span className="font-mono text-[10.5px] text-faint">per field</span>
              </div>
              <dl className="mb-3 grid grid-cols-3 border border-line text-[11.5px] leading-snug">
                <div className="px-2.5 py-2">
                  <dt className="font-mono font-semibold text-ink">Send</dt>
                  <dd className="text-muted">your real value</dd>
                </div>
                <div className="border-l border-line px-2.5 py-2">
                  <dt className="font-mono font-semibold text-accent-ink">Tag</dt>
                  <dd className="text-muted">a working value marked for this site</dd>
                </div>
                <div className="border-l border-line px-2.5 py-2">
                  <dt className="font-mono font-semibold text-ink">Withhold</dt>
                  <dd className="text-muted">left blank</dd>
                </div>
              </dl>
              <div className="border border-line">
                {view.decision.fields.map((f, i) => {
                  const a = actions[f.selector] ?? f.action;
                  const warn = f.required && a === "withhold";
                  return (
                    <div key={f.selector} className={cx("flex items-center justify-between gap-4 px-3 py-2 transition-colors hover:bg-hover", i > 0 && "border-t border-line")}>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13.5px] font-medium text-ink">{f.label}</span>
                          <span className="font-mono text-[10px] text-faint">{KIND[f.kind] ?? f.kind}</span>
                          {f.required && <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-ink">req</span>}
                        </div>
                        <p className={cx("text-[11.5px] leading-snug", warn ? "text-accent-ink" : "text-muted")}>{warn ? "Required: the site may reject this." : f.reason}</p>
                      </div>
                      <Segmented allowed={f.allowed} value={a} onChange={(v) => setActions((s) => ({ ...s, [f.selector]: v }))} />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* RELEASE */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-well px-6 py-3.5">
          <p className="font-mono text-[12px] text-ink-2">
            <span className="text-muted">04 · Release</span>
            <span className="mx-3 text-line-strong">|</span>
            {counts.send} sent · <span className="text-accent-ink">{counts.tag} tagged</span> · {counts.withhold} withheld
            <span className="ml-3 text-muted">signed receipt on release</span>
          </p>
          <div className="flex items-center gap-2">
            {err && <span className="text-[12px] text-accent-ink">{err}</span>}
            {readOnly ? (
              <Button variant="primary" onClick={onClose}>
                Close preview
              </Button>
            ) : (
              <>
                <Button onClick={() => submit(false)} busy={busy === "deny"} disabled={!!busy}>
                  Don&apos;t share
                </Button>
                <Button variant="accent" onClick={() => submit(true)} busy={busy === "approve"} disabled={!!busy}>
                  Release with these choices
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// The gate declines on the person's behalf after 10 minutes without an answer.
const CONSENT_TIMEOUT_MS = 10 * 60_000;

function WaitTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const waited = Math.max(0, now - new Date(since).getTime());
  const left = Math.max(0, CONSENT_TIMEOUT_MS - waited);
  const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
  return (
    <span className="ml-3 border-l border-white/30 pl-3" title="Without an answer, Telltale declines for you after 10 minutes">
      agent waiting {mmss(waited)} · auto-declines in {mmss(left)}
    </span>
  );
}
