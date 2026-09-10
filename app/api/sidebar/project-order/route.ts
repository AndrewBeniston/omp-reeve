import { NextResponse } from "next/server";
import { normalizeProjectOrder } from "@/lib/project-order";
import { readProjectOrder, writeProjectOrder } from "@/lib/reeve-ui-state";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { projectOrder: readProjectOrder() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { projectOrder?: unknown };
    if (!Array.isArray(body.projectOrder)
      || body.projectOrder.some((project) => typeof project !== "string" || project.length === 0)
      || new Set(body.projectOrder).size !== body.projectOrder.length) {
      return NextResponse.json({ error: "projectOrder must contain unique project paths." }, { status: 400 });
    }
    const projectOrder = normalizeProjectOrder(body.projectOrder);
    writeProjectOrder(projectOrder);
    return NextResponse.json({ projectOrder });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
