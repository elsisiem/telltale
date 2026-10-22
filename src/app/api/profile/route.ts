import { NextResponse } from "next/server";
import { z } from "zod";
import { clearProfile, ProfileInput, saveProfile, saveSettings, vaultState } from "@/lib/profile-store";
import { DEMO_PROFILE } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The only route that returns the person's real details, so their own settings page can edit them.
// The deployment sits behind authentication; nothing else in the app ever sends these values out.

export async function GET() {
  const { profile, settings } = await vaultState();
  return NextResponse.json({
    saved: !!profile,
    profile: profile ?? null,
    demo: { firstName: DEMO_PROFILE.firstName, lastName: DEMO_PROFILE.lastName },
    settings,
    encryption: process.env.TELLTALE_VAULT_KEY?.trim() ? "AES-256-GCM · key from deployment secret" : "AES-256-GCM · key file on this machine",
  });
}

export async function PUT(req: Request) {
  const parsed = ProfileInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const profile = await saveProfile(parsed.data);
  return NextResponse.json({ saved: true, firstName: profile.firstName });
}

export async function DELETE() {
  await clearProfile();
  return NextResponse.json({ saved: false });
}

export async function PATCH(req: Request) {
  const body = z.object({ dryRun: z.boolean() }).parse(await req.json());
  return NextResponse.json({ settings: await saveSettings(body) });
}
