import { NextResponse } from "next/server";
import { listIdentities } from "@/lib/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the person's real values next to what each site received, for their own Identities page.
// Like /api/profile, it sits behind the deployment's authentication.
export async function GET() {
  return NextResponse.json({ identities: await listIdentities() });
}
