// Quick single-page capture for visual checks: npx tsx scripts/shot.ts <url> <out.png> [width] [height]
import { chromium } from "playwright";
(async () => {
  const [url, out, w = "1440", h = "900"] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out });
  await b.close();
})();
