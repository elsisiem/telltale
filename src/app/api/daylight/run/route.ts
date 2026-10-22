import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runScan } from "@/lib/daylight/scan";

export const runtime = "nodejs";

type G = typeof globalThis & { __telltaleScanRunning?: string };

/** Start a live sweep of every registered broker; progress streams over /api/events. */
export async function POST() {
  const g = globalThis as G;
  if (g.__telltaleScanRunning) return NextResponse.json({ scanId: g.__telltaleScanRunning, alreadyRunning: true });
  const scanId = crypto.randomUUID();
  g.__telltaleScanRunning = scanId;
  runScan({ scanId, concurrency: 24 })
    .catch((err) => console.error("[daylight] scan failed:", err))
    .finally(() => {
      g.__telltaleScanRunning = undefined;
    });
  return NextResponse.json({ scanId });
}
