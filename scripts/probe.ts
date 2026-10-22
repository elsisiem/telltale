import { chromium } from "playwright";
import { snapshot } from "../src/lib/agent/browser";
const urls = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ headless: true });
  for (const u of urls) {
    const p = await b.newPage();
    try {
      await p.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForTimeout(2500);
      const s = await snapshot(p);
      console.log(`\n== ${u} -> ${s.url}\n   title: ${s.title} | site: ${s.siteName}`);
      console.log("   fields:", s.fields.slice(0, 12).map(f => `${f.type}:${f.label || f.name || f.placeholder}`).join(" | "));
      console.log("   buttons:", s.buttons.slice(0, 8).map(x => x.text).join(" | "));
    } catch (e) { console.log(`\n== ${u} ERROR ${(e as Error).message.slice(0, 100)}`); }
    await p.close();
  }
  await b.close();
})();
