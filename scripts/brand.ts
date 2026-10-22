// Renders brand images to docs/brand: npx tsx scripts/brand.ts
import { chromium } from "playwright";

const mark = (stroke: string, size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <rect x="2.75" y="2.75" width="11.5" height="11.5" stroke="${stroke}" stroke-width="1.5"/>
  <rect x="9.75" y="9.75" width="11.5" height="11.5" stroke="${stroke}" stroke-width="1.5"/>
  <rect x="10.5" y="10.5" width="3" height="3" fill="#FF4F00"/>
</svg>`;

const page = (body: string, bg: string) => `<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&family=Inter:wght@400;500&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${bg}}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;

const card = (dark: boolean) => {
  const ink = dark ? "#E8EAED" : "#111318";
  const muted = dark ? "#8C949F" : "#6B7280";
  const bg = dark ? "#0C0E11" : "#F8F9FA";
  const line = dark ? "#262B33" : "#E5E7EB";
  return page(
    `<div id="c" style="width:1200px;height:800px;background:${bg};display:flex;flex-direction:column;justify-content:center;padding:0 120px;position:relative;
      background-image:linear-gradient(${line} 1px,transparent 1px),linear-gradient(90deg,${line} 1px,transparent 1px);background-size:40px 40px;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%, ${bg} 35%, transparent 80%)"></div>
      <div style="position:relative;display:flex;align-items:center;gap:36px">
        ${mark(ink, 150)}
        <span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:132px;letter-spacing:-4px;color:${ink};line-height:1">Telltale</span>
      </div>
      <div style="position:relative;margin-top:44px;font-family:Inter,sans-serif;font-size:34px;line-height:1.35;color:${muted};max-width:900px">
        A consent layer for personal AI agents.
      </div>
      <div style="position:relative;margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:2px;text-transform:uppercase;color:#FF4F00">
        Know who gets your data. Mark it. Make them answer for it.
      </div>
    </div>`,
    bg,
  );
};

const wordmark = () =>
  page(
    `<div id="c" style="display:inline-flex;align-items:center;gap:28px;padding:24px 32px">
      ${mark("#111318", 120)}
      <span style="font-family:'JetBrains Mono',monospace;font-weight:600;font-size:104px;letter-spacing:-3px;color:#111318;line-height:1">Telltale</span>
    </div>`,
    "transparent",
  );

const icon = () =>
  page(
    `<div id="c" style="width:512px;height:512px;background:#111318;display:flex;align-items:center;justify-content:center;border-radius:96px">${mark("#FFFFFF", 340)}</div>`,
    "transparent",
  );

(async () => {
  const b = await chromium.launch();
  const render = async (html: string, file: string, omitBackground = false) => {
    const p = await b.newPage({ deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: "networkidle" });
    await p.evaluate("document.fonts.ready");
    await p.locator("#c").screenshot({ path: `docs/brand/${file}`, omitBackground });
    await p.close();
    console.log("saved", file);
  };
  await render(card(false), "telltale-thumbnail.png");
  await render(card(true), "telltale-thumbnail-dark.png");
  await render(wordmark(), "telltale-wordmark.png", true);
  await render(icon(), "telltale-icon.png", true);
  await b.close();
})();
