"use client";

import type { ReactNode } from "react";
import { cx } from "./format";

/** A legal document rendered as an exhibit: off-white paper, serif, line breaks preserved. */
export function Paper({
  title,
  body,
  exhibit,
  stamp,
  className,
  compact,
  footer,
}: {
  title?: string;
  body: string;
  exhibit?: string;
  stamp?: string;
  className?: string;
  compact?: boolean;
  footer?: ReactNode;
}) {
  return (
    <article className={cx("paper relative overflow-hidden rounded-[3px]", compact ? "px-5 py-5" : "px-12 py-12", className)}>
      {exhibit && (
        <div className="absolute right-0 top-0 rounded-bl-md border-b border-l border-paper-line bg-[#ebe6da] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b6455]">
          {exhibit}
        </div>
      )}
      {stamp && (
        <div
          className="pointer-events-none absolute right-8 top-10 z-10 rotate-[-8deg] whitespace-pre-line select-none rounded-md border-[3px] border-[#c62828] px-4 py-2 bg-paper/40 text-center font-mono text-[20px] font-bold uppercase leading-tight tracking-[0.12em] text-[#c62828] opacity-80 mix-blend-multiply"
          aria-label={stamp}
        >
          {stamp}
        </div>
      )}
      {title && <h3 className={cx("font-serif font-semibold text-paper-ink", compact ? "mb-3 text-[16px]" : "mb-6 pr-64 text-[24px] leading-tight")}>{title}</h3>}
      <div className={cx("whitespace-pre-wrap font-serif text-paper-ink", compact ? "text-[13px] leading-[1.55]" : "text-[17px] leading-[1.7]")}>{body}</div>
      {footer && <div className="mt-6 border-t border-paper-line pt-4">{footer}</div>}
    </article>
  );
}
