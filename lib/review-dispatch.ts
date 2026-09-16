import type { ReviewSlashOutcome, ReviewSlashRequest } from "./review-slash-entries";

/**
 * What the composer did with a review prompt, which is the only account of
 * whether a turn could start. The panel's own view of the run state can lag
 * it, so a follow-up asks the composer and believes the answer.
 */
export type ReviewComposerSubmit = "sent" | "busy" | "ignored" | "unavailable";

/** What the shell does with a prompt the composer did not send. */
export interface ReviewComposerDelivery {
  /** What to report to the panel. */
  outcome: ReviewSlashOutcome;
  /** Whether to write the prompt into the composer. */
  insertPrompt: boolean;
}

/**
 * Where a composed review prompt goes.
 *
 * A review the human asked for is kept: a busy composer holds it as a draft
 * they can send. A review nobody asked for at that moment is dropped: the
 * composer holds human work, and an automatic prompt written into it would
 * replace or sit on top of a draft nobody chose to have. The panel asks for
 * that one again instead, which is what `deferred` says.
 */
export function reviewComposerDelivery(
  request: Readonly<ReviewSlashRequest>,
  submit: ReviewComposerSubmit,
): ReviewComposerDelivery {
  if (submit === "sent") {
    return { outcome: { kind: "delivered", message: "Review requested in this Session" }, insertPrompt: false };
  }
  if (request.origin === "automatic") {
    return {
      outcome: {
        kind: "error",
        error: "This Session was busy, so the automatic review did not start.",
        deferred: submit === "busy",
      },
      insertPrompt: false,
    };
  }
  return {
    outcome: { kind: "error", error: "This Session is busy, so the review is waiting in the composer." },
    insertPrompt: true,
  };
}
