// Node-only startup work. instrumentation.ts imports this file only in the
// Node.js runtime, so the edge bundle never sees these imports.
import type { configureHttpDispatcher as ConfigureHttpDispatcher } from "@/lib/http-dispatcher";

type DispatcherModule = { configureHttpDispatcher: typeof ConfigureHttpDispatcher };

export async function registerNode(): Promise<void> {
  if (typeof process.versions.bun === "string") {
    const [{ collectBrowserUploads }, { SessionManager }] = await Promise.all([
      import("@/lib/upload-store"),
      import("@oh-my-pi/pi-coding-agent"),
    ]);
    const existingSessions = new Set((await SessionManager.listAll()).map(session => session.id));
    try {
      await collectBrowserUploads({ sessionExists: async sessionId => existingSessions.has(sessionId) });
    } catch (error) {
      console.warn(error);
    }
    return;
  }

  // Keep the Node-only undici graph out of Next's browser/edge instrumentation
  // bundles. Node 22 can load this local TypeScript module directly.
  const importRuntimeModule = Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<DispatcherModule>;
  const moduleUrl = `file://${encodeURI(process.cwd())}/lib/http-dispatcher.ts`;
  const { configureHttpDispatcher } = await importRuntimeModule(moduleUrl);
  await configureHttpDispatcher();
}
