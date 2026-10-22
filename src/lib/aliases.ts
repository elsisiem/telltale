import type { Profile } from "./vault";

// Issues the working, per-recipient email address that replaces the real one.
export interface AliasProvider {
  name: string;
  create(code: string, recipientDomain: string, profile: Profile): Promise<string>;
}

/**
 * Free fallback: plus-addressing on the person's real mailbox (maya+k7q2@gmail.com). It routes
 * to the real inbox with no setup, but a broker can strip the tag, so it is weaker evidence than
 * a dedicated inbox.
 */
export const plusAddressing: AliasProvider = {
  name: "plus-addressing",
  async create(code, _domain, profile) {
    const [local, host] = profile.email.split("@");
    return `${local}+${code.toLowerCase()}@${host}`;
  },
};

let provider: AliasProvider | null = null;

export async function aliasProvider(): Promise<AliasProvider> {
  if (provider) return provider;
  const chosen = process.env.AGENTMAIL_API_KEY
    ? (await import("./integrations/agentmail")).agentMailProvider()
    : plusAddressing;
  provider = chosen;
  return chosen;
}

export function _setAliasProvider(p: AliasProvider | null) {
  provider = p;
}
