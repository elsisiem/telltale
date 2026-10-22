import { NextResponse } from "next/server";
import { dashboardState } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await dashboardState());
}
