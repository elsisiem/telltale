"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import type { Finding } from "@/lib/risk";
import { AppShell } from "./AppShell";
import { ApiError, api, cx, fmtStamp } from "./format";
import { useDashboard, useEvents } from "./hooks";
import type { DaylightResponse, DaylightResult, DaylightStatus } from "./types";
import { Button, Card, CardHeader, Icon, Tag } from "./ui";

type TileStatus = DaylightStatus | "pending";
type Tile = { brokerId: string; name: string; status: TileStatus; result?: DaylightResult };

// Monochrome board: the eye should land only on the orange, which is the problem.
const STATUS: Record<TileStatus, { label: string; tile: string; blurb: string }> = {
  hidden: { label: "Hidden", tile: "bg-accent", blurb: "The rights page tells search engines not to index it." },
  visible: { label: "Visible", tile: "bg-[#cfd5dc]", blurb: "The rights page is indexable and reachable." },
  blocked: { label: "Blocked", tile: "hatch bg-well", blurb: "The page refused an automated visit (bot protection)." },
  unreachable: { label: "Unreachable", tile: "border border-line-strong bg-surface", blurb: "The page did not load." },
  pending: { label: "Not checked", tile: "bg-well", blurb: "" },
};
const ORDER: DaylightStatus[] = ["hidden", "visible", "blocked", "unreachable"];
const KIND_ORDER = { "own-optout": 0, "own-policy": 1, "vendor-portal": 2 } as const;
const KIND_LABEL = { "own-optout": "own opt-out", "own-policy": "privacy page", "vendor-portal": "vendor portal" } as const;

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

  const r = tile.result;
  return (
    <div className="anim-fade flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-ink">{info?.name ?? tile.name}</h3>
          {info?.dba && <p className="mt-0.5 text-[12px] text-muted">dba {info.dba}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag tone={tile.status === "hidden" ? "accent" : "default"}>{STATUS[tile.status].label}</Tag>
            {r?.kind && <Tag tone="muted">{KIND_LABEL[r.kind]}</Tag>}
            {r?.carried && <Tag tone="muted">carried · {r.observedAt?.slice(0, 10)}</Tag>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-muted hover:text-ink" aria-label="Close">
          <Icon name="close" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {STATUS[tile.status].blurb && <p className="text-[12.5px] text-muted">{STATUS[tile.status].blurb}</p>}
        {r?.url && (
          <div className="mt-3">
            <div className="label">Page checked</div>
            <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[11.5px] text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
              {r.url}
            </a>
          </div>
        )}
        <div className="mt-4">
          <div className="label">Evidence · verbatim</div>
          {r?.signals.length ? (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {r.signals.map((sig, i) => (
                <li key={i} className="border border-line bg-well px-2.5 py-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{sig.type}</div>
                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink">{sig.detail}</pre>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-faint">{tile.status === "pending" ? "Not checked yet." : "No signals recorded."}</p>
          )}
        </div>
        <div className="mt-4">
          <div className="label">In its registry filing, it said it</div>
          {loading ? (
            <div className="scanline mt-2 h-14 bg-well" />
          ) : info?.findings.length ? (
            <ul className="mt-1.5 flex flex-col border-t border-line">
              {info.findings.map((f) => (
                <li key={f.key} className="flex gap-2.5 border-b border-line py-1.5 text-[12.5px] leading-snug text-ink">
                  <span className={cx("mt-[6px] size-[5px] shrink-0", f.severity === "high" ? "bg-accent" : "bg-ink-2")} />
                  {f.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-faint">{info ? "No flagged practices in its filing." : "No registry entry found."}</p>
          )}
          {info?.contactEmail && <p className="mt-3 font-mono text-[11px] text-muted">privacy contact · {info.contactEmail}</p>}
        </div>
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
  const connected = useEvents(onEvent);

  const running = !!scanId;
  const results = useMemo(() => data?.results ?? [], [data]);
  const byId = useMemo(() => new Map(results.map((r) => [r.brokerId, r])), [results]);
  const total = progress?.total || data?.scan?.summary?.total || state?.registry.brokers || 603;

  async function run() {
    setStarting(true);
    setErrMsg(null);
    try {
      const r = await api<{ scanId: string }>("/api/daylight/run", { method: "POST" });
      setScanId(r.scanId);
      setLive(new Map());
      setProgress({ done: 0, total });
    } catch (e) {
      setErrMsg(e instanceof ApiError && e.status === 404 ? "The sweep endpoint isn't available on this server." : (e as Error).message);
    } finally {
      setStarting(false);
    }
  }

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
  const hiddenList = tiles
    .filter((t) => t.status === "hidden")
    .map((t) => ({ ...t, kind: byId.get(t.brokerId)?.kind ?? null }))
    .sort((a, b) => (a.kind ? KIND_ORDER[a.kind] : 3) - (b.kind ? KIND_ORDER[b.kind] : 3) || a.name.localeCompare(b.name));
  const ownOptOut = hiddenList.filter((t) => t.kind === "own-optout").length;
  const pct = Math.round(((progress?.done ?? 0) / Math.max(total, 1)) * 100);

  return (
    <AppShell
      active="daylight"
      state={state}
      connected={connected}
      crumbs={["Telltale", "Daylight"]}
      actions={
        <Button variant="primary" size="sm" onClick={run} busy={starting} disabled={running}>
          {running ? `Sweeping ${pct}%` : "Run sweep"}
        </Button>
      }
    >
      <div className="grid min-h-full grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <header>
            <h1 className="text-[22px] font-semibold text-ink">Daylight</h1>
            <p className="mt-1 max-w-[760px] text-[14px] text-muted">
              Every California data broker must publish a page where consumers can exercise their rights. Daylight visits all {total} of them and records whether a person can actually find it.
            </p>
          </header>

          <dl className="grid grid-cols-2 border border-line bg-surface sm:grid-cols-5">
            <div className="border-line px-4 py-3 sm:border-r">
              <dt className="label">Checked</dt>
              <dd className="mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums text-ink">
                {checked}
                <span className="text-[15px] text-faint">/{total}</span>
              </dd>
            </div>
            {ORDER.map((k, i) => (
              <div key={k} className={cx("border-t border-line px-4 py-3 sm:border-t-0", i < ORDER.length - 1 && "sm:border-r")}>
                <dt className="label flex items-center gap-1.5">
                  <span className={cx("size-2.5", STATUS[k].tile)} />
                  {STATUS[k].label}
                </dt>
                <dd className={cx("mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums", k === "hidden" && counts[k] ? "text-accent-ink" : counts[k] ? "text-ink" : "text-faint")}>{counts[k]}</dd>
              </div>
            ))}
          </dl>

          {running && (
            <div className="h-[2px] bg-line" aria-label={`Sweep ${pct}% done`}>
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          )}
          {phase === "missing" && <p className="border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted">No sweep results on this server yet.</p>}
          {phase === "ok" && !data?.scan && !running && <p className="border border-dashed border-line-strong px-4 py-3 text-[13px] text-muted">No sweep has run yet. Run one to check every broker.</p>}
          {(phase === "error" || errMsg) && <p className="border-l-2 border-accent pl-3 text-[13px] text-accent-ink">{errMsg ?? "Could not load Daylight results."}</p>}

          <Card>
            <CardHeader
              title="Registered brokers"
              meta={data?.scan && <span className="font-mono text-[10.5px] text-faint">sweep {fmtStamp(data.scan.startedAt)}{data.scan.finishedAt ? ` → ${fmtStamp(data.scan.finishedAt).slice(11)}` : " · in progress"}</span>}
            />
            <div className={cx("p-4", running && "scanline")}>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }}>
                {tiles.map((t) => (
                  <button
                    key={t.brokerId}
                    onClick={() => t.status !== "pending" && setSelected(t.brokerId)}
                    title={t.name ? `${t.name} · ${STATUS[t.status].label}` : "Not checked"}
                    className={cx(
                      "aspect-square transition-transform duration-100",
                      STATUS[t.status].tile,
                      t.status !== "pending" ? "anim-tile cursor-pointer hover:scale-[1.35] hover:outline hover:outline-1 hover:outline-ink" : "cursor-default",
                      selected === t.brokerId && "outline outline-2 outline-offset-1 outline-ink",
                    )}
                    aria-label={t.name || "Not checked"}
                  />
                ))}
              </div>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-[12px] text-muted">
              Signals are what a search engine sees. A blocked page may be bot protection, not hiding.
              {!running && !!data?.scan?.summary?.carriedOver && ` ${data.scan.summary.carriedOver} were blocked this sweep, so their last conclusive result is shown.`}
            </div>
          </Card>
        </div>

        <Card className="flex min-h-[520px] flex-col xl:sticky xl:top-5 xl:h-[calc(100vh-56px-40px)]">
          {selTile ? (
            <BrokerPanel tile={selTile} onClose={() => setSelected(null)} />
          ) : (
            <>
              <CardHeader title="Hidden from search engines" meta={<span className="font-mono text-[10.5px] text-accent-ink">{hiddenList.length}</span>} />
              <div className="border-b border-line px-4 py-3">
                {ownOptOut > 0 ? (
                  <p className="text-[13px] text-ink">
                    <span className="font-mono font-semibold text-accent-ink">{ownOptOut}</span> hide their own opt-out page. The rest hide a privacy page or use a vendor portal that blocks crawlers.
                  </p>
                ) : (
                  <p className="text-[13px] text-muted">{checked ? "No broker hides its rights page in this sweep." : "Run a sweep to find out."}</p>
                )}
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                {hiddenList.map((t) => (
                  <li key={t.brokerId}>
                    <button onClick={() => setSelected(t.brokerId)} className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors hover:bg-hover">
                      <span className={cx("size-2 shrink-0", t.kind === "own-optout" ? "bg-accent" : "border border-accent")} />
                      <span className="truncate text-[13px] text-ink">{t.name}</span>
                      {t.kind && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-faint">{KIND_LABEL[t.kind]}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-4 py-2.5">
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {ORDER.map((k) => (
                    <li key={k} className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
                      <span className={cx("size-2.5 shrink-0", STATUS[k].tile)} />
                      {STATUS[k].label}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-faint">Select any tile for verbatim evidence and the broker&apos;s own filing.</p>
              </div>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
