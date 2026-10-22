import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestObservation } from "@/lib/leaks";

export const runtime = "nodejs";

const Body = z.object({
  channel: z.enum(["email", "sms", "postal", "listing"]),
  to: z.string(),
  from: z.string(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
  receivedAt: z.string().optional(),
});

/** Report contact on a tagged identifier that Telltale can't read itself: a text, a letter, a listing. */
export async function POST(req: Request) {
  const b = Body.parse(await req.json());
  return NextResponse.json(await ingestObservation({ ...b, receivedAt: b.receivedAt ?? new Date().toISOString() }));
}
