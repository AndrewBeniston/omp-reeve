import { acknowledgePrDraft, type ReviewPrDraft } from "./review-pr-drafts";
import type { ReviewPrPublication, ReviewPrPublishResult } from "./review-pr-ui";

/**
 * What a thread action is aimed at, as one comparable name.
 *
 * A reply, a resolve and a reopen are aimed at a thread; an edit and a delete
 * are aimed at a comment. Anything else is not a thread action and has no aim
 * here.
 */
function aim(publication: ReviewPrPublication): string | null {
  switch (publication.action) {
    case "reply":
    case "resolve":
    case "unresolve": return "thread:" + publication.threadId;
    case "edit":
    case "delete": return "comment:" + publication.commentId;
    default: return null;
  }
}

/**
 * The unconfirmed thread action already aimed at this one, if there is one.
 *
 * The record of a write nobody could confirm is only a guard if it guards the
 * **action**, not merely itself. Pressing Unresolve a second time makes a new
 * record with a new identifier, so a check that asks "is this record
 * unconfirmed" always says no and sends the same mutation again — which is the
 * one thing the record exists to prevent.
 *
 * So the question is asked about the thread or the comment, not the record: an
 * unconfirmed write aimed at something is a reason to leave that thing alone
 * until a person has looked at GitHub, whichever action is pressed next. A
 * reply that may already have posted and a resolve that may already have
 * landed are the same problem, and both are duplicated by trying again.
 */
export function outstandingThreadAction(
  current: ReviewPrDraft[],
  publication: ReviewPrPublication,
): ReviewPrDraft | null {
  const target = aim(publication);
  if (target === null) return null;
  return current.find((draft) => draft.uncertain === true && aim(draft.publication) === target) ?? null;
}

/**
 * What the local record of a thread action becomes, once the host has answered.
 *
 * A thread action carries no words of its own, so the only reason to write
 * anything down is the one case where nobody can say what happened. The record
 * is made immediately before dispatch and resolved here:
 *
 * - the host confirmed it, so the record has served its purpose;
 * - the host stated a refusal, so nothing was written and there is nothing to
 *   guard against attempting twice;
 * - no answer came back, so the record stays, and `outstandingThreadAction`
 *   is what turns it into a guard: while it is there, nothing aimed at that
 *   thread or comment is offered or sent.
 *
 * Only this action's own record is touched. A draft someone is still writing
 * beside it is not read, not published, and not cleared by resolving a thread.
 */
export function threadActionRecords(
  current: ReviewPrDraft[],
  record: ReviewPrDraft,
  result: ReviewPrPublishResult,
): ReviewPrDraft[] {
  switch (result.kind) {
    case "confirmed": return acknowledgePrDraft(current, record);
    case "refused": return current.filter((draft) => draft.id !== record.id);
    case "uncertain": return current;
  }
}
