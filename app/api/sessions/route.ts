import { NextResponse } from "next/server";
import {
  attachSessionProjectInfo,
  listAllSessions,
  mergeSessionLists,
} from "@/lib/session-reader";
import { getRpcSessionInfos, getRunningRpcSessionIds } from "@/lib/rpc-manager";
import { readArchivedIds } from "@/lib/session-archive";
import { loadPinnedSessionIds } from "@/lib/session-pins";
import { readProjectOrder } from "@/lib/reeve-ui-state";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const showArchived = new URL(req.url).searchParams.get("archived") === "1";
    const [persistedSessions, runtimeSessions] = await Promise.all([
      listAllSessions({ force }),
      attachSessionProjectInfo(getRpcSessionInfos()),
    ]);
    const archived = readArchivedIds();
    const pinned = await loadPinnedSessionIds();
    const sessions = mergeSessionLists(persistedSessions, runtimeSessions)
      .filter((s) => (showArchived ? archived.has(s.id) : !archived.has(s.id)))
      .map((session) => ({ ...session, pinned: pinned.has(session.id) }))
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
    return NextResponse.json(
      { sessions, runningSessionIds: getRunningRpcSessionIds(), projectOrder: readProjectOrder() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
