import { chromium, type Browser, type Page } from "playwright";

// One browser per agent run. With KERNEL_API_KEY it starts as a hosted Kernel browser; if a tab
// crashes there (some ad-heavy pages crash Kernel's Chromium build), the session reopens the same
// page in a bundled local Chromium and carries on. `page` always points at the live tab.

export type BrowserSession = {
  page: Page;
  liveViewUrl: string | null;
  kind: "kernel" | "local";
  /** Reopen `url` in a local Chromium after a crash. */
  recover(url: string): Promise<void>;
  close(): Promise<void>;
};

const VIEWPORT = { width: 1280, height: 860 };

async function launchLocal() {
  const browser = await chromium.launch({ headless: process.env.TELLTALE_HEADLESS === "1" || !!process.env.FLY_APP_NAME });
  const page = await browser.newPage({ viewport: VIEWPORT });
  return { browser, page };
}

/** `local` forces a local window, e.g. for this app's own demo pages, which a cloud browser can't reach. */
export async function openBrowser(opts: { local?: boolean } = {}): Promise<BrowserSession> {
  const closers: (() => Promise<void>)[] = [];
  const session: BrowserSession = {
    page: undefined as unknown as Page,
    liveViewUrl: null,
    kind: "local",
    async recover(url: string) {
      const { browser, page } = await launchLocal();
      closers.push(() => browser.close());
      session.page = page;
      session.kind = "local";
      session.liveViewUrl = null;
      if (url && url !== "about:blank") await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    },
    async close() {
      await Promise.all(closers.map((c) => c().catch(() => {})));
    },
  };

  if (process.env.KERNEL_API_KEY && !opts.local && process.env.TELLTALE_BROWSER !== "local") {
    try {
      const { default: Kernel } = await import("@onkernel/sdk");
      const kernel = new Kernel();
      const kb = await kernel.browsers.create({ headless: false, stealth: true, timeout_seconds: 600 });
      const browser: Browser = await chromium.connectOverCDP(kb.cdp_ws_url);
      closers.push(async () => {
        await browser.close().catch(() => {});
        await kernel.browsers.deleteByID(kb.session_id).catch(() => {});
      });
      const context = browser.contexts()[0] ?? (await browser.newContext());
      session.page = context.pages()[0] ?? (await context.newPage());
      session.kind = "kernel";
      session.liveViewUrl = kb.browser_live_view_url ?? null;
      return session;
    } catch (err) {
      console.warn(`[browser] Kernel unavailable (${(err as Error).message}); using local Chromium`);
    }
  }
  const { browser, page } = await launchLocal();
  closers.push(() => browser.close());
  session.page = page;
  return session;
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
