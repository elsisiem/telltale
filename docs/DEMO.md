# Telltale: 2-minute demo

**The story:** my agent was about to hand my data to a data broker. Telltale stopped it, made the broker a legal promise in writing, and caught it breaking that promise.

**Hit these three points. None of them is something an alias can do.**

1. **It stops the agent before anything is shared**, using the company's own filing with the State of California.
2. **The AI never sees your data.** The agent asks for "an email field" and Telltale types the value.
3. **A leak becomes a legal case**: a signed receipt, an opt-out with a legal deadline, and a complaint draft for the regulator.

The tagged email is only how the leak gets caught. Mention it in one line and move on.

Rehearsed against the live site on 2026-10-22: the consent card appears 16 to 20 seconds after **Run** (3 of 3 runs), and a run costs about $0.04.

## Setup (2 minutes before)

1. Sign in at **https://telltale-app.fly.dev/console** (user `telltale`, password from `.env.local`).
2. Press **d**, then **Reset demo**. Close the panel with **d**.
3. Open two tabs:
   - Tab 1: `/console?preset=people` (the Spokeo task is already filled in)
   - Tab 2: `/daylight`
4. Zoom to 110% and silence notifications.

## The script

### 1 · The problem (0:00). Click **Run** first, then talk.

> "Personal agents fill in forms for us now. They hand our details to whoever asks, and some of those sites are data brokers: companies whose business is selling data about you. Nothing on the page tells you. Right now my agent is signing me up for Spokeo."

### 2 · Telltale stops it (0:20). The card appears by itself.

> "Telltale stopped it before a single letter was typed. Spokeo is a registered data broker, and this is from its own filing with California: it shared people's data with law enforcement without a subpoena. So I decide what goes through. The email goes, but marked."

Click **Release with these choices**.

> "And Claude never saw my email. The agent asked for an email field, and Telltale typed the value."

### 3 · Make them promise (0:45). In the ledger, on the Spokeo entry:

Click **Send opt-out**, then **read letter**.

> "This is what an alias can't do. Telltale writes Spokeo a legal opt-out: you may not sell or share this. California gives them 15 business days, and the deadline is tracked right here. That marked email is how we'll know if they don't comply."

### 4 · Catch them (1:05)

Press **d**, then **Replay day 47 (simulated)**. Close the panel.

> "Day 47, simulated with a fictional company. The address only Spokeo ever had just reached a lead seller, after the deadline. That's not spam any more. It's a broken legal request with a date on it."

Click **Draft complaint**.

> "Telltale builds the case: what Spokeo got, when it was told not to sell it, its own filing, and a complaint ready for the state regulator. I decide whether to file."

### 5 · At scale (1:35). Tab 2, Daylight.

> "And we don't wait for leaks. Daylight checks every registered broker in California, all 603, in about half a minute. Eighteen hide their own opt-out page from search engines."

Click **Spokeo, Inc.** in the list on the right.

> "Spokeo is one of them. That's the header, word for word."

### 6 · Close (1:50)

> "Agents are going to fill in millions of forms for us. Telltale is the consent layer they're missing: it knows who's a broker, asks you first, and turns your data into evidence."

### Running long?

- Skip **read letter** in step 3 (about 5 seconds).
- Skip Daylight and go straight to the close (about 15 seconds).
- Never cut steps 2 and 4. They are the product.

## If something breaks

| Problem | What to do |
|---|---|
| No consent card after 30 seconds | "Live sites are slow." Press **Run** again. If it fails twice: press **d**, **Preview a site**, `https://www.spokeo.com/signup` shows the same card read-only. Replay needs a release, so then go to Daylight. |
| Replay button is greyed out | The Spokeo card was not released. Its hint says what to run. |
| The browser picture is too small | Click it, or press **Expand**. |
| No network for Daylight | `/daylight` shows the committed 2026-10-22 snapshot. |
| A judge asks what a mark means | **Guide** (or `?`) explains everything on screen. |

## Proof it's live (for questions)

If a judge asks "is any of this real?", this takes 15 seconds. Prepare it during setup: after **Reset demo**, click the **Dental cleaning** preset and **Run**, then open **Identities** and **Copy** the `bayview-dental.fly.dev` inbox. Draft an email to it on your phone.

> "That address went to one place only: a fictional dental office. I'm emailing it from my own phone now."

Within about 5 seconds the dental card on **Identities** says **Leaked**. Real mail, traced live, measured at 4.5 seconds. Do not press **Draft complaint** on the dental leak; the office is not a broker.

## Questions judges may ask

- **"Isn't this just email aliases?"** "Aliases tell you who leaked, after it's too late, and only for email. Telltale checks the company's legal filing before anything is typed, marks your name and address too, and sends the opt-out. So if your data shows up after the deadline, you don't have a hunch. You have a dated record of a broken rule."
- **"How do you know they're a broker?"** It's their own registration with the California Privacy Protection Agency, quoted. Every card shows the source and its limits: self-reported, California only, request counts from 2024.
- **"Couldn't a broker strip the tag?"** From a plus address, yes. Not from a dedicated inbox or an `Attn` line, because the address itself is the tag.
- **"Is tagging lying?"** No. Every tagged value works and reaches you. Fields the law expects to be true (SSN, government ID, financial account, date of birth) are never altered; the only choice is whether to share them.
- **"Why doesn't the model see the data?"** The agent describes fields by type and the gate types the values. The model provider is a recipient too.
- **"Did you just sign a fake person up for Spokeo?"** No. Maya is synthetic and dry run is on, so Telltale fills the form and stops before submitting. In that mode it never emails a real company; the opt-out is prepared, not sent.
- **"Does a tag being contacted prove Spokeo sold it?"** It proves the data moved. The strong case is first contact after the opt-out deadline, which is why Telltale records the deadline.
- **"Can I see what each site got?"** Yes, the **Identities** page: your real details next to what each site received, its inbox and its mail.
- **"Who pays?"** People pay about $10 a month for proof: receipts, deadlines and evidence. Companies building personal agents license the consent layer, because their agent handing a user's data to a broker is their problem too. Daylight stays free and public. Pricing is a starting point, not tested.
- **"What does it cost to run?"** About four cents of model use for the Spokeo task, with prompt caching.
