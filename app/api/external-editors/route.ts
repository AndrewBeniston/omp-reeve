import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { launchExternalEditor, listExternalEditors } from "@/lib/external-editor-detect";
import { readExternalEditorPreferences, rememberTarget, writeExternalEditorPreferences } from "@/lib/external-editor-preferences";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

/**
 * The applications a reviewed file can be opened in, and opening it in one.
 *
 * Detection runs on the server because that is where the machine is: the
 * browser cannot tell whether an editor is installed, and the desktop shell
 * should not have to be running for this to work.
 */
export const dynamic = "force-dynamic";

async function allowedPath(value: string | null): Promise<string | null> {
  if (!value || value.includes("\0")) return null;
  const roots = await getAllowedFileRoots();
  if (!isFilePathAllowed(value, roots) || !isExistingFilePathAllowed(value, roots)) return null;
  return value;
}

export async function GET(request: NextRequest) {
  const filePath = await allowedPath(request.nextUrl.searchParams.get("path"));
  if (!filePath) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json(await listExternalEditors(filePath));
}

export async function POST(request: NextRequest) {
  // Starting a process on the human's machine is worth checking twice, for
  // the same reasons the write route does.
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Name a file to open." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const filePath = await allowedPath(typeof record.path === "string" ? record.path : null);
  if (!filePath) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (typeof record.targetId !== "string" || !record.targetId) {
    return NextResponse.json({ error: "Name an application to open it in." }, { status: 400 });
  }
  const line = typeof record.line === "number" && Number.isInteger(record.line) && record.line > 0 ? record.line : undefined;
  const preferences = readExternalEditorPreferences();
  const opened = launchExternalEditor(record.targetId, { path: filePath, line }, { preferences });
  if (!opened.ok) {
    return NextResponse.json({ error: opened.reason === "unknown-target" ? "That application is not one Reeve knows." : "That application could not be found on this machine." }, { status: 404 });
  }
  /*
   * Review's own menu opens a file without changing what the file opens in
   * next time — picking an application there is a decision about this one
   * reading, not a default. Only a caller that asks is remembered.
   */
  if (record.persistPreferred === true) {
    writeExternalEditorPreferences(rememberTarget(preferences, record.targetId, typeof record.forPath === "string" ? filePath : null));
  }
  return NextResponse.json({ opened: true });
}
