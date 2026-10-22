import { NextResponse } from "next/server";
import { z } from "zod";
import { sendOptOut } from "@/lib/requests";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { disclosureId } = z.object({ disclosureId: z.string() }).parse(await req.json());
  try {
    return NextResponse.json(await sendOptOut(disclosureId));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
