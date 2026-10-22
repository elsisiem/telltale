"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import { api } from "./format";
import type { UiState } from "./types";

/** Subscribe to the server event stream; reconnects with backoff when the stream drops. */
export function useEvents(onEvent: (e: TelltaleEvent) => void) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let backoff = 1000;
    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/events");
      es.onopen = () => {
        setConnected(true);
        backoff = 1000;
      };
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as TelltaleEvent | { type: "hello" | "ping" };
          if (e.type === "hello" || e.type === "ping") return;
          handler.current(e as TelltaleEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 10_000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      es?.close();
    };
  }, []);

  return connected;
}

/** Dashboard state from /api/state with a debounced refresh for event bursts. */
export function useDashboard() {
  const [state, setState] = useState<UiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setState(await api<UiState>("/api/state"));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshSoon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    refresh();
    return () => clearTimeout(timer.current);
  }, [refresh]);

  return { state, error, refresh, refreshSoon };
}

/** sessionStorage-backed state for per-tab conveniences (e.g. the agent log across reloads). */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {}
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}
