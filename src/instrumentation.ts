// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerDaylight } = await import("./lib/daylight/findings");
  registerDaylight();
  if (process.env.AGENTMAIL_API_KEY) {
    const { startAgentMailWatcher } = await import("./lib/integrations/agentmail");
    startAgentMailWatcher();
  }
}
