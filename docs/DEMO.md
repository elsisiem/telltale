# Telltale: 2-minute demo

Rehearsed against the live site on 2026-10-22. The timings are measured.

| Measured on https://telltale-app.fly.dev | |
|---|---|
| Spokeo task: **Run** to consent card | 16 to 20 s (3 of 3 runs) |
| Real email to a tagged inbox: sent to traced as a leak | 4.5 s |
| Model cost per Spokeo run | about $0.04 |

## Ten minutes before

1. Sign in at **https://telltale-app.fly.dev/console** (user `telltale`, password from `.env.local`).
2. Press **d** to open the stage controls, then **Reset demo**.
3. Click the **Dental cleaning** preset, then **Run**. It finishes in about 13 seconds. Do not reset after this.
4. Open **Identities**, press **Copy** on the `bayview-dental.fly.dev` card, and on your phone write an email to that address. Subject: "We found your profile". Leave it unsent.
5. Open three tabs, in this order:
   - Tab 1: `/console?preset=people` (the Spokeo task is already filled in)
   - Tab 2: `/identities`
   - Tab 3: `/daylight` (it shows the latest sweep; there is no need to run one)
6. Zoom to 110% so the room can read it, and silence notifications.

Rehearsing again? Repeat steps 2 to 4. The dental inbox address changes on every run.

## The run

### 0:00 · Hook. Click **Run** first, then talk.

> "Personal agents fill in forms for us now, and they hand our details to whoever asks. Some of those sites are data brokers, and nothing on the page says so. One car insurance quote site I tested is run by a registered broker that denied 13,539 of 15,040 deletion requests last year.
> Right now my agent is signing me up for Spokeo, to see what it knows about me."

### 0:20 · Consent card. It appears by itself.

> "Before it types anything, Telltale stops it. Spokeo is registered with the State of California, and this is its own filing: in the past year it sold or shared consumer data with law enforcement without a subpoena or court order. So the email goes out tagged."

Click **Release with these choices**.

> "And Claude never saw my email. It asked for an email field, and Telltale typed the value."

### 0:40 · Identities (Tab 2)

> "This is what Telltale actually gave out. Every site gets its own version of me. Spokeo got an inbox nobody else has. The dental office I booked earlier got a different one. They are real inboxes, so mail still reaches me."

Send the email from your phone.

> "I just wrote to the dental office's address from my own phone. I'm not the dental office."

Within about 5 seconds the dental card turns orange and says **Leaked**, and **Leaks traced** goes to 1. Scroll so the dental card is on screen.

> "Traced. Real mail, five seconds."

### 1:05 · Enforce (Tab 1)

Press **d**, then **Replay day 47 (simulated)**.

> "Brokers take weeks, so this is day 47, with a fictional sender. Telltale already sent Spokeo an opt-out with the legal deadline of 15 business days. Now a lead company writes to the address only Spokeo had, after that deadline."

Click **Draft complaint**.

> "That's evidence: the signed consent receipt, the deadline, Spokeo's own filing, and a complaint draft for the state privacy agency. I decide whether to file it."

### 1:30 · Daylight (Tab 3)

> "We also check the opt-out page of every registered broker, all 603. Eighteen tell search engines to hide their own opt-out page."

Click **Spokeo, Inc.** in the list on the right.

> "Spokeo is one of them. That's the header, word for word."

### 1:45 · Close

> "Telltale. Know who gets your data, mark it, and make them answer for it. It runs on the state's own filings, and every card says what that data can't tell you."

### Running long?

- Cut the car insurance sentence from the hook (about 8 seconds).
- Cut Daylight and go straight to the close (about 15 seconds).
- Keep the consent card, Identities and the live email. They are the parts only Telltale does.

## If something breaks

| Problem | What to do |
|---|---|
| No consent card after 30 seconds | Say "live sites are slow", press **Run** again. Last resort: stage controls, **Preview a site**, `https://www.spokeo.com/signup` shows the same card read-only. Replay needs a release, so skip to Daylight. |
| The email takes longer than 10 seconds | "It's on its way." Move on to the replay. The dental card will flip while you talk. |
| The browser picture is too small | Click it, or press **Expand**. |
| AgentMail is down | Tagged emails fall back to plus-addressing and attribution still works. Skip the phone email. |
| No network for Daylight | `/daylight` shows the committed 2026-10-22 snapshot. |
| A judge asks what a mark means | **Guide** (or `?`) explains every mark on screen. |

Do not press **Draft complaint** on the dental leak. The dental office is fictional and is not a broker; the complaint flow is for the Spokeo replay.

## Questions judges may ask

- **"Isn't this just email aliases?"** Aliases tell you who leaked after the fact. Telltale decides before anything is typed, using the recipient's own legal filing, marks every field it lets through, and turns a leak after an opt-out deadline into a dated violation with evidence.
- **"How do you know they're a broker?"** It's their own registration with the California Privacy Protection Agency, quoted. Every card links the source and its limits: self-reported, California only, request counts from 2024.
- **"Couldn't a broker strip the tag?"** From a plus address, yes. Not from a dedicated inbox or an `Attn` line, because the address itself is the tag.
- **"Is tagging lying?"** No. Every tagged value works and reaches you. Fields the law expects to be true (SSN, government ID, financial account, date of birth) are never altered; the only choice is whether to share them.
- **"Why doesn't the model see the data?"** The agent describes fields by type and the gate types the values. The model provider is a recipient too.
- **"Did you just sign a fake person up for Spokeo?"** No. Maya is synthetic and dry run is on, so Telltale fills the form and stops before submitting. It never emails a real company in that mode.
- **"What does it cost to run?"** About four cents of model use for the Spokeo task, with prompt caching. Daylight checks all 603 brokers in under a minute.
- **"Who pays?"** People pay for proof, about $10 a month. Companies that buy data pay for Daylight as a compliance feed on every broker.
