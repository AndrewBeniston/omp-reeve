import { NextResponse } from "next/server";
import { SessionManager } from "@oh-my-pi/pi-coding-agent";
import { getRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";
import { readSessionHistoryPage, sessionHistoryFailure } from "@/lib/session-history";
import { isApiRequestAllowed } from "@/lib/request-security";
import type { SessionEntry } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const search = new URL(req.url).searchParams;
  const cursor = search.get("cursor");
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json(sessionHistoryFailure(id, cursor, "forbidden", "Untrusted API request"), { status: 403 });
  }

  try {
    const rpc = getRpcSession(id);
    const liveRpc = rpc?.isAlive() ? rpc : undefined;
    const filePath = liveRpc ? null : await resolveSessionPath(id);
    if (!liveRpc && !filePath) {
      return NextResponse.json(sessionHistoryFailure(id, cursor, "session_not_found", "Session not found"), { status: 404 });
    }

    const manager = liveRpc?.inner.sessionManager ?? await SessionManager.open(filePath!);
    const entries = manager.getEntries() as SessionEntry[];
    const leafId = search.get("leafId") ?? manager.getLeafId();
    const result = readSessionHistoryPage({ sessionId: id, entries, leafId, cursor });
    if (!result.ok) {
      const status = result.error.code === "cursor_not_found" ? 409 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      sessionHistoryFailure(id, cursor, "read_failed", "Could not read Session history", true),
      { status: 500 },
    );
  }
}
