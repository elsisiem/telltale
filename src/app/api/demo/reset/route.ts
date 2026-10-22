import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Clear the person's trail (disclosures, mail, leaks, requests, Telltale's own inboxes) between rehearsals. Daylight scans are kept. */
export async function POST() {
  const d = await db();
  for (const t of ["complaints", "leaks", "messages", "requests", "disclosures"]) await d.query(`delete from ${t}`);
  let inboxesDeleted = 0;
  if (process.env.AGENTMAIL_API_KEY) {
    const { deleteTelltaleInboxes } = await import("@/lib/integrations/agentmail");
    inboxesDeleted = await deleteTelltaleInboxes().catch(() => 0);
  }
  return NextResponse.json({ ok: true, inboxesDeleted });
}
