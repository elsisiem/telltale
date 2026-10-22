import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./vault";
import type { FieldDecision } from "./policy";
import type { RiskProfile } from "./risk";
import type { Recipient } from "./resolver";
import { REGISTRY_SOURCE } from "./registry";

// Consent receipt shaped after ISO/IEC TS 27560:2023 (consent record information structure),
// signed with Ed25519 so the person can later prove what they agreed to and when.

export type ConsentReceipt = {
  schema: "telltale-consent-receipt/1 (ISO/IEC TS 27560:2023 aligned)";
  receiptId: string;
  issuedAt: string;
  piiPrincipal: string;
  controller: { host: string; domain: string; registeredBrokers: { name: string; id: string }[] };
  noticeBasis: { source: string; url: string; registrationYear: number; findings: string[] };
  purpose: string;
  legalBasis: "consent";
  piiCategories: { kind: string; label: string; action: string; tagCode?: string }[];
  tagCode: string;
  rights: { deletion: string; optOut: string };
  signature?: { alg: "Ed25519"; publicKey: string; value: string };
};

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function keys(): { privateKey: crypto.KeyObject; publicKeyPem: string } {
  // Deployed: the signing key comes from a secret (base64 of the PEM) so receipts stay verifiable
  // across restarts and redeploys. Local: a key file generated on first use.
  const fromEnv = process.env.TELLTALE_RECEIPT_KEY?.trim();
  if (fromEnv) {
    const privateKey = crypto.createPrivateKey(Buffer.from(fromEnv, "base64").toString("utf8"));
    return { privateKey, publicKeyPem: crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString() };
  }
  const dir = path.join(DATA_DIR, "keys");
  const file = path.join(dir, "receipt-ed25519.pem");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(file));
  const publicKeyPem = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  return { privateKey, publicKeyPem };
}

export function buildReceipt(args: {
  recipient: Recipient;
  risk: RiskProfile;
  fields: FieldDecision[];
  tagCode: string;
  purpose: string;
  principal: string;
}): ConsentReceipt {
  const r: ConsentReceipt = {
    schema: "telltale-consent-receipt/1 (ISO/IEC TS 27560:2023 aligned)",
    receiptId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
    piiPrincipal: args.principal,
    controller: {
      host: args.recipient.host,
      domain: args.recipient.domain,
      registeredBrokers: args.recipient.brokers.map((b) => ({ name: b.name, id: b.id })),
    },
    noticeBasis: {
      source: REGISTRY_SOURCE.publisher,
      url: REGISTRY_SOURCE.url,
      registrationYear: REGISTRY_SOURCE.registrationYear,
      findings: args.risk.findings.map((f) => `${f.entity}: ${f.text}`),
    },
    purpose: args.purpose,
    legalBasis: "consent",
    piiCategories: args.fields.map((f) => ({
      kind: f.kind, label: f.label, action: f.action, ...(f.action === "tag" ? { tagCode: args.tagCode } : {}),
    })),
    tagCode: args.tagCode,
    rights: {
      deletion: "Cal. Civ. Code §1798.105; Delete Act (SB 362) via the CPPA DROP platform",
      optOut: "Cal. Civ. Code §1798.120",
    },
  };
  return sign(r);
}

export function sign(r: ConsentReceipt): ConsentReceipt {
  const { privateKey, publicKeyPem } = keys();
  const { signature: _drop, ...body } = r;
  void _drop;
  const value = crypto.sign(null, Buffer.from(canonical(body)), privateKey).toString("base64");
  return { ...body, signature: { alg: "Ed25519", publicKey: publicKeyPem, value } };
}

export function verify(r: ConsentReceipt): boolean {
  if (!r.signature) return false;
  const { signature, ...body } = r;
  return crypto.verify(null, Buffer.from(canonical(body)), crypto.createPublicKey(signature.publicKey), Buffer.from(signature.value, "base64"));
}
