"use client";

import { useEffect, type ReactNode } from "react";
import { cx, hostOf } from "./format";
import { Icon, Tag } from "./ui";

/** Full-size view of the agent's browser, with its latest activity alongside. */
export function BrowserViewer({
  frame,
  liveViewUrl,
  running,
  activity,
  onClose,
}: {
  frame: { data: string; url: string } | null;
  liveViewUrl: string | null;
  running: boolean;
  activity: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Agent browser">
      <div className="anim-rise flex h-full max-h-[920px] w-full max-w-[1600px] flex-col border border-ink bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
          <span className="label text-ink">Agent browser</span>
          <span className="min-w-0 flex-1 truncate border border-line bg-well px-2.5 py-1 font-mono text-[12px] text-ink-2">{frame?.url ?? (liveViewUrl ? "hosted browser" : "—")}</span>
          {running ? (
            <Tag tone="accent">
              <span className="anim-blink size-[5px] bg-accent" aria-hidden />
              Live
            </Tag>
          ) : (
            <Tag tone="muted">Last frame</Tag>
          )}
          <button onClick={onClose} className="p-1 text-muted hover:text-ink" aria-label="Close expanded browser">
            <Icon name="close" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-0 items-start justify-center overflow-auto bg-well p-4">
            {frame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/jpeg;base64,${frame.data}`} alt={`What the agent's browser shows on ${hostOf(frame.url)}`} className="h-auto max-h-full w-auto max-w-full border border-line-strong bg-surface" />
            ) : liveViewUrl ? (
              <iframe src={liveViewUrl} className="h-full w-full border border-line-strong" allow="autoplay; clipboard-read; clipboard-write" title="Agent browser live view" />
            ) : (
              <p className="self-center font-mono text-[12px] text-muted">The browser view appears once the agent opens a page.</p>
            )}
          </div>
          <aside className="flex min-h-0 flex-col border-t border-line lg:border-l lg:border-t-0">
            <div className="flex h-8 shrink-0 items-center border-b border-line px-4">
              <span className="label">Activity</span>
            </div>
            <div className={cx("min-h-0 flex-1 overflow-y-auto py-1")}>{activity}</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
