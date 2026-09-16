import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { resolveReviewWatchRepository, subscribeReviewWatch } from "@/lib/review-watch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await authorizeReviewOwner(request.nextUrl.searchParams);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    const roots = await getAllowedFileRoots();
    const allowed = (target: string) => isFilePathAllowed(target, roots) && isExistingFilePathAllowed(target, roots);
    const repository = await resolveReviewWatchRepository(cwd);
    if (![repository.root, ...repository.gitDirectories].every(allowed)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    let cleanup = () => {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const subscription: { stop?: () => void } = {};
        const send = (contents: string) => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(contents)); }
          catch { cleanup(); }
        };
        const heartbeat = setInterval(() => send(": heartbeat\n\n"), 25_000);
        heartbeat.unref?.();
        cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          subscription.stop?.();
          request.signal.removeEventListener("abort", cleanup);
          try { controller.close(); } catch { /* Already cancelled. */ }
        };
        request.signal.addEventListener("abort", cleanup, { once: true });
        if (request.signal.aborted) { cleanup(); return; }
        subscription.stop = subscribeReviewWatch(repository, (event) => send(`data: ${JSON.stringify(event)}\n\n`));
        if (closed) subscription.stop();
      },
      cancel() { cleanup(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive", "X-Accel-Buffering": "no",
    } });
  } catch {
    return NextResponse.json({ error: "Changes cannot be watched here. Refresh Review manually." }, { status: 409 });
  }
}
