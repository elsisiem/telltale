import { AgentMailClient } from "agentmail";
import { plusAddressing, type AliasProvider } from "../aliases";
import { db } from "../db";
import { ingestObservation } from "../leaks";

// AgentMail gives every recipient its own real inbox, so a tagged address is a working mailbox
// that Telltale can read, not just a label. The free tier allows 3 inboxes; past that, aliases
// fall back to plus-addressing.

let client: AgentMailClient | null = null;
function am(): AgentMailClient {
  client ??= new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
  return client;
}

export function agentMailProvider(): AliasProvider {
  return {
    name: "agentmail",
    async create(code, _domain, profile) {
      try {
        const inbox = await am().inboxes.create({
          username: `${profile.firstName}.${code}`.toLowerCase(),
          displayName: profile.firstName,
          clientId: `telltale-${code}`,
        });
        return inbox.email;
      } catch (err) {
        console.warn(`[agentmail] inbox create failed (${(err as Error).message}); using plus-addressing`);
        return plusAddressing.create(code, _domain, profile);
      }
    },
  };
}

async function inboxIdFor(email: string): Promise<string | null> {
  const res = await am().inboxes.list({ limit: 100 });
  return res.inboxes.find((i) => i.email.toLowerCase() === email.toLowerCase())?.inboxId ?? null;
}

export async function agentMailSend(to: string, subject: string, text: string, fromAlias: string | null): Promise<string> {
  const inboxId = fromAlias ? await inboxIdFor(fromAlias) : null;
  if (!inboxId) return "manual";
  await am().inboxes.messages.send(inboxId, { to, subject, text });
  return `agentmail:${fromAlias}`;
}

/** Pull new mail for every tagged AgentMail inbox and run it through attribution. */
export async function pollAgentMail(): Promise<number> {
  const d = await db();
  const { rows } = await d.query<{ alias_email: string }>("select alias_email from disclosures where alias_email is not null");
  const tagged = new Set(rows.map((r) => r.alias_email.toLowerCase()));
  const { inboxes } = await am().inboxes.list({ limit: 100 });
  let ingested = 0;
  for (const inbox of inboxes) {
    if (!tagged.has(inbox.email.toLowerCase())) continue;
    const { messages } = await am().inboxes.messages.list(inbox.inboxId, { limit: 50 });
    for (const m of messages) {
      const seen = await d.query("select 1 from messages where id = $1", [m.messageId]);
      if (seen.rows.length) continue;
      await ingestObservation({
        id: m.messageId,
        channel: "email",
        to: inbox.email,
        from: String(m.from),
        subject: m.subject,
        snippet: m.preview,
        receivedAt: new Date(m.timestamp).toISOString(),
      });
      ingested++;
    }
  }
  return ingested;
}

type G = typeof globalThis & { __telltaleMailPoll?: NodeJS.Timeout };
export function startAgentMailWatcher(intervalMs = 5000) {
  const g = globalThis as G;
  if (g.__telltaleMailPoll) return;
  g.__telltaleMailPoll = setInterval(() => {
    pollAgentMail().catch((e) => console.warn("[agentmail] poll failed:", (e as Error).message));
  }, intervalMs);
}
