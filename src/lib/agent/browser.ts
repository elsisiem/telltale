import { chromium, type Browser, type Page } from "playwright";

// One browser per agent run. With KERNEL_API_KEY it is a hosted Kernel browser whose live view
// can be embedded on stage; otherwise a local Chromium window.

export type BrowserSession = {
  page: Page;
  liveViewUrl: string | null;
  close(): Promise<void>;
};

export async function openBrowser(): Promise<BrowserSession> {
  if (process.env.KERNEL_API_KEY) {
    const { default: Kernel } = await import("@onkernel/sdk");
    const kernel = new Kernel();
    const kb = await kernel.browsers.create({ headless: false, stealth: true, timeout_seconds: 600 });
    const browser: Browser = await chromium.connectOverCDP(kb.cdp_ws_url);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    return {
      page,
      liveViewUrl: kb.browser_live_view_url ?? null,
      async close() {
        await browser.close().catch(() => {});
        await kernel.browsers.deleteByID(kb.session_id).catch(() => {});
      },
    };
  }
  const browser = await chromium.launch({ headless: process.env.TELLTALE_HEADLESS === "1" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  return { page, liveViewUrl: null, close: () => browser.close() };
}

export type PageField = {
  selector: string;
  tag: string;
  type: string;
  name: string;
  label: string;
  placeholder: string;
  autocomplete: string;
  required: boolean;
};

export type PageSnapshot = {
  url: string;
  title: string;
  siteName: string | null;
  text: string;
  fields: PageField[];
  buttons: { selector: string; text: string }[];
};

// Plain JS string so bundlers can't inject helpers (e.g. esbuild's __name) into browser code.
const SNAPSHOT_JS = `(() => {
  let n = document.querySelectorAll("[data-tt]").length;
  const tag = (el) => {
    if (!el.getAttribute("data-tt")) el.setAttribute("data-tt", "e" + n++);
    return '[data-tt="' + el.getAttribute("data-tt") + '"]';
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const labelFor = (el) => {
    const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
    const wrapping = el.closest("label");
    return clean((byFor && byFor.textContent) || (wrapping && wrapping.textContent) || el.getAttribute("aria-label")).slice(0, 80);
  };
  const skip = ["hidden", "submit", "button", "image", "reset"];
  const fields = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => visible(el) && !skip.includes(el.type))
    .map((el) => ({
      selector: tag(el), tag: el.tagName.toLowerCase(), type: el.type || "", name: el.name || "",
      label: labelFor(el), placeholder: el.placeholder || "", autocomplete: el.autocomplete || "", required: !!el.required,
    }));
  const buttons = [...document.querySelectorAll("button, input[type=submit], a[role=button]")]
    .filter(visible)
    .map((el) => ({ selector: tag(el), text: clean(el.value || el.textContent).slice(0, 60) }));
  const site = document.querySelector('meta[property="og:site_name"]');
  return {
    url: location.href, title: document.title, siteName: site ? site.getAttribute("content") : null,
    text: ((document.body && document.body.innerText) || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 3000),
    fields, buttons,
  };
})()`;

/** Describe the page for the model: visible text plus every fillable field and button. */
export async function snapshot(page: Page): Promise<PageSnapshot> {
  return (await page.evaluate(SNAPSHOT_JS)) as PageSnapshot;
}
