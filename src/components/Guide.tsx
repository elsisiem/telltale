"use client";

import { useEffect, type ReactNode } from "react";
import { Icon, Tag, TagCode } from "./ui";

// What Telltale does and what every mark on screen means. Opened from the top bar or with "?".

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="label mb-2.5 text-ink">{title}</h3>
      {children}
    </section>
  );
}

const STEPS: [string, string, string][] = [
  ["01", "Intercept", "Your agent reaches a form and asks Telltale for field types (email, ZIP…). The model never sees your values."],
  ["02", "Inspect", "Telltale identifies who receives the data and checks the State of California's data broker registry, plus the live Daylight sweep."],
  ["03", "Sanitize", "Ordinary sites pass silently. For a registered broker you choose each field: send it, tag it, or withhold it."],
  ["04", "Release", "Only approved values are typed, under a tag, with a signed consent receipt. Brokers get an opt-out; leaks get evidence."],
];

const SHORTCUTS: [string, string][] = [
  ["D", "Stage controls"],
  ["[", "Collapse or expand the sidebar"],
  ["?", "This guide"],
  ["Ctrl ↵", "Run the agent from the task box"],
  ["Esc", "Close a panel, preview or expanded view"],
];

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="anim-fade fixed inset-0 z-50 flex justify-end bg-scrim" onClick={onClose}>
      <aside className="anim-rise flex h-full w-[440px] max-w-full flex-col border-l border-ink bg-surface" onClick={(e) => e.stopPropagation()} aria-label="How Telltale works">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="font-mono text-[13px] font-semibold text-ink">How Telltale works</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-ink" aria-label="Close guide">
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="The pipeline">
            <ol className="flex flex-col gap-3">
              {STEPS.map(([n, t, d]) => (
                <li key={n} className="grid grid-cols-[28px_1fr] gap-3">
                  <span className="flex size-7 items-center justify-center border border-ink font-mono text-[11px] font-semibold">{n}</span>
                  <div>
                    <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">{t}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="What the marks mean">
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 text-[13px] text-ink-2">
              <dt>
                <TagCode code="K7Q2" accent />
              </dt>
              <dd>A tag. Each disclosure gets one, so any copy of your data says where it came from. The Identities page lists every site&apos;s version of you.</dd>
              <dt>
                <Tag tone="accent">Tagged</Tag>
              </dt>
              <dd>A working value marked for one site: its own inbox, an &ldquo;Attn K7Q2&rdquo; address line, a variant middle initial.</dd>
              <dt>
                <Tag>Sent</Tag>
              </dt>
              <dd>Your real value was typed.</dd>
              <dt>
                <Tag tone="muted">Withheld</Tag>
              </dt>
              <dd>Left blank on purpose.</dd>
              <dt>
                <Tag tone="accent">Risk</Tag>
              </dt>
              <dd>The recipient is a registered data broker. The reasons quote its own filing.</dd>
              <dt>
                <Tag tone="accent">Simulated</Tag>
              </dt>
              <dd>Replayed for the demo from a fictional sender. Never a real event.</dd>
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">Orange always means intercepted, risky or waiting for you. Everything else is neutral.</p>
          </Section>

          <Section title="What the data can't tell you">
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-snug text-ink-2">
              <li>Registry answers are self-reported by each broker and not audited by the State.</li>
              <li>Only brokers registered in California are listed; an unlisted company is not proof of safety.</li>
              <li>Request counts are for 2024; a denied request may be one the broker couldn&apos;t verify.</li>
              <li>A tag being contacted proves the data moved, not on its own who sold it. The strong case is contact after the opt-out deadline.</li>
            </ul>
          </Section>

          <Section title="Keyboard">
            <dl className="grid grid-cols-[72px_1fr] gap-y-2 text-[13px] text-ink-2">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="contents">
                  <dt>
                    <span className="kbd">{k}</span>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <p className="px-5 py-4 font-mono text-[11px] text-faint">Not legal advice. Telltale drafts documents; people decide and file.</p>
        </div>
      </aside>
    </div>
  );
}
