"use client";

import type { ReactNode } from "react";
import { cx } from "./format";

/** A legal document rendered as an exhibit: a paper sheet, serif, line breaks preserved. */
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
    <article className={cx("paper overflow-hidden", compact ? "px-4 py-4" : "px-12 py-12", className)}>
      {exhibit && (
        <div className="absolute right-0 top-0 border-b border-l border-paper-line bg-[#f6f2e8] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b6455]">
          {exhibit}
        </div>
      )}
      {stamp && (
        <div
          className="pointer-events-none absolute right-10 top-12 z-10 rotate-[-6deg] select-none whitespace-pre-line border-2 border-accent px-4 py-2 text-center font-mono text-[17px] font-bold uppercase leading-tight tracking-[0.14em] text-accent-ink opacity-85 mix-blend-multiply"
          aria-label={stamp}
        >
          {stamp}
        </div>
      )}
      {title && <h3 className={cx("font-serif font-semibold text-paper-ink", compact ? "mb-3 text-[14px]" : "mb-6 pr-64 text-[22px] leading-tight")}>{title}</h3>}
      <div className={cx("whitespace-pre-wrap font-serif text-paper-ink", compact ? "text-[12.5px] leading-[1.55]" : "text-[16px] leading-[1.7]")}>{body}</div>
      {footer && <div className="mt-6 border-t border-paper-line pt-4">{footer}</div>}
    </article>
  );
}
