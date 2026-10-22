// Domain helpers shared by the registry loader, the resolver and the scanners.

const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp",
  "co.in", "com.br", "com.mx", "co.za", "com.sg", "com.cn", "com.hk", "co.il", "co.kr",
]);

// Domains that host privacy portals or forms for many companies. A broker listing one of
// these as its rights URL must not make every other customer of that vendor resolve to it.
export const SHARED_VENDOR_DOMAINS = new Set([
  "onetrust.com", "trustarc.com", "ketch.com", "transcend.io", "osano.com", "securiti.ai",
  "termly.io", "iubenda.com", "google.com", "forms.gle", "typeform.com", "jotform.com",
  "zendesk.com", "hubspot.com", "hsforms.com", "salesforce.com", "force.com", "wufoo.com",
  "microsoft.com", "office.com", "cookiebot.com", "usercentrics.eu", "privacyrights.org",
  "datagrail.io", "mineos.ai", "truyo.com", "wirewheel.io", "didomi.io", "formstack.com",
  "smartsheet.com", "surveymonkey.com", "github.io", "squarespace.com", "wixsite.com",
  "my.site.com", "freshdesk.com", "zohopublic.com", "airtable.com", "cognitoforms.com",
]);

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com",
  "protonmail.com", "proton.me", "live.com", "msn.com", "me.com", "comcast.net",
]);

/** Parse a hostname out of anything URL-ish: "www.x.com/privacy", "https://x.com", "x.com". */
export function hostnameOf(raw: string): string | null {
  const s = raw.trim().replace(/^[<("']+|[>)"'.,;]+$/g, "");
  if (!s) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** eTLD+1 approximation: good enough for matching brokers, not a public-suffix-list replacement. */
export function registrableDomain(hostOrUrl: string): string | null {
  const host = hostOrUrl.includes("/") || hostOrUrl.includes(":") ? hostnameOf(hostOrUrl) : hostOrUrl.toLowerCase();
  if (!host) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** Split a registry cell that may hold several URLs separated by ; , whitespace or "and". */
export function splitUrls(cell: string): string[] {
  return cell
    .split(/[;,\s]+|\band\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 3 && p.includes("."));
}

export function emailDomain(email: string): string | null {
  const m = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? registrableDomain(m[1]) : null;
}
