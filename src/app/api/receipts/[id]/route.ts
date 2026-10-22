import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verify, type ConsentReceipt } from "@/lib/receipts";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await db();
  const { rows } = await d.query<{ receipt: ConsentReceipt }>("select receipt from disclosures where id = $1", [(await params).id]);
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ verified: verify(rows[0].receipt), receipt: rows[0].receipt });
}
