import { registrableDomain } from "../domains";
import { isDisallowed } from "./robots";

// Fetches one privacy-rights URL the way a search crawler would and records every signal that
// keeps it out of Google. Evidence is kept verbatim so a finding can quote exactly what we saw.

export type CheckStatus = "visible" | "hidden" | "blocked" | "unreachable";
export type SignalType =
  | "meta-noindex" | "x-robots-tag" | "robots-disallow" | "http-error" | "network-error" | "offsite-redirect";
export type Signal = { type: SignalType; detail: string };

export type CheckResult = {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  status: CheckStatus;
  signals: Signal[];
};

export type CheckOptions = {
  timeoutMs?: number;
  /** origin -> robots.txt body (null when unavailable). Share one across a scan. */
  robotsCache?: Map<string, Promise<string | null>>;
  fetchImpl?: typeof fetch;
};

export const USER_AGENT = "Mozilla/5.0 (compatible; TelltaleDaylight/0.1; privacy-compliance research)";
export const HIDING_SIGNALS: SignalType[] = ["meta-noindex", "x-robots-tag", "robots-disallow"];
const MAX_BODY = 2 * 1024 * 1024;
const defaultRobotsCache = new Map<string, Promise<string | null>>();

export function normalizeUrl(raw: string): string {
  const s = raw.trim().replace(/^[<("']+|[>)"'.,;]+$/g, "");
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

async function get(url: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const body = await readCapped(res);
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of tag.replace(/^<meta\b/i, "").replace(/\/?>$/, "").matchAll(re)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

const noindexIn = (directives: string) =>
  directives.toLowerCase().split(/[,\s]+/).some((d) => d === "noindex" || d === "none");

/** <meta name="robots|googlebot" content="...noindex|none..."> in any attribute order or quoting. */
export function metaNoindex(html: string): string[] {
  const hits: string[] = [];
  for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const name = (a.name ?? "").trim().toLowerCase();
    if ((name === "robots" || name === "googlebot") && noindexIn(a.content ?? "")) hits.push(m[0]);
  }
  return hits;
}

// Directives that take a value and so look like "<agent>: ..." prefixes.
const VALUED = new Set(["unavailable_after", "max-snippet", "max-image-preview", "max-video-preview"]);

/** X-Robots-Tag noindex/none for all crawlers or for googlebot ("googlebot: noindex"). */
export function xRobotsNoindex(header: string): boolean {
  let agent: string | null = null;
  for (const part of header.split(",")) {
    let token = part.trim();
    const m = token.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/i);
    if (m && !VALUED.has(m[1].toLowerCase())) {
      agent = m[1].toLowerCase();
      token = m[2];
    }
    if ((agent === null || agent === "googlebot") && noindexIn(token)) return true;
  }
  return false;
}

function robotsFor(origin: string, cache: Map<string, Promise<string | null>>, timeoutMs: number, fetchImpl: typeof fetch) {
  let p = cache.get(origin);
  if (!p) {
    p = get(`${origin}/robots.txt`, timeoutMs, fetchImpl)
      .then(({ res, body }) => (res.ok ? body : null))
      .catch(() => null);
    cache.set(origin, p);
  }
  return p;
}

/** Anti-bot interstitials (often 200/202 with their own noindex) stand in for the real page. */
export function botChallenge(res: Response, body: string): string | null {
  const h = (k: string) => res.headers.get(k);
  if (h("sg-captcha")) return `SG-Captcha: ${h("sg-captcha")}`;
  if (h("cf-mitigated")) return `cf-mitigated: ${h("cf-mitigated")}`;
  // Markers that only appear on the interstitial itself, not on pages the vendor merely protects.
  const head = body.slice(0, 20_000);
  if (/\/\.well-known\/sgcaptcha\//i.test(head)) return "SiteGround captcha";
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>|window\._cf_chl_opt/i.test(head)) return "Cloudflare challenge";
  if (/geo\.captcha-delivery\.com|ct\.captcha-delivery\.com/i.test(head)) return "DataDome";
  if (/Incapsula incident ID/i.test(head)) return "Imperva";
  if (/id=["']px-captcha["']/i.test(head)) return "PerimeterX";
  return null;
}

const RANK: Record<CheckStatus, number> = { hidden: 3, blocked: 2, unreachable: 1, visible: 0 };
export function worst(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "visible");
}

export async function checkUrl(raw: string, opts: CheckOptions = {}): Promise<CheckResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cache = opts.robotsCache ?? defaultRobotsCache;
  const url = normalizeUrl(raw);
  const signals: Signal[] = [];

  let res: Response;
  let body: string;
  try {
    ({ res, body } = await get(url, timeoutMs, fetchImpl));
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const detail = err.name === "AbortError"
      ? `timed out after ${timeoutMs / 1000}s`
      : [err.cause?.code, err.cause?.message ?? err.message].filter(Boolean).join(": ");
    return { url, finalUrl: null, httpStatus: null, status: "unreachable", signals: [{ type: "network-error", detail }] };
  }

  const finalUrl = res.url || url;
  const fromDomain = registrableDomain(url);
  const toDomain = registrableDomain(finalUrl);
  if (fromDomain && toDomain && fromDomain !== toDomain) {
    signals.push({ type: "offsite-redirect", detail: `${url} -> ${finalUrl}` });
  }

  // Only a page that actually rendered can be "hidden" by its own markup; bot challenges and
  // error pages routinely carry noindex and say nothing about the opt-out page itself.
  const challenge = botChallenge(res, body);
  const httpLine = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  if (challenge) {
    signals.push({ type: "http-error", detail: `${httpLine}, bot challenge (${challenge})` });
  } else if (res.ok) {
    const xrt = res.headers.get("x-robots-tag");
    if (xrt && xRobotsNoindex(xrt)) signals.push({ type: "x-robots-tag", detail: `X-Robots-Tag: ${xrt}` });
    for (const tag of metaNoindex(body)) signals.push({ type: "meta-noindex", detail: tag });
  } else {
    signals.push({ type: "http-error", detail: httpLine });
  }

  // Google never fetches a disallowed URL, so check the listed URL and wherever it lands.
  const seen = new Set<string>();
  for (const u of [url, finalUrl]) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    const path = `${parsed.pathname}${parsed.search}`;
    if (seen.has(parsed.origin + path)) continue;
    seen.add(parsed.origin + path);
    const txt = await robotsFor(parsed.origin, cache, timeoutMs, fetchImpl);
    if (!txt) continue;
    const v = isDisallowed(txt, path);
    if (v.disallowed && v.rule) {
      signals.push({ type: "robots-disallow", detail: `${parsed.host}/robots.txt (user-agent: ${v.group}) ${v.rule}` });
    }
  }

  let status: CheckStatus = "visible";
  if (signals.some((s) => HIDING_SIGNALS.includes(s.type))) status = "hidden";
  else if (challenge || [401, 403, 429].includes(res.status)) status = "blocked";
  else if (res.status >= 400) status = "unreachable";

  return { url, finalUrl, httpStatus: res.status, status, signals };
}
