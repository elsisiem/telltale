// Seeds the local PGlite database with the stage story so the console has something to show:
//   1. a silent pass to an ordinary dental office (email tagged automatically)
//   2. a consent-gated disclosure to a registered broker (Best Auto Insurance, run by Apollo Interactive), resolved in-process
//   3. an opt-out of sale/sharing to that broker
//   4. expected first-party mail, then a SIMULATED "Day 47" contact from a fictional sender
//
// PGlite is single-process: stop `pnpm dev` before running this, then start it again.
//   pnpm tsx scripts/seed-demo.ts          (clears previous demo rows first)
//   pnpm tsx scripts/seed-demo.ts --keep   (appends)
import fs from "node:fs";
import path from "node:path";

process.env.TELLTALE_DB_DIR ||= path.join(process.cwd(), ".telltale", "db");
// PGlite creates only the last path segment; make sure .telltale/ exists on a fresh checkout.
fs.mkdirSync(path.dirname(process.env.TELLTALE_DB_DIR), { recursive: true });

const DAY = 86_400_000;

async function main() {
  const { db } = await import("../src/lib/db");
  const { requestDisclosure, resolveConsent, listPending } = await import("../src/lib/gate");
  const { sendOptOut } = await import("../src/lib/requests");
  const { ingestObservation } = await import("../src/lib/leaks");
  type FormField = import("../src/lib/gate").FormField;

  const d = await db();
  if (!process.argv.includes("--keep")) {
    for (const t of ["complaints", "leaks", "messages", "requests", "disclosures"]) await d.query(`delete from ${t}`);
    console.log("cleared previous demo rows");
  }

  const dentalForm: FormField[] = [
    { selector: "#name", kind: "fullName", label: "Full name", required: true },
    { selector: "#email", kind: "email", label: "Email", required: true },
    { selector: "#phone", kind: "phone", label: "Phone", required: true },
    { selector: "#zip", kind: "zip", label: "ZIP" },
  ];
  const dental = await requestDisclosure({ url: "https://bayview-dental.fly.dev/", purpose: "Book a dental cleaning", fields: dentalForm });
  console.log("dental:", dental.status, dental.status === "approved" ? `${dental.tagCode} prompted=${dental.prompted}` : "");

  const brokerForm: FormField[] = [
    { selector: "#name", kind: "fullName", label: "Full name", required: true },
    { selector: "#email", kind: "email", label: "Work email", required: true },
    { selector: "#phone", kind: "phone", label: "Phone" },
    { selector: "#company", kind: "other", label: "Company" },
    { selector: "#zip", kind: "zip", label: "ZIP" },
  ];
  const pendingResult = requestDisclosure({ url: "https://www.bestautoinsurance.com/quote", purpose: "Car insurance quotes", fields: brokerForm });
  await new Promise((r) => setTimeout(r, 300));
  const card = listPending().find((p) => p.status === "pending" && p.recipient.host === "www.bestautoinsurance.com");
  if (!card) throw new Error("expected a pending consent card for bestautoinsurance.com");
  console.log("consent card:", card.recipient.brokers.map((b) => b.name).join(", "), `${card.risk.findings.length} findings`);
  resolveConsent(card.id, { approved: true, actions: { "#name": "tag", "#email": "tag", "#phone": "withhold", "#company": "withhold" } });
  const broker = await pendingResult;
  if (broker.status !== "approved") throw new Error("broker disclosure was not approved");
  console.log("broker:", broker.tagCode, broker.values["#email"]);

  const { rows } = await d.query<{ created_at: string }>("select created_at from disclosures where id = $1", [broker.disclosureId]);
  const created = new Date(rows[0].created_at);

  const optout = await sendOptOut(broker.disclosureId, { sentAt: created });
  console.log("opt-out:", optout.status, "due", optout.due_at);

  const alias = broker.values["#email"];
  const fp = await ingestObservation({
    channel: "email", to: alias, from: "Best Auto Insurance <quotes@bestautoinsurance.com>", fromDomain: "bestautoinsurance.com",
    subject: "Your quotes are ready", receivedAt: new Date(created.getTime() + 2 * 60_000).toISOString(),
  });
  console.log("first-party:", fp.classification);

  const leak = await ingestObservation({
    channel: "email", to: alias, from: "Northgate Lead Exchange <offers@northgate-leads.example>", fromDomain: "northgate-leads.example",
    subject: "New matches for your profile are ready", snippet: "We found updated contact and address records associated with you…",
    receivedAt: new Date(created.getTime() + 47 * DAY).toISOString(), replay: true,
  });
  console.log("replay:", leak.classification, leak.leakId ?? "");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
