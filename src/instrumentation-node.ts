import { registerDaylight } from "./lib/daylight/findings";

registerDaylight();
if (process.env.AGENTMAIL_API_KEY) {
  import("./lib/integrations/agentmail").then(({ startAgentMailWatcher }) => startAgentMailWatcher());
}
