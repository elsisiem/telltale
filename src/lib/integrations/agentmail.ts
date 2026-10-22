import { AgentMailClient } from "agentmail";
import { plusAddressing, type AliasProvider } from "../aliases";
import { db } from "../db";
import { ingestObservation } from "../leaks";

// AgentMail gives every recipient its own real inbox, so a tagged address is a working mailbox
// that Telltale can read, not just a label. At the plan's inbox limit Telltale reclaims its own unused
// inboxes; failing that, aliases fall back to plus-addressing.

// Every inbox Telltale creates carries this client id prefix; only those are ever deleted.
const CLIENT_PREFIX = "telltale-";

let client: AgentMailClient | null = null;
function am(): AgentMailClient {
  client ??= new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
  return client;
}

export function agentMailProvider(): AliasProvider {
  return {
    name: "agentmail",
    async create(code, _domain, profile) {
      const attempt = () =>
        am().inboxes.create({
          username: `${profile.firstName}.${code}`.toLowerCase(),
          displayName: profile.firstName,
          clientId: `${CLIENT_PREFIX}${code}`,
        });
      try {
        return (await attempt()).email;
      } catch (err) {
        // At the plan's inbox limit, free one of our own inboxes that no disclosure uses any more.
        if (/limit/i.test((err as Error).message) && (await reclaimInbox())) {
          try {
            return (await attempt()).email;
          } catch {}
        }
        const reason = (err as Error).message.split("\n")[0];
        console.warn(`[agentmail] inbox create failed (${reason}); using plus-addressing`);
        return plusAddressing.create(code, _domain, profile);
      }
    },
  };
}

async function ownInboxes() {
  const { inboxes } = await am().inboxes.list({ limit: 100 });
  return inboxes.filter((i) => i.clientId?.startsWith(CLIENT_PREFIX));
}

/** Delete the oldest Telltale inbox not referenced by any disclosure. */
async function reclaimInbox(): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query<{ alias_email: string }>("select lower(alias_email) as alias_email from disclosures where alias_email is not null");
  const used = new Set(rows.map((r) => r.alias_email));
  const orphan = (await ownInboxes())
    .filter((i) => !used.has(i.email.toLowerCase()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  if (!orphan) return false;
  await am().inboxes.delete(orphan.inboxId);
  return true;
}

/** Demo reset: remove every inbox Telltale created (never anyone else's). */
export async function deleteTelltaleInboxes(): Promise<number> {
  const mine = await ownInboxes();
  for (const i of mine) await am().inboxes.delete(i.inboxId);
  return mine.length;
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
