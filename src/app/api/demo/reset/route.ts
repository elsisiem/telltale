import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Clear the person's trail (disclosures, mail, leaks, requests) between rehearsals. Daylight scans are kept. */
export async function POST() {
  const d = await db();
  for (const t of ["complaints", "leaks", "messages", "requests", "disclosures"]) await d.query(`delete from ${t}`);
  return NextResponse.json({ ok: true });
}
