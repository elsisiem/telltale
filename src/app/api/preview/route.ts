import { NextResponse } from "next/server";
import { z } from "zod";
import { preview, type FormField } from "@/lib/gate";

export const runtime = "nodejs";

const KINDS = ["email", "phone", "fullName", "firstName", "lastName", "street", "city", "state", "zip", "dob", "ssn", "governmentId", "financialAccount", "other"] as const;

const Body = z.object({
  url: z.string(),
  orgName: z.string().optional(),
  fields: z.array(z.object({ selector: z.string(), kind: z.enum(KINDS), label: z.string(), required: z.boolean().optional() })).optional(),
});

const DEFAULT_FIELDS: FormField[] = [
  { selector: "name", kind: "fullName", label: "Full name" },
  { selector: "email", kind: "email", label: "Email" },
  { selector: "phone", kind: "phone", label: "Phone" },
  { selector: "street", kind: "street", label: "Street address" },
  { selector: "zip", kind: "zip", label: "ZIP" },
  { selector: "dob", kind: "dob", label: "Date of birth" },
];

/** What Telltale would decide for a site, without an agent run. */
export async function POST(req: Request) {
  const b = Body.parse(await req.json());
  return NextResponse.json(await preview({ url: b.url, orgName: b.orgName, purpose: "Preview", fields: b.fields ?? DEFAULT_FIELDS }));
}
