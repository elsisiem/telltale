import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ingestObservation } from "@/lib/leaks";
import { sendOptOut } from "@/lib/requests";

export const runtime = "nodejs";

// A resold address takes weeks to surface, so the stage demo replays "Day 47". The sender is a
// fictional company on a reserved .example domain: the replay never shows a real business doing
// something it did not do. Everything it produces is marked as a simulation.
const SIM_SENDER = { from: "Northgate Lead Exchange <offers@northgate-leads.example>", domain: "northgate-leads.example" };
const DAY = 86_400_000;

export async function POST(req: Request) {
  const { disclosureId, day } = z.object({ disclosureId: z.string().optional(), day: z.number().int().min(1).max(365).default(47) }).parse(await req.json().catch(() => ({})));
  const d = await db();
  const { rows } = await d.query<{ id: string; created_at: string; alias_email: string }>(
    disclosureId
      ? "select id, created_at, alias_email from disclosures where id = $1"
      : "select id, created_at, alias_email from disclosures where alias_email is not null and jsonb_array_length(broker_ids) > 0 order by created_at desc limit 1",
    disclosureId ? [disclosureId] : [],
  );
  const disc = rows[0];
  if (!disc?.alias_email) return NextResponse.json({ error: "Nothing to replay yet: no registered broker has received a tagged email. Run the People-search account task and release its consent card, then replay." }, { status: 400 });

  // One replay per disclosure, so a second press on stage returns the same leak instead of a copy.
  const { rows: prior } = await d.query<{ id: string; classification: string }>("select id, classification from messages where disclosure_id = $1 and replay = true order by received_at limit 1", [disc.id]);
  if (prior[0]) {
    const { rows: leak } = await d.query<{ id: string }>("select id from leaks where message_id = $1", [prior[0].id]);
    return NextResponse.json({ messageId: prior[0].id, classification: prior[0].classification, leakId: leak[0]?.id, simulated: true, day, already: true });
  }

  const created = new Date(disc.created_at);
  const { rows: existing } = await d.query("select 1 from requests where kind = 'optout' and tag_code = (select tag_code from disclosures where id = $1)", [disc.id]);
  if (!existing.length) await sendOptOut(disc.id, { sentAt: created });

  const result = await ingestObservation({
    channel: "email",
    to: disc.alias_email,
    from: SIM_SENDER.from,
    fromDomain: SIM_SENDER.domain,
    subject: "New matches for your profile are ready",
    snippet: "We found updated contact and address records associated with you…",
    receivedAt: new Date(created.getTime() + day * DAY).toISOString(),
    replay: true,
  });
  return NextResponse.json({ ...result, simulated: true, day });
}
