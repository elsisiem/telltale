import type { Recipient } from "./resolver";
import { REGISTRY_SOURCE, type Broker, type BrokerFlags } from "./registry";

export type Severity = "high" | "medium" | "info";

export type Finding = {
  key: string;
  severity: Severity;
  /** What the broker told the State of California, phrased as their own filing. */
  text: string;
  entity: string;
  source: "ca-registry" | "daylight";
};

export type RiskLevel = "none" | "registered" | "elevated" | "high";

export type RiskProfile = {
  level: RiskLevel;
  findings: Finding[];
  limitations: string[];
};

// Each flag maps to the registry question it answers, worded as the filing states it.
const FLAG_FINDINGS: { flag: keyof BrokerFlags; severity: Severity; text: string }[] = [
  { flag: "soldToGenAIDeveloper", severity: "high", text: "sold or shared consumers' data with a developer of a GenAI system or model in the past year" },
  { flag: "soldToLawEnforcement", severity: "high", text: "sold or shared consumers' data with law enforcement in the past year, other than under subpoena or court order" },
  { flag: "soldToForeignActor", severity: "high", text: "sold or shared consumers' data with a foreign actor in the past year" },
  { flag: "soldToFederalGovernment", severity: "medium", text: "sold or shared consumers' data with the federal government in the past year" },
  { flag: "soldToStateGovernment", severity: "medium", text: "sold or shared consumers' data with other state governments in the past year" },
  { flag: "preciseGeolocation", severity: "high", text: "collects consumers' precise geolocation" },
  { flag: "biometric", severity: "high", text: "collects consumers' biometric data" },
  { flag: "reproductiveHealth", severity: "high", text: "collects consumers' reproductive health care data" },
  { flag: "sexualOrientation", severity: "medium", text: "collects consumers' sexual orientation status" },
  { flag: "citizenship", severity: "medium", text: "collects consumers' citizenship data, including immigration status" },
  { flag: "governmentIds", severity: "medium", text: "collects government-issued identification numbers" },
  { flag: "accountLogins", severity: "medium", text: "collects account logins or numbers with security codes for third-party accounts" },
  { flag: "minors", severity: "medium", text: "collects personal information of minors" },
];

function deletionFindings(b: Broker): Finding[] {
  const d = b.requests.delete;
  const out: Finding[] = [];
  if (d.received >= 50 && d.denied / d.received >= 0.5) {
    out.push({
      key: "delete-denials",
      severity: "high",
      text: `reported denying ${d.denied.toLocaleString("en-US")} of ${d.received.toLocaleString("en-US")} deletion requests in ${REGISTRY_SOURCE.statsYear}`,
      entity: b.name,
      source: "ca-registry",
    });
  }
  if (d.received > 0 && d.medianDays > 45) {
    out.push({
      key: "delete-slow",
      severity: "medium",
      text: `reported a median of ${d.medianDays} days to answer deletion requests in ${REGISTRY_SOURCE.statsYear} (the CCPA allows 45)`,
      entity: b.name,
      source: "ca-registry",
    });
  }
  return out;
}

export const REGISTRY_LIMITATIONS = [
  "Registry answers are self-reported by each broker and not audited by the State.",
  "Only brokers registered in California appear; an unlisted company is not proof of safety.",
  `Request counts cover calendar year ${REGISTRY_SOURCE.statsYear}; a 'denied' request may be one the broker could not verify.`,
];

export function assessRisk(recipient: Recipient, extra: Finding[] = []): RiskProfile {
  if (!recipient.brokers.length && !extra.length) {
    return { level: "none", findings: [], limitations: REGISTRY_LIMITATIONS.slice(1, 2) };
  }
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const b of recipient.brokers) {
    for (const f of FLAG_FINDINGS) {
      if (b.flags[f.flag] && !seen.has(f.flag)) {
        seen.add(f.flag);
        findings.push({ key: f.flag, severity: f.severity, text: f.text, entity: b.name, source: "ca-registry" });
      }
    }
    for (const f of deletionFindings(b)) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        findings.push(f);
      }
    }
  }
  findings.push(...extra);
  const order: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const highs = findings.filter((f) => f.severity === "high").length;
  const level: RiskLevel = highs >= 2 ? "high" : highs === 1 || findings.length >= 2 ? "elevated" : "registered";
  return { level, findings, limitations: REGISTRY_LIMITATIONS };
}
