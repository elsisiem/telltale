import fs from "node:fs";
import path from "node:path";
import { hostnameOf, registrableDomain } from "./domains";
import { loadRegistry, type Broker } from "./registry";

export type Recipient = {
  host: string;
  domain: string;
  brokers: Broker[];
  matchedBy: "registry-domain" | "alias" | "name" | "none";
};

type AliasFile = Record<string, string[]>; // domain -> broker ids

let index: Map<string, Broker[]> | null = null;
let aliases: AliasFile | null = null;

function domainIndex(brokers = loadRegistry()): Map<string, Broker[]> {
  if (index) return index;
  index = new Map();
  for (const b of brokers) {
    for (const d of b.domains) index.set(d, [...(index.get(d) ?? []), b]);
  }
  return index;
}

function aliasFile(): AliasFile {
  if (aliases) return aliases;
  const file = path.join(process.cwd(), "data", "domain-aliases.json");
  aliases = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as AliasFile) : {};
  return aliases;
}

const STOP = new Set(["inc", "llc", "corp", "corporation", "co", "company", "ltd", "the", "group", "holdings", "lp", "plc", "data", "solutions", "services"]);
export function nameTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Match a company name (e.g. from a page's og:site_name) against registry names and DBAs. */
export function matchByName(orgName: string, brokers = loadRegistry()): Broker[] {
  const want = nameTokens(orgName).join(" ");
  if (want.length < 4) return [];
  return brokers.filter((b) =>
    [b.name, ...(b.dba ? b.dba.split(/[,;]/) : [])].some((n) => nameTokens(n).join(" ") === want),
  );
}

export function resolveRecipient(urlOrHost: string, opts: { orgName?: string } = {}): Recipient {
  const host = hostnameOf(urlOrHost) ?? urlOrHost.toLowerCase();
  const domain = registrableDomain(host) ?? host;
  const byDomain = domainIndex().get(domain);
  if (byDomain?.length) return { host, domain, brokers: byDomain, matchedBy: "registry-domain" };

  const aliasIds = aliasFile()[domain];
  if (aliasIds?.length) {
    const all = loadRegistry();
    const brokers = aliasIds.map((id) => all.find((b) => b.id === id)).filter((b): b is Broker => !!b);
    if (brokers.length) return { host, domain, brokers, matchedBy: "alias" };
  }

  if (opts.orgName) {
    const byName = matchByName(opts.orgName);
    if (byName.length) return { host, domain, brokers: byName, matchedBy: "name" };
  }
  return { host, domain, brokers: [], matchedBy: "none" };
}

export function _resetResolverCache() {
  index = null;
  aliases = null;
}
