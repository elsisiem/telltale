// Proves live inbound attribution with real email: a temporary Telltale-owned inbox writes to the
// newest tagged address, and we wait for the deployed server to classify it. The sender inbox is
// deleted afterwards. Usage: npx tsx scripts/live-inbound.ts <baseUrl>
import fs from "node:fs";
import { AgentMailClient } from "agentmail";

const env = Object.fromEntries([...fs.readFileSync(".env.local", "utf8").matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
const base = process.argv[2] ?? "https://telltale-app.fly.dev";
const auth = { authorization: "Basic " + Buffer.from(`telltale:${env.TELLTALE_PASSWORD}`).toString("base64") };
const am = new AgentMailClient({ apiKey: env.AGENTMAIL_API_KEY });

type State = { disclosures: { alias_email: string | null; recipient_host: string }[]; messages: { to_addr: string; classification: string; from_domain: string }[]; leaks: { id: string }[] };
const state = async () => (await (await fetch(`${base}/api/state`, { headers: auth })).json()) as State;

(async () => {
  const target = (await state()).disclosures.filter((d) => d.alias_email?.endsWith("@agentmail.to")).at(-1);
  if (!target?.alias_email) throw new Error("no AgentMail-tagged disclosure yet; run the agent first");
  console.log(`tagged address ${target.alias_email} was given only to ${target.recipient_host}`);

  const sender = await am.inboxes.create({ username: `telltale-probe-${Date.now().toString(36)}`, displayName: "Probe Sender", clientId: `telltale-probe-${Date.now()}` });
  try {
    await am.inboxes.messages.send(sender.inboxId, { to: target.alias_email, subject: "We found your profile", text: "Test message from a sender that was never given this address." });
    console.log(`sent from ${sender.email}; waiting for the server to attribute it…`);
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      const m = s.messages.find((x) => x.to_addr.toLowerCase() === target.alias_email!.toLowerCase() && x.from_domain === "agentmail.to");
      if (m) {
        console.log(`attributed after ${((Date.now() - t0) / 1000).toFixed(1)}s: classification=${m.classification}, leaks recorded=${s.leaks.length}`);
        break;
      }
      if (Date.now() - t0 > 90_000) throw new Error("not attributed within 90s");
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await am.inboxes.delete(sender.inboxId).catch(() => {});
    console.log("probe sender inbox deleted");
  }
})();
