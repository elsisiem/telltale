import type { Metadata } from "next";
import { DaylightBoard } from "@/components/DaylightBoard";

export const metadata: Metadata = { title: "Daylight · Telltale" };

export default function DaylightPage() {
  return <DaylightBoard />;
}
