import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDisallowed } from "@/lib/daylight/robots";
import { checkUrl, metaNoindex, xRobotsNoindex } from "@/lib/daylight/check";
import { runScan } from "@/lib/daylight/scan";
import { daylightFindings } from "@/lib/daylight/findings";
import { bus, type TelltaleEvent } from "@/lib/events";
import { db } from "@/lib/db";
import { emptyFlags, loadRegistry, type Broker, type RequestStats } from "@/lib/registry";

describe("robots.txt (Google semantics)", () => {
  const txt = [
    "User-agent: *",
    "Disallow: /",
    "",
    "User-agent: Googlebot",
    "User-agent: bingbot",
    "Disallow: /privacy",
    "Allow: /privacy/faq",
    "Disallow: /*.pdf$",
    "Disallow: /opt*out",
  ].join("\n");

  it("uses the googlebot group over * and merges multi-agent groups", () => {
    expect(isDisallowed(txt, "/about")).toEqual({ disallowed: false, group: "googlebot" });
    expect(isDisallowed(txt, "/about", ["*"]).disallowed).toBe(true);
    expect(isDisallowed(txt, "/privacy/request")).toMatchObject({ disallowed: true, rule: "Disallow: /privacy", group: "googlebot" });
  });
  it("lets the longest match win", () => {
    expect(isDisallowed(txt, "/privacy/faq/ccpa")).toMatchObject({ disallowed: false, rule: "Allow: /privacy/faq" });
  });
  it("lets Allow win a tie", () => {
    expect(isDisallowed("User-agent: *\nDisallow: /page\nAllow: /page", "/page").disallowed).toBe(false);
    expect(isDisallowed("User-agent: *\nAllow: /a*\nDisallow: /a*", "/abc").disallowed).toBe(false);
  });
  it("supports * wildcards and $ anchors", () => {
    expect(isDisallowed(txt, "/docs/form.pdf").disallowed).toBe(true);
    expect(isDisallowed(txt, "/docs/form.pdf?x=1").disallowed).toBe(false);
    expect(isDisallowed(txt, "/opt-out").disallowed).toBe(true);
    expect(isDisallowed(txt, "/optout").disallowed).toBe(true);
    expect(isDisallowed("User-agent: *\nDisallow: /*?", "/p?q=1").disallowed).toBe(true);
  });
  it("treats an empty Disallow as allow-all and ignores comments and case", () => {
    expect(isDisallowed("User-agent: *\nDisallow:", "/anything").disallowed).toBe(false);
    expect(isDisallowed("USER-AGENT: GoogleBot # us\ndisallow: /x # no", "/x/y")).toMatchObject({ disallowed: true, rule: "disallow: /x" });
  });
  it("allows everything when no group matches", () => {
    expect(isDisallowed("User-agent: bingbot\nDisallow: /", "/x").disallowed).toBe(false);
  });
});

describe("noindex detection", () => {
  it("finds meta robots in any attribute order, quoting or case", () => {
    expect(metaNoindex(`<META content='NOINDEX, follow' NAME=Robots>`)).toHaveLength(1);
    expect(metaNoindex(`<meta data-x="1" name="googlebot" content="none"/>`)).toHaveLength(1);
    expect(metaNoindex(`<meta name="robots" content="index, follow">`)).toHaveLength(0);
    expect(metaNoindex(`<meta name="description" content="noindex">`)).toHaveLength(0);
    expect(metaNoindex(`<!-- <meta name="robots" content="noindex"> -->`)).toHaveLength(0);
  });
  it("reads X-Robots-Tag including agent-scoped forms", () => {
    expect(xRobotsNoindex("noindex, nofollow")).toBe(true);
    expect(xRobotsNoindex("none")).toBe(true);
    expect(xRobotsNoindex("googlebot: noindex")).toBe(true);
    expect(xRobotsNoindex("otherbot: noindex")).toBe(false);
    expect(xRobotsNoindex("max-snippet: 20, noarchive")).toBe(false);
    expect(xRobotsNoindex("unavailable_after: 2027-01-01, noindex")).toBe(true);
  });
});

const ROBOTS = "User-agent: *\nDisallow: /private\n";
const page = (head = "") => `<!doctype html><html><head><title>Privacy</title>${head}</head><body>Do not sell my info</body></html>`;

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // No keep-alive: a reused socket can be reset while the event loop is blocked (PGlite start-up).
    res.setHeader("connection", "close");
    const html = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html", ...headers });
      res.end(body);
    };
    switch (req.url) {
      case "/robots.txt": res.writeHead(200, { "content-type": "text/plain" }); return res.end(ROBOTS);
      case "/clean": return html(200, page());
      case "/meta": return html(200, page(`<meta content="noindex,nofollow" data-x='y' NAME='ROBOTS' >`));
      case "/xrt": return html(200, page(), { "X-Robots-Tag": "googlebot: noindex" });
      case "/private/optout": return html(200, page());
      case "/forbidden": return html(403, page(`<meta name="robots" content="noindex">`));
      case "/missing": return html(404, "not found");
      case "/captcha":
        return html(202, `<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Fcaptcha"></meta></head></html>`, {
          "SG-Captcha": "challenge", "X-Robots-Tag": "noindex",
        });
      case "/redirect": res.writeHead(302, { location: "/meta" }); return res.end();
      default: return html(404, "not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("checkUrl against a local fixture", () => {
  it("passes a clean page", async () => {
    const r = await checkUrl(`${base}/clean`);
    expect(r).toMatchObject({ status: "visible", httpStatus: 200, signals: [] });
  });
  it("flags meta noindex with the verbatim tag", async () => {
    const r = await checkUrl(`${base}/meta`);
    expect(r.status).toBe("hidden");
    expect(r.signals).toContainEqual({ type: "meta-noindex", detail: `<meta content="noindex,nofollow" data-x='y' NAME='ROBOTS' >` });
  });
  it("flags X-Robots-Tag", async () => {
    const r = await checkUrl(`${base}/xrt`);
    expect(r.status).toBe("hidden");
    expect(r.signals).toContainEqual({ type: "x-robots-tag", detail: "X-Robots-Tag: googlebot: noindex" });
  });
  it("flags a robots.txt disallow with the rule line", async () => {
    const r = await checkUrl(`${base}/private/optout`);
    expect(r.status).toBe("hidden");
    expect(r.signals[0].type).toBe("robots-disallow");
    expect(r.signals[0].detail).toContain("Disallow: /private");
  });
  it("classifies 403 as blocked without trusting the error page's noindex", async () => {
    const r = await checkUrl(`${base}/forbidden`);
    expect(r.status).toBe("blocked");
    expect(r.signals.map((s) => s.type)).toEqual(["http-error"]);
  });
  it("treats a bot challenge as blocked, not hidden, despite its noindex header", async () => {
    const r = await checkUrl(`${base}/captcha`);
    expect(r.status).toBe("blocked");
    expect(r.signals).toEqual([{ type: "http-error", detail: "HTTP 202 Accepted, bot challenge (SG-Captcha: challenge)" }]);
  });
  it("classifies 404 and network errors as unreachable", async () => {
    expect((await checkUrl(`${base}/missing`)).status).toBe("unreachable");
    const dead = await checkUrl("http://127.0.0.1:1/x", { timeoutMs: 2000 });
    expect(dead.status).toBe("unreachable");
    expect(dead.signals[0].type).toBe("network-error");
  });
  it("follows redirects and judges the final page", async () => {
    const r = await checkUrl(`${base}/redirect`);
    expect(r.finalUrl).toBe(`${base}/meta`);
    expect(r.status).toBe("hidden");
  });
});

describe("runScan + findings", () => {
  const stats: RequestStats = { received: 0, compliedWhole: 0, compliedPart: 0, denied: 0, meanDays: 0, medianDays: 0 };
  const fake = (id: string, rightsUrls: string[], website = ""): Broker => ({
    id, name: `${id} Inc`, dba: null, website, contactEmail: "", rightsUrls, domains: [`${id}.test`],
    city: "", state: "CA", country: "US", flags: emptyFlags(),
    requests: { delete: stats, know: stats, knowSold: stats, optOut: stats, limit: stats }, comments: null,
  });

  it("scans brokers, stores results and feeds the consent card", async () => {
    const brokers = [
      fake("sneaky", [`${base}/clean`, `${base}/meta`]),
      fake("walled", [`${base}/forbidden`]),
      fake("open", [], `${base}/clean`),
    ];
    const events: TelltaleEvent[] = [];
    const on = (e: TelltaleEvent) => events.push(e);
    bus.on("event", on);
    const { scanId, summary, results } = await runScan({ brokers, concurrency: 2 });
    bus.off("event", on);

    expect(results.map((r) => r.status)).toEqual(["hidden", "blocked", "visible"]);
    expect(summary.counts).toEqual({ visible: 1, hidden: 1, blocked: 1, unreachable: 0 });
    expect(summary.hidden).toHaveLength(1);
    expect(summary.hidden[0]).toMatchObject({ brokerId: "sneaky", url: `${base}/meta` });
    expect(events.filter((e) => e.type === "scan.progress")).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "scan.done", scanId });

    const d = await db();
    const { rows } = await d.query("select * from scan_results where scan_id = $1", [scanId]);
    expect(rows).toHaveLength(4);
    const { rows: scans } = await d.query<{ summary: { totalBrokers: number } }>("select summary from scans where id = $1", [scanId]);
    expect(scans[0].summary.totalBrokers).toBe(3);

    // The fixture server is not on the broker's own domain, so it reads as a vendor portal.
    const findings = await daylightFindings({ host: "sneaky.test", domain: "sneaky.test", matchedBy: "registry-domain", brokers });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ key: "hidden-optout", severity: "medium", entity: "sneaky Inc", source: "daylight" });
    expect(findings[0].text).toMatch(/^routes consumer requests to a third-party portal that blocks search engines \(observed \d{4}-\d{2}-\d{2}: <meta content="noindex/);

    // Served from the broker's own domain at an opt-out path, the same evidence is high severity.
    const own = brokers.map((b) => (b.id === "sneaky" ? { ...b, website: base } : b));
    const ownFindings = await daylightFindings({ host: "sneaky.test", domain: "sneaky.test", matchedBy: "registry-domain", brokers: own });
    expect(ownFindings[0].severity).toBe(own[0].rightsUrls.some((u) => /opt|rights|choices/.test(u)) ? "high" : "medium");
  });
});

describe("conclusive observations", () => {
  it("keeps a hidden finding when a later sweep was only blocked", async () => {
    const d = await db();
    const broker = loadRegistry().find((b) => b.name.startsWith("Spokeo"))!;
    const url = "https://www.spokeo.com/privacy/control/all-categories";
    await d.query("insert into scans (id, started_at, finished_at) values ('s-old', now() - interval '2 hours', now() - interval '2 hours'), ('s-new', now(), now())");
    await d.query("insert into scan_results (scan_id, broker_id, url, status, signals) values ($1, $2, $3, 'hidden', $4), ($5, $2, $3, 'blocked', '[]')", [
      "s-old", broker.id, url, JSON.stringify([{ type: "x-robots-tag", detail: "X-Robots-Tag: noindex" }]), "s-new",
    ]);
    const f = await daylightFindings({ host: "www.spokeo.com", domain: "spokeo.com", matchedBy: "registry-domain", brokers: [broker] });
    expect(f[0]?.text).toMatch(/^hides its own opt-out page from search engines \(observed .*X-Robots-Tag: noindex\)$/);
  });
});
