import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { isApiRequestAllowed } from "@/lib/request-security";
import { resolveSessionPath } from "@/lib/session-reader";
import { findBrowserUpload, releaseBrowserUpload, UploadError, validateSessionId } from "@/lib/upload-store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; uploadId: string }> }) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  try {
    const { id: sessionId, uploadId } = await params;
    validateSessionId(sessionId);
    if (!getRpcSession(sessionId)?.isAlive() && !await resolveSessionPath(sessionId)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const result = await findBrowserUpload({ sessionId, id: uploadId });
    if (!result) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    return NextResponse.json(result.upload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Upload lookup failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; uploadId: string }> }) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  try {
    const { id: sessionId, uploadId } = await params;
    validateSessionId(sessionId);
    if (!getRpcSession(sessionId)?.isAlive() && !await resolveSessionPath(sessionId)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const removed = await releaseBrowserUpload({ sessionId, id: uploadId });
    return removed
      ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "Upload not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Upload deletion failed" }, { status: 500 });
  }
}
