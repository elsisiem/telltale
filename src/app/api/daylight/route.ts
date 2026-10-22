import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Signal } from "@/lib/daylight/check";
import { classify, ownDomains, readSnapshot } from "@/lib/daylight/findings";
import type { ScanSummary } from "@/lib/daylight/scan";
import { loadRegistry } from "@/lib/registry";
import { sweepProgress } from "@/lib/daylight/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "visible" | "hidden" | "blocked" | "unreachable";
const RANK: Record<Status, number> = { hidden: 3, blocked: 2, unreachable: 1, visible: 0 };

/** Latest finished sweep (database first, then the committed snapshot), one row per broker. */
async function latest() {
  const registry = loadRegistry();
  const names = Object.fromEntries(registry.map((b) => [b.id, b.name]));
  const domains = Object.fromEntries(registry.map((b) => [b.id, ownDomains(b)]));
  // How damning a hidden page is: the broker's own opt-out page, its policy page, or a vendor portal.
  const kindOf = (brokerId: string, url: string, status: Status) => (status === "hidden" ? classify(url, domains[brokerId] ?? []) : null);
  const d = await db();
  const { rows } = await d.query<{ id: string; started_at: string; finished_at: string; summary: ScanSummary }>(
    "select * from scans where finished_at is not null order by finished_at desc limit 1",
  );
  if (rows[0]) {
    const scan = rows[0];
    const { rows: results } = await d.query<{ broker_id: string; url: string; status: Status; signals: Signal[] }>(
      "select broker_id, url, status, signals from scan_results where scan_id = $1",
      [scan.id],
    );
    type Row = { brokerId: string; name: string; url: string; status: Status; signals: Signal[]; kind: string | null; observedAt: string; carried: boolean };
    const byBroker = new Map<string, Row>();
    const finished = new Date(scan.finished_at).toISOString();
    for (const r of results) {
      const cur = byBroker.get(r.broker_id);
      if (!cur || RANK[r.status] > RANK[cur.status]) {
        byBroker.set(r.broker_id, { brokerId: r.broker_id, name: names[r.broker_id] ?? r.broker_id, url: r.url, status: r.status, signals: r.signals, kind: null, observedAt: finished, carried: false });
      }
    }
    // A blocked or unreachable page says nothing new: show the broker's last conclusive result
    // (an earlier sweep, else the committed snapshot) and mark it as carried over.
    const inconclusive = [...byBroker.values()].filter((r) => r.status === "blocked" || r.status === "unreachable").map((r) => r.brokerId);
    if (inconclusive.length) {
      const { rows: prior } = await d.query<{ broker_id: string; url: string; status: Status; signals: Signal[]; finished_at: string }>(
        `select distinct on (r.broker_id) r.broker_id, r.url, r.status, r.signals, s.finished_at
           from scan_results r join scans s on s.id = r.scan_id
          where s.finished_at is not null and s.id <> $1 and r.broker_id = any($2::text[]) and r.status in ('hidden', 'visible')
          order by r.broker_id, s.finished_at desc, (r.status = 'hidden') desc`,
        [scan.id, inconclusive],
      );
      const snapshot = readSnapshot();
      for (const id of inconclusive) {
        const p = prior.find((x) => x.broker_id === id);
        const s = snapshot?.brokers.find((b) => b.id === id);
        const fromSnap = s && (s.status === "hidden" || s.status === "visible") ? s : null;
        const cur = byBroker.get(id)!;
        if (p) byBroker.set(id, { ...cur, url: p.url, status: p.status, signals: p.signals, observedAt: new Date(p.finished_at).toISOString(), carried: true });
        else if (fromSnap) {
          const u = [...fromSnap.urls].sort((x, y) => RANK[y.status] - RANK[x.status])[0];
          byBroker.set(id, { ...cur, url: u?.url ?? cur.url, status: fromSnap.status, signals: u?.signals ?? [], observedAt: snapshot!.finishedAt, carried: true });
        }
      }
    }
    const merged = [...byBroker.values()].map((r) => ({ ...r, kind: kindOf(r.brokerId, r.url, r.status) }));
    const counts = { visible: 0, hidden: 0, blocked: 0, unreachable: 0 } as Record<Status, number>;
    for (const r of merged) counts[r.status]++;
    return ({
      source: "database",
      scan: { id: scan.id, startedAt: scan.started_at, finishedAt: scan.finished_at, summary: { ...scan.summary, total: scan.summary.totalBrokers, counts, carriedOver: merged.filter((r) => r.carried).length } },
      results: merged,
    });
  }

  const snap = readSnapshot();
  if (!snap) return ({ source: "none", scan: null, results: [] });
  const results = snap.brokers.map((b) => {
    const worst = [...b.urls].sort((x, y) => RANK[y.status] - RANK[x.status])[0];
    const url = worst?.url ?? "";
    return { brokerId: b.id, name: b.name, url, status: b.status, signals: worst?.signals ?? [], kind: kindOf(b.id, url, b.status) };
  });
  return ({
    source: "snapshot",
    scan: {
      id: snap.scanId,
      startedAt: snap.startedAt,
      finishedAt: snap.finishedAt,
      summary: { total: snap.brokers.length, counts: snap.counts, hidden: results.filter((r) => r.status === "hidden") },
    },
    results,
  });
}

/** Latest finished sweep plus, while one is running, its progress so far. */
export async function GET() {
  return NextResponse.json({ ...(await latest()), running: await sweepProgress(true) });
}
