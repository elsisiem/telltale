// Smoke-tests each configured integration with one cheap call: npx tsx scripts/check-keys.ts
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[2].trim()) process.env[m[1]] ??= m[2].trim();
}
async function check(name: string, fn: () => Promise<string>) {
  try { console.log(`ok   ${name}: ${await fn()}`); } catch (e) { console.log(`FAIL ${name}: ${(e as Error).message.slice(0, 200)}`); }
}
(async () => {
  await check("anthropic", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const ws = process.env.ANTHROPIC_WORKSPACE_ID;
    const r = await new Anthropic(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {}).messages.create({ model: process.env.TELLTALE_MODEL || "claude-sonnet-5-5", max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with the word ready." }] });
    return `${r.model} → ${r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim()}`;
  });
  await check("agentmail", async () => {
    const { AgentMailClient } = await import("agentmail");
    const res = await new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY }).inboxes.list({ limit: 100 });
    return `${res.inboxes.length} inbox(es): ${res.inboxes.map((i) => i.email).join(", ") || "none"}`;
  });
  await check("kernel", async () => {
    const { default: Kernel } = await import("@onkernel/sdk");
    const k = new Kernel();
    const b = await k.browsers.create({ headless: false, timeout_seconds: 60 });
    await k.browsers.deleteByID(b.session_id);
    return `browser ${b.session_id.slice(0, 8)} created + deleted, live view ${b.browser_live_view_url ? "available" : "missing"}`;
  });
  await check("exa", async () => {
    const { companyFor } = await import("../src/lib/integrations/exa");
    return `bestautoinsurance.com → ${await companyFor("bestautoinsurance.com")}`;
  });
})();
