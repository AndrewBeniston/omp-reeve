import fs from "node:fs";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { isApiRequestAllowed } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let filePath: unknown;
  try {
    ({ filePath } = await request.json());
  } catch {
    return NextResponse.json({ exists: false });
  }

  if (typeof filePath !== "string" || !filePath || filePath.includes("\0")) {
    return NextResponse.json({ exists: false });
  }

  const allowedRoots = await getAllowedFileRoots();
  let exists = false;
  if (isFilePathAllowed(filePath, allowedRoots)) {
    try {
      exists = fs.statSync(filePath).isFile() && isExistingFilePathAllowed(filePath, allowedRoots);
    } catch {
      exists = false;
    }
  }

  return NextResponse.json({ exists }, {
    headers: { "Cache-Control": "no-store" },
  });
}
