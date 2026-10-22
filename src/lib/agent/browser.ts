import { chromium, type Browser, type Page } from "playwright";
import { db } from "../db";

// One browser per agent run, opened at the first navigation so it can be chosen per site. With
// KERNEL_API_KEY it is a hosted Kernel browser, unless the site has crashed Kernel before (some
// ad-heavy pages crash Kernel's Chromium build): those, and this app's own demo pages, open in a
// bundled local Chromium. A crash mid-run reopens the same page locally and is remembered.

export type BrowserSession = {
  page: Page;
  liveViewUrl: string | null;
  kind: "kernel" | "local";
  /** Open the right browser for `url` if none is open yet. */
  ensure(url: string): Promise<void>;
  /** Reopen `url` in a local Chromium after a crash, and remember that the site crashes Kernel. */
  recover(url: string): Promise<void>;
  close(): Promise<void>;
};

const VIEWPORT = { width: 1280, height: 860 };

async function launchLocal() {
  const browser = await chromium.launch({ headless: process.env.TELLTALE_HEADLESS === "1" || !!process.env.FLY_APP_NAME });
  const page = await browser.newPage({ viewport: VIEWPORT });
  return { browser, page };
}

async function crashesKernel(host: string): Promise<boolean> {
  const d = await db();
  const { rows } = await d.query("select 1 from browser_memo where host = $1", [host]);
  return rows.length > 0;
}

async function rememberCrash(host: string) {
  const d = await db();
  await d.query("insert into browser_memo (host, reason) values ($1, 'kernel tab crashed') on conflict (host) do update set seen_at = now()", [host]);
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** `local` forces a local window, e.g. for this app's own demo pages, which a cloud browser can't reach. */
export async function openBrowser(opts: { local?: boolean } = {}): Promise<BrowserSession> {
  const closers: (() => Promise<void>)[] = [];
  const useKernel = !!process.env.KERNEL_API_KEY && !opts.local && process.env.TELLTALE_BROWSER !== "local";

  const openLocal = async (url?: string) => {
    const { browser, page } = await launchLocal();
    closers.push(() => browser.close());
    session.page = page;
    session.kind = "local";
    session.liveViewUrl = null;
    if (url && url !== "about:blank") await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  };

  const session: BrowserSession = {
    page: undefined as unknown as Page,
    liveViewUrl: null,
    kind: "local",
    async ensure(url: string) {
      if (session.page && !session.page.isClosed()) return;
      if (!useKernel || (await crashesKernel(hostOf(url)).catch(() => false))) return openLocal();
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
      } catch (err) {
        console.warn(`[browser] Kernel unavailable (${(err as Error).message}); using local Chromium`);
        await openLocal();
      }
    },
    async recover(url: string) {
      if (session.kind === "kernel") await rememberCrash(hostOf(url)).catch(() => {});
      await openLocal(url);
    },
    async close() {
      await Promise.all(closers.map((c) => c().catch(() => {})));
    },
  };
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
  links: { selector: string; text: string; href: string }[];
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
  const links = [...document.querySelectorAll("a[href]:not([role=button])")]
    .filter((el) => visible(el) && clean(el.textContent).length > 1)
    .slice(0, 40)
    .map((el) => ({ selector: tag(el), text: clean(el.textContent).slice(0, 60), href: el.href }));
  const site = document.querySelector('meta[property="og:site_name"]');
  return {
    url: location.href, title: document.title, siteName: site ? site.getAttribute("content") : null,
    text: ((document.body && document.body.innerText) || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 3000),
    fields, buttons, links,
  };
})()`;

/** Describe the page for the model: visible text plus every fillable field and button. */
export async function snapshot(page: Page): Promise<PageSnapshot> {
  return (await page.evaluate(SNAPSHOT_JS)) as PageSnapshot;
}
