// Captures the landing page, every tour step and dark-mode screens: npx tsx scripts/shots-public.ts <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:3200";
(async () => {
  const b = await chromium.launch();
  const page = async (theme: "light" | "dark", w = 1440, h = 900) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript((t) => localStorage.setItem("telltale:theme", t), theme);
    return ctx.newPage();
  };
  const p = await page("light");
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.screenshot({ path: "scripts/screens/pub-landing.png" });
  await p.screenshot({ path: "scripts/screens/pub-landing-full.png", fullPage: true });
  await p.goto(BASE + "/tour", { waitUntil: "networkidle" });
  await p.keyboard.press(" "); // pause autoplay
  for (let i = 0; i < 7; i++) {
    await p.locator("ol button").nth(i).click();
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `scripts/screens/pub-tour-${i + 1}.png` });
  }
  const d = await page("dark");
  for (const [name, path] of [["landing", "/"], ["console", "/console"], ["daylight", "/daylight"], ["tour", "/tour"]] as const) {
    await d.goto(BASE + path, { waitUntil: "networkidle" });
    await d.waitForTimeout(1500);
    await d.screenshot({ path: `scripts/screens/dark-${name}.png` });
  }
  await b.close();
  console.log("done");
})();
