import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { readSessionHeader, resolveSessionPath } from "@/lib/session-reader";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  activeSpeechSessionId,
  closeSpeechSession,
  getOrCreateSpeechBridge,
  getSpeechAvailability,
  getSpeechBridge,
} from "@/lib/speech-bridge";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function speechSession(id: string): Promise<{ id: string; cwd: string } | null> {
  const live = getRpcSession(id);
  if (live?.isAlive()) return { id: live.sessionId, cwd: live.cwd };
  const path = await resolveSessionPath(id);
  if (!path) return null;
  const header = readSessionHeader(path);
  if (!header?.cwd) return null;
  return { id: header.id, cwd: header.cwd };
}

// GET returns the current state. GET ?events opens the typed event stream.
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  try {
    const session = await speechSession((await params).id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const state = getSpeechBridge(session.id)?.snapshot ?? "idle";
    if (!new URL(request.url).searchParams.has("events")) {
      return NextResponse.json({ sessionId: session.id, state, ...(await getSpeechAvailability(session.cwd)) });
    }

    const bridge = getOrCreateSpeechBridge(session.id, session.cwd);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const send = (event: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        send({ type: "connected", sessionId: session.id });
        const unsubscribe = bridge.subscribe(event => {
          send(event);
          if (event.type === "closed") cleanup();
        });
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(":\n\n"));
        }, 30_000);
        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          request.signal.removeEventListener("abort", cleanup);
          controller.close();
        };
        if (request.signal.aborted) cleanup();
        else request.signal.addEventListener("abort", cleanup, { once: true });
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// POST { action: "start" | "stop" | "cancel" }. Long speech work reports through GET ?events.
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const body = await request.json() as { action?: string };
    if (body.action !== "start" && body.action !== "stop" && body.action !== "cancel") {
      return NextResponse.json({ error: "Unknown speech action" }, { status: 400 });
    }
    const session = await speechSession((await params).id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (body.action === "start") {
      const activeId = activeSpeechSessionId();
      if (activeId && (activeId !== session.id || getSpeechBridge(session.id)?.unavailableForStart)) {
        return NextResponse.json({ code: "speech-busy", error: "Another session is using speech input" }, { status: 409 });
      }
    }
    const bridge = getOrCreateSpeechBridge(session.id, session.cwd);
    if (body.action === "start") void bridge.start();
    else if (body.action === "stop") void bridge.stop();
    else await bridge.cancel();
    return NextResponse.json({ sessionId: session.id, state: bridge.snapshot }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  try {
    const session = await speechSession((await params).id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    await closeSpeechSession(session.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
