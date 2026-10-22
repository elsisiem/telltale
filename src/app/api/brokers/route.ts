import { NextResponse } from "next/server";
import { loadRegistry } from "@/lib/registry";
import { resolveRecipient } from "@/lib/resolver";
import { assessRisk } from "@/lib/risk";

export const runtime = "nodejs";

/** ?q=domain-or-name → matching registry entries with their findings. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return NextResponse.json({ results: [] });
  const byDomain = resolveRecipient(q);
  const brokers = byDomain.brokers.length
    ? byDomain.brokers
    : loadRegistry().filter((b) => b.name.toLowerCase().includes(q) || (b.dba ?? "").toLowerCase().includes(q)).slice(0, 20);
  return NextResponse.json({
    results: brokers.map((b) => ({ ...b, findings: assessRisk({ ...byDomain, brokers: [b] }).findings })),
  });
}
