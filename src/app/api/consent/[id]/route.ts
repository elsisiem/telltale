import { NextResponse } from "next/server";
import { z } from "zod";
import { getPending, resolveConsent } from "@/lib/gate";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getPending((await params).id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "not found" }, { status: 404 });
}

const Body = z.object({
  approved: z.boolean(),
  actions: z.record(z.string(), z.enum(["send", "tag", "withhold"])).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = Body.parse(await req.json());
  const ok = resolveConsent((await params).id, body);
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "no pending consent with that id" }, { status: 404 });
}
