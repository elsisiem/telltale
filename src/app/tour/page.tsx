import type { Metadata } from "next";
import { Tour } from "@/components/Tour";
import { tourData } from "@/lib/facts";

export const metadata: Metadata = { title: "Tour · Telltale", description: "One disclosure from an agent's request to a regulator-ready complaint." };

export default function TourPage() {
  return <Tour data={tourData()} />;
}
