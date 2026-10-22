// Drives one live agent run against a Telltale server and approves each consent card with its
// default choices, printing every tool call: npx tsx scripts/live-run.ts <baseUrl> "<task>"
import fs from "node:fs";
const env = Object.fromEntries([...fs.readFileSync(".env.local", "utf8").matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
const [base, task] = process.argv.slice(2);
const auth: Record<string, string> = env.TELLTALE_PASSWORD ? { authorization: "Basic " + Buffer.from(`telltale:${env.TELLTALE_PASSWORD}`).toString("base64") } : {};
const t0 = Date.now();
const log = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${s}`);

(async () => {
  const sse = await fetch(`${base}/api/events`, { headers: auth });
  const reader = sse.body!.getReader();
  const { runId, error } = await (await fetch(`${base}/api/agent/run`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ task }) })).json();
  if (error) throw new Error(error);
  log(`run ${runId}`);
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!chunk.startsWith("data: ")) continue;
      const e = JSON.parse(chunk.slice(6));
      if (e.runId && e.runId !== runId) continue;
      if (e.type === "agent.tool") log(`tool ${e.tool} ${JSON.stringify(e.input).slice(0, 160)}`);
      if (e.type === "agent.log") log(`says ${e.text.slice(0, 200).replace(/\s+/g, " ")}`);
      if (e.type === "agent.browser") log(`browser live view: ${e.liveViewUrl ? "yes" : "no"}`);
      if (e.type === "consent.request") {
        const card = await (await fetch(`${base}/api/consent/${e.pendingId}`, { headers: auth })).json();
        log(`CONSENT CARD for ${card.recipient.host}: ${card.recipient.brokers.map((b: { name: string }) => b.name).join(", ") || "not a broker"}`);
        for (const f of card.risk.findings) log(`   [${f.severity}] ${f.text.slice(0, 120)}`);
        for (const f of card.decision.fields) log(`   field ${f.label} (${f.kind}) -> ${f.action}`);
        await fetch(`${base}/api/consent/${e.pendingId}`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ approved: true }) });
        log("   approved with defaults");
      }
      if (e.type === "disclosure.created") log(`disclosure ${e.disclosureId.slice(0, 8)} recorded`);
      if (e.type === "agent.done") { log(`DONE: ${e.summary}`); process.exit(0); }
    }
  }
})();
