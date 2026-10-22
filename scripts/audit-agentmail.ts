// Read-only security audit of the AgentMail account behind AGENTMAIL_API_KEY. Prints metadata
// only (never key secrets or message bodies): npx tsx scripts/audit-agentmail.ts
import fs from "node:fs";
import { AgentMailClient } from "agentmail";

const env = Object.fromEntries([...fs.readFileSync(".env.local", "utf8").matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
const am = new AgentMailClient({ apiKey: env.AGENTMAIL_API_KEY });

// Drop anything that could be a secret before printing.
const SECRETISH = /key|secret|token|password|hash/i;
function safe(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(safe);
  if (obj instanceof Date) return obj.toISOString();
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([k]) => !(SECRETISH.test(k) && !/id$|name|prefix|count|limit|at$/i.test(k)))
        .map(([k, v]) => [k, safe(v)]),
    );
  }
  return obj;
}

async function section(title: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${title}`);
  try {
    console.log(JSON.stringify(safe(await fn()), null, 2).slice(0, 3000));
  } catch (e) {
    console.log("unavailable:", (e as Error).message.split("\n")[0].slice(0, 160));
  }
}

(async () => {
  await section("organization", () => am.organizations.get());
  await section("api keys (metadata only)", () => am.apiKeys.list());
  await section("webhooks (where incoming mail may be forwarded)", () => am.webhooks.list());
  await section("pods", () => am.pods.list());
  await section("usage", () => am.metrics.queryUsage());

  console.log("\n=== inbox activity (counts and dates only, no contents)");
  const { inboxes } = await am.inboxes.list({ limit: 100 });
  for (const i of inboxes) {
    let summary = "";
    try {
      const { messages, count } = await am.inboxes.messages.list(i.inboxId, { limit: 100 });
      const sent = messages.filter((m) => m.labels?.includes("sent")).length;
      const received = messages.filter((m) => m.labels?.includes("received")).length;
      const times = messages.map((m) => new Date(m.timestamp).getTime()).sort((a, b) => a - b);
      const last = times.length ? new Date(times[times.length - 1]).toISOString().slice(0, 16) : "-";
      const today = messages.filter((m) => new Date(m.timestamp).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
      summary = `messages ${count} (sent ${sent}, received ${received}), today ${today}, last ${last}`;
    } catch (e) {
      summary = "messages unavailable: " + (e as Error).message.split("\n")[0].slice(0, 80);
    }
    console.log(`${i.email.padEnd(36)} created ${new Date(i.createdAt).toISOString().slice(0, 16)}  client ${String(i.clientId ?? "-").padEnd(18)} ${summary}`);
  }
})();
