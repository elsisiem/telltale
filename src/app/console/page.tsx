import type { Metadata } from "next";
import { Console } from "@/components/Console";

export const metadata: Metadata = { title: "Console · Telltale" };

export default function ConsolePage() {
  return <Console />;
}
