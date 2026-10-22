"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { TourData } from "@/lib/facts";
import { cx } from "./format";
import { Logo } from "./Logo";
import { ThemeButton } from "./Theme";

// A visual walkthrough of one disclosure. The fields travel along the trajectory you → agent →
// Telltale → site, split at the gate, and the tagged email later surfaces at a (fictional)
// third party. Everything shown comes from the real filing except the simulated leak.

type NodeKey = "you" | "agent" | "gate" | "registry" | "site" | "third" | "evidence";
type Step = { n: string; title: string; caption: string; active: NodeKey[]; edges: string[]; ms: number };

const STEPS: Step[] = [
  { n: "01", title: "The task", caption: "Maya asks her agent for car insurance quotes.", active: ["you", "agent"], edges: ["you-agent"], ms: 5000 },
  { n: "02", title: "Intercept", caption: "The agent reaches the quote form and asks Telltale for six field types. It never holds a value.", active: ["agent", "gate"], edges: ["agent-gate"], ms: 6500 },
  { n: "03", title: "Inspect", caption: "Telltale identifies who receives the data and reads that company's own filing with the State of California.", active: ["gate", "registry"], edges: ["gate-registry"], ms: 7500 },
  { n: "04", title: "Sanitize", caption: "The recipient is a registered broker, so Maya decides each field. Defaults minimise what leaves.", active: ["gate"], edges: [], ms: 7500 },
  { n: "05", title: "Release", caption: "Only approved values are typed, under tag K7Q2, with a signed receipt. Telltale sends an opt-out with a legal deadline.", active: ["gate", "site"], edges: ["gate-site"], ms: 7500 },
  { n: "06", title: "Day 47", caption: "The tagged inbox receives mail from a company it was never given to, after the opt-out deadline. (Simulated.)", active: ["site", "third"], edges: ["site-third"], ms: 7500 },
  { n: "07", title: "Evidence", caption: "Telltale assembles the timeline into a complaint for the regulator. Maya reviews it and decides whether to file.", active: ["third", "evidence"], edges: ["third-evidence"], ms: 9000 },
];

// Canvas geometry (viewBox units).
const VB = { w: 1000, h: 440 };
const NODES: Record<NodeKey, { x: number; y: number; w: number; h: number; label: string; sub?: string }> = {
  you: { x: 70, y: 180, w: 76, h: 56, label: "YOU", sub: "Maya" },
  agent: { x: 240, y: 180, w: 96, h: 56, label: "AGENT", sub: "Claude" },
  gate: { x: 480, y: 180, w: 150, h: 96, label: "TELLTALE", sub: "consent gate" },
  registry: { x: 480, y: 372, w: 170, h: 46, label: "CA REGISTRY", sub: "603 broker filings" },
  site: { x: 775, y: 180, w: 196, h: 56, label: "bestautoinsurance.com", sub: "Apollo Interactive, LLC" },
  third: { x: 900, y: 352, w: 150, h: 50, label: "northgate-leads", sub: "fictional · simulated" },
  evidence: { x: 900, y: 52, w: 140, h: 50, label: "COMPLAINT", sub: "for the CPPA" },
};
const EDGES: Record<string, string> = {
  "you-agent": "M108 180 H192",
  "agent-gate": "M288 180 H405",
  "gate-registry": "M480 228 V349",
  "gate-site": "M555 180 H677",
  "site-third": "M850 208 C 885 240, 900 280, 900 327",
  "third-evidence": "M900 327 C 960 260, 960 140, 900 77",
};

const PACKET = { w: 78, h: 18 };

const GAP = PACKET.h + 4;

/**
 * Where each field sits at each step. `i` is its index among all fields, `g` its index within its
 * group after the split (released or withheld), `n` the size of that group.
 */
function packetPos(step: number, i: number, g: number, n: number, action: string, kind: string): { x: number; y: number; o: number } {
  const stack = (cx: number, cy: number, idx: number, count: number) => ({ x: cx, y: cy + (idx - (count - 1) / 2) * GAP });
  const all = 6;
  if (step === 0) return { ...stack(NODES.you.x, NODES.you.y, i, all), o: 0 };
  if (step <= 2) return { ...stack(350, 180, i, all), o: 1 };
  if (action === "withhold") {
    // Withheld fields drop out under the gate and never move on.
    return { x: 400 + g * 80, y: 268, o: step === 3 ? 0.9 : 0.45 };
  }
  if (step === 3) return { ...stack(605, 180, g, n), o: 1 };
  if (step >= 5 && kind === "email") return { x: 900, y: 302, o: 1 };
  return { ...stack(775, 254, g, n), o: step >= 5 ? 0.35 : 1 };
}

function NodeBox({ k, on, done, accent }: { k: NodeKey; on: boolean; done: boolean; accent?: boolean }) {
  const n = NODES[k];
  const stroke = on ? (accent ? "var(--color-accent)" : "var(--color-ink)") : done ? "var(--color-line-strong)" : "var(--color-line)";
  const fill = on && accent ? "var(--color-accent-wash)" : "var(--color-surface)";
  return (
    <g style={{ transition: "opacity 400ms" }} opacity={on || done ? 1 : 0.55}>
      <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} strokeWidth={on ? 1.6 : 1} style={{ fill, stroke, transition: "stroke 300ms, fill 300ms" }} />
      {k === "gate" && (
        <>
          <rect x={n.x - n.w / 2 + 10} y={n.y - n.h / 2 + 10} width={22} height={22} strokeWidth={1.2} style={{ fill: "none", stroke: "var(--color-ink)" }} />
          <rect x={n.x - n.w / 2 + 20} y={n.y - n.h / 2 + 20} width={22} height={22} strokeWidth={1.2} style={{ fill: "none", stroke: "var(--color-ink)" }} />
          <rect x={n.x - n.w / 2 + 21} y={n.y - n.h / 2 + 21} width={10} height={10} style={{ fill: "var(--color-accent)" }} />
        </>
      )}
      <text x={n.x} y={n.y + (k === "gate" ? 14 : -2)} textAnchor="middle" fontSize={k === "site" || k === "third" ? 12 : 13} fontWeight={600} letterSpacing="0.06em" style={{ fill: on && accent ? "var(--color-accent-ink)" : "var(--color-ink)", fontFamily: "var(--font-mono)" }}>
        {n.label}
      </text>
      {n.sub && (
        <text x={n.x} y={n.y + (k === "gate" ? 30 : 14)} textAnchor="middle" fontSize={10.5} style={{ fill: on && accent ? "var(--color-accent-ink)" : "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
          {n.sub}
        </text>
      )}
    </g>
  );
}

function Canvas({ step, data }: { step: number; data: TourData }) {
  const s = STEPS[step];
  const visited = new Set(STEPS.slice(0, step).flatMap((x) => x.active));
  const accentNodes: NodeKey[] = ["site", "third", "evidence", "registry"];
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="block w-full" role="img" aria-label={`Step ${s.n}: ${s.title}`}>
      <defs>
        <pattern id="tour-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" strokeWidth="0.6" style={{ stroke: "var(--color-line)" }} />
        </pattern>
        <marker id="tour-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0L10 5L0 10z" style={{ fill: "var(--color-accent)" }} />
        </marker>
        <marker id="tour-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0L10 5L0 10z" style={{ fill: "var(--color-line-strong)" }} />
        </marker>
      </defs>
      <rect width={VB.w} height={VB.h} fill="url(#tour-grid)" opacity="0.6" />

      {Object.entries(EDGES).map(([key, d]) => {
        const on = s.edges.includes(key);
        const past = STEPS.slice(0, step).some((x) => x.edges.includes(key));
        const dashed = key === "site-third" || key === "third-evidence" || key === "gate-registry";
        return (
          <path
            key={key}
            d={d}
            fill="none"
            strokeWidth={on ? 2 : 1.2}
            strokeDasharray={dashed || on ? "6 5" : undefined}
            markerEnd={on ? "url(#tour-arrow)" : past ? "url(#tour-arrow-muted)" : undefined}
            className={on ? "tour-flow" : undefined}
            style={{ stroke: on ? "var(--color-accent)" : past ? "var(--color-line-strong)" : "var(--color-line)", transition: "stroke 300ms" }}
          />
        );
      })}

      {(Object.keys(NODES) as NodeKey[]).map((k) => (
        <NodeBox key={k} k={k} on={s.active.includes(k)} done={visited.has(k)} accent={accentNodes.includes(k) && s.active.includes(k) && (k !== "registry" || step === 2)} />
      ))}

      {/* registry callout during Inspect */}
      <g style={{ opacity: step === 2 ? 1 : 0, transition: "opacity 400ms" }}>
        <rect x={80} y={350} width={300} height={44} strokeWidth={1} style={{ fill: "var(--color-surface)", stroke: "var(--color-accent)" }} />
        <path d="M380 372 H395" strokeWidth={1} style={{ stroke: "var(--color-accent)" }} />
        <text x={92} y={368} fontSize={10.5} style={{ fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
          FILING · {data.broker?.name ?? "registered broker"}
        </text>
        <text x={92} y={384} fontSize={12} fontWeight={600} style={{ fill: "var(--color-accent-ink)", fontFamily: "var(--font-mono)" }}>
          {data.findings[0]?.text.replace("reported denying", "denied").slice(0, 44) ?? "registered data broker"}
        </text>
      </g>

      {/* the fields */}
      {data.fields.map((f, i) => {
        const group = data.fields.filter((x) => (x.action === "withhold") === (f.action === "withhold"));
        const p = packetPos(step, i, group.indexOf(f), group.length, f.action, f.kind);
        const tagged = step >= 3 && f.action === "tag";
        const withheld = step >= 3 && f.action === "withhold";
        const label = withheld ? `${short(f.kind)} ∅` : tagged ? `${short(f.kind)} ${data.tagCode}` : short(f.kind);
        const style: CSSProperties = { transform: `translate(${p.x - PACKET.w / 2}px, ${p.y - PACKET.h / 2}px)`, opacity: p.o, transition: "transform 900ms cubic-bezier(0.2,0.8,0.2,1), opacity 500ms" };
        return (
          <g key={f.kind} style={style}>
            <rect width={PACKET.w} height={PACKET.h} strokeWidth={1} style={{ fill: tagged ? "var(--color-accent-wash)" : "var(--color-surface)", stroke: tagged ? "var(--color-accent)" : withheld ? "var(--color-line-strong)" : "var(--color-ink)", strokeDasharray: withheld ? "3 3" : undefined }} />
            <text x={PACKET.w / 2} y={12.5} textAnchor="middle" fontSize={9.5} fontWeight={600} letterSpacing="0.05em" style={{ fill: tagged ? "var(--color-accent-ink)" : withheld ? "var(--color-faint)" : "var(--color-ink)", fontFamily: "var(--font-mono)" }}>
              {label}
            </text>
          </g>
        );
      })}

      {/* step 4: legend under the gate */}
      <g style={{ opacity: step === 3 ? 1 : 0, transition: "opacity 400ms" }}>
        <text x={480} y={300} textAnchor="middle" fontSize={10.5} style={{ fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
          withheld fields stay here
        </text>
      </g>

      {/* step 6: surfaced label */}
      <g style={{ opacity: step >= 5 ? 1 : 0, transition: "opacity 500ms" }}>
        <rect x={826} y={398} width={148} height={20} strokeWidth={1} style={{ fill: "var(--color-surface)", stroke: "var(--color-accent)" }} />
        <text x={900} y={412} textAnchor="middle" fontSize={9.5} fontWeight={600} letterSpacing="0.08em" style={{ fill: "var(--color-accent-ink)", fontFamily: "var(--font-mono)" }}>
          SIMULATED · DAY 47
        </text>
      </g>
    </svg>
  );
}

const SHORT: Record<string, string> = { fullName: "NAME", email: "EMAIL", phone: "PHONE", street: "STREET", zip: "ZIP", dob: "DOB" };
const short = (k: string) => SHORT[k] ?? k.toUpperCase();
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Artifact({ step, data }: { step: number; data: TourData }) {
  const box = (children: ReactNode, accent?: boolean) => <div className={cx("border bg-surface", accent ? "border-accent" : "border-line")}>{children}</div>;
  switch (step) {
    case 0:
      return box(
        <div className="p-4">
          <p className="label">Task</p>
          <p className="mt-1.5 text-[14px] leading-snug text-ink">&ldquo;Get me car insurance quotes at {data.host} for my 2019 Honda Civic. Use my details where the form asks.&rdquo;</p>
        </div>,
      );
    case 1:
      return box(
        <div className="p-4">
          <p className="label">What the model sends Telltale</p>
          <pre className="mt-2 overflow-x-auto bg-well p-3 font-mono text-[11.5px] leading-relaxed text-ink">{`fill_form({
  purpose: "Car insurance quotes",
  fields: [
${data.fields.map((f) => `    { kind: "${f.kind}" }`).join(",\n")}
  ]
})`}</pre>
          <p className="mt-2 text-[12.5px] text-muted">Kinds only. No names, numbers or addresses reach the model provider.</p>
        </div>,
      );
    case 2:
      return box(
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="label">California data broker registry</p>
            <span className="tag tag-accent">Registered broker</span>
          </div>
          <p className="mt-2 text-[14px] leading-snug text-ink">
            In its filing with the State of California, <span className="font-semibold">{data.broker?.name}</span>
            {data.broker && data.broker.dbaCount > 1 ? ` (${data.broker.dbaCount} brand names)` : ""} said it:
          </p>
          <ul className="mt-2 border-t border-line">
            {data.findings.map((f) => (
              <li key={f.text} className="flex gap-2.5 border-b border-line py-2 text-[13.5px] leading-snug text-ink">
                <span className={cx("mt-[6px] size-[6px] shrink-0", f.severity === "high" ? "bg-accent" : "bg-ink-2")} />
                {f.text}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[10.5px] text-faint">Self-reported · 2026 filings · counts for 2024</p>
        </div>,
        true,
      );
    case 3:
      return box(
        <div className="p-4">
          <p className="label mb-2">Per-field decision</p>
          <ul>
            {data.fields.map((f) => (
              <li key={f.kind} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[13px] last:border-0">
                <span className="text-ink-2">{f.label}</span>
                <span className={cx("tag", f.action === "tag" && "tag-accent", f.action === "withhold" && "tag-muted")}>{f.action === "tag" ? "Tagged" : f.action === "send" ? "Sent" : "Withheld"}</span>
              </li>
            ))}
          </ul>
        </div>,
      );
    case 4:
      return box(
        <div className="p-4">
          <p className="label">What the site receives</p>
          <ul className="mt-1.5">
            {data.fields.map((f) => (
              <li key={f.kind} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[12.5px] last:border-0">
                <span className="text-muted">{f.label}</span>
                <span className={cx("truncate font-mono", f.action === "withhold" ? "text-faint" : f.action === "tag" ? "text-accent-ink" : "text-ink")}>{f.shown}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-px border border-line bg-line text-[11.5px]">
            <div className="bg-well p-2.5">
              <p className="label">Receipt</p>
              <p className="mt-1 font-mono text-ink">Ed25519 · signed</p>
            </div>
            <div className="bg-well p-2.5">
              <p className="label">Opt-out deadline</p>
              <p className="mt-1 font-mono text-ink">{day(data.optOutDue)}</p>
            </div>
          </div>
        </div>,
      );
    case 5:
      return box(
        <div className="p-4">
          <div className="flex items-center justify-between">
            <p className="label">Inbound on {data.alias}</p>
            <span className="tag tag-accent">Simulated</span>
          </div>
          <div className="mt-2 border border-line bg-well p-3 text-[12.5px] leading-relaxed">
            <p className="font-mono text-ink-2">From: Northgate Lead Exchange &lt;offers@northgate-leads.example&gt;</p>
            <p className="font-mono text-ink-2">Date: {day(data.contactAt)}</p>
            <p className="mt-1.5 text-ink">New matches for your profile are ready</p>
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-ink">
            That address was created for <span className="font-mono">bestautoinsurance.com</span> only. It arrived <span className="font-semibold text-accent-ink">26 days after</span> the opt-out deadline.
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted">The sender is fictional; this step shows what Telltale does when a real one appears.</p>
        </div>,
        true,
      );
    default:
      return (
        <div className="paper overflow-hidden px-5 py-5">
          <div className="absolute right-0 top-0 border-b border-l border-paper-line bg-[#f6f2e8] px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#6b6455]">Simulation</div>
          <pre className="whitespace-pre-wrap font-serif text-[12.5px] leading-[1.55] text-paper-ink">{data.complaint}</pre>
        </div>
      );
  }
}

export function Tour({ data }: { data: TourData }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const last = STEPS.length - 1;

  const go = useCallback((i: number) => {
    setStep(Math.max(0, Math.min(last, i)));
    setTick((t) => t + 1);
  }, [last]);

  useEffect(() => {
    if (!playing || step === last) return;
    const t = setTimeout(() => go(step + 1), STEPS[step].ms);
    return () => clearTimeout(t);
  }, [playing, step, last, go, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  const s = STEPS[step];
  const progressKey = useMemo(() => `${step}-${tick}-${playing}`, [step, tick, playing]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="font-mono text-[14px] font-semibold">Telltale</span>
          </Link>
          <span className="font-mono text-[13px] text-line-strong">/</span>
          <span className="font-mono text-[13px] text-ink">Tour</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            <Link href="/console?preset=insurance" className="inline-flex h-8 items-center bg-ink px-3 font-mono text-[12px] font-medium text-on-ink transition-colors hover:bg-ink-hover">
              Run it live
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold">One disclosure, start to finish</h1>
            <p className="mt-1 max-w-[760px] text-[14px] text-muted">
              Uses the real California registry filing for <span className="font-mono text-ink-2">{data.host}</span>. The persona is synthetic and the day-47 leak is simulated from a fictional sender.
            </p>
          </div>
          <p className="font-mono text-[11px] text-faint">← → to step · space to pause</p>
        </div>

        {/* step rail */}
        <ol className="mt-5 grid grid-cols-7 border border-line bg-surface">
          {STEPS.map((x, i) => (
            <li key={x.n} className={cx(i > 0 && "border-l border-line")}>
              <button onClick={() => go(i)} className={cx("relative flex h-full w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-hover", i === step && "bg-well")} aria-current={i === step ? "step" : undefined}>
                <span className={cx("font-mono text-[10.5px]", i <= step ? "text-accent-ink" : "text-faint")}>{x.n}</span>
                <span className={cx("font-mono text-[12px] font-semibold uppercase tracking-[0.05em]", i === step ? "text-ink" : i < step ? "text-ink-2" : "text-faint")}>{x.title}</span>
                {i === step && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line">
                    <span key={progressKey} className="block h-full bg-accent" style={{ animation: playing && step < last ? `tour-progress ${x.ms}ms linear forwards` : undefined, width: playing && step < last ? undefined : "100%" }} />
                  </span>
                )}
                {i < step && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent/40" />}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="border border-line bg-surface">
            <div className="flex h-10 items-center justify-between border-b border-line px-4">
              <span className="label">Trajectory</span>
              <span className="font-mono text-[11px] text-muted">
                step {s.n} of {STEPS.length}
              </span>
            </div>
            <Canvas step={step} data={data} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="max-w-[640px] text-[14.5px] leading-snug text-ink">
                <span className="mr-2 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-accent-ink">{s.title}</span>
                {s.caption}
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => go(step - 1)} disabled={step === 0} className="h-8 border border-line-strong px-3 font-mono text-[12px] text-ink transition-colors hover:border-ink disabled:opacity-40">
                  Prev
                </button>
                <button onClick={() => (step === last ? (go(0), setPlaying(true)) : setPlaying((p) => !p))} className="h-8 min-w-[76px] border border-line-strong px-3 font-mono text-[12px] text-ink transition-colors hover:border-ink">
                  {step === last ? "Replay" : playing ? "Pause" : "Play"}
                </button>
                <button onClick={() => go(step + 1)} disabled={step === last} className="h-8 bg-ink px-3 font-mono text-[12px] font-medium text-on-ink transition-colors hover:bg-ink-hover disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-3">
            <div key={step} className="anim-rise">
              <p className="font-mono text-[11px] text-faint">
                {s.n} · {s.title.toUpperCase()}
              </p>
              <div className="mt-2">
                <Artifact step={step} data={data} />
              </div>
            </div>
            {step === last && (
              <div className="anim-rise border border-ink bg-surface p-4">
                <p className="text-[14px] font-medium text-ink">See it with a live agent.</p>
                <p className="mt-1 text-[13px] text-muted">The console runs the same flow on the real site, with your decision in the middle.</p>
                <div className="mt-3 flex gap-2">
                  <Link href="/console?preset=insurance" className="inline-flex h-9 items-center bg-accent px-3.5 font-mono text-[12px] font-medium text-white transition-colors hover:bg-accent-ink">
                    Run it live
                  </Link>
                  <Link href="/" className="inline-flex h-9 items-center border border-line-strong px-3.5 font-mono text-[12px] text-ink transition-colors hover:border-ink">
                    Back to overview
                  </Link>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
