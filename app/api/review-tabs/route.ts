import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { canonicalReviewCwd } from "@/lib/review-comments";
import { authorizeReviewOwner, matchRegisteredReviewTab, registerReviewOwner } from "@/lib/review-owner-server";
import { sanitizeReviewSelection } from "@/lib/review-selection";
import {
  findRegisteredReviewTab,
  readProjectReviewTabs,
  removeRegisteredReviewTab,
  ReviewTabRegistryUnreadable,
  updateRegisteredReviewTab,
  writeRegisteredReviewTab,
} from "@/lib/review-tab-registry";

/**
 * The Review Tabs a Project had open, and the binding each one carries.
 *
 * Registering a Tab here is what makes a later Review request answerable: the
 * record written now is what every read and every change is checked against.
 */
export const dynamic = "force-dynamic";

/**
 * A registry that cannot be read is never written over, and is never reported
 * as empty. A fresh response each time: a body is read once.
 */
function unreadable(): NextResponse {
  return NextResponse.json(
    { error: "Reeve could not read its Review Tabs." },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  const projectRoot = request.nextUrl.searchParams.get("projectRoot")?.trim() ?? "";
  if (!projectRoot) return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  const roots = await getAllowedFileRoots();
  if (!isFilePathAllowed(projectRoot, roots) || !isExistingFilePathAllowed(projectRoot, roots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  // A record whose Worktree has since gone, or is no longer reachable, is not
  // returned: restoring it would put a Tab on screen that every request it
  // made would then be refused for.
  try {
    const tabs = readProjectReviewTabs(projectRoot).filter((tab) => (
      canonicalReviewCwd(tab.owner.projectRoot) === canonicalReviewCwd(projectRoot)
      && isFilePathAllowed(tab.owner.worktreePath, roots)
      && isExistingFilePathAllowed(tab.owner.worktreePath, roots)
    ));
    return NextResponse.json({ tabs });
  } catch (error) {
    if (error instanceof ReviewTabRegistryUnreadable) return unreadable();
    throw error;
  }
}

async function store(request: NextRequest, registering: boolean): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  // Opening a Tab names only a Worktree and a Session; the Project and the id
  // are resolved here. Changing one names the whole binding it already has.
  const authorization = registering
    ? await registerReviewOwner(record.cwd, record.sessionId)
    : await authorizeReviewOwner(record);
  if (authorization.status === "refused") return authorization.response;
  try {
    /*
     * Opening a Tab that is already open says nothing about what it was
     * reviewing, so what it was reviewing is kept. Only a request that carries
     * a selection changes one.
     */
    const existing = findRegisteredReviewTab(authorization.tabId);
    const selection = "selection" in record
      ? sanitizeReviewSelection(record.selection)
      : existing?.selection ?? null;
    // Opening a Tab puts it in front of an open panel, which is what it will
    // come back as. Any other write says so for itself.
    const active = "active" in record ? record.active === true : registering || existing?.active === true;
    const tab = { tabId: authorization.tabId, owner: authorization.owner, selection, active };
    // A Tab closed while this was in flight stays closed.
    if (registering) writeRegisteredReviewTab(tab);
    else if (!updateRegisteredReviewTab(tab)) {
      return NextResponse.json({ error: "Access denied", reason: "unregistered-tab" }, { status: 403 });
    }
    return NextResponse.json({ tab });
  } catch (error) {
    if (error instanceof ReviewTabRegistryUnreadable) return unreadable();
    throw error;
  }
}

export async function POST(request: NextRequest) {
  return store(request, true);
}

export async function PUT(request: NextRequest) {
  return store(request, false);
}

export async function DELETE(request: NextRequest) {
  /*
   * Closing a Tab is checked against the registry alone. Its Worktree may have
   * been deleted and its Session may be gone — that is when a human most wants
   * it gone, and a live check would refuse exactly then.
   */
  const authorization = matchRegisteredReviewTab(request.nextUrl.searchParams);
  if (authorization.status === "refused") {
    // Nothing stored under that id is nothing to forget.
    if (authorization.reason !== "unregistered-tab") return authorization.response;
    return NextResponse.json({ removed: false });
  }
  try {
    removeRegisteredReviewTab(authorization.tabId);
  } catch (error) {
    if (error instanceof ReviewTabRegistryUnreadable) return unreadable();
    throw error;
  }
  return NextResponse.json({ removed: true });
}
