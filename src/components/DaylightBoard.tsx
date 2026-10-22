"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import type { Finding } from "@/lib/risk";
import { ApiError, api, cx, fmtStamp } from "./format";
import { useDashboard, useEvents } from "./hooks";
import { SiteHeader, SyntheticBadge } from "./SiteHeader";
import type { DaylightResponse, DaylightResult, DaylightStatus } from "./types";
import { Button, Dot } from "./ui";

type TileStatus = DaylightStatus | "pending";
type Tile = { brokerId: string; name: string; status: TileStatus; result?: DaylightResult };

const STATUS: Record<TileStatus, { label: string; tile: string; text: string; blurb: string }> = {
  visible: { label: "Visible", tile: "bg-pass", text: "text-pass", blurb: "Opt-out page is indexable and reachable." },
  hidden: { label: "Hidden", tile: "bg-alarm", text: "text-alarm", blurb: "Opt-out page tells search engines not to index it." },
  blocked: { label: "Blocked", tile: "bg-signal", text: "text-signal", blurb: "The page refused an automated visit." },
  unreachable: { label: "Unreachable", tile: "bg-[#07080a] ring-1 ring-inset ring-line-2", text: "text-muted", blurb: "The page did not load." },
  pending: { label: "Not checked", tile: "bg-line", text: "text-dim", blurb: "" },
};

type BrokerInfo = { id: string; name: string; dba: string | null; website: string; contactEmail: string; rightsUrls: string[]; findings: Finding[] };

function BrokerPanel({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const [info, setInfo] = useState<BrokerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setInfo(null);
    const q = tile.name && tile.name !== tile.brokerId ? tile.name : tile.brokerId;
    api<{ results: BrokerInfo[] }>(`/api/brokers?q=${encodeURIComponent(q)}`)
      .then((r) => live && setInfo(r.results.find((b) => b.id === tile.brokerId) ?? r.results[0] ?? null))
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tile.brokerId, tile.name]);

  const s = STATUS[tile.status];
  const r = tile.result;
  return (
    <div className="anim-fade-in flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold leading-tight text-fg">{info?.name ?? tile.name}</h3>
          {info?.dba && <p className="text-[13px] text-muted">dba {info.dba}</p>}
        </div>
        <button onClick={onClose} className="rounded px-1.5 text-muted hover:text-fg" aria-label="Close">
          ✕
        </button>
      </div>
      <div className={cx("mt-3 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold", s.text, "border-current/40")}>
        <span className={cx("size-2.5 rounded-[3px]", s.tile)} /> {s.label}
      </div>
      {s.blurb && <p className="mt-1.5 text-[13px] text-muted">{s.blurb}</p>}

      {r?.url && (
        <div className="mt-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Opt-out page checked</div>
          <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[13px] text-fg underline decoration-line-2 underline-offset-2 hover:decoration-fg">
            {r.url}
          </a>
        </div>
      )}

      <div className="mt-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Evidence (verbatim)</div>
        {r?.signals.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {r.signals.map((sig, i) => (
              <li key={i} className="rounded-lg border border-line bg-ink p-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">{sig.type}</div>
                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-fg">{sig.detail}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-dim">{tile.status === "pending" ? "Not checked yet." : "No signals recorded."}</p>
        )}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">In its registry filing, it said it</div>
        {loading ? (
          <p className="mt-1 text-[13px] text-dim">Looking up the filing…</p>
        ) : info?.findings.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {info.findings.map((f) => (
              <li key={f.key} className="flex gap-2.5 text-[14px] leading-snug text-fg">
                <span className="pt-[7px]">
                  <Dot tone={f.severity === "high" ? "alarm" : f.severity === "medium" ? "signal" : "muted"} />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-dim">{info ? "No flagged practices in its filing." : "No registry entry found."}</p>
        )}
        {info?.contactEmail && <p className="mt-3 font-mono text-[12px] text-muted">privacy contact: {info.contactEmail}</p>}
      </div>
    </div>
  );
}

export function DaylightBoard() {
  const { state } = useDashboard();
  const [data, setData] = useState<DaylightResponse | null>(null);
  const [phase, setPhase] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [live, setLive] = useState<Map<string, DaylightStatus>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await api<DaylightResponse>("/api/daylight"));
      setPhase("ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setPhase("missing");
      else {
        setPhase("error");
        setErrMsg((e as Error).message);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => clearTimeout(refetchTimer.current);
  }, [load]);

  const onEvent = useCallback(
    (e: TelltaleEvent) => {
      if (e.type === "scan.progress") {
        setScanId((s) => s ?? e.scanId);
        setProgress({ done: e.done, total: e.total });
        setLive((m) => new Map(m).set(e.brokerId, e.status as DaylightStatus));
        clearTimeout(refetchTimer.current);
        refetchTimer.current = setTimeout(load, 1500);
      } else if (e.type === "scan.done") {
        setScanId(null);
        setProgress(null);
        setLive(new Map());
        void load();
      }
    },
    [load],
  );
  useEvents(onEvent);

  async function run() {
    setStarting(true);
    setErrMsg(null);
    try {
      const r = await api<{ scanId: string }>("/api/daylight/run", { method: "POST" });
      setScanId(r.scanId);
      setLive(new Map());
      setProgress({ done: 0, total: total });
    } catch (e) {
      setErrMsg(e instanceof ApiError && e.status === 404 ? "The sweep endpoint isn't available on this server yet." : (e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const running = !!scanId;
  const results = useMemo(() => data?.results ?? [], [data]);
  const byId = useMemo(() => new Map(results.map((r) => [r.brokerId, r])), [results]);
  const total = progress?.total || data?.scan?.summary?.total || state?.registry.brokers || 603;

  const tiles: Tile[] = useMemo(() => {
    const out: Tile[] = [];
    if (running) {
      for (const [id, status] of live) {
        const r = byId.get(id);
        out.push({ brokerId: id, name: r?.name ?? id, status, result: r && r.status === status ? r : undefined });
      }
    } else {
      for (const r of results) out.push({ brokerId: r.brokerId, name: r.name, status: r.status, result: r });
    }
    for (let i = out.length; i < total; i++) out.push({ brokerId: `pending-${i}`, name: "", status: "pending" });
    return out;
  }, [running, live, byId, results, total]);

  const counts = useMemo(() => {
    const c: Record<DaylightStatus, number> = { visible: 0, hidden: 0, blocked: 0, unreachable: 0 };
    for (const t of tiles) if (t.status !== "pending") c[t.status]++;
    return c;
  }, [tiles]);
  const checked = counts.visible + counts.hidden + counts.blocked + counts.unreachable;
  const selTile = selected ? tiles.find((t) => t.brokerId === selected) : undefined;
  const kindById = useMemo(() => new Map(results.map((r) => [r.brokerId, r.kind ?? null])), [results]);
  const KIND_ORDER = { "own-optout": 0, "own-policy": 1, "vendor-portal": 2 } as const;
  const KIND_LABEL = { "own-optout": "own opt-out page", "own-policy": "privacy page", "vendor-portal": "vendor portal" } as const;
  const hiddenList = tiles
    .filter((t) => t.status === "hidden")
    .map((t) => ({ ...t, kind: kindById.get(t.brokerId) ?? null }))
    .sort((a, b) => (a.kind ? KIND_ORDER[a.kind] : 3) - (b.kind ? KIND_ORDER[b.kind] : 3) || a.name.localeCompare(b.name));
  const ownOptOut = hiddenList.filter((t) => t.kind === "own-optout").length;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader right={state?.person.synthetic ? <SyntheticBadge name={state.person.firstName} /> : null} />
      <main className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-[minmax(0,1fr)_380px] gap-8 px-6 py-7">
        <section className="min-w-0">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">
                Daylight: we check all {total} registered brokers&apos; opt-out pages, live.
              </h1>
              <p className="mt-1.5 max-w-[760px] text-[15px] text-muted">
                A broker must offer a way to opt out. Daylight visits each one&apos;s published rights page and records whether a person can actually find it.
              </p>
            </div>
            <Button variant="primary" size="lg" onClick={run} busy={starting} disabled={running} className="shrink-0 whitespace-nowrap">
              {running ? "Sweeping…" : "Run sweep"}
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-5 divide-x divide-line rounded-xl border border-line bg-panel">
            <div className="px-5 py-4">
              <div className="text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                {checked}
                <span className="text-[22px] text-dim">/{total}</span>
              </div>
              <div className="mt-2 text-[13px] text-muted">{running ? "checked so far" : "checked"}</div>
            </div>
            {(["visible", "hidden", "blocked", "unreachable"] as DaylightStatus[]).map((k) => (
              <div key={k} className="px-5 py-4">
                <div className={cx("text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums", counts[k] ? STATUS[k].text : "text-dim")}>{counts[k]}</div>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-muted">
                  <span className={cx("size-2.5 rounded-[3px]", STATUS[k].tile)} />
                  {STATUS[k].label}
                </div>
              </div>
            ))}
          </div>

          {running && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-fg transition-[width] duration-300" style={{ width: `${Math.round(((progress?.done ?? 0) / Math.max(total, 1)) * 100)}%` }} />
            </div>
          )}

          {phase === "missing" && (
            <div className="mt-5 rounded-xl border border-dashed border-line-2 px-5 py-4 text-[15px] text-muted">
              <span className="font-medium text-fg">No sweep results yet.</span> The Daylight scanner isn&apos;t running on this server, so every broker below is still unchecked.
            </div>
          )}
          {phase === "ok" && !data?.scan && !running && (
            <div className="mt-5 rounded-xl border border-dashed border-line-2 px-5 py-4 text-[15px] text-muted">
              <span className="font-medium text-fg">No sweep has run yet.</span> Press Run sweep to check every broker&apos;s opt-out page.
            </div>
          )}
          {(phase === "error" || errMsg) && <p className="mt-4 text-[14px] text-alarm">{errMsg ?? "Could not load Daylight results."}</p>}

          <div className="mt-5 rounded-xl border border-line bg-panel p-4">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15px, 1fr))" }}>
              {tiles.map((t) => (
                <button
                  key={t.brokerId}
                  onClick={() => t.status !== "pending" && setSelected(t.brokerId)}
                  title={t.name ? `${t.name} · ${STATUS[t.status].label}` : "Not checked"}
                  className={cx(
                    "aspect-square rounded-[3px] transition-transform",
                    STATUS[t.status].tile,
                    t.status !== "pending" && "anim-tile-in cursor-pointer hover:scale-125 hover:ring-2 hover:ring-fg",
                    t.status === "pending" && "cursor-default",
                    selected === t.brokerId && "ring-2 ring-fg",
                  )}
                  aria-label={t.name || "Not checked"}
                />
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
            <span>
              Signals are what a search engine sees; a blocked page may be bot protection, not hiding.
              {!running && !!data?.scan?.summary?.carriedOver && ` ${data.scan.summary.carriedOver} blocked this sweep, so their last conclusive result is shown.`}
            </span>
            {data?.scan && (
              <span className="font-mono text-[12px] text-dim">
                last sweep {fmtStamp(data.scan.startedAt)}
                {data.scan.finishedAt ? ` → ${fmtStamp(data.scan.finishedAt)}` : " · in progress"}
              </span>
            )}
          </div>
        </section>

        <aside className="sticky top-6 h-[calc(100vh-68px-56px)] self-start rounded-xl border border-line bg-panel p-5">
          {selTile ? (
            <BrokerPanel tile={selTile} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex h-full flex-col">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">How to read the board</h3>
              <ul className="mt-3 flex flex-col gap-3">
                {(["visible", "hidden", "blocked", "unreachable"] as DaylightStatus[]).map((k) => (
                  <li key={k} className="flex gap-3">
                    <span className={cx("mt-1 size-3.5 shrink-0 rounded-[3px]", STATUS[k].tile)} />
                    <div>
                      <div className={cx("text-[14px] font-semibold", STATUS[k].text)}>{STATUS[k].label}</div>
                      <div className="text-[13px] text-muted">{STATUS[k].blurb}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-6 min-h-0 flex-1 overflow-y-auto border-t border-line pt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Hidden from search engines</h3>
                {ownOptOut > 0 && <p className="mt-1 text-[13px] text-dim"><span className="text-alarm">{ownOptOut}</span> hide their own opt-out page; the rest a privacy page or a vendor portal.</p>}
                {hiddenList.length ? (
                  <ul className="mt-2 flex flex-col">
                    {hiddenList.map((t) => (
                      <li key={t.brokerId}>
                        <button onClick={() => setSelected(t.brokerId)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] text-fg hover:bg-white/[0.04]">
                          <span className={`size-2 shrink-0 rounded-[2px] ${t.kind === "own-optout" ? "bg-alarm" : "bg-alarm/50"}`} />
                          <span className="truncate">{t.name}</span>
                          {t.kind && <span className="ml-auto shrink-0 font-mono text-[11px] text-dim">{KIND_LABEL[t.kind]}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-dim">{checked ? "None found in this sweep." : "Run a sweep to find out."}</p>
                )}
              </div>
              <p className="mt-3 text-[12px] text-dim">Click any tile for the verbatim evidence and the broker&apos;s own registry filing.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
