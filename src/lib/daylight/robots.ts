// robots.txt evaluation with Google's semantics (RFC 9309 plus Google's documented behavior):
// one group per run of user-agent lines, the most specific matching group wins outright,
// and within it the longest matching rule wins with Allow beating Disallow on ties.

export type RobotsRule = { allow: boolean; pattern: string; line: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
export type RobotsVerdict = { disallowed: boolean; rule?: string; group?: string };

export function parseRobots(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of txt.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      current.rules.push({ allow: key === "allow", pattern: value, line });
    } else {
      // Sitemap and unknown records neither end a group nor belong to one.
      lastWasAgent = false;
    }
  }
  return groups;
}

function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Collapse percent-encoding of unreserved characters so "/opt%2Dout" and "/opt-out" compare equal. */
function normalizePath(p: string): string {
  return p.replace(/%([0-9a-fA-F]{2})/g, (m, hex: string) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(c) ? c : m.toUpperCase();
  });
}

export function matchGroup(groups: RobotsGroup[], userAgents: string[]): RobotsGroup | null {
  for (const ua of userAgents.map((u) => u.toLowerCase())) {
    const hits = groups.filter((g) => g.agents.includes(ua));
    if (hits.length) return { agents: [ua], rules: hits.flatMap((g) => g.rules) };
  }
  return null;
}

export function isDisallowed(robotsTxt: string, path: string, userAgents = ["googlebot", "*"]): RobotsVerdict {
  const group = matchGroup(parseRobots(robotsTxt), userAgents);
  if (!group) return { disallowed: false };
  const target = normalizePath(path.startsWith("/") ? path : `/${path}`);
  let best: RobotsRule | null = null;
  for (const r of group.rules) {
    // An empty Disallow means "allow everything" and never outranks a real rule.
    if (!r.pattern) continue;
    if (!compile(normalizePath(r.pattern)).test(target)) continue;
    if (
      !best ||
      r.pattern.length > best.pattern.length ||
      (r.pattern.length === best.pattern.length && r.allow && !best.allow)
    ) best = r;
  }
  if (!best) return { disallowed: false, group: group.agents[0] };
  if (best.allow) return { disallowed: false, rule: best.line, group: group.agents[0] };
  return { disallowed: true, rule: best.line, group: group.agents[0] };
}
