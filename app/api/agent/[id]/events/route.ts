import { resolveSessionPath } from "@/lib/session-reader";
import {
  getRpcSession,
  startRpcSession,
  subscribeRpcSessionEvents,
  type AgentEvent,
} from "@/lib/rpc-manager";
import { isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const OMITTED_EVENT_TYPES = new Set(["turn_start", "turn_end", "tool_execution_update"]);

function toClientEvent(event: AgentEvent): AgentEvent | null {
  if (OMITTED_EVENT_TYPES.has(event.type)) return null;
  if (event.type === "message_update") {
    const clientEvent = { ...event };
    delete clientEvent.assistantMessageEvent;
    return clientEvent;
  }
  if (event.type === "agent_end") return { type: "agent_end" };
  return event;
}

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isApiRequestAllowed(req)) {
    return new Response("Untrusted API request", { status: 403 });
  }

  const pendingEvents: AgentEvent[] = [];
  let forwardEvent = (event: AgentEvent) => {
    pendingEvents.push(event);
  };
  const unsubscribe = subscribeRpcSessionEvents(id, (event) => {
    const clientEvent = toClientEvent(event);
    if (clientEvent) forwardEvent(clientEvent);
  });

  let filePath: string | undefined;
  const existingSession = getRpcSession(id);
  if (!existingSession || !existingSession.isAlive()) {
    try {
      filePath = await resolveSessionPath(id) ?? undefined;
    } catch (error) {
      unsubscribe();
      throw error;
    }
    if (!filePath) {
      unsubscribe();
      return new Response("Session not found", { status: 404 });
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const encode = (data: unknown) => {
        if (closed) return;
        const text = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(text));
      };

      // Send initial connected event before variable session startup completes.
      encode({ type: "connected", sessionId: id });
      for (const event of pendingEvents) encode(event);
      pendingEvents.length = 0;
      forwardEvent = (event) => encode(event);

      // Heartbeat every 30s to prevent server/proxy timeout (Next.js default ~120-150s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          // controller already closed
        }
      }, 30_000);

      // Cleanup when client disconnects
      const cleanup = () => {
        if (closed) return;
        closed = true;
        forwardEvent = () => {};
        clearInterval(heartbeat);
        unsubscribe();
        req.signal?.removeEventListener("abort", cleanup);
        controller.close();
      };

      // Detect client disconnect via abort signal
      if (req.signal?.aborted) {
        cleanup();
        return;
      }
      req.signal?.addEventListener("abort", cleanup, { once: true });

      if (!getRpcSession(id)?.isAlive() && filePath) {
        void startRpcSession(id, filePath, undefined).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          encode({ type: "prompt_error", errorMessage: `Failed to start agent: ${message}` });
          cleanup();
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
