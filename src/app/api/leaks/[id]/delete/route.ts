import { NextResponse } from "next/server";
import { sendDeletion } from "@/lib/requests";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json(await sendDeletion((await params).id));
}
