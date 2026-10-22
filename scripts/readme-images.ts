// Regenerates the README screenshots in docs/images: npx tsx scripts/readme-images.ts <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:3200";
(async () => {
  const b = await chromium.launch();
  const open = async (theme: "light" | "dark") => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => {
      localStorage.setItem("telltale:theme", t);
      localStorage.setItem("telltale:sidebar-collapsed", "0");
    }, theme);
    return ctx.newPage();
  };
  const p = await open("light");
  const shot = async (name: string, path: string, act?: () => Promise<void>) => {
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    if (act) await act();
    await p.screenshot({ path: `docs/images/${name}.png` });
  };
  await shot("landing", "/");
  await shot("console", "/console");
  await shot("consent", "/console", async () => {
    await p.keyboard.press("d");
    await p.fill("#preview-url", "https://www.spokeo.com/signup");
    await p.getByRole("button", { name: "Preview", exact: true }).click();
    await p.waitForTimeout(1200);
  });
  await shot("tour", "/tour", async () => {
    await p.keyboard.press(" ");
    await p.locator("ol button").nth(3).click();
    await p.waitForTimeout(1400);
  });
  await shot("daylight", "/daylight");
  const d = await open("dark");
  await d.goto(BASE + "/console", { waitUntil: "networkidle" });
  await d.waitForTimeout(1500);
  await d.screenshot({ path: "docs/images/console-dark.png" });
  await b.close();
  console.log("saved docs/images");
})();
