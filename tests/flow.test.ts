import { describe, expect, it, beforeAll } from "vitest";
import { requestDisclosure, resolveConsent, listPending, type FormField } from "@/lib/gate";
import { _setAliasProvider } from "@/lib/aliases";
import { ingestObservation } from "@/lib/leaks";
import { draftComplaint, sendDeletion, sendOptOut, setSender } from "@/lib/requests";
import { bus, type TelltaleEvent } from "@/lib/events";
import { verify } from "@/lib/receipts";
import { loadRegistry } from "@/lib/registry";

const FORM: FormField[] = [
  { selector: "#name", kind: "fullName", label: "Full name", required: true },
  { selector: "#email", kind: "email", label: "Email", required: true },
  { selector: "#phone", kind: "phone", label: "Phone" },
  { selector: "#street", kind: "street", label: "Street" },
  { selector: "#zip", kind: "zip", label: "ZIP" },
];

beforeAll(() => {
  _setAliasProvider({ name: "test", create: async (code) => `maya.${code.toLowerCase()}@agentmail.to` });
  setSender(async () => "test");
});

describe("end-to-end: disclose → opt out → leak → complaint", () => {
  it("passes ordinary recipients through silently with a tagged email", async () => {
    const r = await requestDisclosure({ url: "https://www.example-dental.com/book", purpose: "Book a cleaning", fields: FORM });
    expect(r.status).toBe("approved");
    if (r.status !== "approved") return;
    expect(r.prompted).toBe(false);
    expect(r.values["#email"]).toMatch(/^maya\.[a-z2-9]{4}@agentmail\.to$/);
    expect(r.values["#street"]).toBe("2140 Folsom St Apt 3");
    // The model only ever sees outcomes, never values
    expect(JSON.stringify(r.summary)).not.toContain("Folsom");
  });

  it("stops at a broker, applies the person's choices, then catches a later leak", async () => {
    const events: TelltaleEvent[] = [];
    const onEvent = (e: TelltaleEvent) => events.push(e);
    bus.on("event", onEvent);

    const pendingResult = requestDisclosure({ url: "https://rocketreach.co/signup", purpose: "Free contact lookup", fields: FORM });
    await new Promise((r) => setTimeout(r, 50));
    const card = listPending()[0];
    expect(card.recipient.brokers[0].name).toBe("RocketReach LLC");
    expect(card.risk.findings.some((f) => f.key === "soldToGenAIDeveloper")).toBe(true);
    // The person also withholds the name entirely
    resolveConsent(card.id, { approved: true, actions: { "#name": "withhold" } });
    const r = await pendingResult;
    expect(r.status).toBe("approved");
    if (r.status !== "approved") return;
    expect(r.prompted).toBe(true);
    expect(r.values).toMatchObject({ "#name": "", "#phone": "", "#street": "", "#zip": "94110" });
    expect(verify(r.receipt)).toBe(true);

    // Day 0: opt out of sale/sharing (keeps the account)
    const day0 = new Date("2026-10-22T16:00:00Z");
    const optOut = await sendOptOut(r.disclosureId, { sentAt: day0 });
    expect(optOut.due_at?.slice(0, 10)).toBe("2026-11-12");

    // First-party mail is expected
    const alias = r.values["#email"];
    const fp = await ingestObservation({ channel: "email", to: alias, from: "hello@rocketreach.co", subject: "Welcome", receivedAt: "2026-10-22T17:00:00Z" });
    expect(fp.classification).toBe("first-party");

    // Day 47: a registered broker that never got the address writes to it
    const thirdParty = loadRegistry().find((b) => b.flags.soldToGenAIDeveloper && b.domains.length && !b.domains.includes("rocketreach.co"))!;
    const leak = await ingestObservation({
      channel: "email", to: alias, from: `offers@${thirdParty.domains[0]}`, subject: "We found your profile",
      receivedAt: "2026-12-08T09:00:00Z", replay: true,
    });
    expect(leak.classification).toBe("leak");
    expect(events.some((e) => e.type === "leak.detected")).toBe(true);

    const complaint = await draftComplaint(leak.leakId!);
    expect(complaint.body).toContain("rocketreach.co");
    expect(complaint.body).toContain("2026-11-12");
    expect(complaint.body).toContain(thirdParty.name);

    const del = await sendDeletion(leak.leakId!, { sentAt: new Date("2026-12-08T10:00:00Z") });
    expect(del.kind).toBe("delete");
    expect(del.body).toContain(alias);
    bus.off("event", onEvent);
  });
});
