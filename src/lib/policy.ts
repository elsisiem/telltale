import type { RiskProfile } from "./risk";

export type FieldKind =
  | "email" | "phone" | "fullName" | "firstName" | "lastName" | "street" | "city" | "state"
  | "zip" | "dob" | "ssn" | "governmentId" | "financialAccount" | "other";

/** Send the real value, send a tagged-but-working value, or leave it out. */
export type Action = "send" | "tag" | "withhold";

export type FieldRequest = {
  kind: FieldKind;
  label: string;
  required?: boolean;
};

export type FieldDecision = FieldRequest & {
  action: Action;
  allowed: Action[];
  reason: string;
};

export type Decision = {
  needsConsent: boolean;
  why: string;
  fields: FieldDecision[];
};

// Fields where the law expects the truth (identity checks, tax, banking). Telltale never
// alters these; the only choice is whether to disclose them at all.
export const MUST_BE_TRUTHFUL: FieldKind[] = ["ssn", "governmentId", "financialAccount", "dob"];
const SENSITIVE: FieldKind[] = ["ssn", "governmentId", "financialAccount"];

export function allowedActions(kind: FieldKind, caps: { phoneTags: boolean }): Action[] {
  if (MUST_BE_TRUTHFUL.includes(kind)) return ["send", "withhold"];
  switch (kind) {
    case "email":
    case "fullName":
    case "street":
      return ["send", "tag", "withhold"];
    case "phone":
      return caps.phoneTags ? ["send", "tag", "withhold"] : ["send", "withhold"];
    default:
      return ["send", "withhold"];
  }
}

const BROKER_DEFAULTS: Partial<Record<FieldKind, Action>> = {
  email: "tag", fullName: "tag", firstName: "send", lastName: "withhold", phone: "withhold",
  street: "withhold", city: "send", state: "send", zip: "send", dob: "withhold",
};

/**
 * Decide what each field becomes before the agent types it. Ordinary recipients get tagged
 * emails silently (no prompt); registered brokers and sensitive fields stop for consent.
 */
export function decide(fields: FieldRequest[], risk: RiskProfile, caps = { phoneTags: false }): Decision {
  const isBroker = risk.level !== "none";
  const sensitive = fields.filter((f) => SENSITIVE.includes(f.kind));
  const decisions = fields.map((f): FieldDecision => {
    const allowed = allowedActions(f.kind, caps);
    let action: Action;
    let reason: string;
    if (SENSITIVE.includes(f.kind)) {
      action = "withhold";
      reason = "Sensitive identifier: never sent without your explicit yes.";
    } else if (!isBroker) {
      action = allowed.includes("tag") && f.kind === "email" ? "tag" : "send";
      reason = action === "tag" ? "Working alias so a leak can be traced back to this site." : "Not a registered data broker.";
    } else {
      action = BROKER_DEFAULTS[f.kind] ?? "withhold";
      if (!allowed.includes(action)) action = "withhold";
      reason =
        action === "tag" ? "Tagged so any resale is traceable to this broker."
        : action === "withhold" ? "Not needed to use the service; brokers resell what they collect."
        : "Low-risk on its own.";
    }
    return { ...f, action, allowed, reason };
  });

  const needsConsent = isBroker || sensitive.length > 0;
  const why = isBroker
    ? "This recipient is a registered data broker in California."
    : sensitive.length
      ? `The form asks for ${sensitive.map((f) => f.label).join(", ")}.`
      : "Ordinary recipient. Email is tagged automatically.";
  return { needsConsent, why, fields: decisions };
}
