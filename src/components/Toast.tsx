"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cx } from "./format";
import { Icon } from "./ui";

// Short confirmations for actions whose effect isn't otherwise obvious on screen.

type Tone = "ok" | "accent" | "error";
type Toast = { id: number; title: string; detail?: string; tone: Tone };

const Ctx = createContext<(title: string, opts?: { detail?: string; tone?: Tone }) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (title: string, opts: { detail?: string; tone?: Tone } = {}) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, title, detail: opts.detail, tone: opts.tone ?? "ok" }]);
      setTimeout(() => dismiss(id), opts.tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[min(440px,calc(100vw-40px))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "anim-rise pointer-events-auto flex items-start gap-3 border bg-surface px-3.5 py-2.5 shadow-[0_12px_32px_-16px_rgba(17,19,24,0.35)]",
              t.tone === "error" ? "border-accent" : t.tone === "accent" ? "border-accent" : "border-ink",
            )}
            role="status"
          >
            <span className={cx("mt-[5px] size-[7px] shrink-0", t.tone === "ok" ? "bg-ok" : "bg-accent")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] font-semibold text-ink">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-[12px] leading-snug text-muted">{t.detail}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="-mr-1 p-0.5 text-faint hover:text-ink" aria-label="Dismiss">
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
