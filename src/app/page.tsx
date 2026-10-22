import { Landing } from "@/components/Landing";
import { publicFacts } from "@/lib/facts";

export default function Home() {
  return <Landing facts={publicFacts()} />;
}
