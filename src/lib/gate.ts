import crypto from "node:crypto";
import { aliasProvider } from "./aliases";
import { db } from "./db";
import { emit } from "./events";
import { decide, type Action, type Decision, type FieldDecision, type FieldKind } from "./policy";
import { buildReceipt, type ConsentReceipt } from "./receipts";
import { loadRegistry, type Broker } from "./registry";
import { resolveRecipient, type Recipient } from "./resolver";
import { assessRisk, type Finding, type RiskProfile } from "./risk";
import { loadProfile } from "./profile-store";
import { mintTagCode, valueFor } from "./vault";

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
  decision: Omit<Decision, "fields"> & { fields: (FieldDecision & { selector: string })[] };
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
  let recipient = resolveRecipient(req.url, { orgName: req.orgName });
  if (!recipient.brokers.length && process.env.EXA_API_KEY) {
    const { companyFor } = await import("./integrations/exa");
    const company = await companyFor(recipient.domain);
    if (company) recipient = resolveRecipient(req.url, { orgName: company });
  }
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

  // Multi-step forms: later steps on the same site in the same run keep the first step's tag and
  // decisions, and only ask again if a new kind of personal data appears.
  const prior = req.runId ? await priorDisclosure(req.runId, view.recipient.domain) : null;
  if (prior) {
    const decided = new Map(prior.fields.map((f) => [f.kind, f.action]));
    for (const f of view.decision.fields) {
      const a = decided.get(f.kind);
      if (a && f.allowed.includes(a)) f.action = a;
    }
    const hasNewKind = view.decision.fields.some((f) => !decided.has(f.kind));
    view.decision.needsConsent = view.decision.needsConsent && hasNewKind;
  }

  if (!view.decision.needsConsent) {
    view.status = "approved";
    return finalize(view, false, prior);
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
  return finalize(view, true, prior);
}

type PriorDisclosure = {
  id: string; tag_code: string; alias_email: string | null; created_at: string;
  fields: { selector: string; kind: FieldKind; label: string; action: Action }[];
};

async function priorDisclosure(runId: string, domain: string): Promise<PriorDisclosure | null> {
  const d = await db();
  const { rows } = await d.query<PriorDisclosure>(
    "select id, tag_code, alias_email, created_at, fields from disclosures where run_id = $1 and recipient_domain = $2 order by created_at desc limit 1",
    [runId, domain],
  );
  return rows[0] ?? null;
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

async function finalize(view: PendingView, prompted: boolean, prior: PriorDisclosure | null = null): Promise<GateResult> {
  const profile = await loadProfile();
  const tagCode = prior?.tag_code ?? (await uniqueTagCode());
  const needsAlias = view.decision.fields.some((f) => f.kind === "email" && f.action === "tag");
  const aliasEmail = prior?.alias_email
    ?? (needsAlias ? await (await aliasProvider()).create(tagCode, view.recipient.domain, profile) : undefined);

  const values: Record<string, string> = {};
  for (const f of view.decision.fields) values[f.selector] = valueFor(f.kind, f.action, profile, { code: tagCode, aliasEmail: aliasEmail ?? undefined });

  const thisStep = view.decision.fields.map(({ selector, kind, label, action }) => ({ selector, kind, label, action }));
  const allFields = prior ? [...prior.fields.filter((p) => !thisStep.some((f) => f.kind === p.kind)), ...thisStep] : thisStep;

  const registry = loadRegistry();
  const recipient: Recipient = {
    host: view.recipient.host,
    domain: view.recipient.domain,
    matchedBy: view.recipient.matchedBy,
    brokers: view.recipient.brokers.map((b) => registry.find((r) => r.id === b.id)).filter((b): b is Broker => !!b),
  };
  const receipt = buildReceipt({
    recipient,
    risk: view.risk,
    fields: allFields.map((f) => ({ ...f, allowed: [], reason: "" })),
    tagCode,
    purpose: view.request.purpose,
    principal: `telltale:${crypto.createHash("sha256").update(profile.email).digest("hex").slice(0, 16)}`,
  });

  const d = await db();
  const disclosureId = prior?.id ?? crypto.randomUUID();
  if (prior) {
    await d.query("update disclosures set fields = $2, receipt = $3, alias_email = $4 where id = $1", [
      prior.id, JSON.stringify(allFields), JSON.stringify(receipt), aliasEmail ?? null,
    ]);
  } else {
    await d.query(
      `insert into disclosures (id, recipient_host, recipient_domain, broker_ids, risk_level, tag_code, alias_email, fields, receipt, purpose, run_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        disclosureId, view.recipient.host, view.recipient.domain, JSON.stringify(view.recipient.brokers.map((b) => b.id)),
        view.risk.level, tagCode, aliasEmail ?? null, JSON.stringify(allFields), JSON.stringify(receipt), view.request.purpose,
        view.request.runId ?? null,
      ],
    );
  }
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
