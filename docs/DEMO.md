# Telltale: 3-minute demo script

Setup before going on stage:
- Open **https://telltale-app.fly.dev/console** and sign in (user `telltale`, password from `.env.local`). Press **d** once to confirm the stage panel opens.
- **Opening option:** start on **https://telltale-app.fly.dev/tour** (public, no password) and let it play the seven steps while you give the hook. Its last step, **Run it live**, opens the console with the car-insurance task already filled in.
- Press **Reset demo** in the stage panel. This clears earlier runs and frees Telltale's own AgentMail inboxes.
- **Warm-up:** run the car-insurance preset once before going on stage. If Kernel's browser crashes on that site, Telltale remembers it and goes straight to its bundled browser next time, which saves about 15 seconds.
- Have `/daylight` open in a second tab. A sweep keeps running if you switch tabs or pages; the top bar shows its progress.
- The agent's browser shows in the console as a live screenshot stream. Press **Expand** on it, or click the picture, to show the browser full-size for the room.
- **Guide** (or `?`) opens a one-page explanation of the pipeline and every mark on screen. It's a good backup if a judge asks what a tag means.
- In the ledger, **Inspect** on any entry shows that disclosure in the pipeline; **back to latest** returns to the live view.

## 0:00–0:20 · The hook

> "Personal agents now fill in forms for us. I asked mine to get me car insurance quotes. It went to bestautoinsurance.com and was about to hand over my name, email, phone and address.
> That site is run by a **registered data broker**. In its own sworn filing with the State of California, the operator says it **denied 13,539 of 15,040 deletion requests** last year. My agent had no idea. Neither did I."

## 0:20–0:50 · Daylight: the shock, from live public data

On `/daylight`, press **Run sweep**. 603 tiles fill in as the sweep runs, which takes about a minute. Keep talking while it runs; if needed, the committed snapshot is already on screen.

> "Every California data broker must list a page where you can opt out. We check all 603 of them, live. **55 list a privacy page that search engines are told to ignore, and 18 do it to their own opt-out page.** Spokeo sends `X-Robots-Tag: noindex` on its privacy-control page." (Click the Spokeo tile to show the verbatim header.)

## 0:50–2:00 · Console: know and mark

1. Preset **"Book a dental cleaning…"** → Run.
   > "An ordinary site. Telltale stays out of the way. Notice the email is a tagged alias." (Point at the green edge and the amber tag code.)
2. Preset **"Get car insurance quotes…"** → Run. The agent opens bestautoinsurance.com and the **consent card** takes over the screen.
   > "Before a single field is typed: registered broker, quoted from its own filing. And I choose per field. Email gets a tagged alias, phone is withheld, ZIP only."
   Press **Release with these choices.**
3. In the ledger, press **Verify receipt** and get "Signature valid · Ed25519".
   > "Two things you can't see. Claude never saw Maya's details: it asked for an email field, and Telltale filled it. And because Maya is a synthetic persona, Telltale stopped before submitting to a real company."

## 2:00–2:40 · Enforce

1. Press **Send opt-out** on the broker card. The deadline appears: 15 business days.
   > "I keep the service, but I've told them they may not sell it."
2. Stage panel (**d**) → **Replay day 47 (simulated)**. An orange dashed edge draws out to Northgate Lead Exchange.
   > "Day 47, simulated with a fictional sender. Someone writes to the tagged address that only this broker ever received, after the opt-out deadline. That's no longer a hunch. That's evidence."
3. **Draft complaint** opens the exhibit: timeline, signed receipt, deadline, the broker's own filing, stamped SIMULATION.

**Optional live moment with a real email (about 20 seconds):** read out the dental office's tagged address from the ledger (`maya.xxxx@agentmail.to`) and ask a judge to email it from their phone.
> "That address went to exactly one place: a dental office. You're not the dental office."

Within about 10 seconds the console shows a red leak edge to the judge's email domain. This is real mail, attributed live. The dental office is fictional, so no real company is implicated.

## 2:40–3:00 · Close

> "Telltale turns the state's own broker filings into a consent layer for agents, and turns your data into evidence when the filings are broken.
> People pay for proof, not aliases: about $10 a month. Companies that buy data pay for Daylight, the compliance feed on every broker.
> Every card says what the data can't tell you. It's self-reported, California only, and the request counts are from 2024."

## If something breaks

| Problem | Fallback |
|---|---|
| The agent stalls on a live site | Stage panel → **Preview a site** → `https://www.bestautoinsurance.com/quote` shows the same consent card read-only. Then run the replay. |
| No network for the sweep | `/daylight` shows the committed 2026-10-22 snapshot automatically. |
| The model declines or times out | Server-side refusal fallback is on. Otherwise use Preview. |
| AgentMail is down | Aliases fall back to plus-addressing, and attribution still works. |

## Questions judges may ask

- **"Isn't this just email aliases?"** Aliases tell you who leaked. Telltale decides *before* disclosure using the recipient's legal filing, tags every field, and turns a leak into a dated violation of a CCPA opt-out.
- **"How do you know they're a broker?"** It's their own registration with the CPPA, quoted. We show the source and its limitations on every card.
- **"Couldn't a broker strip the tag?"** Plus-addressing, yes. A dedicated AgentMail inbox and an `Attn` line, no: the address *is* the tag.
- **"Is tagging lying?"** No. Every tagged value works and reaches you. Fields where the law expects the truth (SSN, government ID, financial account, date of birth) are never altered.
- **"Why didn't the model see the data?"** The agent describes fields by kind, and the gate types the values. That matters beyond brokers: the model provider is a recipient too.
