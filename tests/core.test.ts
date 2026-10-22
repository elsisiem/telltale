import { beforeAll, describe, expect, it } from "vitest";
import { registrableDomain, splitUrls } from "@/lib/domains";
import { loadRegistry } from "@/lib/registry";
import { resolveRecipient } from "@/lib/resolver";
import { assessRisk } from "@/lib/risk";
import { decide, type FieldRequest } from "@/lib/policy";
import { DEMO_PROFILE, mintTagCode, tagInitial, valueFor } from "@/lib/vault";
import { buildReceipt, verify } from "@/lib/receipts";
import { addBusinessDays, complaintDraft, optOutLetter } from "@/lib/letters";

const FORM: FieldRequest[] = [
  { kind: "fullName", label: "Full name", required: true },
  { kind: "email", label: "Email", required: true },
  { kind: "phone", label: "Phone" },
  { kind: "street", label: "Street address" },
  { kind: "zip", label: "ZIP" },
  { kind: "dob", label: "Date of birth" },
];

describe("domains", () => {
  it("reduces hosts to registrable domains", () => {
    expect(registrableDomain("https://www.privacy.transunion.com/x")).toBe("transunion.com");
    expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("rocketreach.co")).toBe("rocketreach.co");
  });
  it("splits multi-url registry cells", () => {
    expect(splitUrls("https://a.com/privacy; www.b.com/optout and c.org")).toEqual([
      "https://a.com/privacy", "www.b.com/optout", "c.org",
    ]);
    expect(splitUrls("https://www.clearview.ai/privacy-and-requests")).toEqual(["https://www.clearview.ai/privacy-and-requests"]);
  });
});

describe("registry + resolver", () => {
  beforeAll(() => loadRegistry());
  it("loads all 603 brokers", () => expect(loadRegistry()).toHaveLength(603));
  it("does not attribute a filing agent's email domain to its clients", () => {
    expect(resolveRecipient("https://ignitevisibility.com").brokers).toHaveLength(0);
  });
  it("resolves a broker by any subdomain", () => {
    const r = resolveRecipient("https://app.rocketreach.co/signup");
    expect(r.matchedBy).toBe("registry-domain");
    expect(r.brokers[0].name).toBe("RocketReach LLC");
  });
  it("does not flag ordinary sites", () => {
    expect(resolveRecipient("https://www.wikipedia.org").brokers).toHaveLength(0);
  });
});

describe("risk + policy", () => {
  it("quotes the broker's own filing", () => {
    const risk = assessRisk(resolveRecipient("rocketreach.co"));
    expect(risk.level).toBe("high");
    expect(risk.findings.map((f) => f.key)).toContain("soldToGenAIDeveloper");
    expect(risk.limitations.length).toBeGreaterThan(0);
  });
  it("flags brokers that deny most deletion requests", () => {
    const r = resolveRecipient("https://keywordconnects.com");
    const risk = assessRisk(r.brokers.length ? r : { ...r, brokers: loadRegistry().filter((b) => b.name.startsWith("Keyword Connects")) });
    expect(risk.findings.find((f) => f.key === "delete-denials")?.text).toMatch(/denying 5,201 of 5,201/);
  });
  it("stays silent for ordinary recipients but still tags email", () => {
    const d = decide(FORM, assessRisk(resolveRecipient("example-dental.com")));
    expect(d.needsConsent).toBe(false);
    expect(d.fields.find((f) => f.kind === "email")?.action).toBe("tag");
    expect(d.fields.find((f) => f.kind === "street")?.action).toBe("send");
  });
  it("stops for brokers with minimizing defaults", () => {
    const d = decide(FORM, assessRisk(resolveRecipient("rocketreach.co")));
    expect(d.needsConsent).toBe(true);
    const by = Object.fromEntries(d.fields.map((f) => [f.kind, f.action]));
    expect(by).toMatchObject({ email: "tag", fullName: "tag", phone: "withhold", street: "withhold", zip: "send", dob: "withhold" });
  });
  it("never offers to alter fields that must be truthful", () => {
    const d = decide([{ kind: "ssn", label: "SSN" }, { kind: "dob", label: "DOB" }], assessRisk(resolveRecipient("example.com")));
    expect(d.needsConsent).toBe(true);
    for (const f of d.fields) expect(f.allowed).not.toContain("tag");
  });
});

describe("vault tags", () => {
  it("mints codes without look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(mintTagCode()).toMatch(/^[2-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
  });
  it("produces working but traceable values", () => {
    const t = { code: "K7Q2", aliasEmail: "maya.k7q2@agentmail.to" };
    expect(valueFor("email", "tag", DEMO_PROFILE, t)).toBe("maya.k7q2@agentmail.to");
    expect(valueFor("street", "tag", DEMO_PROFILE, t)).toBe("2140 Folsom St Apt 3 Attn K7Q2");
    expect(valueFor("fullName", "tag", DEMO_PROFILE, t)).not.toContain(" R. ");
    expect(tagInitial("K7Q2", "R")).not.toBe("R");
    expect(valueFor("phone", "withhold", DEMO_PROFILE, t)).toBe("");
  });
});

describe("receipts", () => {
  it("signs and verifies, and detects tampering", () => {
    const recipient = resolveRecipient("rocketreach.co");
    const risk = assessRisk(recipient);
    const fields = decide(FORM, risk).fields;
    const r = buildReceipt({ recipient, risk, fields, tagCode: "K7Q2", purpose: "Sign up", principal: "telltale:test" });
    expect(verify(r)).toBe(true);
    expect(verify({ ...r, purpose: "Anything" })).toBe(false);
  });
});

describe("letters", () => {
  it("computes the 15-business-day opt-out deadline", () => {
    expect(addBusinessDays(new Date("2026-10-22T12:00:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-11-12");
  });
  it("writes an opt-out that keeps the account", () => {
    const l = optOutLetter({
      broker: { name: "RocketReach LLC", contactEmail: "privacy@rocketreach.co" },
      profile: DEMO_PROFILE, ids: { tagCode: "K7Q2", aliasEmail: "maya.k7q2@agentmail.to" }, sentAt: new Date("2026-10-22T12:00:00Z"),
    });
    expect(l.body).toContain("not asking you to close my account");
    expect(l.body).toContain("maya.k7q2@agentmail.to");
  });
  it("drafts a complaint citing the deadline and the sender's filing", () => {
    const c = complaintDraft({
      profile: DEMO_PROFILE, tagCode: "K7Q2", identifierObserved: "maya.k7q2@agentmail.to",
      issuedTo: { domain: "rocketreach.co", at: "2026-10-22T12:00:00Z", receiptId: "r-1" },
      observed: { channel: "email", from: "deals@leadco.example", senderDomain: "leadco.example", at: "2026-12-08T09:00:00Z" },
      senderBrokers: [{ name: "LeadCo", findings: ["sold or shared consumers' data with a developer of a GenAI system or model in the past year"] }],
      request: { target: "rocketreach.co", sentAt: "2026-10-22T12:00:00Z", due: "2026-11-12T12:00:00Z" },
    });
    expect(c.body).toContain("2026-11-12");
    expect(c.body).toContain("Not legal advice");
  });
});
