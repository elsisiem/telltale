import crypto from "node:crypto";
import { db } from "../db";
import { splitUrls } from "../domains";
import { emit } from "../events";
import { loadRegistry, type Broker } from "../registry";
import { checkUrl, normalizeUrl, worst, type CheckOptions, type CheckResult, type CheckStatus, type Signal } from "./check";

// Daylight: audits every registered broker's privacy-rights page for search-engine hiding.

export type BrokerResult = { brokerId: string; name: string; status: CheckStatus; checks: CheckResult[] };

export type ScanSummary = {
  startedAt: string;
  finishedAt: string;
  totalBrokers: number;
  totalUrls: number;
  counts: Record<CheckStatus, number>;
  hidden: { brokerId: string; name: string; url: string; finalUrl: string | null; evidence: Signal[] }[];
  blocked: { brokerId: string; name: string; url: string; httpStatus: number | null }[];
};

export type ScanOptions = {
  concurrency?: number;
  limit?: number;
  brokerIds?: string[];
  /** Overrides the registry (tests point fake brokers at a local server). */
  brokers?: Broker[];
  check?: CheckOptions;
  /** Lets a caller (the API route) know the id before the scan finishes. */
  scanId?: string;
};

export function urlsFor(b: Broker): string[] {
  const listed = b.rightsUrls.length ? b.rightsUrls : splitUrls(b.website).slice(0, 1);
  return [...new Set(listed.map(normalizeUrl))];
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

export async function runScan(opts: ScanOptions = {}): Promise<{ scanId: string; summary: ScanSummary; results: BrokerResult[] }> {
  let brokers = opts.brokers ?? loadRegistry();
  if (opts.brokerIds) {
    const ids = new Set(opts.brokerIds);
    brokers = brokers.filter((b) => ids.has(b.id));
  }
  if (opts.limit !== undefined) brokers = brokers.slice(0, opts.limit);

  const d = await db();
  const scanId = opts.scanId ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await d.query("insert into scans (id, started_at) values ($1, $2)", [scanId, startedAt]);

  const check: CheckOptions = { robotsCache: new Map(), ...opts.check };
  const results: BrokerResult[] = [];
  let done = 0;

  await pool(brokers, opts.concurrency ?? 16, async (b) => {
    const urls = urlsFor(b);
    const checks: CheckResult[] = [];
    for (const u of urls) checks.push(await checkUrl(u, check));
    if (!checks.length) {
      checks.push({ url: "", finalUrl: null, httpStatus: null, status: "unreachable", signals: [{ type: "network-error", detail: "no rights URL or website in registry filing" }] });
    }
    const status = worst(checks.map((c) => c.status));
    for (const c of checks) {
      await d.query(
        `insert into scan_results (scan_id, broker_id, url, status, signals) values ($1,$2,$3,$4,$5)
         on conflict (scan_id, broker_id, url) do nothing`,
        [scanId, b.id, c.url, c.status, JSON.stringify(c.signals)],
      );
    }
    results.push({ brokerId: b.id, name: b.name, status, checks });
    emit({ type: "scan.progress", scanId, done: ++done, total: brokers.length, brokerId: b.id, status });
  });

  const order = new Map(brokers.map((b, i) => [b.id, i]));
  results.sort((a, b) => order.get(a.brokerId)! - order.get(b.brokerId)!);

  const counts: Record<CheckStatus, number> = { visible: 0, hidden: 0, blocked: 0, unreachable: 0 };
  for (const r of results) counts[r.status]++;
  const summary: ScanSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalBrokers: results.length,
    totalUrls: results.reduce((n, r) => n + r.checks.length, 0),
    counts,
    hidden: results.flatMap((r) =>
      r.checks
        .filter((c) => c.status === "hidden")
        .map((c) => ({ brokerId: r.brokerId, name: r.name, url: c.url, finalUrl: c.finalUrl, evidence: c.signals })),
    ),
    blocked: results.flatMap((r) =>
      r.checks
        .filter((c) => c.status === "blocked")
        .map((c) => ({ brokerId: r.brokerId, name: r.name, url: c.url, httpStatus: c.httpStatus })),
    ),
  };
  await d.query("update scans set finished_at = $2, summary = $3 where id = $1", [scanId, summary.finishedAt, JSON.stringify(summary)]);
  emit({ type: "scan.done", scanId });
  return { scanId, summary, results };
}
