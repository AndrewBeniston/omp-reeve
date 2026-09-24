import { NextResponse } from "next/server";
import { buildSessionContext as ompBuildSessionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionEntries, resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { AttachmentPathError } from "@/lib/attachment-paths";
import { UploadError } from "@/lib/upload-store";
import { GoalApiError, readPersistedGoalState } from "@/lib/goal-command";
import type { GoalCommandResult } from "@/lib/omp-types";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const { session } = await startRpcSession(id, filePath, undefined);
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot send the same Retry twice")) {
      return NextResponse.json({ error: error.message, code: "retry_duplicate" }, { status: 409 });
    }
    if (error instanceof GoalApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: error instanceof AttachmentPathError || error instanceof UploadError ? error.status : 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      const filePath = await resolveSessionPath(id);
      if (!filePath) return NextResponse.json({ running: false, goal: null, goalState: null });
      // Read the file through the shared reader. Only startRpcSession opens a
      // SessionManager, so a read never races a live wrapper on the file.
      const entries = await getSessionEntries(filePath);
      const sessionManager = {
        buildSessionContext: () => ompBuildSessionContext(entries as unknown as Parameters<typeof ompBuildSessionContext>[0]),
      };
      try {
        const goal = readPersistedGoalState(sessionManager);
        return NextResponse.json({ running: false, goal: goal.goal, goalState: goal.state });
      } catch (error) {
        if (error instanceof GoalApiError && error.code === "goal_invalid_snapshot") {
          return NextResponse.json({ running: false, goal: null, goalState: null });
        }
        throw error;
      }
    }

    const state = await session.send({ type: "get_state" }) as {
      goal?: GoalCommandResult["goal"];
      goalState?: GoalCommandResult["state"];
    };
    return NextResponse.json({ running: true, state, goal: state.goal ?? null, goalState: state.goalState ?? null });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
