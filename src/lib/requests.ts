import crypto from "node:crypto";
import { db } from "./db";
import { addDays, complaintDraft, deletionRequestLetter, DELETE_DAYS, optOutLetter } from "./letters";
import { loadRegistry, type Broker } from "./registry";
import { assessRisk } from "./risk";
import { resolveRecipient } from "./resolver";
import { loadProfile, taggedValue } from "./vault";

type DisclosureRow = {
  id: string; created_at: string; recipient_domain: string; broker_ids: string[]; tag_code: string;
  alias_email: string | null; fields: { kind: string; action: string }[]; receipt: { receiptId: string } | null;
};

export type RequestRow = {
  id: string; created_at: string; kind: "optout" | "delete"; target_domain: string; target_broker_id: string | null;
  tag_code: string | null; channel: string; sent_at: string | null; due_at: string | null; body: string; status: string;
};

function brokerById(id: string | undefined): Broker | undefined {
  return id ? loadRegistry().find((b) => b.id === id) : undefined;
}

function idsFor(d: DisclosureRow) {
  const p = loadProfile();
  const tagged = (k: string) => d.fields.some((f) => f.kind === k && f.action === "tag");
  return {
    tagCode: d.tag_code,
    aliasEmail: d.alias_email,
    taggedName: tagged("fullName") ? taggedValue("fullName", p, { code: d.tag_code }) : undefined,
    taggedStreet: tagged("street") ? taggedValue("street", p, { code: d.tag_code }) : undefined,
  };
}

export type Sender = (to: string, subject: string, body: string, fromAlias: string | null) => Promise<string>;

/** Default sender records the letter for the person to send; AgentMail replaces it when configured. */
let sender: Sender | null = null;
export function setSender(s: Sender | null) {
  sender = s;
}

async function deliver(to: string, subject: string, body: string, fromAlias: string | null): Promise<string> {
  if (sender) return sender(to, subject, body, fromAlias);
  // Never send legal requests to a real company on behalf of the synthetic stage persona.
  if (loadProfile().synthetic) return "manual";
  if (process.env.AGENTMAIL_API_KEY) {
    const { agentMailSend } = await import("./integrations/agentmail");
    return agentMailSend(to, subject, body, fromAlias);
  }
  return "manual";
}

/** Opt-out of sale/sharing to a broker the person chose to use. Starts the 15-business-day clock. */
export async function sendOptOut(disclosureId: string, opts: { sentAt?: Date } = {}): Promise<RequestRow> {
  const d = await db();
  const { rows } = await d.query<DisclosureRow>("select * from disclosures where id = $1", [disclosureId]);
  const disc = rows[0];
  if (!disc) throw new Error(`no disclosure ${disclosureId}`);
  const broker = brokerById(disc.broker_ids[0]);
  if (!broker) throw new Error(`${disc.recipient_domain} is not a registered broker; nothing to opt out of`);
  const sentAt = opts.sentAt ?? new Date();
  const letter = optOutLetter({ broker, profile: loadProfile(), ids: idsFor(disc), sentAt });
  const channel = await deliver(broker.contactEmail, letter.subject, letter.body, disc.alias_email);
  const row: RequestRow = {
    id: crypto.randomUUID(), created_at: new Date().toISOString(), kind: "optout",
    target_domain: disc.recipient_domain, target_broker_id: broker.id, tag_code: disc.tag_code,
    channel, sent_at: sentAt.toISOString(), due_at: letter.dueAt.toISOString(),
    body: `${letter.subject}\n\n${letter.body}`, status: channel === "manual" ? "ready-to-send" : "sent",
  };
  await insert(row);
  return row;
}

/** Deletion request to a company that got the data second-hand (found via a leak). */
export async function sendDeletion(leakId: string, opts: { sentAt?: Date } = {}): Promise<RequestRow> {
  const d = await db();
  const { rows } = await d.query<{ disclosure_id: string; sender_domain: string; sender_broker_ids: string[] }>(
    "select * from leaks where id = $1", [leakId],
  );
  const leak = rows[0];
  if (!leak) throw new Error(`no leak ${leakId}`);
  const { rows: ds } = await d.query<DisclosureRow>("select * from disclosures where id = $1", [leak.disclosure_id]);
  const broker = brokerById(leak.sender_broker_ids[0]);
  const target = broker ?? { name: leak.sender_domain, contactEmail: `privacy@${leak.sender_domain}` };
  const sentAt = opts.sentAt ?? new Date();
  const letter = deletionRequestLetter({ broker: target, profile: loadProfile(), ids: idsFor(ds[0]), sentAt });
  const channel = await deliver(target.contactEmail, letter.subject, letter.body, ds[0].alias_email);
  const row: RequestRow = {
    id: crypto.randomUUID(), created_at: new Date().toISOString(), kind: "delete",
    target_domain: leak.sender_domain, target_broker_id: broker?.id ?? null, tag_code: ds[0].tag_code,
    channel, sent_at: sentAt.toISOString(), due_at: addDays(sentAt, DELETE_DAYS).toISOString(),
    body: `${letter.subject}\n\n${letter.body}`, status: channel === "manual" ? "ready-to-send" : "sent",
  };
  await insert(row);
  return row;
}

async function insert(r: RequestRow) {
  const d = await db();
  await d.query(
    `insert into requests (id, created_at, kind, target_domain, target_broker_id, tag_code, channel, sent_at, due_at, body, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [r.id, r.created_at, r.kind, r.target_domain, r.target_broker_id, r.tag_code, r.channel, r.sent_at, r.due_at, r.body, r.status],
  );
}

/** Build (and store) the regulator complaint draft for a leak. The person files it, not us. */
export async function draftComplaint(leakId: string): Promise<{ id: string; title: string; body: string }> {
  const d = await db();
  const { rows } = await d.query<{ id: string; disclosure_id: string; sender_domain: string; sender_broker_ids: string[]; evidence: {
    observed: { channel: string; from: string; to: string; senderDomain: string; at: string; subject?: string; replay?: boolean };
    violation: { requestIds: string[] } | null;
  } }>("select * from leaks where id = $1", [leakId]);
  const leak = rows[0];
  if (!leak) throw new Error(`no leak ${leakId}`);
  const { rows: ds } = await d.query<DisclosureRow>("select * from disclosures where id = $1", [leak.disclosure_id]);
  const disc = ds[0];
  const reqId = leak.evidence.violation?.requestIds[0];
  const req = reqId ? (await d.query<RequestRow>("select * from requests where id = $1", [reqId])).rows[0] : undefined;
  const sender = resolveRecipient(leak.sender_domain);
  const senderRisk = assessRisk(sender);
  const draft = complaintDraft({
    profile: loadProfile(),
    tagCode: disc.tag_code,
    identifierObserved: leak.evidence.observed.to,
    issuedTo: { domain: disc.recipient_domain, at: new Date(disc.created_at).toISOString(), receiptId: disc.receipt?.receiptId ?? "n/a" },
    observed: leak.evidence.observed,
    senderBrokers: sender.brokers.slice(0, 1).map((b) => ({ name: b.name, findings: senderRisk.findings.map((f) => f.text) })),
    request: req?.sent_at && req.due_at
      ? { target: req.target_domain, sentAt: new Date(req.sent_at).toISOString(), due: new Date(req.due_at).toISOString() }
      : undefined,
  });
  if (leak.evidence.observed.replay) {
    draft.title = `SIMULATION · ${draft.title}`;
    draft.body = `SIMULATION. The contact below was replayed for demonstration from a fictional sender; it is not a real event and must not be filed.\n\n${draft.body}`;
  }
  // One draft per leak: re-opening the evidence page returns the same complaint.
  const { rows: existing } = await d.query<{ id: string }>("select id from complaints where leak_id = $1 order by created_at limit 1", [leakId]);
  if (existing[0]) {
    await d.query("update complaints set body = $2 where id = $1", [existing[0].id, draft.body]);
    return { id: existing[0].id, ...draft };
  }
  const id = crypto.randomUUID();
  await d.query("insert into complaints (id, leak_id, request_id, body) values ($1,$2,$3,$4)", [id, leakId, reqId ?? null, draft.body]);
  return { id, ...draft };
}
