import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicFacts } from "@/lib/facts";
import { Logo } from "./Logo";
import { ThemeButton } from "./Theme";

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="font-mono text-[14px] font-semibold text-ink">Telltale</span>
        </Link>
        <nav className="hidden items-center gap-5 font-mono text-[12px] text-muted md:flex" aria-label="Sections">
          <a href="#problem" className="hover:text-ink">Problem</a>
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#product" className="hover:text-ink">Product</a>
          <a href="#data" className="hover:text-ink">Data</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeButton />
          <Link href="/tour" className="hidden h-8 items-center border border-line-strong px-3 font-mono text-[12px] text-ink transition-colors hover:border-ink sm:inline-flex">
            Take the tour
          </Link>
          <Link href="/console" className="inline-flex h-8 items-center bg-ink px-3 font-mono text-[12px] font-medium text-on-ink transition-colors hover:bg-ink-hover">
            Open console
          </Link>
        </div>
      </div>
    </header>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-accent-ink">{children}</p>;
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[720px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-[28px] font-semibold leading-[1.15] text-ink md:text-[32px]">{title}</h2>
      {children && <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  );
}

/** A faithful miniature of the product's consent card, filled from the real filing. */
function HeroCard({ facts }: { facts: PublicFacts }) {
  const h = facts.hero;
  const rows: [string, "Send" | "Tag" | "Withhold"][] = [
    ["Full name", "Tag"],
    ["Email", "Tag"],
    ["Phone", "Withhold"],
    ["Street address", "Withhold"],
    ["ZIP code", "Send"],
  ];
  return (
    <div className="border border-ink bg-surface shadow-[0_24px_60px_-30px_rgba(17,19,24,0.45)]">
      <div className="flex h-9 items-center gap-2.5 bg-accent px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
        <span className="anim-blink size-[6px] bg-white" />
        Intercepted · awaiting your consent
      </div>
      <div className="border-b border-line px-5 py-4">
        <p className="label">Your agent wants to give personal data to</p>
        <p className="mt-1 font-mono text-[20px] font-semibold text-ink">{h?.host ?? "www.bestautoinsurance.com"}</p>
      </div>
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="label">Inspect</span>
          <span className="tag tag-accent">Registered data broker</span>
        </div>
        {h && (
          <p className="mt-2.5 text-[14px] leading-snug text-ink">
            In its filing with the State of California, <span className="font-semibold">{h.name}</span> reported denying{" "}
            <span className="font-mono font-semibold text-accent-ink">{fmt(h.denied)}</span> of {fmt(h.received)} deletion requests in {h.statsYear}.
          </p>
        )}
      </div>
      <ul className="px-5 py-2">
        {rows.map(([label, a]) => (
          <li key={label} className="flex items-center justify-between border-b border-line py-1.5 text-[13px] last:border-0">
            <span className="text-ink-2">{label}</span>
            <span className="inline-flex border border-line-strong font-mono text-[10.5px]">
              {(["Send", "Tag", "Withhold"] as const).map((x, i) => (
                <span key={x} className={`w-[64px] py-1 text-center ${i > 0 ? "border-l border-line-strong" : ""} ${x === a ? (x === "Tag" ? "bg-accent text-white" : x === "Send" ? "bg-ink text-on-ink" : "bg-well text-ink") : "text-faint"}`}>
                  {x}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-well px-5 py-2.5 font-mono text-[11px] text-muted">
        <span>signed receipt on release</span>
        <span>
          {rows.filter((r) => r[1] === "Send").length} sent · <span className="text-accent-ink">{rows.filter((r) => r[1] === "Tag").length} tagged</span> · {rows.filter((r) => r[1] === "Withhold").length} withheld
        </span>
      </div>
    </div>
  );
}

const PROBLEMS: [string, string][] = [
  ["Agents fill forms without reading them", "Personal agents now book appointments, request quotes and open accounts. They type your name, email and address into whatever form is in front of them, and nobody checks who is on the other side."],
  ["Helpful-looking sites are often data brokers", "Quote comparison and people-search sites collect contact details to resell them. Many are registered as data brokers in California, but nothing on the page tells you, and nothing tells your agent."],
  ["Once your data is out, you can't prove who sold it", "Every company that holds your email looks equally guilty. Opt-out and deletion rights exist, but without evidence a person has no way to show a broker ignored them."],
];

const STEPS: [string, string, string][] = [
  ["01", "Intercept", "When the agent reaches a form, it asks Telltale for field types, never values. The model provider never sees your details."],
  ["02", "Inspect", "Telltale identifies the recipient and checks it against the State of California's data broker registry and a live audit of each broker's opt-out page."],
  ["03", "Sanitize", "Ordinary sites pass without a prompt. For a registered broker you decide each field: send it, give a tagged value, or leave it out."],
  ["04", "Release", "Only what you approved is typed, under a tag unique to that site, with a signed consent receipt. Brokers receive an opt-out with a legal deadline."],
];

const CAPABILITIES: [string, string][] = [
  ["Recipient intelligence", "Each site is matched to its legal filing, including whether the company sold data to AI developers, shared it with law enforcement or collects precise location."],
  ["Field-level consent", "Decisions are made per field, not per site. Identifiers the law expects to be accurate, such as SSN or date of birth, are never altered."],
  ["Tagged identities", "Every disclosure gets a working inbox and a tag code. Mail still reaches you; every copy of your data now says where it came from."],
  ["Signed consent receipts", "Each release is recorded in an Ed25519-signed receipt aligned with ISO/IEC TS 27560, so you can show what you agreed to and when."],
  ["Deadlines and evidence", "Telltale sends the opt-out, tracks the 15-business-day deadline, and when a tag turns up somewhere else it assembles a dated complaint for the regulator."],
  ["Daylight", "A continuous audit of all registered brokers' opt-out pages. It records the exact tag, header or robots.txt rule that hides a page from search engines."],
];

export function Landing({ facts }: { facts: PublicFacts }) {
  const stats: [string, string, string][] = [
    [fmt(facts.brokers), "registered data brokers checked", `${facts.source.publisher}, ${facts.source.registrationYear} filings`],
    [fmt(facts.genAI), "say they sold or shared consumer data with an AI developer", "Self-reported in the same filings"],
    [fmt(facts.hidden), "privacy-rights pages hidden from search engines", `Daylight sweep, ${fmtDay(facts.sweptAt)}`],
    [fmt(facts.ownOptOut), "brokers hide their own opt-out page", "Verbatim tag or header recorded for each"],
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Nav />

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-16 md:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
          <div>
            <Eyebrow>Consent layer for personal agents</Eyebrow>
            <h1 className="mt-4 text-[38px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink md:text-[50px]">
              Your agent fills in forms for you. Telltale decides what it gives away.
            </h1>
            <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-ink-2">
              Telltale sits between a personal AI agent and every website it touches. Each recipient is checked against its own legal filing, every field you share is marked, and if your data turns up where it shouldn&apos;t, you have the evidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/tour" className="inline-flex h-11 items-center gap-2 bg-accent px-5 font-mono text-[13px] font-medium text-white transition-colors hover:bg-accent-ink">
                Take the tour
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" />
                </svg>
              </Link>
              <Link href="/console" className="inline-flex h-11 items-center border border-ink px-5 font-mono text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-on-ink">
                Open the console
              </Link>
            </div>
            <p className="mt-4 font-mono text-[11px] text-faint">The tour is open to everyone. The console runs a live agent and asks for the team password.</p>
          </div>
          <HeroCard facts={facts} />
        </div>
      </section>

      <section className="border-b border-line bg-surface">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          {stats.map(([n, label, source]) => (
            <div key={label} className="border-b border-line px-6 py-8 lg:border-b-0">
              <dd className="font-mono text-[34px] font-semibold leading-none tabular-nums text-ink">{n}</dd>
              <dt className="mt-3 text-[14px] leading-snug text-ink-2">{label}</dt>
              <p className="mt-2 font-mono text-[10.5px] text-faint">{source}</p>
            </div>
          ))}
        </dl>
      </section>

      <section id="problem" className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <SectionHead eyebrow="The problem" title="Agents now hand out personal data at machine speed. The other side is rarely who it appears to be." />
          <div className="mt-10 grid gap-px border border-line bg-line md:grid-cols-3">
            {PROBLEMS.map(([t, d]) => (
              <div key={t} className="bg-surface p-6">
                <h3 className="text-[15px] font-semibold leading-snug text-ink">{t}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
          {facts.hero && (
            <p className="mt-6 max-w-[760px] border-l-2 border-accent pl-4 text-[14.5px] leading-relaxed text-ink-2">
              <span className="font-mono text-ink">{facts.hero.host}</span> compares car insurance quotes. Its operator, {facts.hero.name}, is a registered data broker that reported denying {fmt(facts.hero.denied)} of {fmt(facts.hero.received)} deletion requests in {facts.hero.statsYear}.
            </p>
          )}
        </div>
      </section>

      <section id="how" className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead eyebrow="How it works" title="Every disclosure passes through four steps.">
              The agent does the browsing. Telltale owns the moment your data leaves.
            </SectionHead>
            <Link href="/tour" className="inline-flex h-9 items-center border border-line-strong px-3.5 font-mono text-[12px] text-ink transition-colors hover:border-ink">
              See it step by step
            </Link>
          </div>
          <ol className="mt-10 grid gap-px border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="bg-canvas p-6">
                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-[11px] text-faint">{n}</span>
                  <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink">{t}</span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="product" className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <SectionHead eyebrow="Product" title="Built to produce proof, not just aliases.">
            Email aliases tell you which site leaked an address. Telltale decides before anything is shared, marks every field, and turns a leak into a dated violation of a request the broker was legally required to honour.
          </SectionHead>
          <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(([t, d]) => (
              <div key={t} className="bg-surface p-6">
                <h3 className="font-mono text-[13px] font-semibold text-ink">{t}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-px border border-line bg-line md:grid-cols-2">
            <div className="bg-surface p-6">
              <p className="label">For people</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink">A consent layer for the agent you already use, with tagged identities, receipts and enforcement handled for you.</p>
            </div>
            <div className="bg-surface p-6">
              <p className="label">For teams that buy or share data</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink">Daylight as a compliance feed: which vendors hide their opt-out pages, never registered, or contradict their own filings.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="data" className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-20 lg:grid-cols-2">
          <SectionHead eyebrow="Public record" title="Grounded in filings companies make under oath, with their limits stated.">
            Since 2026, California requires data brokers to disclose whether they sold data to AI developers, law enforcement, the federal government or foreign actors. Telltale reads those answers directly from the state registry.
          </SectionHead>
          <ul className="flex flex-col border-t border-line">
            {[
              "Registry answers are self-reported by each broker and not audited by the State.",
              "Only brokers registered in California are listed; an unlisted company is not proof of safety.",
              `Request counts cover ${facts.source.statsYear}; a denied request may be one the broker could not verify.`,
              "Daylight sees what an honest crawler sees. A blocked page may be bot protection, not hiding.",
              "A tag being contacted proves the data moved, not on its own who sold it. The strong case is contact after the opt-out deadline.",
            ].map((l) => (
              <li key={l} className="flex gap-3 border-b border-line py-3 text-[14px] leading-snug text-ink-2">
                <span className="mt-[7px] size-[5px] shrink-0 bg-ink-2" aria-hidden />
                {l}
              </li>
            ))}
            <li className="pt-3 font-mono text-[11px] text-faint">
              Source:{" "}
              <a href={facts.source.url} className="underline decoration-line-strong underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
                {facts.source.publisher} · Data Broker Registry
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="text-[24px] font-semibold text-ink">Follow one disclosure from request to evidence.</h2>
            <p className="mt-2 text-[15px] text-ink-2">Seven steps, about two minutes, using the real filing for a real quote site.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/tour" className="inline-flex h-11 items-center bg-accent px-5 font-mono text-[13px] font-medium text-white transition-colors hover:bg-accent-ink">
              Take the tour
            </Link>
            <Link href="/console" className="inline-flex h-11 items-center border border-ink px-5 font-mono text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-on-ink">
              Open the console
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-6 font-mono text-[11px] text-faint">
          <span className="flex items-center gap-2">
            <Logo size={16} /> Telltale
          </span>
          <span>Not legal advice. Telltale drafts documents; people decide and file.</span>
        </div>
      </footer>
    </div>
  );
}
