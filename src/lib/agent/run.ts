import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { emit } from "../events";
import { requestDisclosure } from "../gate";
import type { FieldKind } from "../policy";
import { loadProfile } from "../vault";
import { openBrowser, snapshot, type BrowserSession } from "./browser";

// The personal agent. It browses and fills forms for the person, but it never holds their
// details: it describes each field by kind, and Telltale's gate decides and types the values.

const MODEL = process.env.TELLTALE_MODEL ?? "claude-sonnet-5-5";
const MAX_TURNS = 25;

const KINDS = [
  "email", "phone", "fullName", "firstName", "lastName", "street", "city", "state", "zip", "dob",
  "ssn", "governmentId", "financialAccount", "other",
] as const satisfies readonly FieldKind[];

const SYSTEM = `You are a personal agent that completes web tasks for one person.

You do not know the person's name, email, phone, address, or any other personal detail, and you must not guess or invent them. Their details are held by Telltale, a consent layer between you and every website. To put personal information into a form, call fill_form once with every personal field on the page, describing each by kind. Telltale identifies who receives the data, asks the person when needed, and types the values itself. Its result tells you which fields were sent, tagged, or withheld; you never see the values.

Rules:
- Use read_page before acting on a page and after each navigation or submission.
- Never put personal details into a form any other way than fill_form.
- If fill_form says the person declined, do not submit. Stop and report that.
- A withheld field is intentional. If the form rejects a withheld required field, report it rather than working around it.
- Non-personal choices (checkboxes for terms, plan selection) you may make with click when the task requires them.
- When the task is complete or cannot continue, call finish with a one-sentence summary.`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "navigate",
    description: "Open a URL in the browser.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
    strict: true,
  },
  {
    name: "read_page",
    description: "Return the current page's URL, title, visible text, form fields (with selectors and labels) and buttons.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "fill_form",
    description:
      "Fill personal-information fields on the current page through Telltale. List every personal field you intend to fill, each with its selector from read_page and its kind. Telltale fills them; you receive only the per-field outcome.",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string", description: "Why the person is giving this site their data, in a few words." },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              selector: { type: "string" },
              kind: { type: "string", enum: [...KINDS] },
              label: { type: "string", description: "The field's visible label." },
              required: { type: "boolean" },
            },
            required: ["selector", "kind", "label", "required"],
            additionalProperties: false,
          },
        },
      },
      required: ["purpose", "fields"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "set_field",
    description:
      "Type or select a NON-personal answer (e.g. vehicle year, coverage type, a search term). Never use this for anything about the person: use fill_form.",
    input_schema: {
      type: "object",
      properties: { selector: { type: "string" }, value: { type: "string" } },
      required: ["selector", "value"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "click",
    description: "Click a button, link or checkbox by its selector from read_page.",
    input_schema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"], additionalProperties: false },
    strict: true,
  },
  {
    name: "finish",
    description: "End the task with a one-sentence summary for the person.",
    input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
    strict: true,
  },
];

// With the synthetic stage persona, never submit contact details to a real business.
const dryRun = () => process.env.TELLTALE_DRY_RUN === "1" || (process.env.TELLTALE_DRY_RUN !== "0" && loadProfile().synthetic === true);
const SUBMIT_RE = /submit|get (my )?(free )?quotes?|see (my )?(rates|quotes)|sign ?up|create|register|send|request|finish|complete|view (my )?(rates|results)|continue|next/i;
const LOCAL_URL = /(localhost|127\.0\.0\.1)(:\d+)?/;
const CONTACT_KINDS = new Set<FieldKind>(["email", "phone", "fullName", "firstName", "lastName", "street"]);
const contactSharedOn = new Set<string>();

function looksPersonal(v: string): boolean {
  const p = loadProfile();
  const real = [p.email, p.phone, p.firstName, p.lastName, p.street, p.dob].filter((x) => x && x.length > 2).map((x) => x.toLowerCase());
  const s = v.toLowerCase();
  return /@/.test(v) || /\d{3}\D?\d{3}\D?\d{4}/.test(v) || real.some((x) => s.includes(x));
}

const FillInput = z.object({
  purpose: z.string(),
  fields: z.array(z.object({ selector: z.string(), kind: z.enum(KINDS), label: z.string(), required: z.boolean() })),
});

export async function execute(session: BrowserSession, runId: string, name: string, input: unknown): Promise<{ text: string; finished?: string }> {
  const { page } = session;
  switch (name) {
    case "navigate": {
      const { url } = z.object({ url: z.string().url() }).parse(input);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return { text: `Opened ${page.url()}` };
    }
    case "read_page":
      return { text: JSON.stringify(await snapshot(page)) };
    case "fill_form": {
      const req = FillInput.parse(input);
      const snap = await snapshot(page);
      const result = await requestDisclosure({ url: page.url(), orgName: snap.siteName ?? undefined, purpose: req.purpose, fields: req.fields, runId });
      if (result.status === "denied") return { text: "The person declined to share this information with this site. Do not submit the form." };
      for (const f of req.fields) {
        const value = result.values[f.selector];
        if (!value) continue;
        const el = page.locator(f.selector);
        const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
        if (tagName === "select") await el.selectOption({ label: value }).catch(() => el.selectOption(value));
        else await el.fill(value);
      }
      if (req.fields.some((f) => CONTACT_KINDS.has(f.kind) && result.values[f.selector])) contactSharedOn.add(new URL(page.url()).host);
      const lines = result.summary.map((s) => `${s.label}: ${s.action === "tag" ? "filled with a tagged value" : s.action === "send" ? "filled" : "left empty (withheld by the person)"}`);
      return { text: `Telltale ${result.prompted ? "asked the person and " : ""}filled the form.\n${lines.join("\n")}` };
    }
    case "set_field": {
      const { selector, value } = z.object({ selector: z.string(), value: z.string() }).parse(input);
      if (looksPersonal(value)) return { text: "Refused: that looks like personal information. Use fill_form so Telltale can decide." };
      const el = page.locator(selector).first();
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName === "select") await el.selectOption({ label: value }).catch(() => el.selectOption(value));
      else await el.fill(value);
      return { text: `Set ${selector}` };
    }
    case "click": {
      const { selector } = z.object({ selector: z.string() }).parse(input);
      const loc = page.locator(selector).first();
      const host = new URL(page.url()).host;
      // The fictional demo pages served by this app are not real businesses, so submitting is fine.
      if (dryRun() && !LOCAL_URL.test(host) && contactSharedOn.has(host)) {
        const label = ((await loc.textContent().catch(() => "")) ?? "") + " " + ((await loc.getAttribute("value").catch(() => "")) ?? "");
        if (SUBMIT_RE.test(label)) {
          return { text: "Dry run: Telltale stopped here so the demo persona's contact details are not submitted to a real company. Call finish and tell the person the form is filled and ready to submit." };
        }
      }
      await loc.click({ timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return { text: `Clicked ${selector}. Now at ${page.url()}` };
    }
    case "finish": {
      const { summary } = z.object({ summary: z.string() }).parse(input);
      return { text: "ok", finished: summary };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

export async function runAgent(task: string, opts: { runId?: string } = {}): Promise<{ runId: string; summary: string }> {
  const runId = opts.runId ?? crypto.randomUUID();
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  // Keys not scoped to a workspace must name one on every request.
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const session = await openBrowser({ local: LOCAL_URL.test(task) });
  emit({ type: "agent.browser", runId, liveViewUrl: session.liveViewUrl });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: task }];
  let summary = "Stopped without finishing.";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools,
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      messages.push({ role: "assistant", content: response.content });

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) emit({ type: "agent.log", runId, text: block.text });
      }
      if (response.stop_reason === "refusal") {
        summary = "The model declined this task.";
        break;
      }
      if (response.stop_reason === "pause_turn") continue;
      const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!uses.length) {
        summary = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join(" ") || summary;
        break;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      let finished: string | undefined;
      for (const use of uses) {
        emit({ type: "agent.tool", runId, tool: use.name, input: use.input });
        try {
          const r = await execute(session, runId, use.name, use.input);
          finished ??= r.finished;
          results.push({ type: "tool_result", tool_use_id: use.id, content: r.text });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: `Error: ${(err as Error).message}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      if (finished) {
        summary = finished;
        break;
      }
    }
  } finally {
    emit({ type: "agent.done", runId, summary });
    await session.close().catch(() => {});
  }
  return { runId, summary };
}
