// UI-facing shapes for the rows /api/state returns. The server types its SQL rows loosely, so
// these pin down the columns the console reads. Type-only imports: nothing server-side ships.
import type { DashboardState } from "@/lib/state";
import type { Action, FieldKind } from "@/lib/policy";
import type { RiskLevel } from "@/lib/risk";
import type { Classification } from "@/lib/leaks";
import type { RequestRow } from "@/lib/requests";
import type { PendingView } from "@/lib/gate";

export type { Action, FieldKind, RiskLevel, Classification, PendingView };

export type DisclosureField = { selector: string; kind: FieldKind; label: string; action: Action };

export type DisclosureRow = {
  id: string;
  created_at: string;
  recipient_host: string;
  recipient_domain: string;
  broker_ids: string[];
  risk_level: RiskLevel;
  tag_code: string;
  alias_email: string | null;
  fields: DisclosureField[];
  purpose: string | null;
  receipt_id: string | null;
};

export type MessageRow = {
  id: string;
  received_at: string;
  to_addr: string;
  from_addr: string;
  from_domain: string | null;
  subject: string | null;
  snippet: string | null;
  disclosure_id: string | null;
  classification: Classification;
  replay: boolean;
};

export type LeakEvidence = {
  tagCode: string;
  issuedTo: { domain: string; at: string; receiptId?: string };
  observed: { channel: string; from: string; to: string; senderDomain: string; at: string; subject?: string; replay: boolean };
  senderRegistry: { id: string; name: string }[];
  senderFindings: string[];
  violation: { requestIds: string[]; deadlinePassed: string[]; note: string } | null;
};

export type LeakRow = {
  id: string;
  detected_at: string;
  disclosure_id: string;
  message_id: string;
  sender_domain: string;
  sender_broker_ids: string[];
  evidence: LeakEvidence;
};

export type RequestSummary = Omit<RequestRow, "body">;
export type { RequestRow };

export type ComplaintRow = { id: string; created_at: string; leak_id: string | null; request_id: string | null; status: string };

export type UiState = Omit<DashboardState, "disclosures" | "messages" | "leaks" | "requests" | "complaints"> & {
  disclosures: DisclosureRow[];
  messages: MessageRow[];
  leaks: LeakRow[];
  requests: RequestSummary[];
  complaints: ComplaintRow[];
};

/** A consent card: either a live pending request (has id) or a read-only preview. */
export type CardView = Omit<PendingView, "id" | "createdAt" | "status"> & { id?: string; createdAt?: string; status?: PendingView["status"] };

export type ComplaintDoc = { id: string; title: string; body: string };

export type ReceiptResponse = { verified: boolean; receipt: Record<string, unknown> & { receiptId?: string; signature?: { alg: string; publicKey: string; value: string } } };

// Daylight (broker opt-out page sweep). Coded against the planned /api/daylight contract.
export type DaylightStatus = "visible" | "hidden" | "blocked" | "unreachable";
export type DaylightSignal = { type: string; detail: string };
export type DaylightResult = { brokerId: string; name: string; url: string; status: DaylightStatus; signals: DaylightSignal[] };
export type DaylightScan = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  summary: { total: number; counts: Record<DaylightStatus, number>; hidden: unknown[] } | null;
};
export type DaylightResponse = { scan: DaylightScan | null; results: DaylightResult[] };
