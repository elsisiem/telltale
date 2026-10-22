// Drives one real agent run from the console UI and captures the live states:
// npx tsx scripts/shots-live.ts <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:3200";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}/console`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Car insurance quotes" }).click();
  await p.getByRole("button", { name: /Run agent/ }).click();
  await p.waitForTimeout(7000);
  await p.screenshot({ path: "scripts/screens/ui-live-running.png" });
  await p.getByRole("dialog").waitFor({ timeout: 120_000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: "scripts/screens/ui-live-consent.png" });
  await p.getByRole("button", { name: "Release with these choices" }).click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "scripts/screens/ui-live-held-released.png" });
  await p.getByText("Complete", { exact: true }).first().waitFor({ timeout: 180_000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "scripts/screens/ui-live-done.png" });
  await b.close();
  console.log("captured");
})();
