# Telltale

**Know who gets your data. Mark it. Make them answer for it.**

Personal AI agents now fill in forms for us: insurance quotes, sign-ups, bookings. Nobody reads who is on the other side. Telltale is a consent layer that sits between a personal agent and every website:

1. **Know.** Before the agent sends anything, Telltale identifies the recipient using California's official data broker registry: 603 companies, each answering yes/no under oath to questions such as *did you sell consumers' data to a generative-AI developer?* or *did you share it with law enforcement without a subpoena?* It adds a live check of whether the broker hides its own opt-out page from search engines. Ordinary sites pass silently. Registered brokers trigger a consent card that quotes their own filing and lets the person decide field by field.
2. **Mark.** Every disclosure carries a tag that still works: a per-site inbox, an `Attn K7Q2` address line, a variant middle initial. Mail still arrives, and each copy of the data now says where it came from. Each decision is recorded in an Ed25519-signed consent receipt (aligned with ISO/IEC TS 27560).
3. **Enforce.** Telltale sends the broker a CCPA opt-out of sale/sharing, which starts a 15-business-day legal deadline. If a tagged identifier is later contacted by anyone else, Telltale traces the path, attaches the evidence, and drafts a complaint to the California Privacy Protection Agency plus a deletion request to the new holder. The person reviews and files it; Telltale never files on its own.

## Why this matters now (2026)

- Since **Jan 1, 2026**, SB 361 requires brokers to disclose sales to GenAI developers, law enforcement, the federal government and foreign actors. These columns are new, and as far as we could find, no consumer tool uses them.
- Since **Aug 1, 2026**, brokers must process California's DROP deletion requests every 45 days, or pay $200 per request per day.
- Agentic browsers and form-filling agents now hand out personal data at machine speed with no human reading the fine print.

## What we found in the public data

- **Lead-generation sites that look like helpful quote tools are registered data brokers.** Example: `bestautoinsurance.com`, `medicareinfo.org` and `nationalhomequotes.com` are operated by Apollo Interactive, LLC. In its own filing it reports denying **13,539 of 15,040** deletion requests in 2024. `autotrader.com` is filed under Cox Automotive, which reports collecting precise geolocation, biometric data and citizenship data.
- **55 of 603 registered brokers' listed privacy-rights pages were hidden from search engines** in our sweep on 2026-10-22. **18 hide their own opt-out page**, among them Spokeo (`X-Robots-Tag: noindex` on its privacy-control page), Uplead, Datafy and RecordsFinder. Of the rest, 29 hide a privacy-policy page and 8 route requests to a vendor portal that blocks crawlers; those get softer wording. Every finding stores the verbatim tag, header or robots.txt rule as evidence (`pnpm daylight`).

## Privacy by design

- **The model never sees personal data.** The agent describes form fields by kind (`email`, `zip`…); the gate fills in the values itself. Claude only learns the outcome ("tagged", "withheld").
- **The vault stays on the device** (`.telltale/profile.json`, git-ignored).
- **Fields where the law expects the truth are never altered** (SSN, government ID, financial account, date of birth). The only choice is whether to disclose them at all.
- **The stage persona is synthetic.** In that mode Telltale never emails real companies and never submits contact details to a real business (dry run).
- **Simulations are labeled.** The "Day 47" leak replay uses a fictional sender on a reserved `.example` domain, and every artifact it produces is stamped SIMULATION.

## Data sources and their limitations

| Source | Used for | Limitations |
|---|---|---|
| [CPPA Data Broker Registry](https://cppa.ca.gov/data_broker_registry/) (2026 filings, 603 brokers, 77 columns) | Recipient identification, findings, request statistics | Brokers report this themselves and the State does not audit it. It covers only brokers registered in California, so an unlisted company is not proof of safety. Request counts are for calendar 2024, and a "denied" request may be one the broker could not verify. |
| Daylight sweep (live HTTP: meta robots, `X-Robots-Tag`, robots.txt) | "Hides its opt-out page" findings | It sees what an honest crawler sees. Pages served differently to Googlebot, or `noindex` added by JavaScript, are invisible to it. A blocked page may be bot protection rather than hiding. Vendor-hosted portals are flagged with softer wording. |
| Exa company search (optional) | Matching brand domains that brokers never listed | A name match can be wrong. Exa is only used when the domain itself isn't in the registry. |
| Leak attribution | Tracing who passed on a tagged identifier | A tag being contacted proves the data moved, not who sold it. The strong case is narrower: contact *after* the opt-out deadline. Shared marketing vendors can blur the trail. |

## Run it

```bash
pnpm install
npx playwright install chromium
cp .env.example .env.local   # add ANTHROPIC_API_KEY; the other keys are optional
pnpm dev                     # http://localhost:3000
pnpm test                    # vitest
pnpm daylight                # live sweep of all 603 brokers (~1 min)
```

| Integration | With key | Without key |
|---|---|---|
| Claude (`ANTHROPIC_API_KEY`) | Live agent, Claude Sonnet 5.5 (medium effort) with server-side refusal fallback | Consent preview and every other screen still work |
| AgentMail | One real inbox per recipient; incoming mail is attributed automatically | Plus-addressing on the person's email |
| Kernel | Hosted browser. Sites that crash Kernel's browser are remembered and reopened in the bundled Chromium | Local Chromium window |
| Exa | Company lookup for unknown brand domains | Registry domains and names only |
| Neon (`DATABASE_URL`) | Postgres | Embedded PGlite in `.telltale/db` |

## Deployed

Telltale runs at **https://telltale-app.fly.dev**: one always-on Fly.io machine in Chicago (`ord`), next to its Neon Postgres in AWS us-east-2. It is behind HTTP Basic auth (user `telltale`); only the fictional demo pages under `/demo/` are public, so a cloud browser can load them.

```bash
fly deploy --remote-only --ha=false     # builds the Docker image on Fly; no local Docker needed
fly secrets import < secrets.env         # ANTHROPIC_*, AGENTMAIL_API_KEY, KERNEL_API_KEY, EXA_API_KEY,
                                         # DATABASE_URL, TELLTALE_PASSWORD, TELLTALE_RECEIPT_KEY
```

- **One machine on purpose.** Pending consent cards and the live event stream live in that process's memory, so the app never scales out and never sleeps.
- **Receipt key as a secret.** The Ed25519 receipt key is supplied as `TELLTALE_RECEIPT_KEY` (base64 PEM), so receipts verify across restarts.
- **Every agent run streams screenshots to the console,** whichever browser it uses.
- **Cloud sweeps see more bot walls than home connections.** Each broker therefore keeps its last *conclusive* result (hidden or visible), and the board says how many results were carried over.

## Architecture

```
agent (Claude, tools: navigate/read_page/fill_form/set_field/click/finish)
   │  fill_form({fields: [{selector, kind}]})        ← no values, ever
   ▼
consent gate ── resolver (registry domains → brokers, Exa fallback)
   │           ├─ risk (filing findings + Daylight evidence + limitations)
   │           ├─ policy (send / tag / withhold per field; truthful fields never tagged)
   │           └─ consent card (SSE → UI → POST /api/consent/:id)
   ▼
vault → tagged values typed into the page → signed receipt → disclosures table
   ▼
inbound (AgentMail poll / manual report) → attribution → leak → opt-out deadline check
   ▼
CCPA opt-out · deletion request · CPPA complaint draft (person files)
```

Code map: `src/lib/{registry,resolver,risk,policy,vault,gate,receipts,leaks,letters,requests}.ts`, `src/lib/daylight/*`, `src/lib/agent/*`, `src/app/api/*`.

Not legal advice. Telltale drafts documents; people decide and file.
