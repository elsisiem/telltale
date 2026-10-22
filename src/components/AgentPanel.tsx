"use client";

import { useEffect, useRef, useState } from "react";
import { api, cx, fmtTime, hostOf } from "./format";
import { BrowserViewer } from "./BrowserViewer";
import { Button, Card, CardHeader, Icon, Tag } from "./ui";

// Stage presets. Edit freely: `label` is the chip text, `task` is what the agent receives.
export const PRESETS: { label: string; task: string }[] = [
  // {origin} becomes this app's address: the dental office is a fictional demo page served by Telltale.
  { label: "Dental cleaning", task: "Book a dental cleaning at {origin}/demo/dental using my details" },
  { label: "Car insurance quotes", task: "Get me car insurance quotes at https://www.bestautoinsurance.com for my 2019 Honda Civic. Use my details where the form asks." },
  { label: "People-search account", task: "Create a free account at https://www.spokeo.com so I can check what it shows about me" },
];

export type LogEntry =
  | { id: string; at: string; kind: "run"; task: string }
  | { id: string; at: string; kind: "tool"; tool: string; input: unknown }
  | { id: string; at: string; kind: "log"; text: string }
  | { id: string; at: string; kind: "done"; text: string };

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function LogRow({ e }: { e: LogEntry }) {
  const time = <span className="w-[52px] shrink-0 pt-px font-mono text-[10.5px] tabular-nums text-faint">{fmtTime(e.at).slice(0, 8)}</span>;

  if (e.kind === "run")
    return (
      <li className="anim-rise border-t border-line px-4 py-2.5 first:border-0">
        <div className="flex items-center gap-2">
          <Tag tone="ink">Run</Tag>
          <span className="font-mono text-[10.5px] text-faint">{fmtTime(e.at)}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink">{e.task}</p>
      </li>
    );
  if (e.kind === "log")
    return (
      <li className="anim-rise flex gap-3 px-4 py-1">
        {time}
        <p className="text-[12.5px] leading-snug text-muted">{e.text}</p>
      </li>
    );
  if (e.kind === "done") {
    const err = e.text.startsWith("Error:");
    return (
      <li className={cx("anim-rise mx-4 my-2 border px-3 py-2", err ? "border-accent" : "border-ink")}>
        <Tag tone={err ? "accent" : "ink"}>{err ? "Stopped" : "Complete"}</Tag>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink">{err ? e.text.replace(/^Error:\s*/, "") : e.text}</p>
      </li>
    );
  }

  const input = rec(e.input);
  let text: React.ReactNode = null;
  let accent = false;
  switch (e.tool) {
    case "navigate": {
      const url = String(input.url ?? "");
      text = (
        <>
          <span className="font-mono text-ink">{hostOf(url)}</span>
          <span className="font-mono text-faint">{url.replace(/^https?:\/\/[^/]+/, "")}</span>
        </>
      );
      break;
    }
    case "read_page":
      text = "Read the page";
      break;
    case "fill_form": {
      const fields = Array.isArray(input.fields) ? input.fields : [];
      accent = true;
      text = (
        <span className="text-ink">
          Requested {fields.length} personal field{fields.length === 1 ? "" : "s"} · intercepted
        </span>
      );
      break;
    }
    case "set_field":
      text = (
        <>
          Answered <span className="font-mono text-ink">{String(input.value ?? "")}</span>
        </>
      );
      break;
    case "click":
      text = <span className="font-mono text-[12px]">{String(input.selector ?? "")}</span>;
      break;
    case "finish":
      text = <span className="text-ink">{String(input.summary ?? "Finished")}</span>;
      break;
  }
  return (
    <li className="anim-rise flex items-start gap-3 px-4 py-1">
      {time}
      <span className={cx("w-[76px] shrink-0 pt-px font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em]", accent ? "text-accent-ink" : "text-ink-2")}>{e.tool.replace("_", " ")}</span>
      <div className="min-w-0 flex-1 break-words text-[12.5px] leading-snug text-muted">{text}</div>
    </li>
  );
}

export function AgentPanel({
  log,
  liveViewUrl,
  frame,
  running,
  modelOn,
  onStarted,
}: {
  log: LogEntry[];
  liveViewUrl: string | null;
  frame: { data: string; url: string } | null;
  running: boolean;
  modelOn: boolean;
  onStarted: (runId: string, task: string) => void;
}) {
  const withOrigin = (t: string) => (typeof window === "undefined" ? t : t.replaceAll("{origin}", window.location.origin));
  const [task, setTask] = useState(PRESETS[0].task);
  useEffect(() => setTask((t) => withOrigin(t)), []);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the newest activity in view by scrolling the log itself, never the page around it.
  const logBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

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
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader
        title="Agent"
        meta={
          running ? (
            <Tag tone="accent">
              <span className="anim-blink size-[5px] bg-accent" aria-hidden />
              Running
            </Tag>
          ) : (
            <Tag tone="muted">Idle</Tag>
          )
        }
      />
      <div className="border-b border-line p-3">
        <label htmlFor="agent-task" className="sr-only">
          Task for the agent
        </label>
        <textarea
          id="agent-task"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={running || frame ? 2 : 3}
          className="w-full resize-none border border-line-strong bg-surface px-3 py-2 text-[13.5px] leading-snug text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none"
          placeholder="Tell your agent what to do…"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {PRESETS.map((p) => {
            const on = task === withOrigin(p.task);
            return (
              <button
                key={p.label}
                onClick={() => setTask(withOrigin(p.task))}
                className={cx("h-6 border px-2 font-mono text-[11px] transition-colors", on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink")}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <Button variant="primary" onClick={run} busy={busy} disabled={task.trim().length < 3 || running} className="mt-3 w-full">
          {running ? "Agent is running" : "Run agent"}
          {!running && <span className="kbd border-white/25 bg-transparent text-white/60">Ctrl ↵</span>}
        </Button>
        {!modelOn && !error && <p className="mt-2 text-[12px] text-muted">No model key set. Use stage controls (D) to preview a site.</p>}
        {error && <p className="mt-2 border-l-2 border-accent pl-2 text-[12px] text-accent-ink">{error.includes("ANTHROPIC_API_KEY") ? "The agent needs ANTHROPIC_API_KEY. Preview a site from stage controls (D)." : error}</p>}
      </div>

      {(frame || liveViewUrl) && (
        <figure className="border-b border-line">
          <figcaption className="flex h-7 items-center justify-between gap-2 border-b border-line bg-well pl-3 pr-1">
            <span className="truncate font-mono text-[11px] text-ink-2">{frame ? hostOf(frame.url) : "Live browser"}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                <span className={cx("size-[6px]", running ? "anim-blink bg-accent" : "bg-line-strong")} />
                {running ? "live" : "last frame"}
              </span>
              <button onClick={() => setExpanded(true)} className="flex h-5 items-center gap-1 border border-line-strong bg-surface px-1.5 font-mono text-[10px] text-ink-2 transition-colors hover:border-ink hover:text-ink" title="Expand the browser view">
                <Icon name="expand" className="size-3" />
                Expand
              </button>
            </span>
          </figcaption>
          {frame ? (
            <button onClick={() => setExpanded(true)} className="group relative block w-full cursor-zoom-in" aria-label="Expand the browser view">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/jpeg;base64,${frame.data}`} alt="What the agent's browser shows" className="h-[168px] w-full object-cover object-top" />
              <span className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/5" aria-hidden />
            </button>
          ) : (
            <iframe src={liveViewUrl!} className="h-[168px] w-full" allow="autoplay; clipboard-read; clipboard-write" title="Agent browser live view" />
          )}
        </figure>
      )}
      {expanded && (
        <BrowserViewer
          frame={frame}
          liveViewUrl={liveViewUrl}
          running={running}
          onClose={() => setExpanded(false)}
          activity={
            <ol className="flex flex-col">
              {log.slice(-40).map((e) => (
                <LogRow key={e.id} e={e} />
              ))}
            </ol>
          }
        />
      )}

      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="label">Activity</span>
        <span className="font-mono text-[10.5px] text-faint">{log.length} events</span>
      </div>
      <div ref={logBox} className="min-h-[96px] flex-1 overflow-y-auto py-1">
        {log.length === 0 ? (
          <div className="m-3 border border-dashed border-line-strong px-4 py-3">
            <p className="label mb-2 text-ink">Start here</p>
            <ol className="flex flex-col gap-1.5 text-[12.5px] leading-snug text-ink-2">
              <li className="flex gap-2">
                <span className="font-mono text-faint">1</span> Pick a task above, or write your own.
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-faint">2</span> Run the agent. Its browser appears here.
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-faint">3</span> When a form asks for personal data, Telltale intercepts it. Registered brokers wait for your decision.
              </li>
            </ol>
            <p className="mt-2.5 text-[11.5px] text-muted">The agent never sees your details. It asks for field types; Telltale types the values.</p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {log.map((e) => (
              <LogRow key={e.id} e={e} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
