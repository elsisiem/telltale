import type { Metadata } from "next";
import { EvidenceView } from "@/components/EvidenceView";

export const metadata: Metadata = { title: "Evidence · Telltale" };

export default async function EvidencePage({ params }: { params: Promise<{ leakId: string }> }) {
  const { leakId } = await params;
  return <EvidenceView leakId={leakId} />;
}
