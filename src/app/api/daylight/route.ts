import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Signal } from "@/lib/daylight/check";
import { readSnapshot } from "@/lib/daylight/findings";
import type { ScanSummary } from "@/lib/daylight/scan";
import { loadRegistry } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "visible" | "hidden" | "blocked" | "unreachable";
const RANK: Record<Status, number> = { hidden: 3, blocked: 2, unreachable: 1, visible: 0 };

/** Latest finished sweep (database first, then the committed snapshot), one row per broker. */
export async function GET() {
  const names = Object.fromEntries(loadRegistry().map((b) => [b.id, b.name]));
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
    const byBroker = new Map<string, { brokerId: string; name: string; url: string; status: Status; signals: Signal[] }>();
    for (const r of results) {
      const cur = byBroker.get(r.broker_id);
      if (!cur || RANK[r.status] > RANK[cur.status]) {
        byBroker.set(r.broker_id, { brokerId: r.broker_id, name: names[r.broker_id] ?? r.broker_id, url: r.url, status: r.status, signals: r.signals });
      }
    }
    return NextResponse.json({
      source: "database",
      scan: { id: scan.id, startedAt: scan.started_at, finishedAt: scan.finished_at, summary: { ...scan.summary, total: scan.summary.totalBrokers } },
      results: [...byBroker.values()],
    });
  }

  const snap = readSnapshot();
  if (!snap) return NextResponse.json({ source: "none", scan: null, results: [] });
  const results = snap.brokers.map((b) => {
    const worst = [...b.urls].sort((x, y) => RANK[y.status] - RANK[x.status])[0];
    return { brokerId: b.id, name: b.name, url: worst?.url ?? "", status: b.status, signals: worst?.signals ?? [] };
  });
  return NextResponse.json({
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
