import fs from "node:fs";
import path from "node:path";
import { bus, type TelltaleEvent } from "../src/lib/events";
import { runScan } from "../src/lib/daylight/scan";
import { SNAPSHOT_FILE, type Snapshot } from "../src/lib/daylight/findings";

// Audits every registered broker's privacy-rights page against the live web.
// Usage: npx tsx scripts/daylight.ts [--limit N] [--concurrency N] [--broker id ...]

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const concurrency = arg("concurrency") ? Number(arg("concurrency")) : 16;
  const brokerIds = process.argv.flatMap((a, i) => (process.argv[i - 1] === "--broker" ? [a] : []));

  bus.on("event", (e: TelltaleEvent) => {
    if (e.type !== "scan.progress") return;
    if (e.status !== "visible" || e.done % 25 === 0 || e.done === e.total) {
      process.stderr.write(`[${String(e.done).padStart(3)}/${e.total}] ${e.status.padEnd(11)} ${e.brokerId}\n`);
    }
  });

  const { scanId, summary, results } = await runScan({ concurrency, limit, brokerIds: brokerIds.length ? brokerIds : undefined });

  const snapshot: Snapshot = {
    scanId,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    counts: summary.counts,
    brokers: results.map((r) => ({
      id: r.brokerId,
      name: r.name,
      status: r.status,
      urls: r.checks.map((c) => ({ url: c.url, finalUrl: c.finalUrl, httpStatus: c.httpStatus, status: c.status, signals: c.signals })),
    })),
  };
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 1) + "\n");

  const secs = (Date.parse(summary.finishedAt) - Date.parse(summary.startedAt)) / 1000;
  console.log(`\nDaylight scan ${scanId}`);
  console.log(`${summary.totalBrokers} brokers, ${summary.totalUrls} URLs, ${secs.toFixed(0)}s\n`);
  console.table(summary.counts);

  console.log(`\nHIDDEN (${summary.hidden.length} URLs)`);
  for (const h of summary.hidden) {
    console.log(`\n  ${h.name}  [${h.brokerId}]`);
    console.log(`    url:   ${h.url}${h.finalUrl && h.finalUrl !== h.url ? `\n    final: ${h.finalUrl}` : ""}`);
    for (const s of h.evidence) console.log(`    ${s.type}: ${s.detail}`);
  }

  console.log(`\nBLOCKED (${summary.blocked.length} URLs)`);
  for (const b of summary.blocked) console.log(`  ${b.httpStatus}  ${b.name}  ${b.url}`);

  console.log(`\nSnapshot written to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
