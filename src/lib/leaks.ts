import crypto from "node:crypto";
import { db } from "./db";
import { emailDomain, registrableDomain } from "./domains";
import { emit } from "./events";
import { resolveRecipient } from "./resolver";
import { assessRisk } from "./risk";

// Attribution: every tagged identifier was issued to exactly one recipient. Contact through it
// from anyone else means the data moved, and the tag says where it started.

export type Observation = {
  id?: string;
  channel: "email" | "sms" | "postal" | "listing";
  to: string; // the identifier contacted: alias email, tagged phone, or a tag code seen on mail
  from: string; // sender address, phone, or company name
  fromDomain?: string;
  subject?: string;
  snippet?: string;
  receivedAt: string;
  replay?: boolean;
};

export type Classification = "first-party" | "affiliate" | "leak" | "untagged";

type DisclosureRow = {
  id: string; created_at: string; recipient_domain: string; broker_ids: string[]; tag_code: string;
  alias_email: string | null; receipt: { receiptId: string } | null;
};

// Tag codes use the vault alphabet (no 0/1/I/L/O/U). Off-email they appear as "Attn K7Q2".
const TAG_RE = /attn\s+([2-9ABCDEFGHJKMNPQRSTVWXYZ]{4})\b/i;
const BARE_TAG_RE = /^[2-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/i;

async function findDisclosure(o: Observation): Promise<DisclosureRow | null> {
  const d = await db();
  const to = o.to.trim().toLowerCase();
  let { rows } = await d.query<DisclosureRow>("select * from disclosures where lower(alias_email) = $1", [to]);
  if (rows.length) return rows[0];
  // plus-addressing fallback (name+code@host) or a code read off postal mail / a listing
  const plus = to.match(/\+([a-z0-9]{4})@/);
  const code = plus?.[1] ?? (o.channel !== "email" ? (o.to.match(TAG_RE)?.[1] ?? (BARE_TAG_RE.test(o.to.trim()) ? o.to.trim() : undefined)) : undefined);
  if (!code) return null;
  ({ rows } = await d.query<DisclosureRow>("select * from disclosures where upper(tag_code) = $1", [code.toUpperCase()]));
  return rows[0] ?? null;
}

export async function ingestObservation(o: Observation): Promise<{ messageId: string; classification: Classification; leakId?: string }> {
  const d = await db();
  const messageId = o.id ?? crypto.randomUUID();
  const fromDomain = o.fromDomain ?? (o.channel === "email" ? emailDomain(o.from) : registrableDomain(o.from)) ?? o.from.toLowerCase();
  const disclosure = await findDisclosure(o);

  let classification: Classification = "untagged";
  let senderBrokerIds: string[] = [];
  if (disclosure) {
    const sender = resolveRecipient(fromDomain);
    senderBrokerIds = sender.brokers.map((b) => b.id);
    if (fromDomain === disclosure.recipient_domain) classification = "first-party";
    else if (senderBrokerIds.some((id) => disclosure.broker_ids.includes(id))) classification = "affiliate";
    else classification = "leak";
  }

  const existing = await d.query("select 1 from messages where id = $1", [messageId]);
  if (existing.rows.length) return { messageId, classification };
  await d.query(
    `insert into messages (id, received_at, to_addr, from_addr, from_domain, subject, snippet, disclosure_id, classification, replay)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [messageId, o.receivedAt, o.to, o.from, fromDomain, o.subject ?? null, o.snippet ?? null, disclosure?.id ?? null, classification, !!o.replay],
  );
  emit({ type: "message.received", messageId, classification });
  if (classification !== "leak" || !disclosure) return { messageId, classification };

  const sender = resolveRecipient(fromDomain);
  const senderRisk = assessRisk(sender);
  const { rows: reqs } = await d.query<{ id: string; target_domain: string; sent_at: string; due_at: string; body: string }>(
    `select * from requests where tag_code = $1 and kind = 'optout' and sent_at is not null order by sent_at`,
    [disclosure.tag_code],
  );
  const overdue = reqs.filter((r) => new Date(r.due_at) < new Date(o.receivedAt));

  const leakId = crypto.randomUUID();
  const evidence = {
    tagCode: disclosure.tag_code,
    issuedTo: { domain: disclosure.recipient_domain, at: disclosure.created_at, receiptId: disclosure.receipt?.receiptId },
    observed: { channel: o.channel, from: o.from, to: o.to, senderDomain: fromDomain, at: o.receivedAt, subject: o.subject, replay: !!o.replay },
    senderRegistry: sender.brokers.map((b) => ({ id: b.id, name: b.name })),
    senderFindings: senderRisk.findings.map((f) => `${f.text}`),
    violation: overdue.length
      ? { requestIds: overdue.map((r) => r.id), deadlinePassed: overdue.map((r) => r.due_at), note: "Contact after the opt-out deadline on a request covering this identifier." }
      : null,
  };
  await d.query(
    `insert into leaks (id, disclosure_id, message_id, sender_domain, sender_broker_ids, evidence) values ($1,$2,$3,$4,$5,$6)`,
    [leakId, disclosure.id, messageId, fromDomain, JSON.stringify(senderBrokerIds), JSON.stringify(evidence)],
  );
  emit({ type: "leak.detected", leakId });
  return { messageId, classification, leakId };
}
