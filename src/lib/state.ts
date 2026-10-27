import { db } from "./db";
import { listPending } from "./gate";
import { loadRegistry, REGISTRY_SOURCE } from "./registry";
import { isDryRun, loadProfile } from "./profile-store";
import { sweepProgress } from "./daylight/status";

// Everything the console renders, in one read. Real values from the vault are never included:
// the UI shows tags, outcomes and the person's first name only.

export async function dashboardState() {
  const d = await db();
  const [disclosures, messages, leaks, requests, complaints] = await Promise.all([
    d.query("select id, created_at, recipient_host, recipient_domain, broker_ids, risk_level, tag_code, alias_email, fields, purpose, receipt->>'receiptId' as receipt_id from disclosures order by created_at"),
    d.query("select * from messages order by received_at"),
    d.query("select * from leaks order by detected_at"),
    d.query("select id, created_at, kind, target_domain, target_broker_id, tag_code, channel, sent_at, due_at, status from requests order by created_at"),
    d.query("select id, created_at, leak_id, request_id, status from complaints order by created_at"),
  ]);
  const registry = loadRegistry();
  const names = Object.fromEntries(registry.map((b) => [b.id, b.name]));
  const [profile, dryRun, sweep] = await Promise.all([loadProfile(), isDryRun(), sweepProgress()]);
  return {
    person: { firstName: profile.firstName, synthetic: !!profile.synthetic, dryRun },
    sweep,
    registry: { brokers: registry.length, source: REGISTRY_SOURCE },
    integrations: {
      model: process.env.ANTHROPIC_API_KEY ? (process.env.TELLTALE_MODEL || "claude-sonnet-5-5") : null,
      agentmail: !!process.env.AGENTMAIL_API_KEY,
      kernel: !!process.env.KERNEL_API_KEY,
      exa: !!process.env.EXA_API_KEY,
      database: process.env.DATABASE_URL?.trim() ? "neon" : "pglite",
    },
    brokerNames: names,
    pending: listPending().filter((p) => p.status === "pending"),
    disclosures: disclosures.rows,
    messages: messages.rows,
    leaks: leaks.rows,
    requests: requests.rows,
    complaints: complaints.rows,
  };
}

export type DashboardState = Awaited<ReturnType<typeof dashboardState>>;
