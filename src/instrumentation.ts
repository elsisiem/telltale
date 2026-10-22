// Runs once when the Next.js server starts. The runtime check must wrap the import directly so
// the bundler drops Node-only code from the edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
