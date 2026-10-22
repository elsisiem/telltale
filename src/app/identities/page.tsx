import type { Metadata } from "next";
import { IdentitiesView } from "@/components/IdentitiesView";

export const metadata: Metadata = { title: "Identities · Telltale" };

export default function IdentitiesPage() {
  return <IdentitiesView />;
}
