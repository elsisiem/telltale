import Exa from "exa-js";

// When a site's domain is not in the registry, ask Exa which company runs it, so a broker
// operating under a brand domain it never listed can still be matched by name.

const cache = new Map<string, string | null>();

export async function companyFor(domain: string): Promise<string | null> {
  if (cache.has(domain)) return cache.get(domain)!;
  let name: string | null = null;
  try {
    const exa = new Exa(process.env.EXA_API_KEY);
    const res = await exa.search(`${domain} company`, { category: "company", includeDomains: [domain], numResults: 1 });
    const top = res.results[0];
    const entity = top?.entities?.[0] as { properties?: { name?: string } } | undefined;
    name = entity?.properties?.name ?? top?.title?.split(/\s[|\-–:]\s/)[0]?.trim() ?? null;
  } catch (err) {
    console.warn(`[exa] company lookup failed for ${domain}: ${(err as Error).message}`);
  }
  cache.set(domain, name);
  return name;
}
