import { db } from "../db";
import { loadRegistry } from "../registry";

// The sweep in progress, if any. It runs on the server independently of any page, so a page that
// opens mid-sweep (or comes back to it) rebuilds the board from what is already stored.

type Running = { scanId: string; startedAt: string; total: number };
type G = typeof globalThis & { __telltaleSweep?: Running };
const g = globalThis as G;

export function startSweep(scanId: string): Running {
  g.__telltaleSweep = { scanId, startedAt: new Date().toISOString(), total: loadRegistry().length };
  return g.__telltaleSweep;
}

export function endSweep(scanId: string) {
  if (g.__telltaleSweep?.scanId === scanId) g.__telltaleSweep = undefined;
}

export function runningSweep(): Running | null {
  return g.__telltaleSweep ?? null;
}

const RANK: Record<string, number> = { hidden: 3, blocked: 2, unreachable: 1, visible: 0 };

/** Progress of the running sweep: how many brokers are done, and each one's status so far. */
export async function sweepProgress(withStatuses = false): Promise<(Running & { done: number; statuses?: Record<string, string> }) | null> {
  const run = runningSweep();
  if (!run) return null;
  const d = await db();
  const { rows } = await d.query<{ broker_id: string; status: string }>("select broker_id, status from scan_results where scan_id = $1", [run.scanId]);
  const statuses: Record<string, string> = {};
  for (const r of rows) {
    const cur = statuses[r.broker_id];
    if (!cur || RANK[r.status] > RANK[cur]) statuses[r.broker_id] = r.status;
  }
  return { ...run, done: Object.keys(statuses).length, ...(withStatuses ? { statuses } : {}) };
}
