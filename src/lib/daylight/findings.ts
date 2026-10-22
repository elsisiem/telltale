import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { emailDomain, registrableDomain, splitUrls } from "../domains";
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

type Hidden = { brokerId: string; url: string; signals: Signal[]; observed: string };

/**
 * Each broker's most recent *conclusive* observation (a page seen as hidden or visible). A sweep
 * where the page was blocked or unreachable says nothing, so it must not erase an earlier one;
 * sweeps from datacenter IPs hit more bot walls than ones from a home connection.
 */
async function fromDb(ids: string[]): Promise<{ decided: Set<string>; hidden: Hidden[] }> {
  const d = await db();
  const { rows } = await d.query<{ broker_id: string; url: string; status: string; signals: Signal[] | string; finished_at: Date | string; scan_id: string }>(
    `select r.broker_id, r.url, r.status, r.signals, s.finished_at, s.id as scan_id
       from scan_results r join scans s on s.id = r.scan_id
      where s.finished_at is not null and r.broker_id = any($1::text[]) and r.status in ('hidden', 'visible')
      order by s.finished_at desc`,
    [ids],
  );
  const latestScan = new Map<string, string>();
  const hidden: Hidden[] = [];
  for (const r of rows) {
    if (!latestScan.has(r.broker_id)) latestScan.set(r.broker_id, r.scan_id);
    if (latestScan.get(r.broker_id) !== r.scan_id || r.status !== "hidden") continue;
    hidden.push({
      brokerId: r.broker_id,
      url: r.url,
      signals: typeof r.signals === "string" ? (JSON.parse(r.signals) as Signal[]) : r.signals,
      observed: new Date(r.finished_at).toISOString(),
    });
  }
  return { decided: new Set(latestScan.keys()), hidden };
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

function fromSnapshot(ids: string[]): Hidden[] {
  const snap = readSnapshot();
  if (!snap) return [];
  const want = new Set(ids);
  return snap.brokers
    .filter((b) => want.has(b.id))
    .flatMap((b) => b.urls.filter((u) => u.status === "hidden").map((u) => ({ brokerId: b.id, url: u.url, signals: u.signals, observed: snap.finishedAt })));
}

const OPT_OUT_PATH = /opt-?out|choices|do-?not-?sell|donotsell|rights|control|privacy-form|delete|request|preferences/i;

/** The broker's own domains: its website and contact email, not wherever its rights page happens to be hosted. */
export function ownDomains(b: { website: string; contactEmail: string }): string[] {
  const out = new Set<string>();
  for (const u of splitUrls(b.website)) {
    const d = registrableDomain(u);
    if (d) out.add(d);
  }
  const e = emailDomain(b.contactEmail);
  if (e) out.add(e);
  return [...out];
}

export function classify(url: string, brokerDomains: string[]): "own-optout" | "own-policy" | "vendor-portal" {
  const domain = registrableDomain(url);
  if (!domain || !brokerDomains.includes(domain)) return "vendor-portal";
  return OPT_OUT_PATH.test(new URL(/^https?:/i.test(url) ? url : `https://${url}`).pathname) ? "own-optout" : "own-policy";
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function daylightFindings(recipient: Recipient): Promise<Finding[]> {
  if (!recipient.brokers.length) return [];
  const ids = recipient.brokers.map((b) => b.id);
  let fromScans: { decided: Set<string>; hidden: Hidden[] } = { decided: new Set(), hidden: [] };
  try {
    fromScans = await fromDb(ids);
  } catch {
    // A database problem must never block the consent card; the snapshot still answers.
  }
  const hidden = [...fromScans.hidden, ...fromSnapshot(ids.filter((id) => !fromScans.decided.has(id)))];
  const scan = { hidden };

  const out: Finding[] = [];
  for (const b of recipient.brokers) {
    const hits = scan.hidden
      .filter((h) => h.brokerId === b.id)
      .map((h) => ({ ...h, evidence: h.signals.find((s) => HIDING_SIGNALS.includes(s.type)) }))
      .filter((h) => h.evidence)
      .map((h) => ({ ...h, kind: classify(h.url, ownDomains(b)) }));
    // Report the most damning page: the broker's own opt-out page, then its policy, then a vendor portal.
    const hit = (["own-optout", "own-policy", "vendor-portal"] as const).map((k) => hits.find((h) => h.kind === k)).find(Boolean);
    if (!hit?.evidence) continue;
    const seen = `observed ${hit.observed.slice(0, 10)}: ${truncate(hit.evidence.detail, 120)}`;
    out.push({
      key: "hidden-optout",
      severity: hit.kind === "own-optout" ? "high" : "medium",
      text:
        hit.kind === "own-optout" ? `hides its own opt-out page from search engines (${seen})`
        : hit.kind === "own-policy" ? `lists a privacy page for consumer rights that is hidden from search engines (${seen})`
        : `routes consumer requests to a third-party portal that blocks search engines (${seen})`,
      entity: b.name,
      source: "daylight",
    });
  }
  return out;
}

export function registerDaylight() {
  setExtraFindings(daylightFindings);
}
