export async function register(): Promise<void> {
  // Next removes this import from the edge bundle only in this form.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
