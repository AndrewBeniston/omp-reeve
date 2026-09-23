import { NextResponse } from "next/server";
import { getRpcSession } from "@/lib/rpc-manager";
import { isApiRequestAllowed } from "@/lib/request-security";
import { resolveSessionPath } from "@/lib/session-reader";
import {
  MAX_UPLOAD_FILE_BYTES,
  storeBrowserUpload,
  UploadError,
  validateSessionId,
} from "@/lib/upload-store";

export const runtime = "nodejs";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof UploadError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Upload failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() !== "application/octet-stream") {
    return NextResponse.json({ error: "Content-Type must be application/octet-stream" }, { status: 415 });
  }
  if (request.headers.has("x-reeve-file-path") || request.headers.has("x-upload-path")) {
    return NextResponse.json({ error: "Server paths are not accepted" }, { status: 400 });
  }

  try {
    const { id: sessionId } = await params;
    validateSessionId(sessionId);
    if (!getRpcSession(sessionId)?.isAlive() && !await resolveSessionPath(sessionId)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const encodedName = request.headers.get("x-reeve-file-name");
    const sizeText = request.headers.get("x-reeve-file-size");
    if (!encodedName || !sizeText || !/^\d+$/.test(sizeText)) {
      throw new UploadError("File name and size are required", 400);
    }
    let name: string;
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      throw new UploadError("Invalid file name", 400);
    }
    const size = Number(sizeText);
    const length = request.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > MAX_UPLOAD_FILE_BYTES) {
      throw new UploadError("File is too large", 413);
    }
    if (length && /^\d+$/.test(length) && Number(length) !== size) {
      throw new UploadError("File size does not match its declaration", 400);
    }
    if (!request.body) throw new UploadError("A file body is required", 400);
    const upload = await storeBrowserUpload({
      sessionId,
      key: request.headers.get("idempotency-key") ?? "",
      name,
      size,
      mediaType: request.headers.get("x-reeve-media-type") || "application/octet-stream",
      body: request.body,
    });
    return NextResponse.json(upload, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
