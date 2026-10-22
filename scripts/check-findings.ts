import { daylightFindings } from "../src/lib/daylight/findings";
import { resolveRecipient } from "../src/lib/resolver";
process.env.TELLTALE_DB_DIR = "memory://";
(async () => {
  for (const d of process.argv.slice(2)) {
    const f = await daylightFindings(resolveRecipient(d));
    console.log(d.padEnd(28), f.length ? f.map((x) => `[${x.severity}] ${x.entity}: ${x.text}`).join("\n" + " ".repeat(29)) : "-");
  }
})();
