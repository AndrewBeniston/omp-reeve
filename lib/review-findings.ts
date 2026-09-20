import {
  captureReviewCommentAnchor,
  placeReviewComment,
  type ReviewCommentPlacement,
} from "./review-comment-anchor";
import { reviewLineRangeLabel } from "./review-comments";
import { buildAtMentionText, buildFileLineMentionText } from "./file-fuzzy";
import { normalizeFilePathSlashes } from "./file-paths";

/**
 * A finding the review model wrote against a changed line.
 *
 * It is derived from the owning Session's turn stream on every read and is
 * never stored as a second comment. The transcript is the record; this is one
 * reading of it.
 */
export interface ReviewModelFinding {
  /**
   * Stable across reads: the Session entry that carries the directive, and the
   * directive's position in that entry. A line number is never part of it, so
   * a later revision cannot resurrect a finding somebody put away.
   */
  id: string;
  /** The Session entry the finding was written in. */
  entryId: string;
  directiveIndex: number;
  /** Repository-relative, checked, exactly as a patch names a file. */
  path: string;
  /**
   * Always the added side. The directive names one file and one line, and a
   * review is about the code as it stands after the change.
   */
  side: "additions";
  /**
   * The line the directive named, when it named one. The reference's directive
   * makes the line optional, so a finding about a file as a whole is ordinary
   * rather than malformed.
   */
  startLine?: number;
  endLine?: number;
  title: string;
  body: string;
  /** As the model wrote it. Displayed, never used to filter. */
  priority?: string;
  /**
   * The model that wrote it, as `provider/modelId`, read from the entry.
   * Absent on an entry that recorded no model.
   */
  model?: string;
  /** The review request this finding answered, which is its provenance. */
  requestId: string;
  createdAt: string;
}

/** One file as the review request saw it, which is the only revision believed. */
export interface ReviewedFileSnapshot {
  revision: string;
  /** The patch that revision showed. Absent when it was too large to keep. */
  patch?: string;
}

/**
 * Why a finding is on no line at all.
 *
 * Distinct from "detached", which is a finding whose lines were found once and
 * have since moved beyond recognition. These four are the states where Reeve
 * never had the evidence to put it anywhere.
 */
export type ReviewFindingUnplacedReason =
  /** Nothing records which revision the model was reading, so no line is provable. */
  | "no-provenance"
  /** The directive named a file and no line, so there is no line to draw it on. */
  | "file-level"
  /** The file changed after the review ran and its reviewed patch was not kept. */
  | "revision-changed"
  /** The file the directive names is not in the review on screen. */
  | "outside-review"
  /** The reviewed patch did not carry those lines, so the model named lines it was not shown. */
  | "line-not-reviewed";

/** What each of those says out loud, so the panel never has to invent it. */
export const REVIEW_FINDING_UNPLACED_NOTES: Record<ReviewFindingUnplacedReason, string> = {
  "no-provenance": "Reeve cannot tell which revision this finding was written against, so it is kept here rather than drawn on a line it might not be about.",
  "file-level": "This finding is about the file rather than a line of it.",
  "revision-changed": "This file changed after the review ran, so the line the finding names cannot be found again.",
  "outside-review": "This finding names a file the review on screen is not showing.",
  "line-not-reviewed": "This finding names a line the reviewed diff did not show.",
};

export type ReviewFindingPlacement =
  | ReviewCommentPlacement
  | { state: "unplaced"; reason: ReviewFindingUnplacedReason };

export interface PlacedReviewFinding {
  finding: ReviewModelFinding;
  placement: ReviewFindingPlacement;
}

/**
 * The repository-relative path a directive names, or nothing when it names
 * something a review cannot hold.
 *
 * An absolute path, a Windows path and a path that climbs out of the
 * repository are all refused here rather than resolved. A patch names files
 * one way, and anything else is a claim about the machine instead.
 */
export function reviewFindingPath(file: string): string | null {
  const normalized = normalizeFilePathSlashes(file.trim()).replace(/^\.\//, "");
  if (!normalized) return null;
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) return null;
  return normalized;
}

/**
 * Where to draw one finding, given what the review request saw and what the
 * diff shows now.
 *
 * The model wrote a line number against a tree Reeve did not choose and cannot
 * question afterwards. So the line is believed only through the revision the
 * review request was composed against: the anchor is taken from that revision's
 * patch, and from there the finding follows its lines exactly as a comment
 * does. Where that revision is unknown or gone, the finding is kept and says
 * so. It is never measured against whatever patch happens to be on screen.
 */
export function placeReviewFinding(
  finding: ReviewModelFinding,
  reviewed: ReviewedFileSnapshot | undefined,
  current: { patch: string; revision?: string } | undefined,
): ReviewFindingPlacement {
  const startLine = finding.startLine;
  if (startLine === undefined) return { state: "unplaced", reason: "file-level" };
  const endLine = finding.endLine ?? startLine;
  if (!reviewed) return { state: "unplaced", reason: "no-provenance" };
  if (!current) return { state: "unplaced", reason: "outside-review" };
  /*
   * A revision is a digest of the file's patch, so a patch on screen carrying
   * the reviewed revision is that reviewed patch, character for character.
   * That is the one case where the current diff may stand in for a snapshot
   * Reeve did not keep.
   */
  const reviewedPatch = reviewed.patch ?? (current.revision === reviewed.revision ? current.patch : undefined);
  if (reviewedPatch === undefined) return { state: "unplaced", reason: "revision-changed" };
  const anchor = captureReviewCommentAnchor(reviewedPatch, finding.side, startLine, endLine);
  if (!anchor) return { state: "unplaced", reason: "line-not-reviewed" };
  return placeReviewComment({
    side: finding.side,
    startLine,
    endLine,
    revision: reviewed.revision,
    anchor,
  }, current);
}

/**
 * Every finding, placed against the files this review is showing.
 *
 * One pass, one answer, the same as the comments: the diff a finding is drawn
 * on and any text handed to the composer are then two readings of one result.
 */
export function placeReviewFindings(
  findings: readonly ReviewModelFinding[],
  reviewed: ReadonlyMap<string, ReviewedFileSnapshot>,
  current: ReadonlyMap<string, { patch: string; revision?: string }>,
): PlacedReviewFinding[] {
  return findings.map((finding) => ({
    finding,
    placement: placeReviewFinding(finding, reviewed.get(finding.path), current.get(finding.path)),
  }));
}

/**
 * How a finding names its lines, in the words the rest of Review uses, or
 * nothing at all for a finding that named no line.
 */
export function reviewFindingRangeLabel(placed: PlacedReviewFinding): string | null {
  const { finding, placement } = placed;
  if (placement.state === "anchored" || placement.state === "moved") {
    return reviewLineRangeLabel(placement.startLine, placement.endLine);
  }
  if (finding.startLine === undefined) return null;
  return reviewLineRangeLabel(finding.startLine, finding.endLine ?? finding.startLine);
}

/** The findings the human has not put away, unless they asked to see those too. */
export function visibleReviewFindings(
  placed: readonly PlacedReviewFinding[],
  isDismissed: (id: string) => boolean,
  showDismissed: boolean,
): PlacedReviewFinding[] {
  return showDismissed ? [...placed] : placed.filter((entry) => !isDismissed(entry.finding.id));
}

/** The findings belonging to one file, placed against the diff on screen. */
export function placedFindingsForFile(placed: readonly PlacedReviewFinding[], path: string): PlacedReviewFinding[] {
  return placed.filter((entry) => entry.finding.path === path);
}

/**
 * The findings a surface draws, and the only acts it may offer on one.
 *
 * Carried as one value because four surfaces draw findings and every one of
 * them needs the same set. There is no save and no remove here: the model's
 * words live in the Session transcript, and putting one away is the only act
 * this panel owns.
 */
export interface ReviewFindingsHandling {
  findings: readonly PlacedReviewFinding[];
  isFindingDismissed: (id: string) => boolean;
  onDismissFinding: (id: string) => void;
  onRestoreFinding: (id: string) => void;
  /** Absent when there is no Session beside this Review to hand a finding to. */
  onAddFindingToChat?: (placed: PlacedReviewFinding) => void;
}

/**
 * Whether a finding has a line of this diff to sit on.
 *
 * The diff draws the anchored and the moved ones. Everything else is kept
 * beside the diff instead, so a finding is never drawn on a guessed line and
 * never disappears either.
 */
export function reviewFindingSitsOnALine(placed: PlacedReviewFinding): boolean {
  return placed.placement.state === "anchored" || placed.placement.state === "moved";
}

/**
 * The text a finding puts into the owning Session's composer.
 *
 * It is the shape the human's own comments use, so the agent resolves a
 * finding's file and lines exactly as it resolves a comment's. A finding that
 * sits on a line is named by the lines it is on now. One that sits on no line
 * names its file and says what it was written against, because the numbers the
 * model wrote point at a revision this review cannot show.
 */
export function reviewFindingsComposerText(
  placed: readonly PlacedReviewFinding[],
  toSessionPath: (path: string) => string,
): string {
  if (placed.length === 0) return "";
  const lines = placed.map(({ finding, placement }) => {
    const path = toSessionPath(finding.path);
    const said = `${finding.title.trim()} — ${finding.body.trim()}`;
    if (placement.state === "anchored" || placement.state === "moved") {
      return `- ${buildFileLineMentionText(path, placement.startLine, placement.endLine).trimEnd()} — ${said}`;
    }
    const mention = buildAtMentionText(path, false).trimEnd();
    if (finding.startLine === undefined) return `- ${mention} — ${said} (about the file rather than a line of it)`;
    const wrote = reviewLineRangeLabel(finding.startLine, finding.endLine ?? finding.startLine).toLocaleLowerCase();
    return `- ${mention} — ${said} (written against ${wrote}, which this review cannot show now)`;
  });
  return `Findings from the review:\n${lines.join("\n")}\n`;
}
