"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import { AgentPanel, type LogEntry } from "./AgentPanel";
import { AppShell } from "./AppShell";
import { ConsentCard } from "./ConsentCard";
import { TrailCard } from "./DataTrail";
import { api } from "./format";
import { useDashboard, useEvents, useSessionState } from "./hooks";
import { LeakAlert } from "./LeakAlert";
import { Ledger } from "./Ledger";
import { Pipeline } from "./Pipeline";
import { StagePanel } from "./StagePanel";
import type { CardView, PendingView } from "./types";
import { Button, Skeleton } from "./ui";

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function Console() {
  const { state, error, refresh, refreshSoon } = useDashboard();
  const [log, setLog] = useSessionState<LogEntry[]>("telltale:agent-log", []);
  const [liveViewUrl, setLiveViewUrl] = useSessionState<string | null>("telltale:live-view", null);
  // Latest screenshot from the agent's browser (works with Kernel and with the local fallback).
  const [frame, setFrame] = useState<{ data: string; url: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [card, setCard] = useState<{ view: CardView; readOnly: boolean } | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
  const closedIds = useRef(new Set<string>());

  const showPending = useCallback(async (id: string) => {
    if (closedIds.current.has(id)) return;
    try {
      const view = await api<PendingView>(`/api/consent/${id}`);
      if (view.status === "pending" && !closedIds.current.has(id)) setCard({ view, readOnly: false });
    } catch {
      /* already resolved or expired */
    }
  }, []);

  const closeCard = useCallback(() => {
    setCard((c) => {
      if (c?.view.id) closedIds.current.add(c.view.id);
      return null;
    });
  }, []);

  const onEvent = useCallback(
    (e: TelltaleEvent) => {
      const push = (entry: LogEntry) => setLog((l) => [...l.slice(-199), entry]);
      switch (e.type) {
        case "agent.tool":
          setRunning(true);
          push({ id: uid(), at: e.at, kind: "tool", tool: e.tool, input: e.input });
          break;
        case "agent.log":
          push({ id: uid(), at: e.at, kind: "log", text: e.text });
          break;
        case "agent.done":
          setRunning(false);
          setLiveViewUrl(null); // the hosted browser session closes with the run
          push({ id: uid(), at: e.at, kind: "done", text: e.summary });
          break;
        case "agent.browser":
          setRunning(true);
          setLiveViewUrl(e.liveViewUrl);
          break;
        case "agent.frame":
          setFrame({ data: e.data, url: e.url });
          return; // frames arrive ~1/s and change nothing else on the page
        case "consent.request":
          void showPending(e.pendingId);
          break;
        case "consent.resolved":
          closedIds.current.add(e.pendingId);
          setCard((c) => (c?.view.id === e.pendingId ? null : c));
          break;
      }
      refreshSoon();
    },
    [refreshSoon, setLog, setLiveViewUrl, showPending],
  );
  const connected = useEvents(onEvent);

  // Pending consent that arrived before this page loaded.
  useEffect(() => {
    if (card || !state?.pending.length) return;
    const next = state.pending.find((p) => !closedIds.current.has(p.id));
    if (next) setCard({ view: next, readOnly: false });
  }, [state, card]);

  // "d" toggles stage controls (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "d" && !e.metaKey && !e.ctrlKey && !e.altKey) setStageOpen((o) => !o);
      if (e.key === "Escape") setStageOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const leak = state?.leaks.at(-1);
  const livePending = card && !card.readOnly ? card.view : (state?.pending.find((p) => !closedIds.current.has(p.id)) ?? null);

  return (
    <AppShell
      active="console"
      state={state}
      connected={connected}
      crumbs={["Telltale", "Console"]}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setStageOpen((o) => !o)} title="Stage controls (D)">
          Stage <span className="kbd">D</span>
        </Button>
      }
    >
      {!state ? (
        <div className="flex flex-col gap-4 p-5">
          {error ? (
            <p className="border-l-2 border-accent pl-3 text-[13px] text-accent-ink">Could not load state: {error}</p>
          ) : (
            <>
              <Skeleton className="h-[188px]" />
              <div className="grid grid-cols-[340px_minmax(0,1fr)_380px] gap-4">
                <Skeleton className="h-[480px]" />
                <Skeleton className="h-[480px]" />
                <Skeleton className="h-[480px]" />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col gap-4 p-5">
          {leak && <LeakAlert key={leak.id} leak={leak} state={state} onChanged={refreshSoon} />}
          <Pipeline state={state} pending={livePending} running={running} onReview={() => livePending && setCard({ view: livePending, readOnly: false })} />
          <div className="grid min-h-[520px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[312px_minmax(0,1fr)_356px] 2xl:grid-cols-[340px_minmax(0,1fr)_384px]">
            <AgentPanel
              log={log}
              liveViewUrl={liveViewUrl}
              frame={frame}
              running={running}
              modelOn={!!state.integrations.model}
              onStarted={(runId, task) => {
                setRunning(true);
                setLiveViewUrl(null);
                setFrame(null);
                setLog((l) => [...l, { id: runId, at: new Date().toISOString(), kind: "run", task }]);
              }}
            />
            <TrailCard state={state} />
            <div className="min-h-0 lg:col-span-2 xl:col-span-1">
              <Ledger state={state} onChanged={refreshSoon} />
            </div>
          </div>
          <footer className="flex items-center justify-between font-mono text-[10.5px] text-faint">
            <span>
              Registry · {state.registry.source.publisher} · {state.registry.brokers} registered brokers · {state.registry.source.registrationYear} filings, self-reported
            </span>
            <span>Not legal advice. Telltale drafts; people decide and file.</span>
          </footer>
        </div>
      )}

      <StagePanel open={stageOpen} onClose={() => setStageOpen(false)} onPreview={(view) => setCard({ view, readOnly: true })} onRefresh={refresh} />
      {card && <ConsentCard key={card.view.id ?? `preview-${card.view.recipient.host}`} view={card.view} readOnly={card.readOnly} onClose={closeCard} />}
    </AppShell>
  );
}
