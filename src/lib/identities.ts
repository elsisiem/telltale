import { db } from "./db";
import type { Action, FieldKind } from "./policy";
import { loadProfile } from "./profile-store";
import { loadRegistry } from "./registry";
import { realValue, valueFor } from "./vault";

// Every site's version of the person: what they really are next to what that site received, the
// inbox Telltale watches for it, and whatever has arrived there since.

export type IdentityField = { label: string; kind: FieldKind; action: Action; real: string; sent: string };
export type IdentityMessage = { id: string; at: string; from: string; fromDomain: string | null; subject: string | null; classification: string; replay: boolean };

export type Identity = {
  id: string;
  tagCode: string;
  host: string;
  domain: string;
  brokers: string[];
  riskLevel: string;
  createdAt: string;
  purpose: string | null;
  inbox: string | null;
  inboxKind: "agentmail" | "plus" | null;
  fields: IdentityField[];
  messages: IdentityMessage[];
  leakIds: string[];
  optOut: { dueAt: string | null; channel: string } | null;
};

type DisclosureRow = {
  id: string; created_at: string; recipient_host: string; recipient_domain: string; broker_ids: string[];
  risk_level: string; tag_code: string; alias_email: string | null; purpose: string | null; fields: { kind: FieldKind; label: string; action: Action }[];
};

export async function listIdentities(): Promise<Identity[]> {
  const d = await db();
  const profile = await loadProfile();
  const names = new Map(loadRegistry().map((b) => [b.id, b.name]));
  const [discs, msgs, leaks, reqs] = await Promise.all([
    d.query<DisclosureRow>("select id, created_at, recipient_host, recipient_domain, broker_ids, risk_level, tag_code, alias_email, purpose, fields from disclosures order by created_at desc"),
    d.query<{ id: string; received_at: string; from_addr: string; from_domain: string | null; subject: string | null; classification: string; replay: boolean; disclosure_id: string }>(
      "select id, received_at, from_addr, from_domain, subject, classification, replay, disclosure_id from messages where disclosure_id is not null order by received_at",
    ),
    d.query<{ id: string; disclosure_id: string }>("select id, disclosure_id from leaks"),
    d.query<{ tag_code: string; due_at: string | null; channel: string }>("select tag_code, due_at, channel from requests where kind = 'optout'"),
  ]);

  return discs.rows.map((r) => {
    const ctx = { code: r.tag_code, aliasEmail: r.alias_email ?? undefined };
    const sent = (kind: FieldKind, action: Action) => {
      try {
        return valueFor(kind, action, profile, ctx);
      } catch {
        return "";
      }
    };
    const optOut = reqs.rows.find((q) => q.tag_code === r.tag_code);
    return {
      id: r.id,
      tagCode: r.tag_code,
      host: r.recipient_host,
      domain: r.recipient_domain,
      brokers: r.broker_ids.map((id) => names.get(id) ?? id),
      riskLevel: r.risk_level,
      createdAt: new Date(r.created_at).toISOString(),
      purpose: r.purpose,
      inbox: r.alias_email,
      inboxKind: r.alias_email ? (r.alias_email.toLowerCase().endsWith("@agentmail.to") ? "agentmail" : "plus") : null,
      fields: r.fields.map((f) => ({ label: f.label, kind: f.kind, action: f.action, real: realValue(f.kind, profile), sent: sent(f.kind, f.action) })),
      messages: msgs.rows
        .filter((m) => m.disclosure_id === r.id)
        .map((m) => ({ id: m.id, at: new Date(m.received_at).toISOString(), from: m.from_addr, fromDomain: m.from_domain, subject: m.subject, classification: m.classification, replay: m.replay })),
      leakIds: leaks.rows.filter((l) => l.disclosure_id === r.id).map((l) => l.id),
      optOut: optOut ? { dueAt: optOut.due_at ? new Date(optOut.due_at).toISOString() : null, channel: optOut.channel } : null,
    };
  });
}
