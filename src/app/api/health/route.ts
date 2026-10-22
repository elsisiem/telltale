import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness for the host's health checks: the server is up and the database answers. */
export async function GET() {
  try {
    await (await db()).query("select 1");
    return NextResponse.json({ ok: true, database: process.env.DATABASE_URL?.trim() ? "neon" : "pglite" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
