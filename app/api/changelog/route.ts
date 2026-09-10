import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseChangelog } from "@/lib/changelog";

/**
 * GET /api/changelog returns the parsed CHANGELOG.md that ships beside
 * package.json in every build, plus the running version.
 */
export async function GET() {
  const path = join(process.cwd(), "CHANGELOG.md");
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    return NextResponse.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0", releases: [] });
  }
  return NextResponse.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0", releases: parseChangelog(text) });
}
