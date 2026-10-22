import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import {
  FREE_EMAIL_DOMAINS, SHARED_VENDOR_DOMAINS, emailDomain, registrableDomain, splitUrls,
} from "./domains";

// California Privacy Protection Agency data broker registry (cppa.ca.gov/data_broker_registry).
// Brokers file this themselves under the Delete Act; SB 361 added the yes/no disclosure
// questions starting with the 2026 registration year.

export type RequestStats = {
  received: number;
  compliedWhole: number;
  compliedPart: number;
  denied: number;
  meanDays: number;
  medianDays: number;
};

export type BrokerFlags = {
  minors: boolean;
  accountLogins: boolean;
  governmentIds: boolean;
  citizenship: boolean;
  unionMembership: boolean;
  sexualOrientation: boolean;
  genderIdentity: boolean;
  biometric: boolean;
  preciseGeolocation: boolean;
  reproductiveHealth: boolean;
  soldToForeignActor: boolean;
  soldToFederalGovernment: boolean;
  soldToStateGovernment: boolean;
  soldToLawEnforcement: boolean;
  soldToGenAIDeveloper: boolean;
  fcra: boolean;
  glba: boolean;
  hipaa: boolean;
};

export type Broker = {
  id: string;
  name: string;
  dba: string | null;
  website: string;
  contactEmail: string;
  rightsUrls: string[];
  domains: string[];
  city: string;
  state: string;
  country: string;
  flags: BrokerFlags;
  requests: {
    delete: RequestStats;
    know: RequestStats;
    knowSold: RequestStats;
    optOut: RequestStats;
    limit: RequestStats;
  };
  comments: string | null;
};

// Column positions in the 2026 CSV. Headers contain non-breaking hyphens and curly quotes,
// so positions are more reliable than header text.
const C = {
  name: 0, dba: 1, website: 2, email: 3, city: 6, state: 7, country: 9, rightsUrl: 10,
  minors: 11, accountLogins: 12, governmentIds: 13, citizenship: 14, unionMembership: 15,
  sexualOrientation: 16, genderIdentity: 17, biometric: 18, preciseGeolocation: 19,
  reproductiveHealth: 20, soldToForeignActor: 21, soldToFederalGovernment: 22,
  soldToStateGovernment: 23, soldToLawEnforcement: 24, soldToGenAIDeveloper: 25,
  fcra: 26, glba: 30, hipaa: 42,
  delete: 46, know: 52, knowSold: 58, optOut: 64, limit: 70, comments: 76,
} as const;

const yes = (v: string | undefined) => (v ?? "").trim().toLowerCase().startsWith("y");
const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function stats(row: string[], start: number): RequestStats {
  return {
    received: num(row[start]),
    compliedWhole: num(row[start + 1]),
    compliedPart: num(row[start + 2]),
    denied: num(row[start + 3]),
    meanDays: num(row[start + 4]),
    medianDays: num(row[start + 5]),
  };
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function parseRegistryCsv(csv: string): Broker[] {
  const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true });
  const rows = parsed.data.slice(1);
  const seen = new Map<string, number>();
  const emailOnly = new Map<string, number>();
  const brokers = rows
    .filter((r) => (r[C.name] ?? "").trim())
    .map((r) => {
      const name = r[C.name].trim();
      let id = slugify(name);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n + 1}`;

      const rightsUrls = splitUrls(r[C.rightsUrl] ?? "");
      const domains = new Set<string>();
      for (const u of [...splitUrls(r[C.website] ?? ""), ...rightsUrls]) {
        const d = registrableDomain(u);
        if (d && !SHARED_VENDOR_DOMAINS.has(d)) domains.add(d);
      }
      const ed = emailDomain(r[C.email] ?? "");
      if (ed && !FREE_EMAIL_DOMAINS.has(ed) && !SHARED_VENDOR_DOMAINS.has(ed) && !domains.has(ed)) {
        domains.add(ed);
        emailOnly.set(ed, (emailOnly.get(ed) ?? 0) + 1);
      }

      const flags = Object.fromEntries(
        (Object.keys(C) as (keyof typeof C)[])
          .filter((k) => k in emptyFlags())
          .map((k) => [k, yes(r[C[k]])]),
      ) as BrokerFlags;

      return {
        id,
        name,
        dba: (r[C.dba] ?? "").trim() || null,
        website: (r[C.website] ?? "").trim(),
        contactEmail: (r[C.email] ?? "").trim(),
        rightsUrls,
        domains: [...domains],
        city: (r[C.city] ?? "").trim(),
        state: (r[C.state] ?? "").trim(),
        country: (r[C.country] ?? "").trim(),
        flags,
        requests: {
          delete: stats(r, C.delete),
          know: stats(r, C.know),
          knowSold: stats(r, C.knowSold),
          optOut: stats(r, C.optOut),
          limit: stats(r, C.limit),
        },
        comments: (r[C.comments] ?? "").trim() || null,
      };
    });
  // A contact-email domain shared by several brokers that don't otherwise use it belongs to a
  // filing agent (e.g. a marketing agency registering its clients), not to the brokers.
  for (const b of brokers) b.domains = b.domains.filter((d) => (emailOnly.get(d) ?? 0) < 2);
  return brokers;
}

export function emptyFlags(): BrokerFlags {
  return {
    minors: false, accountLogins: false, governmentIds: false, citizenship: false,
    unionMembership: false, sexualOrientation: false, genderIdentity: false, biometric: false,
    preciseGeolocation: false, reproductiveHealth: false, soldToForeignActor: false,
    soldToFederalGovernment: false, soldToStateGovernment: false, soldToLawEnforcement: false,
    soldToGenAIDeveloper: false, fcra: false, glba: false, hipaa: false,
  };
}

export const REGISTRY_SOURCE = {
  publisher: "California Privacy Protection Agency",
  url: "https://cppa.ca.gov/data_broker_registry/",
  file: "data/ca-registry-2026.csv",
  registrationYear: 2026,
  statsYear: 2024,
};

let cache: Broker[] | null = null;

export function loadRegistry(file = path.join(process.cwd(), REGISTRY_SOURCE.file)): Broker[] {
  if (!cache) cache = parseRegistryCsv(fs.readFileSync(file, "utf8"));
  return cache;
}
