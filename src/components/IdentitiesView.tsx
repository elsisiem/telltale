"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import type { Identity } from "@/lib/identities";
import { AppShell } from "./AppShell";
import { api, cx, dayNumber, fmtDate, fmtStamp } from "./format";
import { useDashboard, useEvents } from "./hooks";
import { useToast } from "./Toast";
import { Button, Card, Empty, Icon, Indicator, OutcomeTag, Skeleton, Tag, TagCode } from "./ui";

// Every site's version of you, side by side with the real one, and the inbox Telltale watches for it.

const MAIL: Record<string, { label: string; tone: "default" | "accent" | "muted" }> = {
  "first-party": { label: "Expected", tone: "default" },
  affiliate: { label: "Affiliate", tone: "default" },
  leak: { label: "Leak", tone: "accent" },
  untagged: { label: "Untagged", tone: "muted" },
};

function CopyInbox({ address }: { address: string }) {
  const toast = useToast();
  return (
    <Button
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(address).then(() => toast("Inbox address copied", { detail: `Mail sent to ${address} from anyone other than the site it was given to will show up as a leak.` }))
      }
    >
      Copy
    </Button>
  );
}

function IdentityCard({ id }: { id: Identity }) {
  const broker = id.brokers.length > 0;
  const leaked = id.leakIds.length > 0;
  const tagged = (f: Identity["fields"][number]) => f.action === "tag";
  return (
    <article id={id.tagCode} className={cx("anim-rise scroll-mt-20 border bg-surface target:outline target:outline-2 target:outline-offset-2 target:outline-ink", leaked ? "border-accent" : "border-line")}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
        <TagCode code={id.tagCode} size="lg" accent={broker} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-ink">{id.host}</h2>
          <p className="truncate text-[12.5px] text-muted">
            {broker ? <span className="font-mono text-accent-ink">{id.brokers.join(", ")}</span> : "Not a registered broker"} · given {fmtStamp(id.createdAt)}
            {id.purpose ? ` · ${id.purpose}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {leaked ? (
            <Tag tone="accent">Leaked</Tag>
          ) : id.inboxKind === "agentmail" ? (
            <Tag>
              <span className="anim-blink size-[5px] bg-ok" aria-hidden />
              Watching
            </Tag>
          ) : (
            <Tag tone="muted">Not watched</Tag>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="label px-5 py-2 font-medium">Field</th>
                <th className="label px-3 py-2 font-medium">You</th>
                <th className="label px-3 py-2 font-medium">This site got</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {id.fields.map((f) => (
                <tr key={f.label + f.kind} className="border-b border-line transition-colors last:border-0 hover:bg-hover">
                  <td className="px-5 py-2 text-[13px] text-ink-2">{f.label}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[12px] text-muted" title={f.real}>
                    {f.real || "—"}
                  </td>
                  <td className={cx("max-w-[220px] truncate px-3 py-2 font-mono text-[12px]", tagged(f) ? "font-semibold text-accent-ink" : f.action === "withhold" ? "text-faint" : "text-ink")} title={f.sent}>
                    {f.action === "withhold" ? "left blank" : f.sent || "—"}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <OutcomeTag action={f.action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col">
          <div className="border-b border-line px-5 py-3">
            <p className="label">Inbox for this site only</p>
            {id.inbox ? (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate border border-line bg-well px-2.5 py-1.5 font-mono text-[12.5px] text-ink" title={id.inbox}>
                  {id.inbox}
                </span>
                <CopyInbox address={id.inbox} />
              </div>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-muted">No email was given to this site.</p>
            )}
            {id.inboxKind === "plus" && <p className="mt-1.5 text-[11.5px] text-muted">Plus-addressed fallback: works, but a broker could strip the tag. A dedicated inbox is used when AgentMail is connected.</p>}
            {id.inboxKind === "agentmail" && <p className="mt-1.5 font-mono text-[10.5px] text-faint">real AgentMail inbox · checked every 5 seconds</p>}
          </div>

          <div className="flex-1 px-5 py-3">
            <p className="label mb-1.5">Mail received</p>
            {id.messages.length === 0 ? (
              <p className="text-[12.5px] text-muted">Nothing yet. Anything sent here by someone other than {id.domain} will be traced as a leak.</p>
            ) : (
              <ul className="flex flex-col border-t border-line">
                {id.messages.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 border-b border-line py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-ink">{m.subject ?? "(no subject)"}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted">
                        {m.replay ? <span className="text-accent-ink">Day {dayNumber(id.createdAt, m.at)}</span> : fmtStamp(m.at)} · {m.fromDomain ?? m.from}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {m.replay && <Tag tone="accent">Simulated</Tag>}
                      <Tag tone={MAIL[m.classification]?.tone ?? "muted"}>{MAIL[m.classification]?.label ?? m.classification}</Tag>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-well px-5 py-2.5">
            <span className="font-mono text-[11px] text-ink-2">
              {id.optOut ? (
                <>
                  opt-out of sale · due <span className="text-ink">{fmtDate(id.optOut.dueAt)}</span>
                </>
              ) : broker ? (
                <span className="text-accent-ink">no opt-out sent yet</span>
              ) : (
                "no opt-out needed"
              )}
            </span>
            {leaked && (
              <Link href={`/evidence/${id.leakIds[0]}`} className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-accent-ink hover:underline">
                Open evidence
                <Icon name="arrow" className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function IdentitiesView() {
  const { state, refreshSoon } = useDashboard();
  const [ids, setIds] = useState<Identity[] | null>(null);

  const load = useCallback(() => {
    api<{ identities: Identity[] }>("/api/identities")
      .then((r) => setIds(r.identities))
      .catch(() => setIds([]));
  }, []);
  useEffect(load, [load]);

  const connected = useEvents(
    useCallback(
      (e: TelltaleEvent) => {
        if (e.type === "message.received" || e.type === "leak.detected" || e.type === "disclosure.created") {
          load();
          refreshSoon();
        }
      },
      [load, refreshSoon],
    ),
  );

  const watched = ids?.filter((i) => i.inboxKind === "agentmail").length ?? 0;
  const mail = ids?.reduce((n, i) => n + i.messages.length, 0) ?? 0;
  const leaks = ids?.reduce((n, i) => n + i.leakIds.length, 0) ?? 0;

  return (
    <AppShell active="identities" state={state} connected={connected} crumbs={["Telltale", "Identities"]}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-6">
        <header>
          <h1 className="text-[22px] font-semibold text-ink">Identities</h1>
          <p className="mt-1 max-w-[780px] text-[14px] text-muted">
            Every site gets its own version of you. It works like the real thing, but it is marked, so if it ever turns up somewhere else it says exactly where it came from.
          </p>
        </header>

        <section className="grid gap-px border border-line bg-line md:grid-cols-3" aria-label="How a site's version of you is built">
          {[
            ["Email", "A new, real inbox just for that site", "maya.k7q2@agentmail.to"],
            ["Name", "A middle initial chosen by the tag", "Maya S. Okafor"],
            ["Address", "An attention line carrying the tag", "2140 Folsom St Attn K7Q2"],
          ].map(([k, d, ex]) => (
            <div key={k} className="bg-surface px-5 py-4">
              <p className="label">{k}</p>
              <p className="mt-1 text-[13.5px] text-ink">{d}</p>
              <p className="mt-1.5 font-mono text-[12px] text-accent-ink">{ex}</p>
            </div>
          ))}
        </section>

        <dl className="grid grid-cols-2 border border-line bg-surface md:grid-cols-4">
          {[
            ["Identities", ids?.length ?? "…", false],
            ["Inboxes watched", watched, false],
            ["Mail received", mail, false],
            ["Leaks traced", leaks, leaks > 0],
          ].map(([label, v, accent], i) => (
            <div key={String(label)} className={cx("px-5 py-3", i > 0 && "md:border-l md:border-line", i % 2 === 1 && "border-l border-line md:border-l")}>
              <dt className="label flex items-center gap-1.5">
                {label === "Inboxes watched" && <Indicator on={watched > 0} tone="ink" live={watched > 0} />}
                {label}
              </dt>
              <dd className={cx("mt-1 font-mono text-[24px] font-semibold leading-none tabular-nums", accent ? "text-accent-ink" : "text-ink")}>{String(v)}</dd>
            </div>
          ))}
        </dl>

        {!ids ? (
          <Skeleton className="h-[260px]" />
        ) : ids.length === 0 ? (
          <Card>
            <Empty className="m-4">
              No identities yet. Run the agent from the <Link href="/console" className="underline underline-offset-2">console</Link>; every site it fills a form on gets one.
            </Empty>
          </Card>
        ) : (
          ids.map((i) => <IdentityCard key={i.id} id={i} />)
        )}

        <p className="font-mono text-[11px] text-faint">Your real values are shown only here, to you. The agent and the model never see them.</p>
      </div>
    </AppShell>
  );
}
