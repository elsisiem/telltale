// Captures the stage screens for visual review: pnpm tsx scripts/screenshots.ts [baseUrl]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "scripts", "screens");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const state = (await (await fetch(`${BASE}/api/state`)).json()) as { leaks: { id: string }[] };
  const browser = await chromium.launch();
  const shot = async (name: string, url: string, size: { width: number; height: number }, act?: (p: import("playwright").Page) => Promise<void>) => {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    if (act) await act(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("saved", name);
    await page.close();
  };

  await shot("console-1440", "/", { width: 1440, height: 900 });
  await shot("console-1280", "/", { width: 1280, height: 720 });
  const openPreview = (url: string) => async (p: import("playwright").Page) => {
    await p.keyboard.press("d");
    await p.fill("#preview-url", url);
    await p.getByRole("button", { name: "Preview", exact: true }).click();
    await p.waitForSelector("#consent-title");
    await p.waitForTimeout(600);
  };
  await shot("consent-broker-1440", "/", { width: 1440, height: 900 }, openPreview("https://rocketreach.co/signup"));
  await shot("consent-broker-1280", "/", { width: 1280, height: 720 }, openPreview("https://rocketreach.co/signup"));
  await shot("consent-ordinary-1440", "/", { width: 1440, height: 900 }, openPreview("https://www.bayviewdental.example/book"));
  await shot("stage-panel", "/", { width: 1440, height: 900 }, async (p) => {
    await p.keyboard.press("d");
    await p.waitForTimeout(400);
  });
  await shot("ledger-verified", "/", { width: 1440, height: 900 }, async (p) => {
    await p.getByRole("button", { name: "Verify receipt" }).first().click();
    await p.waitForTimeout(800);
  });
  if (state.leaks[0]) await shot("evidence-1440", `/evidence/${state.leaks[0].id}`, { width: 1440, height: 900 });
  await shot("daylight-1440", "/daylight", { width: 1440, height: 900 });

  // Review-only mocks (request interception, nothing written server-side):
  // a live pending consent card, and a populated Daylight board.
  const preview = await (await fetch(`${BASE}/api/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://rocketreach.co/signup" }) })).json();
  const pending = { ...preview, id: "mock-pending", createdAt: new Date().toISOString(), status: "pending", request: { ...preview.request, purpose: "Free contact lookup" } };
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/api/state", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      await route.fulfill({ response: res, json: { ...json, pending: [pending] } });
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#consent-title");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "consent-live-1440.png") });
    console.log("saved consent-live-1440");
    await page.close();
  }
  {
    const full = (await (await fetch(`${BASE}/api/state`)).json()) as { brokerNames: Record<string, string> };
    const statuses = ["visible", "visible", "visible", "visible", "visible", "visible", "hidden", "blocked", "unreachable"] as const;
    const ids = Object.keys(full.brokerNames);
    const results = ids.slice(0, 410).map((id, i) => ({
      brokerId: id,
      name: full.brokerNames[id],
      url: `https://example.invalid/${id}/privacy`,
      status: statuses[(i * 7 + id.length) % statuses.length],
      signals: [{ type: "meta", detail: '<meta name="robots" content="noindex, nofollow">' }],
    }));
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route("**/api/daylight", (route) =>
      route.fulfill({ json: { scan: { id: "mock", startedAt: new Date().toISOString(), finishedAt: null, summary: { total: ids.length, counts: {}, hidden: [] } }, results } }),
    );
    await page.goto(`${BASE}/daylight`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const hiddenIdx = results.findIndex((r) => r.status === "hidden");
    await page.locator("main button[aria-label]").nth(hiddenIdx).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "daylight-mock-populated.png") });
    console.log("saved daylight-mock-populated");
    await page.close();
  }
  if (process.argv.includes("--interact")) {
    // Exercises the real endpoints (writes rows): request deletion, then draft complaint → evidence page.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Request deletion" }).click();
    await page.getByText("Deletion request ready").waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "console-after-deletion.png") });
    console.log("saved console-after-deletion");
    await page.getByRole("button", { name: /Draft complaint/ }).click();
    await page.waitForURL(/\/evidence\//);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "evidence-from-console.png") });
    console.log("saved evidence-from-console");
    await page.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
