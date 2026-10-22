"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelltaleEvent } from "@/lib/events";
import { AgentPanel, type LogEntry } from "./AgentPanel";
import { ConsentCard } from "./ConsentCard";
import { DataTrail } from "./DataTrail";
import { api } from "./format";
import { useDashboard, useEvents, useSessionState } from "./hooks";
import { LeakAlert } from "./LeakAlert";
import { Ledger } from "./Ledger";
import { IntegrationPills, SiteHeader, SyntheticBadge } from "./SiteHeader";
import { StagePanel } from "./StagePanel";
import type { CardView, PendingView } from "./types";

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function Console() {
  const { state, error, refresh, refreshSoon } = useDashboard();
  const [log, setLog] = useSessionState<LogEntry[]>("telltale:agent-log", []);
  const [liveViewUrl, setLiveViewUrl] = useSessionState<string | null>("telltale:live-view", null);
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

  // "d" toggles the stage panel (ignored while typing).
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

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden">
      <SiteHeader
        right={
          state && (
            <>
              <IntegrationPills integrations={state.integrations} />
              {state.person.synthetic && <SyntheticBadge name={state.person.firstName} />}
            </>
          )
        }
      />
      {state && leak && <LeakAlert key={leak.id} leak={leak} state={state} onChanged={refreshSoon} />}

      {!state ? (
        <div className="flex flex-1 items-center justify-center text-[15px] text-muted">
          {error ? <span className="text-alarm">Could not load state: {error}</span> : "Opening the evidence locker…"}
        </div>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-5 px-5 py-5 min-[1400px]:grid-cols-[340px_minmax(0,1fr)_400px] min-[1400px]:gap-6 min-[1400px]:px-6">
          <div className="min-h-0">
            <AgentPanel
              log={log}
              liveViewUrl={liveViewUrl}
              running={running}
              modelOn={!!state.integrations.model}
              onStarted={(runId, task) => {
                setRunning(true);
                setLiveViewUrl(null);
                setLog((l) => [...l, { id: runId, at: new Date().toISOString(), kind: "run", task }]);
              }}
            />
          </div>
          <div className="min-h-0 overflow-y-auto pr-1">
            <DataTrail state={state} />
          </div>
          <div className="min-h-0">
            <Ledger state={state} onChanged={refreshSoon} />
          </div>
        </main>
      )}

      <footer className="flex h-9 shrink-0 items-center justify-between border-t border-line px-6 text-[12px] text-dim">
        <span>
          Registry: {state?.registry.source.publisher ?? "California Privacy Protection Agency"} · {state?.registry.brokers ?? 603} registered brokers ·{" "}
          {state?.registry.source.registrationYear ?? 2026} filings, self-reported
        </span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={connected ? "size-1.5 rounded-full bg-pass" : "size-1.5 rounded-full bg-dim"} />
            {connected ? "live" : "reconnecting"}
          </span>
          <button onClick={() => setStageOpen((o) => !o)} className="rounded px-1.5 py-0.5 font-mono hover:bg-white/[0.05] hover:text-muted" title="Stage controls (D)">
            stage · D
          </button>
        </span>
      </footer>

      <StagePanel open={stageOpen} onClose={() => setStageOpen(false)} onPreview={(view) => setCard({ view, readOnly: true })} onRefresh={refresh} />
      {card && <ConsentCard key={card.view.id ?? `preview-${card.view.recipient.host}`} view={card.view} readOnly={card.readOnly} onClose={closeCard} />}
    </div>
  );
}
