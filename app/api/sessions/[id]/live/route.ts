import { NextResponse } from "next/server";
import { getOrCreateLiveControllerBridge, getLiveControllerBridge, closeLiveControllerSession } from "@/lib/live-controller-bridge";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { resolveSessionPath } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function liveSession(id: string) {
  const running = getRpcSession(id);
  if (running?.isAlive()) return running.inner;
  const path = await resolveSessionPath(id);
  if (!path) return null;
  return (await startRpcSession(id, path, undefined)).session.inner;
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  try {
    const id = (await params).id;
    if (!new URL(request.url).searchParams.has("events")) {
      return NextResponse.json({ sessionId: id, state: getLiveControllerBridge(id)?.snapshot ?? null });
    }
    const session = await liveSession(id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const bridge = getOrCreateLiveControllerBridge(session.sessionId, session);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const send = (event: unknown) => {
          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
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
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(request)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  try {
    const body = await request.json() as { action?: string };
    if (body.action !== "start" && body.action !== "stop" && body.action !== "cancel" && body.action !== "toggle-mute") {
      return NextResponse.json({ error: "Unknown live action" }, { status: 400 });
    }
    const session = await liveSession((await params).id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const bridge = getOrCreateLiveControllerBridge(session.sessionId, session);
    if (body.action === "start") void bridge.start();
    else if (body.action === "stop") void bridge.stop();
    else if (body.action === "cancel") await bridge.cancel();
    else bridge.toggleMute();
    return NextResponse.json({ sessionId: session.sessionId, state: bridge.snapshot }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  try {
    await closeLiveControllerSession((await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
