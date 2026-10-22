import { EventEmitter } from "node:events";

// In-process bus that streams agent, consent and scan events to the UI over SSE. Stored on
// globalThis so Next.js dev-mode module reloads share one instance.

export type TelltaleEvent =
  | { type: "agent.log"; runId: string; text: string; at: string }
  | { type: "agent.tool"; runId: string; tool: string; input: unknown; at: string }
  | { type: "agent.done"; runId: string; summary: string; at: string }
  | { type: "agent.browser"; runId: string; liveViewUrl: string | null; at: string }
  | { type: "agent.frame"; runId: string; data: string; url: string; at: string }
  | { type: "consent.request"; pendingId: string; at: string }
  | { type: "consent.resolved"; pendingId: string; approved: boolean; at: string }
  | { type: "disclosure.created"; disclosureId: string; at: string }
  | { type: "message.received"; messageId: string; classification: string; at: string }
  | { type: "leak.detected"; leakId: string; at: string }
  | { type: "scan.progress"; scanId: string; done: number; total: number; brokerId: string; status: string; at: string }
  | { type: "scan.done"; scanId: string; at: string };

type G = typeof globalThis & { __telltaleBus?: EventEmitter };
const g = globalThis as G;
export const bus: EventEmitter = (g.__telltaleBus ??= new EventEmitter().setMaxListeners(100));

type Payload<E> = E extends { at: string } ? Omit<E, "at"> : never;
export function emit(e: Payload<TelltaleEvent>) {
  bus.emit("event", { ...e, at: new Date().toISOString() } as TelltaleEvent);
}
