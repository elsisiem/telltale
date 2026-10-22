import type { Broker } from "./registry";
import type { Profile } from "./vault";

// Deadlines under the CCPA regulations (Cal. Code Regs. tit. 11):
//  - opt-out of sale/sharing: comply no later than 15 business days after receipt (§7026(f))
//  - deletion: respond within 45 calendar days, extendable once by 45 more with notice (§7021)
export const OPT_OUT_BUSINESS_DAYS = 15;
export const DELETE_DAYS = 45;
export const DELETE_EXTENDED_DAYS = 90;

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export type TaggedIdentifiers = { tagCode: string; aliasEmail?: string | null; taggedName?: string; taggedStreet?: string };

function identifierList(ids: TaggedIdentifiers, profile: Profile): string {
  return [ids.aliasEmail, ids.taggedName, ids.taggedStreet && `${ids.taggedStreet}, ${profile.city}, ${profile.state} ${profile.zip}`]
    .filter(Boolean)
    .map((x) => `  - ${x}`)
    .join("\n");
}

/**
 * Sent to a service the person chose to use: keep serving me, but do not sell or share what I
 * gave you. Any later appearance of the tagged identifiers elsewhere is then evidence.
 */
export function optOutLetter(args: {
  broker: Pick<Broker, "name" | "contactEmail">;
  profile: Profile;
  ids: TaggedIdentifiers;
  sentAt: Date;
}): { subject: string; body: string; dueAt: Date } {
  const { broker, profile, ids, sentAt } = args;
  const dueAt = addBusinessDays(sentAt, OPT_OUT_BUSINESS_DAYS);
  return {
    dueAt,
    subject: `Do Not Sell or Share My Personal Information (ref ${ids.tagCode})`,
    body: `To: ${broker.name} (${broker.contactEmail})
Date: ${fmt(sentAt)}

I am a California consumer and I use your service. Under Cal. Civ. Code §1798.120 and §1798.121, I direct you not to sell or share my personal information, and to limit the use of any sensitive personal information to what is necessary to provide the service I requested.

This applies to the personal information I provided under these identifiers:
${identifierList(ids, profile)}

Under 11 CCR §7026(f) this must take effect no later than ${OPT_OUT_BUSINESS_DAYS} business days after receipt, which is ${fmt(dueAt)}. I am not asking you to close my account.

You are listed on the California data broker registry. I am keeping a dated record of this request.

${profile.firstName} ${profile.lastName}
Reference: ${ids.tagCode}`,
  };
}

/** Sent to a company the person never dealt with, which got their data from someone else. */
export function deletionRequestLetter(args: {
  broker: Pick<Broker, "name" | "contactEmail">;
  profile: Profile;
  ids: TaggedIdentifiers;
  sentAt: Date;
}): { subject: string; body: string } {
  const { broker, profile, ids, sentAt } = args;
  const identifiers = identifierList(ids, profile);
  return {
    subject: `CCPA request to delete and to opt out of sale/sharing (ref ${ids.tagCode})`,
    body: `To: ${broker.name} (${broker.contactEmail})
Date: ${fmt(sentAt)}

I am a California consumer. Under the California Consumer Privacy Act, I request that you:

1. Delete all personal information you hold about me (Cal. Civ. Code §1798.105), and direct your service providers and contractors to do the same.
2. Stop selling and sharing my personal information (Cal. Civ. Code §1798.120).

Please search your records for the following identifiers, which are associated with me:
${identifiers}

Under 11 CCR §7026(f) the opt-out must take effect within ${OPT_OUT_BUSINESS_DAYS} business days (by ${fmt(addBusinessDays(sentAt, OPT_OUT_BUSINESS_DAYS))}). Under 11 CCR §7021 you must respond to the deletion request within ${DELETE_DAYS} days (by ${fmt(addDays(sentAt, DELETE_DAYS))}).

You are listed on the California data broker registry. I am keeping a dated record of this request.

${profile.firstName} ${profile.lastName}
Reference: ${ids.tagCode}`,
  };
}

export type ComplaintFacts = {
  profile: Profile;
  tagCode: string;
  identifierObserved: string;
  issuedTo: { domain: string; at: string; receiptId: string };
  observed: { channel: string; from: string; senderDomain: string; at: string; subject?: string };
  senderBrokers: { name: string; findings: string[] }[];
  request?: { target: string; sentAt: string; due: string };
};

export function complaintDraft(f: ComplaintFacts): { title: string; body: string } {
  const sender = f.senderBrokers[0]?.name ?? f.observed.senderDomain;
  const lines = [
    `DRAFT complaint to the California Privacy Protection Agency (cppa.ca.gov/webapplications/complaint)`,
    `Prepared by Telltale for review by ${f.profile.firstName} ${f.profile.lastName}. Not legal advice. Nothing is filed until you submit it.`,
    ``,
    `Business complained about: ${sender} (${f.observed.senderDomain})`,
    f.senderBrokers.length ? `Registry status: listed on the California data broker registry.` : `Registry status: not found on the California data broker registry.`,
    ``,
    `What happened`,
    `1. On ${f.issuedTo.at.slice(0, 10)}, I gave the identifier "${f.identifierObserved}" to exactly one business: ${f.issuedTo.domain}. It was created for that business only and recorded in signed consent receipt ${f.issuedTo.receiptId}.`,
  ];
  if (f.request) {
    lines.push(
      `2. On ${f.request.sentAt.slice(0, 10)}, I directed ${f.request.target} not to sell or share my personal information. Under 11 CCR §7026(f) that had to take effect by ${f.request.due.slice(0, 10)}.`,
      `3. On ${f.observed.at.slice(0, 10)}, after that deadline, I was contacted at that identifier by ${sender} via ${f.observed.channel}${f.observed.subject ? ` ("${f.observed.subject}")` : ""}.`,
      ``,
      `Why this matters`,
      `The identifier could only have reached ${sender} through ${f.issuedTo.domain}. Its first use by a third party after the opt-out deadline indicates my data was sold or shared after I opted out (Cal. Civ. Code §1798.120; 11 CCR §7026). I have separately asked ${sender} to delete it.`,
    );
  } else {
    lines.push(
      `2. On ${f.observed.at.slice(0, 10)}, I was contacted at that identifier by ${sender} via ${f.observed.channel}${f.observed.subject ? ` ("${f.observed.subject}")` : ""}.`,
      ``,
      `Why this matters`,
      `The identifier could only have reached ${sender} through ${f.issuedTo.domain}, which indicates my personal information was sold or shared.`,
    );
  }
  for (const b of f.senderBrokers) {
    if (b.findings.length) lines.push(``, `${b.name}'s own registry filing states that it:`, ...b.findings.map((x) => `  - ${x}`));
  }
  lines.push(``, `Evidence attached: signed consent receipt, message headers, request copy, registry extract.`);
  return { title: `Complaint draft: ${sender}`, body: lines.join("\n") };
}
