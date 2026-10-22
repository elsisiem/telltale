"use client";

import type { CSSProperties } from "react";
import type { UiState } from "./types";

// Theme colors as CSS variables, applied through style (not presentation attributes) so the
// graph follows light and dark mode.
const C = {
  ink: "var(--color-ink)",
  muted: "var(--color-muted)",
  faint: "var(--color-faint)",
  line: "var(--color-line)",
  lineStrong: "var(--color-line-strong)",
  accent: "var(--color-accent)",
  accentInk: "var(--color-accent-ink)",
  surface: "var(--color-surface)",
  wash: "var(--color-accent-wash)",
  onInk: "var(--color-on-ink)",
};

const paint = (fill?: string, stroke?: string, mono = false): CSSProperties => ({
  ...(fill ? { fill } : {}),
  ...(stroke ? { stroke } : {}),
  ...(mono ? { fontFamily: "var(--font-mono)" } : {}),
});

// viewBox units; the SVG scales to the card width.
const W = 520;
const X_YOU = 44;
const X_RECIP = 250;
const X_THIRD = 430;
const ROW = 78;
const TOP = 56;
const BOTTOM = 40;
const NODE = 30;

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shortHost = (h: string) => h.replace(/^www\./, "");

/** Where the person's data went: You → each recipient (tag on the edge) → wherever it resurfaced. */
export function TrailGraph({ state }: { state: UiState }) {
  const discs = state.disclosures;
  const n = Math.max(discs.length, 1);
  const H = Math.max(200, (n - 1) * ROW + TOP + BOTTOM + 24);
  const span = H - TOP - BOTTOM - 24;
  const yFor = (i: number) => (discs.length <= 1 ? TOP + span / 2 : TOP + (i * span) / (discs.length - 1));
  const youY = TOP + span / 2;
  const msgById = new Map(state.messages.map((m) => [m.id, m]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Data trail: where ${state.person.firstName}'s data went`}>
      <defs>
        <marker id="tt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L10 5L0 10z" style={paint(C.accent)} />
        </marker>
        <pattern id="tt-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" strokeWidth="0.6" style={paint(undefined, C.line)} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#tt-grid)" opacity="0.55" />

      {[
        [X_YOU, "PERSON"],
        [X_RECIP, "GIVEN TO"],
        [X_THIRD, "SURFACED AT"],
      ].map(([x, label]) => (
        <text key={label} x={x} y={22} textAnchor="middle" fontSize="9.5" letterSpacing="1.2" style={paint(C.faint, undefined, true)}>
          {label}
        </text>
      ))}

      {discs.length === 0 && (
        <text x={X_RECIP} y={youY + 4} textAnchor="middle" fontSize="12" style={paint(C.faint, undefined, true)}>
          no disclosures yet
        </text>
      )}

      {discs.map((d, i) => {
        const y = yFor(i);
        const broker = d.broker_ids.length > 0;
        const x0 = X_YOU + NODE / 2;
        const x3 = X_RECIP - NODE / 2;
        const mx = (x0 + x3) / 2;
        return (
          <g key={`e-${d.id}`}>
            <path d={`M${x0},${youY} H${mx - 14} V${y} H${x3}`} fill="none" strokeWidth={broker ? 1.4 : 1.2} style={paint(undefined, broker ? C.accent : C.lineStrong)} />
            <g transform={`translate(${mx + 40},${y})`}>
              <rect x={-24} y={-10} width={48} height={20} strokeWidth={1} style={paint(C.surface, broker ? C.accent : C.ink)} />
              <text x={0} y={4} textAnchor="middle" fontSize="11" fontWeight={600} letterSpacing="1.4" style={paint(broker ? C.accentInk : C.ink, undefined, true)}>
                {d.tag_code}
              </text>
            </g>
          </g>
        );
      })}

      {state.leaks.map((l) => {
        const i = discs.findIndex((d) => d.id === l.disclosure_id);
        if (i < 0) return null;
        const y = yFor(i);
        const sim = msgById.get(l.message_id)?.replay ?? l.evidence.observed.replay;
        const clipId = `clip-${l.id}`;
        return (
          <g key={`l-${l.id}`}>
            <clipPath id={clipId}>
              <rect x={X_RECIP} y={0} width={0} height={H}>
                <animate attributeName="width" from="0" to={W - X_RECIP} dur="1.1s" fill="freeze" calcMode="spline" keySplines="0.3 0 0.2 1" keyTimes="0;1" />
              </rect>
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <path d={`M${X_RECIP + NODE / 2},${y} H${X_THIRD - NODE / 2 - 4}`} fill="none" strokeWidth={1.4} strokeDasharray="5 4" markerEnd="url(#tt-arrow)" style={paint(undefined, C.accent)} />
              <text x={(X_RECIP + X_THIRD) / 2} y={y - 8} textAnchor="middle" fontSize="10" letterSpacing="0.6" style={paint(C.accentInk, undefined, true)}>
                {l.evidence.tagCode} SURFACED
              </text>
            </g>
            <g className="anim-fade" style={{ animationDelay: "0.9s" }}>
              <rect x={X_THIRD - NODE / 2} y={y - NODE / 2} width={NODE} height={NODE} style={paint(C.accent)} />
              <path d={`M${X_THIRD - 6} ${y - 6} L${X_THIRD + 6} ${y + 6} M${X_THIRD + 6} ${y - 6} L${X_THIRD - 6} ${y + 6}`} strokeWidth={1.6} style={paint(undefined, "#ffffff")} />
              <text x={X_THIRD} y={y + NODE / 2 + 15} textAnchor="middle" fontSize="11" style={paint(C.accentInk, undefined, true)}>
                {truncate(l.sender_domain, 26)}
              </text>
              {sim && (
                <g transform={`translate(${X_THIRD},${y + NODE / 2 + 32})`}>
                  <rect x={-34} y={-9} width={68} height={17} strokeWidth={1} style={paint(C.surface, C.accent)} />
                  <text x={0} y={3.5} textAnchor="middle" fontSize="9" fontWeight={600} letterSpacing="1" style={paint(C.accentInk, undefined, true)}>
                    SIMULATED
                  </text>
                </g>
              )}
            </g>
          </g>
        );
      })}

      {discs.map((d, i) => {
        const y = yFor(i);
        const broker = d.broker_ids.length > 0;
        const name = broker ? state.brokerNames[d.broker_ids[0]] : null;
        return (
          <g key={`n-${d.id}`} className="anim-fade">
            <rect x={X_RECIP - NODE / 2} y={y - NODE / 2} width={NODE} height={NODE} strokeWidth={1.2} style={paint(broker ? C.wash : C.surface, broker ? C.accent : C.ink)} />
            <text x={X_RECIP} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight={600} style={paint(broker ? C.accentInk : C.ink, undefined, true)}>
              {(d.recipient_domain[0] ?? "?").toUpperCase()}
            </text>
            <text x={X_RECIP} y={y + NODE / 2 + 13} textAnchor="middle" fontSize="11" style={paint(C.ink, undefined, true)}>
              {truncate(shortHost(d.recipient_host), 28)}
            </text>
            <text x={X_RECIP} y={y + NODE / 2 + 25} textAnchor="middle" fontSize="9.5" style={paint(broker ? C.accentInk : C.muted, undefined, true)}>
              {broker ? truncate(name ?? "registered broker", 32) : "not a broker"}
            </text>
          </g>
        );
      })}

      <rect x={X_YOU - 20} y={youY - 20} width={40} height={40} style={paint(C.ink)} />
      <text x={X_YOU} y={youY + 4} textAnchor="middle" fontSize="11" fontWeight={600} letterSpacing="0.5" style={paint(C.onInk, undefined, true)}>
        YOU
      </text>
      <text x={X_YOU} y={youY + 36} textAnchor="middle" fontSize="11" style={paint(C.muted, undefined, true)}>
        {state.person.firstName}
      </text>
    </svg>
  );
}
