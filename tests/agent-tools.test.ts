import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { execute } from "@/lib/agent/run";
import { snapshot, type BrowserSession } from "@/lib/agent/browser";
import { _setAliasProvider } from "@/lib/aliases";

// Drives the agent's tools against a real browser and a local form, without calling the model.

const FORM = `<!doctype html><html><head><title>Bayview Dental</title><meta property="og:site_name" content="Bayview Dental"></head>
<body><h1>Book a cleaning</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='1'">
<label for="n">Full name</label><input id="n" name="name" required>
<label>Email <input name="email" type="email" required></label>
<label for="z">ZIP</label><input id="z" name="zip">
<label for="v">Reason for visit</label><select id="v"><option>Cleaning</option><option>Checkup</option></select>
<button type="submit">Request appointment</button></form></body></html>`;

let server: http.Server;
let base = "";
let browser: Browser;
let session: BrowserSession;

beforeAll(async () => {
  _setAliasProvider({ name: "test", create: async (code) => `maya.${code.toLowerCase()}@agentmail.to` });
  server = http.createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end(FORM));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  session = { page, liveViewUrl: null, kind: "local", recover: async () => {}, close: async () => {} };
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe("agent tools", () => {
  it("lets the gate type values the model never sees, and guards the submit button for the demo persona", async () => {
    await execute(session, "run-tools", "navigate", { url: `${base}/book` });
    const snap = await snapshot(session.page);
    const sel = (label: string) => snap.fields.find((f) => f.label.startsWith(label))!.selector;
    expect(snap.siteName).toBe("Bayview Dental");

    const out = await execute(session, "run-tools", "fill_form", {
      purpose: "Book a cleaning",
      fields: [
        { selector: sel("Full name"), kind: "fullName", label: "Full name", required: true },
        { selector: sel("Email"), kind: "email", label: "Email", required: true },
        { selector: sel("ZIP"), kind: "zip", label: "ZIP", required: false },
      ],
    });
    expect(out.text).toContain("Email: filled with a tagged value");
    expect(out.text).not.toMatch(/Maya|Okafor|agentmail|94110/);
    expect(await session.page.inputValue(sel("Full name"))).toBe("Maya R Okafor");
    expect(await session.page.inputValue(sel("Email"))).toMatch(/^maya\.[a-z2-9]{4}@agentmail\.to$/);

    const refused = await execute(session, "run-tools", "set_field", { selector: sel("ZIP"), value: "maya@example.com" });
    expect(refused.text).toMatch(/^Refused/);
    await execute(session, "run-tools", "set_field", { selector: sel("Reason"), value: "Checkup" });

    const button = snap.buttons.find((b) => b.text === "Request appointment")!.selector;
    const click = await execute(session, "run-tools", "click", { selector: button });
    expect(click.text).toMatch(/^Dry run/);
    expect(await session.page.evaluate("document.body.dataset.submitted")).toBeUndefined();
  }, 60_000);
});
