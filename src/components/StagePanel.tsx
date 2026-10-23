"use client";

import { useState } from "react";
import { api } from "./format";
import type { CardView, UiState } from "./types";
import { useToast } from "./Toast";
import { Button, Icon, TagCode } from "./ui";

const PREVIEW_SUGGESTIONS = ["https://www.bestautoinsurance.com", "https://www.spokeo.com/signup", "https://www.uplead.com", "https://bayview-dental.fly.dev"];

export function StagePanel({ open, onClose, onPreview, onRefresh, state }: { open: boolean; onClose: () => void; onPreview: (v: CardView) => void; onRefresh: () => void; state: UiState | null }) {
  const toast = useToast();
  // The replay writes to the newest tagged email given to a registered broker, the same row the API picks.
  const target = state?.disclosures
    .filter((d) => d.alias_email && d.broker_ids.length > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
  const [url, setUrl] = useState(PREVIEW_SUGGESTIONS[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) {
        setMsg({ tone: "ok", text });
        toast(text);
      }
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const replay = () =>
    act("replay", async () => {
      const r = await api<{ classification: string; day: number; leakId?: string }>("/api/demo/replay", { json: {} });
      onRefresh();
      return `Replayed day ${r.day}: ${r.classification}${r.leakId ? " · leak traced" : ""}`;
    });
  const preview = () =>
    act("preview", async () => {
      onPreview(await api<CardView>("/api/preview", { json: { url } }));
      onClose();
    });
  const reset = () =>
    act("reset", async () => {
      const r = await api<{ inboxesDeleted?: number }>("/api/demo/reset", { method: "POST" });
      try {
        sessionStorage.removeItem("telltale:agent-log");
      } catch {}
      onRefresh();
      return `Cleared${r.inboxesDeleted ? ` · ${r.inboxesDeleted} Telltale inbox${r.inboxesDeleted === 1 ? "" : "es"} removed` : ""}`;
    });

  if (!open) return null;
  return (
    <aside className="anim-rise fixed bottom-5 right-5 z-40 w-[360px] border border-ink bg-surface shadow-[0_16px_40px_-20px_rgba(17,19,24,0.4)]" aria-label="Stage controls">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <span className="label">Stage controls</span>
        <span className="flex items-center gap-2">
          <span className="kbd">D</span>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink" aria-label="Close stage controls">
            <Icon name="close" />
          </button>
        </span>
      </div>

      <div className="p-3">
        <Button variant="secondary" className="w-full border-accent text-accent-ink hover:border-accent-ink" onClick={replay} busy={busy === "replay"} disabled={!target}>
          Replay day 47 (simulated)
        </Button>
        {target ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            Writes to the address given to <span className="font-mono text-ink">{target.recipient_host}</span>
            <TagCode code={target.tag_code} accent />
          </p>
        ) : (
          <p className="mt-1.5 text-[11.5px] text-accent-ink">Needs a registered broker that got a tagged email. Run the People-search account task and release its card first.</p>
        )}
        <p className="mt-1 text-[11.5px] text-muted">Fictional sender northgate-leads.example. Everything it produces is labeled SIMULATED.</p>
      </div>

      <div className="border-t border-line p-3">
        <label className="label" htmlFor="preview-url">
          Preview a site
        </label>
        <div className="mt-1.5 flex gap-1.5">
          <input
            id="preview-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && preview()}
            className="h-9 min-w-0 flex-1 border border-line-strong bg-surface px-2.5 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
          />
          <Button onClick={preview} busy={busy === "preview"}>
            Preview
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {PREVIEW_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setUrl(s)} className="h-6 border border-line px-1.5 font-mono text-[10.5px] text-muted transition-colors hover:border-ink hover:text-ink">
              {s.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onRefresh}>
            Refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} busy={busy === "reset"}>
            Reset demo
          </Button>
        </div>
        {msg && <span className={msg.tone === "ok" ? "truncate font-mono text-[11px] text-ink-2" : "truncate text-[11.5px] text-accent-ink"}>{msg.text}</span>}
      </div>
    </aside>
  );
}
