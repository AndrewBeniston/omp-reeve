import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { readFileSource, saveFileSource } from "@/lib/file-source";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

/**
 * One file's whole text, for the source view a review opens.
 *
 * Separate from `/api/files` on purpose. That route is a preview: it refuses
 * anything past 256 KiB, which is the right answer for a thumbnail of a file
 * and the wrong one for reading the change you were just shown a diff of. This
 * route carries the reference's own limits instead — 20 MiB refused, 10 MiB
 * read-only, text decided by sniffing the first 4096 bytes — and is the only
 * route that writes a file back.
 *
 * The allow-list is the same one `/api/files` uses. A path outside a Session's
 * directories, its Project root, or a root something explicitly opened is
 * refused here as it is there.
 */
export const dynamic = "force-dynamic";

async function allowedPath(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !value || value.includes("\0")) return null;
  const roots = await getAllowedFileRoots();
  if (!isFilePathAllowed(value, roots) || !isExistingFilePathAllowed(value, roots)) return null;
  return value;
}

export async function GET(request: NextRequest) {
  const filePath = await allowedPath(request.nextUrl.searchParams.get("path"));
  if (!filePath) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const result = await readFileSource(filePath);
  if (result.status === "unavailable") return NextResponse.json({ error: "This file could not be read." }, { status: 404 });
  return NextResponse.json(result);
}

/**
 * Write a file back, over the version the editor opened and no other.
 *
 * A modification time that no longer matches is not an error: the disk's own
 * text comes back with it, so the editor can merge rather than choose.
 */
export async function PUT(request: NextRequest) {
  /*
   * The proxy makes these checks for every API request. They are made again
   * here because this is the one route in Reeve that writes a file the human
   * did not name in the request that reached it, and a JSON body is something
   * a cross-site form cannot send at all.
   */
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Name a file to save." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const filePath = await allowedPath(record.path);
  if (!filePath) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (typeof record.content !== "string" || typeof record.expectedMtimeMs !== "number" || !Number.isFinite(record.expectedMtimeMs)) {
    return NextResponse.json({ error: "Name a file to save." }, { status: 400 });
  }
  const result = await saveFileSource(filePath, record.content, record.expectedMtimeMs);
  if (result.outcome === "unavailable") return NextResponse.json({ error: "This file could not be saved." }, { status: 409 });
  /*
   * The one outcome that must not be reported as a failure to do anything:
   * the file was changed and could not be changed back. The human is told
   * where their original text is rather than being left to find out.
   */
  if (result.outcome === "damaged") {
    return NextResponse.json({
      error: `This file was left partly written and could not be restored. Your original text is at ${result.recoveryPath}`,
      recoveryPath: result.recoveryPath,
    }, { status: 500 });
  }
  if (result.outcome === "too-large") {
    return NextResponse.json({ error: "This file is too large to save here.", limitBytes: result.limitBytes }, { status: 413 });
  }
  return NextResponse.json(result);
}
