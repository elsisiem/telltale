// Captures the redesigned screens for review: npx tsx scripts/shots-ui.ts <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:3200";
(async () => {
  const b = await chromium.launch();
  const leakId = ((await (await fetch(`${BASE}/api/state`)).json()) as { leaks: { id: string }[] }).leaks.at(-1)?.id;
  const shot = async (name: string, path: string, w: number, h: number, act?: (p: import("playwright").Page) => Promise<void>) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(1600);
    if (act) await act(p);
    await p.screenshot({ path: `scripts/screens/ui-${name}.png` });
    await p.close();
    console.log("saved", name);
  };
  await shot("console-1440", "/console", 1440, 900);
  await shot("console-1280", "/console", 1280, 720);
  await shot("consent", "/console", 1440, 900, async (p) => {
    await p.keyboard.press("d");
    await p.waitForTimeout(300);
    await p.fill("#preview-url", "https://www.spokeo.com/signup");
    await p.getByRole("button", { name: "Preview", exact: true }).click();
    await p.waitForTimeout(1200);
  });
  if (leakId) await shot("evidence", `/evidence/${leakId}`, 1440, 900);
  await shot("daylight", "/daylight", 1440, 900);
  await b.close();
})();
