import { bus, type TelltaleEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let onEvent: (e: TelltaleEvent) => void = () => {};
  let ping: NodeJS.Timeout | undefined;
  const stop = () => {
    bus.off("event", onEvent);
    clearInterval(ping);
  };
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          stop();
        }
      };
      onEvent = (e) => send(e);
      bus.on("event", onEvent);
      ping = setInterval(() => send({ type: "ping" }), 15000);
      send({ type: "hello" });
      req.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: stop,
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
