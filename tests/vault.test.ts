import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { _resetVaultCache, clearProfile, isDryRun, loadProfile, saveProfile, saveSettings, seal, unseal } from "@/lib/profile-store";
import { DEMO_PROFILE } from "@/lib/vault";

const KEY = crypto.randomBytes(32).toString("base64");
process.env.TELLTALE_VAULT_KEY = KEY;

afterAll(async () => {
  await clearProfile();
  delete process.env.TELLTALE_VAULT_KEY;
});

describe("vault encryption", () => {
  it("round-trips and rejects tampering", () => {
    const sealed = seal({ email: "a@b.co" });
    expect(sealed).not.toContain("a@b.co");
    expect(unseal<{ email: string }>(sealed).email).toBe("a@b.co");
    const raw = Buffer.from(sealed, "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => unseal(raw.toString("base64"))).toThrow();
  });
});

describe("profile store", () => {
  it("uses the synthetic persona until a profile is saved, and always dry-runs it", async () => {
    _resetVaultCache();
    expect((await loadProfile()).synthetic).toBe(true);
    expect(await isDryRun()).toBe(true);
  });

  it("stores the profile encrypted and honours the dry-run setting", async () => {
    await saveProfile({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.org", zip: "94110" });
    const p = await loadProfile();
    expect(p).toMatchObject({ firstName: "Ada", email: "ada@example.org", synthetic: false });
    const d = await db();
    const { rows } = await d.query<{ value: string }>("select value from vault where key = 'profile'");
    expect(rows[0].value).not.toContain("ada@example.org");

    expect(await isDryRun()).toBe(false);
    await saveSettings({ dryRun: true });
    expect(await isDryRun()).toBe(true);

    await clearProfile();
    expect((await loadProfile()).firstName).toBe(DEMO_PROFILE.firstName);
  });

  it("rejects an invalid email", async () => {
    await expect(saveProfile({ firstName: "A", lastName: "B", email: "not-an-email" })).rejects.toThrow();
  });
});
