import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { setExtraFindings } from "../gate";
import type { Recipient } from "../resolver";
import type { Finding } from "../risk";
import { HIDING_SIGNALS, type CheckStatus, type Signal } from "./check";

// Turns the latest Daylight scan into consent-card findings. Falls back to the snapshot the CLI
// commits to data/ so a fresh deployment has evidence before its first scan.

export const SNAPSHOT_FILE = path.join(process.cwd(), "data", "daylight-latest.json");

export type Snapshot = {
  scanId: string;
  startedAt: string;
  finishedAt: string;
  counts: Record<CheckStatus, number>;
  brokers: {
    id: string;
    name: string;
    status: CheckStatus;
    urls: { url: string; finalUrl: string | null; httpStatus: number | null; status: CheckStatus; signals: Signal[] }[];
  }[];
};

type Hidden = { brokerId: string; signals: Signal[] };

async function fromDb(ids: string[]): Promise<{ observed: string; hidden: Hidden[] } | null> {
  const d = await db();
  const { rows } = await d.query<{ id: string; finished_at: Date | string }>(
    "select id, finished_at from scans where finished_at is not null order by finished_at desc limit 1",
  );
  if (!rows.length) return null;
  const { rows: hits } = await d.query<{ broker_id: string; url: string; signals: Signal[] | string }>(
    "select broker_id, url, signals from scan_results where scan_id = $1 and status = 'hidden' and broker_id = any($2::text[]) order by url",
    [rows[0].id, ids],
  );
  return {
    observed: new Date(rows[0].finished_at).toISOString(),
    hidden: hits.map((h) => ({
      brokerId: h.broker_id,
      signals: typeof h.signals === "string" ? (JSON.parse(h.signals) as Signal[]) : h.signals,
    })),
  };
}

let snapshotCache: { mtimeMs: number; snap: Snapshot } | null = null;
export function readSnapshot(file = SNAPSHOT_FILE): Snapshot | null {
  try {
    const { mtimeMs } = fs.statSync(file);
    if (snapshotCache?.mtimeMs !== mtimeMs) snapshotCache = { mtimeMs, snap: JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot };
    return snapshotCache.snap;
  } catch {
    return null;
  }
}

function fromSnapshot(ids: string[]): { observed: string; hidden: Hidden[] } | null {
  const snap = readSnapshot();
  if (!snap) return null;
  const want = new Set(ids);
  return {
    observed: snap.finishedAt,
    hidden: snap.brokers
      .filter((b) => want.has(b.id))
      .flatMap((b) => b.urls.filter((u) => u.status === "hidden").map((u) => ({ brokerId: b.id, signals: u.signals }))),
  };
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function daylightFindings(recipient: Recipient): Promise<Finding[]> {
  if (!recipient.brokers.length) return [];
  const ids = recipient.brokers.map((b) => b.id);
  let scan: { observed: string; hidden: Hidden[] } | null = null;
  try {
    scan = await fromDb(ids);
  } catch {
    // A database problem must never block the consent card; fall through to the snapshot.
  }
  scan ??= fromSnapshot(ids);
  if (!scan) return [];

  const out: Finding[] = [];
  for (const b of recipient.brokers) {
    const evidence = scan.hidden
      .filter((h) => h.brokerId === b.id)
      .flatMap((h) => h.signals)
      .find((s) => HIDING_SIGNALS.includes(s.type));
    if (!evidence) continue;
    out.push({
      key: "hidden-optout",
      severity: "high",
      text: `hides its consumer privacy-rights page from search engines (observed ${scan.observed.slice(0, 10)}: ${truncate(evidence.detail, 120)})`,
      entity: b.name,
      source: "daylight",
    });
  }
  return out;
}

export function registerDaylight() {
  setExtraFindings(daylightFindings);
}
