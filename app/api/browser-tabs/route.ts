import { stat } from "fs/promises";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { fromStoredBrowserTabs } from "@/lib/browser-tab-store";
import { readProjectBrowserTabs, writeProjectBrowserTabs } from "@/lib/browser-tab-registry";

/**
 * The Browser tabs a Project had open.
 *
 * Reeve's own registry, never an OMP file. There is deliberately no trust gate:
 * a web page is not an executable resource, so a Project that has since lost
 * trust still gets its Tabs back. Trust governs what OMP would run, and a page
 * is not that.
 */
export const dynamic = "force-dynamic";

async function validateCwd(value: unknown): Promise<
  { cwd: string } | { response: NextResponse }
> {
  if (typeof value !== "string" || !value.trim()) {
    return { response: NextResponse.json({ error: "cwd required" }, { status: 400 }) };
  }

  const cwd = resolve(value);
  try {
    if (!(await stat(cwd)).isDirectory()) {
      return { response: NextResponse.json({ error: "cwd must be a directory" }, { status: 400 }) };
    }
  } catch {
    return { response: NextResponse.json({ error: "Directory does not exist" }, { status: 400 }) };
  }

  // The same allow-list the file routes use: a caller may only name a Project
  // the interface could already reach.
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }
  return { cwd };
}

export async function GET(req: Request) {
  const result = await validateCwd(new URL(req.url).searchParams.get("cwd"));
  if ("response" in result) return result.response;
  return NextResponse.json({ tabs: readProjectBrowserTabs(result.cwd) });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; tabs?: unknown };
    const result = await validateCwd(body.cwd);
    if ("response" in result) return result.response;

    const tabs = fromStoredBrowserTabs(body.tabs);
    writeProjectBrowserTabs(result.cwd, tabs);
    return NextResponse.json({ tabs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
