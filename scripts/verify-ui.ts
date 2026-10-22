// Walks the deployed UI and captures each new feature: npx tsx scripts/verify-ui.ts [baseUrl]
import fs from "node:fs";
import { chromium, type Page } from "playwright";

const BASE = process.argv[2] ?? "https://telltale-app.fly.dev";
const pw = fs.readFileSync(".env.local", "utf8").match(/^TELLTALE_PASSWORD=(.*)$/m)?.[1].trim();
const out = (n: string) => `scripts/screens/verify-${n}.png`;

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log("ok  ", name);
  } catch (e) {
    console.log("FAIL", name, (e as Error).message.split("\n")[0]);
  }
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...(pw ? { httpCredentials: { username: "telltale", password: pw } } : {}) });
  const p: Page = await ctx.newPage();
  await p.goto(`${BASE}/console`, { waitUntil: "networkidle" });

  await step("run agent and expand the browser view", async () => {
    await p.getByRole("button", { name: "Dental cleaning" }).click();
    await p.getByRole("button", { name: /Run agent/ }).click();
    await p.getByRole("button", { name: "Expand the browser view" }).first().waitFor({ timeout: 60_000 });
    await p.waitForTimeout(2500);
    await p.getByRole("button", { name: "Expand the browser view" }).first().click();
    await p.waitForTimeout(800);
    await p.screenshot({ path: out("expanded") });
    await p.keyboard.press("Escape");
    await p.getByText("Model use:").first().waitFor({ timeout: 90_000 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: out("after-run") });
  });

  await step("inspect an older disclosure in the pipeline", async () => {
    const inspect = p.getByRole("button", { name: "Inspect" });
    if ((await inspect.count()) > 0) await inspect.last().click();
    await p.waitForTimeout(800);
    await p.screenshot({ path: out("inspect") });
  });

  await step("guide drawer", async () => {
    await p.getByRole("button", { name: /Guide/ }).click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: out("guide") });
    await p.keyboard.press("Escape");
  });

  await step("sweep keeps running across pages", async () => {
    await p.goto(`${BASE}/daylight`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /Run sweep/ }).click();
    await p.waitForTimeout(6000);
    await p.goto(`${BASE}/console`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: out("sweep-console") });
    await p.goto(`${BASE}/daylight`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: out("sweep-resumed") });
  });

  await step("profile page", async () => {
    await p.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out("profile") });
  });

  await b.close();
})();
