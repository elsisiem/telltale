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

/** Describe the page for the model: visible text plus every fillable field and button. */
export async function snapshot(page: Page): Promise<PageSnapshot> {
  return page.evaluate(() => {
    let n = 0;
    const tag = (el: Element) => {
      if (!el.getAttribute("data-tt")) el.setAttribute("data-tt", `e${n++}`);
      return `[data-tt="${el.getAttribute("data-tt")}"]`;
    };
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const labelFor = (el: HTMLElement) => {
      const id = el.id;
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
      const wrapping = el.closest("label")?.textContent;
      return (byFor ?? wrapping ?? el.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    };
    const fields = [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => visible(el) && !["hidden", "submit", "button", "image", "reset"].includes((el as HTMLInputElement).type))
      .map((el) => {
        const i = el as HTMLInputElement;
        return {
          selector: tag(el),
          tag: el.tagName.toLowerCase(),
          type: i.type ?? "",
          name: i.name ?? "",
          label: labelFor(i),
          placeholder: i.placeholder ?? "",
          autocomplete: i.autocomplete ?? "",
          required: i.required,
        };
      });
    const buttons = [...document.querySelectorAll("button, input[type=submit], a[role=button]")]
      .filter(visible)
      .map((el) => ({ selector: tag(el), text: ((el as HTMLInputElement).value || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) }));
    const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? null;
    return {
      url: location.href,
      title: document.title,
      siteName,
      text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, 3000),
      fields,
      buttons,
    };
  });
}
