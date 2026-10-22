import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runScan } from "@/lib/daylight/scan";
import { endSweep, runningSweep, startSweep } from "@/lib/daylight/status";

export const runtime = "nodejs";

/** Start a live sweep of every registered broker; progress streams over /api/events. */
export async function POST() {
  const running = runningSweep();
  if (running) return NextResponse.json({ scanId: running.scanId, alreadyRunning: true });
  const scanId = crypto.randomUUID();
  startSweep(scanId);
  runScan({ scanId, concurrency: 24 })
    .catch((err) => console.error("[daylight] scan failed:", err))
    .finally(() => endSweep(scanId));
  return NextResponse.json({ scanId });
}
