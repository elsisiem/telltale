"use client";

import { useState } from "react";
import { api } from "./format";
import type { CardView } from "./types";
import { Button } from "./ui";

const PREVIEW_SUGGESTIONS = ["https://rocketreach.co/signup", "https://www.spokeo.com/signup", "https://www.bayviewdental.example/book"];

export function StagePanel({ open, onClose, onPreview, onRefresh }: { open: boolean; onClose: () => void; onPreview: (v: CardView) => void; onRefresh: () => void }) {
  const [url, setUrl] = useState(PREVIEW_SUGGESTIONS[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function replay() {
    setBusy("replay");
    setMsg(null);
    try {
      const r = await api<{ classification: string; day: number; leakId?: string }>("/api/demo/replay", { json: {} });
      setMsg({ tone: "ok", text: `Replayed Day ${r.day}: ${r.classification}${r.leakId ? " · leak traced" : ""}` });
      onRefresh();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    setBusy("preview");
    setMsg(null);
    try {
      onPreview(await api<CardView>("/api/preview", { json: { url } }));
      onClose();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;
  return (
    <aside className="anim-slide-up fixed bottom-12 right-6 z-40 w-[380px] rounded-xl border border-line-2 bg-panel-2 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]" aria-label="Stage controls">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Stage controls</span>
        <button onClick={onClose} className="rounded px-1.5 text-muted hover:text-fg" aria-label="Close stage controls">
          ✕
        </button>
      </div>

      <Button variant="secondary" className="w-full border-signal/40 text-signal" onClick={replay} busy={busy === "replay"}>
        Replay Day 47 (simulated)
      </Button>
      <p className="mt-1.5 text-[12px] text-dim">Fictional sender northgate-leads.example. Everything it produces is labeled SIMULATED.</p>

      <div className="mt-4 border-t border-line pt-4">
        <label className="text-[13px] text-muted" htmlFor="preview-url">
          Preview a site (read-only consent card)
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="preview-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && preview()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 font-mono text-[13px] text-fg focus:border-line-2 focus:outline-none"
          />
          <Button onClick={preview} busy={busy === "preview"}>
            Preview
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PREVIEW_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setUrl(s)} className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted hover:text-fg">
              {s.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          Refresh
        </Button>
        {msg && <span className={msg.tone === "ok" ? "text-[12px] text-pass" : "text-[12px] text-alarm"}>{msg.text}</span>}
      </div>
    </aside>
  );
}
