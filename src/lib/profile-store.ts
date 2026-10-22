import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "./db";
import { DATA_DIR, DEMO_PROFILE, type Profile } from "./vault";

// The person's details and preferences, encrypted at rest (AES-256-GCM) in the database. The key
// comes from TELLTALE_VAULT_KEY (a deployment secret), or a key file on this machine when running
// locally, so the database alone never reveals anyone's details. With no saved profile, Telltale
// runs as the synthetic stage persona.

export type Settings = {
  /** Fill forms but never press submit. Always on for the synthetic persona. */
  dryRun: boolean;
};

const DEFAULT_SETTINGS: Settings = { dryRun: false };

export const ProfileInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(""),
  street: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(40).optional().default(""),
  zip: z.string().trim().max(20).optional().default(""),
  dob: z.string().trim().max(20).optional().default(""),
});

function vaultKey(): Buffer {
  const fromEnv = process.env.TELLTALE_VAULT_KEY?.trim();
  if (fromEnv) {
    const k = Buffer.from(fromEnv, "base64");
    if (k.length !== 32) throw new Error("TELLTALE_VAULT_KEY must be 32 bytes, base64-encoded");
    return k;
  }
  const file = path.join(DATA_DIR, "keys", "vault.key");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
}

export function seal(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal<T>(sealed: string): T {
  const raw = Buffer.from(sealed, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

async function read<T>(key: string): Promise<T | null> {
  const d = await db();
  const { rows } = await d.query<{ value: string }>("select value from vault where key = $1", [key]);
  if (!rows[0]) return null;
  try {
    return unseal<T>(rows[0].value);
  } catch {
    console.warn(`[vault] could not decrypt "${key}" (was the vault key changed?); ignoring it`);
    return null;
  }
}

async function write(key: string, value: unknown | null) {
  const d = await db();
  if (value === null) await d.query("delete from vault where key = $1", [key]);
  else await d.query("insert into vault (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()", [key, seal(value)]);
}

type G = typeof globalThis & { __telltaleVault?: { profile: Profile | null; settings: Settings } };
const g = globalThis as G;

export async function vaultState(): Promise<{ profile: Profile | null; settings: Settings }> {
  if (!g.__telltaleVault) {
    const [profile, settings] = await Promise.all([read<Profile>("profile"), read<Settings>("settings")]);
    g.__telltaleVault = { profile, settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } };
  }
  return g.__telltaleVault;
}

/** The person whose details the gate types: the saved profile, or the synthetic persona. */
export async function loadProfile(): Promise<Profile> {
  return (await vaultState()).profile ?? DEMO_PROFILE;
}

export async function saveProfile(input: z.input<typeof ProfileInput>): Promise<Profile> {
  const profile: Profile = { ...ProfileInput.parse(input), synthetic: false };
  await write("profile", profile);
  g.__telltaleVault = undefined;
  return profile;
}

export async function clearProfile() {
  await write("profile", null);
  g.__telltaleVault = undefined;
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const next = { ...(await vaultState()).settings, ...s };
  await write("settings", next);
  g.__telltaleVault = undefined;
  return next;
}

/** Never submit for the synthetic persona; otherwise the person's setting decides (env can force it). */
export async function isDryRun(): Promise<boolean> {
  if (process.env.TELLTALE_DRY_RUN === "1") return true;
  const { profile, settings } = await vaultState();
  if (!profile) return process.env.TELLTALE_DRY_RUN !== "0";
  return settings.dryRun;
}

export function _resetVaultCache() {
  g.__telltaleVault = undefined;
}
