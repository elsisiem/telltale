"use client";

import { useEffect, useState } from "react";
import { api, cx, fmtTime, hostOf } from "./format";
import { Button, SectionLabel } from "./ui";

// Stage presets. Edit freely: `label` is the chip text, `task` is what the agent receives.
export const PRESETS: { label: string; task: string }[] = [
  // {origin} becomes this app's address: the dental office is a fictional demo page served by Telltale.
  { label: "Book a dental cleaning", task: "Book a dental cleaning at {origin}/demo/dental using my details" },
  { label: "Get car insurance quotes", task: "Get me car insurance quotes at https://www.bestautoinsurance.com for my 2019 Honda Civic. Use my details where the form asks." },
  { label: "People-search account", task: "Create a free account at https://www.spokeo.com so I can check what it shows about me" },
];

export type LogEntry =
  | { id: string; at: string; kind: "run"; task: string }
  | { id: string; at: string; kind: "tool"; tool: string; input: unknown }
  | { id: string; at: string; kind: "log"; text: string }
  | { id: string; at: string; kind: "done"; text: string };

function Icon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "navigate":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2c1.8 2 1.8 10 0 12M8 2c-1.8 2-1.8 10 0 12" />
        </svg>
      );
    case "read_page":
      return (
        <svg {...common}>
          <path d="M3 2.5h7l3 3v8H3z" />
          <path d="M5.5 7.5h5M5.5 10h5" />
        </svg>
      );
    case "fill_form":
      return (
        <svg {...common}>
          <path d="M2.5 3.5A1 1 0 0 1 3.5 2.5h4.6l5.4 5.4-5.6 5.6-5.4-5.4z" />
          <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "click":
      return (
        <svg {...common}>
          <path d="M5 2.5v8l2.2-2 1.6 3.6 1.6-.7-1.6-3.5H12z" />
        </svg>
      );
    case "finish":
      return (
        <svg {...common}>
          <path d="M3 8.5l3.2 3L13 4.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
  }
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function LogRow({ e }: { e: LogEntry }) {
  if (e.kind === "run")
    return (
      <div className="anim-row-in border-t border-line pt-3 mt-1 first:border-0 first:mt-0 first:pt-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">New run</span>
          <span className="font-mono text-[12px] text-dim">{fmtTime(e.at)}</span>
        </div>
        <p className="mt-1 text-[15px] text-fg">{e.task}</p>
      </div>
    );
  if (e.kind === "log")
    return <p className="anim-row-in pl-7 text-[14px] leading-snug text-muted">{e.text}</p>;
  if (e.kind === "done") {
    const err = e.text.startsWith("Error:");
    return (
      <div className={cx("anim-row-in rounded-lg border px-3 py-2.5 text-[14px]", err ? "border-alarm/40 bg-alarm/[0.07] text-alarm" : "border-pass/30 bg-pass/[0.06] text-fg")}>
        <span className={cx("mr-2 font-semibold", err ? "text-alarm" : "text-pass")}>{err ? "Stopped" : "Done"}</span>
        {err ? e.text.replace(/^Error:\s*/, "") : e.text}
      </div>
    );
  }
  const input = rec(e.input);
  let main: React.ReactNode = e.tool;
  let tone = "text-muted";
  switch (e.tool) {
    case "navigate": {
      const url = String(input.url ?? "");
      main = (
        <>
          Opened <span className="font-mono text-fg">{hostOf(url)}</span>
          <span className="font-mono text-dim">{url.replace(/^https?:\/\/[^/]+/, "")}</span>
        </>
      );
      break;
    }
    case "read_page":
      main = "Read the page";
      break;
    case "fill_form": {
      const fields = Array.isArray(input.fields) ? input.fields : [];
      tone = "text-signal";
      main = (
        <>
          <span className="text-fg">
            Asked Telltale for <span className="font-semibold text-signal">{fields.length} field{fields.length === 1 ? "" : "s"}</span>
          </span>
          {typeof input.purpose === "string" && <span className="block text-[13px] text-muted">for “{input.purpose}” · values never reach the model</span>}
        </>
      );
      break;
    }
    case "click":
      main = (
        <>
          Clicked <span className="font-mono text-[13px] text-fg">{String(input.selector ?? "")}</span>
        </>
      );
      break;
    case "finish":
      tone = "text-pass";
      main = <span className="text-fg">{String(input.summary ?? "Finished")}</span>;
      break;
  }
  return (
    <div className="anim-row-in flex items-start gap-3">
      <span className={cx("mt-[3px] shrink-0", tone)}>
        <Icon name={e.tool} />
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-snug text-muted break-words">{main}</div>
      <span className="shrink-0 font-mono text-[11px] text-dim">{fmtTime(e.at)}</span>
    </div>
  );
}

export function AgentPanel({
  log,
  liveViewUrl,
  running,
  modelOn,
  onStarted,
}: {
  log: LogEntry[];
  liveViewUrl: string | null;
  running: boolean;
  modelOn: boolean;
  onStarted: (runId: string, task: string) => void;
}) {
  const withOrigin = (t: string) => (typeof window === "undefined" ? t : t.replaceAll("{origin}", window.location.origin));
  const [task, setTask] = useState(PRESETS[0].task);
  useEffect(() => setTask((t) => withOrigin(t)), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { runId } = await api<{ runId: string }>("/api/agent/run", { json: { task: withOrigin(task) } });
      onStarted(runId, task);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionLabel
        right={
          running ? (
            <span className="flex items-center gap-2 text-[12px] text-signal">
              <span className="size-1.5 animate-pulse rounded-full bg-signal" /> Running
            </span>
          ) : null
        }
      >
        Agent
      </SectionLabel>
      <div className="rounded-xl border border-line bg-panel p-3">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-ink px-3 py-2 text-[15px] leading-snug text-fg placeholder:text-dim focus:border-line-2 focus:outline-none"
          placeholder="Tell your agent what to do…"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setTask(withOrigin(p.task))}
              className={cx(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                task === p.task ? "border-signal/50 bg-signal/10 text-signal" : "border-line text-muted hover:border-line-2 hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" onClick={run} busy={busy} disabled={task.trim().length < 3} className="flex-1">
            Run agent
          </Button>
        </div>
        {!modelOn && !error && <p className="mt-2 text-[12px] text-dim">No model key set. Use the stage panel (press D) to preview a site.</p>}
        {error && (
          <p className="mt-2 rounded-md border border-alarm/40 bg-alarm/[0.08] px-2.5 py-1.5 text-[13px] text-alarm">
            {error.includes("ANTHROPIC_API_KEY") ? "The agent needs ANTHROPIC_API_KEY. Preview a site from the stage panel instead (press D)." : error}
          </p>
        )}
      </div>

      {liveViewUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-black">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="text-[12px] text-muted">Live browser</span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-alarm">
              <span className="size-1.5 rounded-full bg-alarm" /> Live
            </span>
          </div>
          <iframe src={liveViewUrl} className="aspect-[16/10] w-full" allow="autoplay; clipboard-read; clipboard-write" title="Agent browser live view" />
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted">
            The agent never sees Maya&apos;s details. When it reaches a form, it asks Telltale, and Telltale decides what each field gets.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {log.map((e) => (
              <LogRow key={e.id} e={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
