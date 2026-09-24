import { NextResponse } from "next/server";

// POST /api/default-cwd
// Retired because new chats must not create a scratch folder.
export async function POST() {
  return new NextResponse(null, { status: 410 });
}
