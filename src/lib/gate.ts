import crypto from "node:crypto";
import { aliasProvider } from "./aliases";
import { db } from "./db";
import { emit } from "./events";
import { decide, type Action, type Decision, type FieldKind } from "./policy";
import { buildReceipt, type ConsentReceipt } from "./receipts";
import { resolveRecipient, type Recipient } from "./resolver";
import { assessRisk, type Finding, type RiskProfile } from "./risk";
import { loadProfile, mintTagCode, valueFor } from "./vault";

// The consent gate. The agent describes the form it is about to fill using field kinds, never
// values. The gate identifies the recipient, decides per field, asks the person when the
// recipient is a registered broker, and only then produces the concrete values to type.

export type FormField = { selector: string; kind: FieldKind; label: string; required?: boolean };

export type DisclosureRequest = {
  url: string;
  purpose: string;
  fields: FormField[];
  orgName?: string;
  runId?: string;
};

export type PendingView = {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "denied" | "expired";
  request: DisclosureRequest;
  recipient: { host: string; domain: string; matchedBy: Recipient["matchedBy"]; brokers: { id: string; name: string; dba: string | null; website: string }[] };
  risk: RiskProfile;
  decision: Decision & { fields: (Decision["fields"][number] & { selector: string })[] };
};

export type GateResult =
  | { status: "denied"; pendingId: string }
  | {
      status: "approved";
      disclosureId: string;
      tagCode: string;
      /** selector -> concrete value. Only the browser executor sees this, never the model. */
      values: Record<string, string>;
      /** What the model is told: per-field outcome without any personal data. */
      summary: { label: string; action: Action }[];
      receipt: ConsentReceipt;
      prompted: boolean;
    };

type Resolution = { approved: boolean; actions?: Record<string, Action> };

type G = typeof globalThis & {
  __telltalePending?: Map<string, PendingView>;
  __telltaleWaiters?: Map<string, (r: Resolution) => void>;
  __telltaleExtraFindings?: (r: Recipient) => Promise<Finding[]>;
};
const g = globalThis as G;
const pending = (g.__telltalePending ??= new Map());
const waiters = (g.__telltaleWaiters ??= new Map());

/** Lets the Daylight scanner add live findings (e.g. hidden opt-out page) to the consent card. */
export function setExtraFindings(fn: (r: Recipient) => Promise<Finding[]>) {
  g.__telltaleExtraFindings = fn;
}

export function listPending(): PendingView[] {
  return [...pending.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPending(id: string): PendingView | undefined {
  return pending.get(id);
}

export async function preview(req: DisclosureRequest): Promise<Omit<PendingView, "id" | "createdAt" | "status">> {
  const recipient = resolveRecipient(req.url, { orgName: req.orgName });
  const extra = g.__telltaleExtraFindings ? await g.__telltaleExtraFindings(recipient) : [];
  const risk = assessRisk(recipient, extra);
  const base = decide(req.fields, risk);
  const decision = { ...base, fields: base.fields.map((f, i) => ({ ...f, selector: req.fields[i].selector })) };
  return {
    request: req,
    recipient: {
      host: recipient.host,
      domain: recipient.domain,
      matchedBy: recipient.matchedBy,
      brokers: recipient.brokers.map((b) => ({ id: b.id, name: b.name, dba: b.dba, website: b.website })),
    },
    risk,
    decision,
  };
}

export async function requestDisclosure(req: DisclosureRequest, opts: { timeoutMs?: number } = {}): Promise<GateResult> {
  const view: PendingView = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    ...(await preview(req)),
  };

  if (!view.decision.needsConsent) {
    view.status = "approved";
    return finalize(view, false);
  }

  pending.set(view.id, view);
  emit({ type: "consent.request", pendingId: view.id });
  const resolution = await new Promise<Resolution>((resolve) => {
    waiters.set(view.id, resolve);
    setTimeout(() => resolve({ approved: false }), opts.timeoutMs ?? 10 * 60_000);
  });
  waiters.delete(view.id);

  if (!resolution.approved) {
    view.status = view.status === "pending" ? "denied" : view.status;
    emit({ type: "consent.resolved", pendingId: view.id, approved: false });
    return { status: "denied", pendingId: view.id };
  }
  for (const f of view.decision.fields) {
    const chosen = resolution.actions?.[f.selector];
    if (chosen && f.allowed.includes(chosen)) f.action = chosen;
  }
  view.status = "approved";
  emit({ type: "consent.resolved", pendingId: view.id, approved: true });
  return finalize(view, true);
}

export function resolveConsent(id: string, r: Resolution): boolean {
  const w = waiters.get(id);
  if (!w) return false;
  w(r);
  return true;
}

async function uniqueTagCode(): Promise<string> {
  const d = await db();
  for (;;) {
    const code = mintTagCode();
    const { rows } = await d.query("select 1 from disclosures where tag_code = $1", [code]);
    if (!rows.length) return code;
  }
}

async function finalize(view: PendingView, prompted: boolean): Promise<GateResult> {
  const profile = loadProfile();
  const tagCode = await uniqueTagCode();
  const needsAlias = view.decision.fields.some((f) => f.kind === "email" && f.action === "tag");
  const aliasEmail = needsAlias
    ? await (await aliasProvider()).create(tagCode, view.recipient.domain, profile)
    : undefined;

  const values: Record<string, string> = {};
  for (const f of view.decision.fields) values[f.selector] = valueFor(f.kind, f.action, profile, { code: tagCode, aliasEmail });

  const recipient = resolveRecipient(view.request.url, { orgName: view.request.orgName });
  const receipt = buildReceipt({
    recipient,
    risk: view.risk,
    fields: view.decision.fields,
    tagCode,
    purpose: view.request.purpose,
    principal: `telltale:${crypto.createHash("sha256").update(profile.email).digest("hex").slice(0, 16)}`,
  });

  const disclosureId = crypto.randomUUID();
  const d = await db();
  await d.query(
    `insert into disclosures (id, recipient_host, recipient_domain, broker_ids, risk_level, tag_code, alias_email, fields, receipt, purpose)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      disclosureId, view.recipient.host, view.recipient.domain, JSON.stringify(view.recipient.brokers.map((b) => b.id)),
      view.risk.level, tagCode, aliasEmail ?? null,
      JSON.stringify(view.decision.fields.map(({ selector, kind, label, action }) => ({ selector, kind, label, action }))),
      JSON.stringify(receipt), view.request.purpose,
    ],
  );
  emit({ type: "disclosure.created", disclosureId });

  return {
    status: "approved",
    disclosureId,
    tagCode,
    values,
    summary: view.decision.fields.map((f) => ({ label: f.label, action: f.action })),
    receipt,
    prompted,
  };
}
