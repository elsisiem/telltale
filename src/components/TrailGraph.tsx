"use client";

import type { UiState } from "./types";

const C = {
  fg: "#E8EAED",
  muted: "#8A93A0",
  dim: "#5C6570",
  signal: "#F5A524",
  alarm: "#FF4D4F",
  pass: "#3DD68C",
  panel: "#12151A",
  ink: "#0B0D10",
};

// Geometry in viewBox units; the SVG scales to the column width (~1:1 at 1440px).
const W = 620;
const X_YOU = 56;
const X_RECIP = 292;
const X_THIRD = 516;
const ROW = 120;
const TOP = 70;
const BOTTOM = 92;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" };

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const shortHost = (h: string) => h.replace(/^www\./, "");

/** Point on the You→recipient cubic (controls at the horizontal midpoint) at parameter t. */
function onEdge(t: number, x0: number, y0: number, x3: number, y3: number) {
  const mx = (x0 + x3) / 2;
  const u = 1 - t;
  const x = u ** 3 * x0 + 3 * u * u * t * mx + 3 * u * t * t * mx + t ** 3 * x3;
  const y = (u ** 3 + 3 * u * u * t) * y0 + (3 * u * t * t + t ** 3) * y3;
  return { x, y };
}

/** Where the person's data went: You → each recipient (tag chip on the edge) → wherever it resurfaced. */
export function TrailGraph({ state }: { state: UiState }) {
  const discs = state.disclosures;
  const n = Math.max(discs.length, 1);
  const H = Math.max(260, (n - 1) * ROW + TOP + BOTTOM);
  const span = H - TOP - BOTTOM;
  const yFor = (i: number) => (discs.length <= 1 ? TOP + span / 2 : TOP + (i * span) / (discs.length - 1));
  const youY = TOP + span / 2;
  const msgById = new Map(state.messages.map((m) => [m.id, m]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 480 }} role="img" aria-label={`Data trail: where ${state.person.firstName}'s data went`}>
      <defs>
        <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={C.alarm} />
        </marker>
        <radialGradient id="you-glow">
          <stop offset="0%" stopColor={C.signal} stopOpacity="0.28" />
          <stop offset="100%" stopColor={C.signal} stopOpacity="0" />
        </radialGradient>
      </defs>

      {[
        [X_YOU, "PERSON"],
        [X_RECIP, "GIVEN TO"],
        [X_THIRD, "SURFACED AT"],
      ].map(([x, label]) => (
        <text key={label} x={x} y={24} textAnchor="middle" fontSize="11" fill={C.dim} letterSpacing="1.8">
          {label}
        </text>
      ))}

      {discs.length === 0 && (
        <text x={X_RECIP} y={youY + 5} textAnchor="middle" fontSize="15" fill={C.dim}>
          No disclosures yet
        </text>
      )}

      {/* You → recipient */}
      {discs.map((d, i) => {
        const y = yFor(i);
        const broker = d.broker_ids.length > 0;
        const x0 = X_YOU + 30;
        const x3 = X_RECIP - 27;
        const mx = (x0 + x3) / 2;
        const path = `M${x0},${youY} C${mx},${youY} ${mx},${y} ${x3},${y}`;
        const chip = onEdge(0.42, x0, youY, x3, y);
        return (
          <g key={`e-${d.id}`}>
            <path d={path} fill="none" stroke={broker ? "#6b2a2d" : "#215a41"} strokeWidth={2.5} />
            <g transform={`translate(${chip.x},${chip.y})`}>
              <rect x={-31} y={-13} width={62} height={26} rx={5} fill={C.ink} stroke={C.signal} strokeOpacity={0.7} />
              <text x={0} y={5} textAnchor="middle" fontSize="14" fontWeight={600} fill={C.signal} letterSpacing="1.5" style={MONO}>
                {d.tag_code}
              </text>
            </g>
          </g>
        );
      })}

      {/* recipient → third party (leak) */}
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
                <animate attributeName="width" from="0" to={W - X_RECIP} dur="1.4s" fill="freeze" calcMode="spline" keySplines="0.3 0 0.2 1" keyTimes="0;1" />
              </rect>
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <path d={`M${X_RECIP + 28},${y} L${X_THIRD - 32},${y}`} fill="none" stroke={C.alarm} strokeWidth={2.5} strokeDasharray="8 6" markerEnd="url(#arrow-red)" />
              <text x={(X_RECIP + X_THIRD) / 2} y={y - 12} textAnchor="middle" fontSize="13" fill={C.alarm} style={MONO}>
                {l.evidence.tagCode} surfaced
              </text>
            </g>
            <g className="anim-fade-in" style={{ animationDelay: "1.1s" }}>
              <circle cx={X_THIRD} cy={y} r={25} fill="#2a1416" stroke={C.alarm} strokeWidth={2.5} />
              <path d={`M${X_THIRD} ${y - 10} L${X_THIRD + 10} ${y + 8} H${X_THIRD - 10} Z`} fill="none" stroke={C.alarm} strokeWidth={2} strokeLinejoin="round" />
              <path d={`M${X_THIRD} ${y - 3} v5 M${X_THIRD} ${y + 5} v0.5`} stroke={C.alarm} strokeWidth={2} strokeLinecap="round" />
              <text x={X_THIRD} y={y + 48} textAnchor="middle" fontSize="14" fill={C.alarm} style={MONO}>
                {truncate(l.sender_domain, 24)}
              </text>
              {sim && (
                <g transform={`translate(${X_THIRD},${y + 70})`}>
                  <rect x={-42} y={-11} width={84} height={20} rx={4} fill="#2a200b" stroke={C.signal} strokeOpacity={0.7} />
                  <text x={0} y={3.5} textAnchor="middle" fontSize="11" fontWeight={700} fill={C.signal} letterSpacing="1.4" style={MONO}>
                    SIMULATED
                  </text>
                </g>
              )}
            </g>
          </g>
        );
      })}

      {/* recipients */}
      {discs.map((d, i) => {
        const y = yFor(i);
        const broker = d.broker_ids.length > 0;
        const ring = broker ? C.alarm : C.pass;
        const name = broker ? state.brokerNames[d.broker_ids[0]] : null;
        return (
          <g key={`n-${d.id}`} className="anim-fade-in">
            <circle cx={X_RECIP} cy={y} r={25} fill={C.panel} stroke={ring} strokeWidth={2.5} />
            <text x={X_RECIP} y={y + 6} textAnchor="middle" fontSize="16" fontWeight={600} fill={ring}>
              {(d.recipient_domain[0] ?? "?").toUpperCase()}
            </text>
            <text x={X_RECIP} y={y + 48} textAnchor="middle" fontSize="14" fill={C.fg} style={MONO}>
              {truncate(shortHost(d.recipient_host), 24)}
            </text>
            <text x={X_RECIP} y={y + 67} textAnchor="middle" fontSize="13" fill={broker ? C.alarm : C.muted}>
              {broker ? truncate(name ?? "Registered data broker", 30) : "not a broker · passed silently"}
            </text>
          </g>
        );
      })}

      {/* You */}
      <circle cx={X_YOU} cy={youY} r={50} fill="url(#you-glow)" />
      <circle cx={X_YOU} cy={youY} r={30} fill={C.fg} />
      <text x={X_YOU} y={youY + 5} textAnchor="middle" fontSize="15" fontWeight={700} fill={C.ink}>
        You
      </text>
      <text x={X_YOU} y={youY + 52} textAnchor="middle" fontSize="14" fill={C.muted}>
        {state.person.firstName}
      </text>
    </svg>
  );
}
