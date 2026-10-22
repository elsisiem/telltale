import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/run";
import { emit } from "@/lib/events";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 400 });
  const { task } = z.object({ task: z.string().min(3) }).parse(await req.json());
  const runId = crypto.randomUUID();
  runAgent(task, { runId }).catch((err) => emit({ type: "agent.done", runId, summary: `Error: ${(err as Error).message}` }));
  return NextResponse.json({ runId });
}
