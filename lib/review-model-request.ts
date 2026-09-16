import {
  EXHAUSTIVE_REVIEW_PASS_LIMIT,
  type ReviewDelivery,
  type ReviewSeverity,
  type ReviewSettings,
  severityFloorFor,
} from "./review-settings";

/**
 * The turn a requested review starts (R14). Composition lives here so the
 * slash command, the panel and an armed trigger all ask the same thing.
 * Nothing here sends: it returns text and a scope.
 */

/**
 * The branch mode carries a resolved merge base, not a branch name: a two-dot
 * diff against a moving branch reports other people's commits as the human's.
 */
export type ReviewRequestMode =
  | { kind: "uncommitted" }
  | { kind: "branch"; base: string; mergeBase: string };

/** The scope travelling with the request; the same shape, so it cannot disagree. */
export type ReviewDiffFilter = ReviewRequestMode;

export interface ReviewRequestInput {
  mode: ReviewRequestMode;
  /** What the human typed after the command, if anything. */
  message?: string;
  /** Who asked, which decides the severity floor that applies. */
  origin?: "automatic" | "requested";
  /** Whether the security instruction is included. */
  security?: boolean;
  settings: Readonly<ReviewSettings>;
}

export interface ReviewRequest {
  prompt: string;
  filter: ReviewDiffFilter;
  delivery: ReviewDelivery;
  severityFloor: ReviewSeverity;
}

const PREAMBLE = [
  "Review the changes described below and report what you would raise in a code review.",
  "Answer as ordinary Markdown. Keep it concise and actionable: name the file and the line, say what is wrong, and say what to do about it.",
  "Label each finding with its severity as critical, high, medium or low, so its weight is visible without reading the whole answer.",
].join("\n");

const UNCOMMITTED_INSTRUCTION = [
  "Review the current changes in this repository, across staged, unstaged and untracked files.",
  "Inspect the changes yourself before you report on them.",
].join("\n");

function branchInstruction(base: string, mergeBase: string): string {
  return [
    `Review this branch against ${base}.`,
    `The two branches diverged at ${mergeBase}. Inspect the changes by diffing against that commit, so commits that arrived on ${base} afterwards are not reported as mine.`,
  ].join("\n");
}

/**
 * The floor, as the model hears it. This is the whole of the mechanism: the
 * answer comes back as ordinary Markdown and nothing filters it afterwards.
 */
const SEVERITY_FLOOR_SENTENCES: Record<ReviewSeverity, string> = {
  critical: "Report only critical findings. Leave anything lesser out.",
  high: "Report findings of high severity and above. Leave anything lesser out.",
  medium: "Report findings of medium severity and above. Leave anything lesser out.",
  low: "Report findings of any severity.",
};

const SECURITY_INSTRUCTION =
  "Include a security pass: look for injection, unsafe deserialization, path traversal, leaked secrets, missing authorization, and unsafe handling of untrusted input.";

/**
 * How a finding reaches the diff.
 *
 * The answer stays ordinary Markdown, as the reference requires. The directive
 * is additional, and it carries the reference's own fields under the reference's
 * own name, so a model that already writes one writes something Reeve reads.
 */
const INLINE_FINDING_INSTRUCTION = [
  "Attach each finding that belongs on a changed line to that line, with one directive on a line of its own, in exactly this form:",
  '::code-comment{title="Short label" body="What is wrong, and what to do about it." file="path/to/file.ts" start=10 end=11 priority=2}',
  "The title, the body and the file are required. The start, the end and the priority are optional.",
  "The file must be repository-relative and must name a file in the changes under review, and the lines must be lines that diff shows.",
  "The directive is in addition to the Markdown answer, and never in place of it.",
].join("\n");

const EXHAUSTIVE_INSTRUCTION =
  `Work exhaustively: go back over the changes until a pass finds nothing new, and stop after at most ${EXHAUSTIVE_REVIEW_PASS_LIMIT} passes whether or not it has settled.`;

/** The human's message goes last, and never replaces the scope. */
export function composeReviewRequest(input: ReviewRequestInput): ReviewRequest {
  const { mode, settings } = input;
  const severityFloor = severityFloorFor(settings, input.origin ?? "requested");
  const blocks = [
    PREAMBLE,
    mode.kind === "uncommitted" ? UNCOMMITTED_INSTRUCTION : branchInstruction(mode.base, mode.mergeBase),
    SEVERITY_FLOOR_SENTENCES[severityFloor],
    INLINE_FINDING_INSTRUCTION,
  ];
  if (input.security) blocks.push(SECURITY_INSTRUCTION);
  if (settings.exhaustiveReview) blocks.push(EXHAUSTIVE_INSTRUCTION);
  const message = input.message?.trim();
  if (message) blocks.push(message);
  return {
    prompt: blocks.join("\n\n"),
    filter: mode.kind === "uncommitted" ? { kind: "uncommitted" } : { kind: "branch", base: mode.base, mergeBase: mode.mergeBase },
    delivery: settings.delivery,
    severityFloor,
  };
}

/** Why a review could not be composed. A Git failure is explained from Git. */
export type ReviewRequestRefusal =
  /** The branches share no history, so there is nothing to pin the diff to. */
  | "no-merge-base"
  /** No Session owns this Review, so there is no conversation to answer in. */
  | "no-session";

export const REVIEW_REQUEST_REFUSALS: Record<ReviewRequestRefusal, string> = {
  "no-merge-base": "These branches share no common commit, so there is nothing to review against. Choose another base.",
  "no-session": "Open this Review beside a Session before asking for a review, so the answer has somewhere to land.",
};
