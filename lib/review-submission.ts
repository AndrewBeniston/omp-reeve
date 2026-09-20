import { acknowledgePrDraft, type ReviewPrDraft, type ReviewPrPin } from "./review-pr-drafts";
import type { ReviewPrIdentity, ReviewPrInlineComment, ReviewPrPublication, ReviewPrPublishResult } from "./review-pr-ui";

export type ReviewSubmissionVerdict = "comment" | "approve" | "request_changes";

const VERDICT_LABELS: Record<ReviewSubmissionVerdict, string> = {
  comment: "Comment",
  approve: "Approve",
  request_changes: "Request changes",
};

/** A short revision, the way a person reads one. */
function short(sha: string): string {
  return sha.slice(0, 8);
}

/** What a submission is anchored to, said plainly when an end is missing. */
function anchorPhrase(pinned: ReviewPrPin): string {
  if (!pinned.headSha) return "anchored to a revision that was never recorded";
  return pinned.baseSha
    ? `anchored to commit ${short(pinned.headSha)} against base ${short(pinned.baseSha)}`
    : `anchored to commit ${short(pinned.headSha)}, against a base that was never recorded`;
}

/**
 * Whether the pull request is still the one the drafts were written against.
 *
 * Both ends are compared, because a rebased base changes what a diff means as
 * surely as a new commit does. An end nobody recorded is reported as unknown
 * rather than treated as matching: a draft carried forward from the old store
 * never knew its base, and answering "unchanged" for it would be a claim
 * nothing supports.
 */
export type ReviewRevisionState =
  | { kind: "current" }
  | { kind: "moved"; head: boolean; base: boolean; message: string }
  | { kind: "unknown"; message: string };

export function reviewSubmissionRevisionState(pinned: ReviewPrPin, observed: ReviewPrPin | null): ReviewRevisionState {
  if (observed === null) {
    return { kind: "unknown", message: "Whether this pull request has changed could not be checked. Refresh before submitting." };
  }
  const headComparable = Boolean(pinned.headSha && observed.headSha);
  const baseComparable = Boolean(pinned.baseSha && observed.baseSha);
  const head = headComparable && pinned.headSha !== observed.headSha;
  const base = baseComparable && pinned.baseSha !== observed.baseSha;
  if (head || base) {
    const moved = head && base
      ? `Its head is now ${short(observed.headSha)} and its base is now ${short(observed.baseSha)}`
      : head
        ? `Its head is now ${short(observed.headSha)}, and you were reading ${short(pinned.headSha)}`
        : `It now compares against base ${short(observed.baseSha)}, and you were reading against ${short(pinned.baseSha)}`;
    return { kind: "moved", head, base,
      message: `This pull request has changed since you started reviewing. ${moved}. Your drafts are kept on the revision they were written against. Refresh and read the new changes before submitting.` };
  }
  if (!headComparable || !baseComparable) {
    return { kind: "unknown",
      message: "The revision these drafts were written against was not fully recorded, so whether the pull request has changed cannot be established. Read the changes again before submitting." };
  }
  return { kind: "current" };
}

export interface ReviewSubmissionRequest {
  verdict: ReviewSubmissionVerdict;
  /** The summary the review is submitted with. */
  body: string;
  comments: ReviewPrInlineComment[];
}

/**
 * The inline drafts a submission would carry, and the drafts they came from.
 *
 * Only saved drafts on the revision being submitted are included. One still
 * being typed is not part of what a person confirms, and one written against
 * another revision would be published against lines it was never read on.
 */
export function reviewSubmissionComments(drafts: ReviewPrDraft[], pinned: ReviewPrPin): ReviewPrDraft[] {
  return drafts.filter((draft) => draft.publication.action === "inline"
    && draft.saved === true
    && draft.uncertain !== true
    && (draft.pinned === undefined || draft.pinned.headSha === pinned.headSha));
}

/**
 * Which line drafts may be drawn on the diff in front of the reader.
 *
 * Keeping a draft through a moved head is only half the job. The other half
 * is not drawing it: a line number from the revision it was written against
 * points somewhere else once the code has changed, so placing it on today's
 * diff would attach somebody's words to a line they never read. Those drafts
 * are kept whole and listed away from the diff, dated by the revision they
 * belong to, which is the same treatment a published thread gets when its
 * line is not in this revision.
 */
export function reviewPrDraftPlacement(drafts: ReviewPrDraft[], pinned: ReviewPrPin): {
  onThisRevision: ReviewPrDraft[];
  onAnEarlierRevision: ReviewPrDraft[];
} {
  const onThisRevision: ReviewPrDraft[] = [];
  const onAnEarlierRevision: ReviewPrDraft[] = [];
  for (const draft of drafts) {
    if (draft.publication.action !== "inline") continue;
    // An unpinned draft predates pinning and is treated as this revision's,
    // which is where it was already being drawn before any of this.
    const here = draft.pinned === undefined || draft.pinned.headSha === pinned.headSha;
    (here ? onThisRevision : onAnEarlierRevision).push(draft);
  }
  return { onThisRevision, onAnEarlierRevision };
}

/** How a draft written against an earlier revision names where it came from. */
export function reviewPrDraftRevisionLabel(draft: ReviewPrDraft): string {
  const headSha = draft.pinned?.headSha ?? "";
  return headSha ? `Written against ${short(headSha)}` : "Written against an unrecorded revision";
}

/**
 * Clear every draft a confirmed submission actually sent, and nothing else.
 *
 * A review goes out as one object carrying many comments, so acknowledging it
 * one draft at a time would leave the rest behind as duplicates waiting to be
 * published again. Each is matched on the version that was sent, so a comment
 * edited while the write was in flight survives.
 */
export function acknowledgePrSubmission(current: ReviewPrDraft[], sent: ReviewPrDraft[]): ReviewPrDraft[] {
  return sent.reduce((remaining, draft) => acknowledgePrDraft(remaining, draft), current);
}

export function reviewSubmissionRequest(verdict: ReviewSubmissionVerdict, body: string, carried: ReviewPrDraft[]): ReviewSubmissionRequest {
  const comments = carried.flatMap((draft) => draft.publication.action === "inline"
    ? [{ path: draft.publication.path, side: draft.publication.side, startLine: draft.publication.startLine,
        endLine: draft.publication.endLine, body: draft.publication.body }]
    : []);
  return { verdict, body, comments };
}

export function reviewSubmissionPublication(request: ReviewSubmissionRequest): ReviewPrPublication {
  return { action: "review", event: request.verdict, body: request.body,
    ...(request.comments.length > 0 ? { comments: request.comments } : {}) };
}

/**
 * Why a submission may not go out, or null where it may.
 *
 * Read in the order a person meets the obstacles: what the account may do at
 * all, then whether the code is still the code they read, then whether this
 * verdict is open to them, and last what they have actually written. Every
 * one of these leaves the drafts alone; refusing is not discarding.
 */
export function reviewSubmissionRefusal(input: {
  request: ReviewSubmissionRequest;
  restriction: string | null;
  canComment: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  revision: ReviewRevisionState;
}): string | null {
  if (input.restriction !== null) return input.restriction;
  if (input.revision.kind === "moved") return input.revision.message;
  const { verdict, body, comments } = input.request;
  const permitted = verdict === "approve" ? input.canApprove
    : verdict === "request_changes" ? input.canRequestChanges
    : input.canComment;
  if (!permitted) {
    return `This GitHub account cannot ${VERDICT_LABELS[verdict].toLowerCase()} on this pull request.`;
  }
  // GitHub takes an approval with nothing written; the other two are a verdict
  // about something, so they carry either a summary or the comments they are
  // a verdict on.
  if (verdict === "request_changes" && !body.trim()) {
    return "Write a summary saying what needs to change before requesting changes.";
  }
  if (verdict === "comment" && !body.trim() && comments.length === 0) {
    return "Write a summary or save a line comment before submitting a comment review.";
  }
  return null;
}

/** What a person was shown and agreed to, kept whole for as long as it stands. */
export interface ReviewSubmissionConfirmation {
  title: string;
  detail: string;
  warning: string | null;
}

/**
 * What a person is agreeing to, written out before anything is sent.
 *
 * Publishing is the one action here that leaves the machine, so the
 * confirmation names the account it goes out as, the pull request it lands on,
 * the revision it is anchored to, and how many line comments travel with it.
 * A person who reads this and presses the button has not been surprised.
 */
export function reviewSubmissionConfirmation(input: {
  identity: ReviewPrIdentity;
  request: ReviewSubmissionRequest;
  revision: ReviewRevisionState;
  pinned: ReviewPrPin;
}): ReviewSubmissionConfirmation {
  const { identity, request, pinned } = input;
  const count = request.comments.length;
  const carried = count === 0 ? "no line comments"
    : count === 1 ? "1 line comment" : `${count} line comments`;
  return {
    title: `Submit review: ${VERDICT_LABELS[request.verdict]}`,
    detail: `This submits ${VERDICT_LABELS[request.verdict].toLowerCase()} with ${carried} to `
      + `${identity.owner}/${identity.repository} #${identity.number} as ${identity.account}, ${anchorPhrase(pinned)}.`,
    warning: input.revision.kind === "current" ? null : input.revision.message,
  };
}

/**
 * What happens to the drafts once the answer comes back.
 *
 * Only a confirmed publication clears anything. A refusal and an unanswered
 * write both keep every draft, and the unanswered one stays marked so the
 * next attempt is a decision a person takes with the pull request in front of
 * them rather than a button pressed twice.
 */
export function reviewSubmissionRetention(result: ReviewPrPublishResult): {
  retain: boolean;
  uncertain: boolean;
  message: string;
} {
  switch (result.kind) {
    case "confirmed":
      return { retain: false, uncertain: false, message: "Review published to GitHub." };
    case "refused":
      return { retain: true, uncertain: false, message: result.message };
    case "uncertain":
      return { retain: true, uncertain: true, message: result.message };
  }
}
