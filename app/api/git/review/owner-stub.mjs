import { NextResponse } from "next/server";

/**
 * The owner a Review endpoint settles before it reads or changes anything.
 *
 * The rules themselves are exercised against real Projects, Worktrees and
 * Sessions in `lib/review-owner-server.test.mjs`. A route test asks a narrower
 * question: does this endpoint ask at all, and does it then work from the
 * owner that came back rather than from what the request claimed?
 */
export const OWNER_FIELDS = { tabId: "review:tab", cwd: "/project", projectRoot: "/project" };
export const OWNER_QUERY = "tabId=review:tab&cwd=/project&projectRoot=/project";

export function reviewOwnerServerStub({ lexical = true, resolved = true } = {}) {
  return {
    authorizeReviewOwner: async (source) => {
      const read = (key) => source instanceof URLSearchParams ? source.get(key) : source?.[key];
      const tabId = read("tabId");
      const cwd = read("cwd");
      const projectRoot = read("projectRoot");
      if (!tabId || !cwd || !projectRoot || !String(cwd).startsWith("/")) {
        return { status: "refused", reason: "malformed", response: NextResponse.json({ error: "Select a Project directory." }, { status: 400 }) };
      }
      if (!lexical || !resolved) {
        return { status: "refused", reason: "denied", response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
      }
      const sessionId = read("sessionId");
      return { status: "authorized", tabId, owner: { projectRoot, worktreePath: cwd, sessionId: sessionId || null } };
    },
  };
}
