import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Action, FieldKind } from "./policy";

// The person's real details. They live only on this machine (.telltale/profile.json) and are
// never put into the model's context: the agent works with {{placeholders}} instead.
export type Profile = {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
  synthetic?: boolean;
};

export const DATA_DIR = path.join(process.cwd(), ".telltale");

// Stage persona. Synthetic so no real person's details are shown on a projector.
export const DEMO_PROFILE: Profile = {
  firstName: "Maya",
  middleName: "R",
  lastName: "Okafor",
  email: "maya.okafor.demo@example.com",
  phone: "+1 415 555 0142",
  street: "2140 Folsom St Apt 3",
  city: "San Francisco",
  state: "CA",
  zip: "94110",
  dob: "1996-04-12",
  synthetic: true,
};

export function loadProfile(): Profile {
  const file = path.join(DATA_DIR, "profile.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as Profile;
  return DEMO_PROFILE;
}

// Crockford-style alphabet without look-alikes (0/O, 1/I/L) so codes survive being read aloud
// or retyped by a broker's data-entry pipeline.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export function mintTagCode(len = 4): string {
  const bytes = crypto.randomBytes(len);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** A middle initial derived from the tag that differs from the person's real one. */
export function tagInitial(code: string, real?: string): string {
  const letters = "ABCDEFGHJKLMNPRSTVW";
  let i = [...code].reduce((s, c) => s + c.charCodeAt(0), 0) % letters.length;
  if (real && letters[i] === real.toUpperCase()[0]) i = (i + 1) % letters.length;
  return letters[i];
}

export type TagContext = { code: string; aliasEmail?: string };

export function realValue(kind: FieldKind, p: Profile): string {
  switch (kind) {
    case "email": return p.email;
    case "phone": return p.phone;
    case "fullName": return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    case "firstName": return p.firstName;
    case "lastName": return p.lastName;
    case "street": return p.street;
    case "city": return p.city;
    case "state": return p.state;
    case "zip": return p.zip;
    case "dob": return p.dob;
    default: return "";
  }
}

export function taggedValue(kind: FieldKind, p: Profile, t: TagContext): string {
  switch (kind) {
    case "email":
      if (!t.aliasEmail) throw new Error("tagged email requested without an alias");
      return t.aliasEmail;
    case "fullName":
      return `${p.firstName} ${tagInitial(t.code, p.middleName)}. ${p.lastName}`;
    case "street":
      // Mail still arrives; the attention line identifies whose copy of the address this is.
      return `${p.street} Attn ${t.code}`;
    default:
      throw new Error(`${kind} cannot be tagged`);
  }
}

export function valueFor(kind: FieldKind, action: Action, p: Profile, t: TagContext): string {
  if (action === "withhold") return "";
  if (action === "tag") return taggedValue(kind, p, t);
  return realValue(kind, p);
}
