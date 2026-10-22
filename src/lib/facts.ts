import { classify, ownDomains, readSnapshot } from "./daylight/findings";
import { addBusinessDays, complaintDraft } from "./letters";
import { decide, type FieldRequest } from "./policy";
import { loadRegistry, REGISTRY_SOURCE } from "./registry";
import { resolveRecipient } from "./resolver";
import { assessRisk } from "./risk";
import { DEMO_PROFILE, taggedValue } from "./vault";

// Numbers and examples for the public pages, computed from the same registry file and Daylight
// snapshot the product uses, so the copy can't drift from the data.

const HERO_HOST = "www.bestautoinsurance.com";

export function publicFacts() {
  const registry = loadRegistry();
  const count = (f: (b: (typeof registry)[number]) => boolean) => registry.filter(f).length;

  const snap = readSnapshot();
  const byId = new Map(registry.map((b) => [b.id, b]));
  let hidden = 0;
  let ownOptOut = 0;
  for (const b of snap?.brokers ?? []) {
    if (b.status !== "hidden") continue;
    hidden++;
    const broker = byId.get(b.id);
    const url = b.urls.find((u) => u.status === "hidden")?.url;
    if (broker && url && classify(url, ownDomains(broker)) === "own-optout") ownOptOut++;
  }

  const hero = resolveRecipient(HERO_HOST).brokers[0];
  return {
    brokers: registry.length,
    genAI: count((b) => b.flags.soldToGenAIDeveloper),
    lawEnforcement: count((b) => b.flags.soldToLawEnforcement),
    preciseGeo: count((b) => b.flags.preciseGeolocation),
    hidden,
    ownOptOut,
    sweptAt: snap?.finishedAt ?? null,
    hero: hero
      ? { host: HERO_HOST, name: hero.name, denied: hero.requests.delete.denied, received: hero.requests.delete.received, statsYear: REGISTRY_SOURCE.statsYear }
      : null,
    source: REGISTRY_SOURCE,
  };
}

export type PublicFacts = ReturnType<typeof publicFacts>;

const TOUR_FIELDS: FieldRequest[] = [
  { kind: "fullName", label: "Full name", required: true },
  { kind: "email", label: "Email", required: true },
  { kind: "phone", label: "Phone" },
  { kind: "street", label: "Street address" },
  { kind: "zip", label: "ZIP code", required: true },
  { kind: "dob", label: "Date of birth" },
];

const DAY = 86_400_000;

/** One disclosure, start to finish, built from the real filing for the walkthrough page. */
export function tourData() {
  const recipient = resolveRecipient(HERO_HOST);
  const risk = assessRisk(recipient);
  const decision = decide(TOUR_FIELDS, risk);
  const broker = recipient.brokers[0];
  const tagCode = "K7Q2";
  const alias = `maya.${tagCode.toLowerCase()}@agentmail.to`;

  const released = new Date("2026-10-22T16:00:00Z");
  const optOutDue = addBusinessDays(released, 15);
  const contactAt = new Date(released.getTime() + 47 * DAY);
  const complaint = complaintDraft({
    profile: DEMO_PROFILE,
    tagCode,
    identifierObserved: alias,
    issuedTo: { domain: "bestautoinsurance.com", at: released.toISOString(), receiptId: "3f6c1d2a-…" },
    observed: { channel: "email", from: "offers@northgate-leads.example", senderDomain: "northgate-leads.example", at: contactAt.toISOString(), subject: "New matches for your profile are ready" },
    senderBrokers: [],
    request: { target: "bestautoinsurance.com", sentAt: released.toISOString(), due: optOutDue.toISOString() },
  });

  return {
    host: HERO_HOST,
    broker: broker ? { name: broker.name, dbaCount: broker.dba ? broker.dba.split(/;\s*/).length : 0 } : null,
    findings: risk.findings.map((f) => ({ text: f.text, severity: f.severity })),
    limitations: risk.limitations,
    fields: decision.fields.map((f) => ({
      label: f.label,
      kind: f.kind,
      action: f.action,
      shown: f.action === "withhold" ? "left blank" : f.action === "tag" ? (f.kind === "email" ? alias : taggedValue(f.kind, DEMO_PROFILE, { code: tagCode, aliasEmail: alias })) : "94110",
    })),
    tagCode,
    alias,
    optOutDue: optOutDue.toISOString(),
    contactAt: contactAt.toISOString(),
    complaint: complaint.body.split("\n").slice(0, 10).join("\n"),
  };
}

export type TourData = ReturnType<typeof tourData>;
