"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReviewLiveUpdates, useReviewTurnActivity } from "@/hooks/useReviewLiveUpdates";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { shouldConfirmRevert, stopConfirmingRevert } from "@/lib/review-confirm";
import { reviewFilesFromPatch, reviewReferencePath } from "@/lib/review-files";
import {
  armSmartReview,
  consumeSmartReview,
  deferSmartReview,
  IDLE_SMART_REVIEW,
  noteSmartReviewChange,
  SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT,
  smartReviewDue,
  smartReviewRequest,
  type SmartReviewState,
} from "@/lib/review-smart-review";

/** How long the Worktree must be quiet before a follow-up review starts. */
const SMART_REVIEW_SETTLE_MS = 1500;
/**
 * How long a refused follow-up waits before it asks the composer again.
 *
 * Longer than the settle delay, because the composer refused for a reason
 * the panel cannot see and the turn it is finishing needs a moment.
 */
const SMART_REVIEW_RETRY_MS = 3000;

/** What one review request did, which is what the trigger has to count. */
interface ReviewDispatchResult {
  /** What to tell the human, or null when the review turn started. */
  error: string | null;
  /** The review turn started. Only this spends a follow-up. */
  accepted: boolean;
  /** The composer refused a running turn and wrote nothing. Ask again. */
  deferred: boolean;
}
import { mutateReviewComments, readReviewComments } from "@/lib/review-comment-store";
import { placeReviewComments, type PlacedReviewComment } from "@/lib/review-comment-anchor";
import {
  newReviewCommentId,
  removeReviewComment,
  reviewCommentOwnerKey,
  reviewCommentsComposerText,
  upsertReviewComment,
  type ReviewComment,
  type ReviewCommentDraft,
  type ReviewCommentHandoff,
} from "@/lib/review-comments";
import { reviewFindingsComposerText, type ReviewFindingsHandling } from "@/lib/review-findings";
import { useReviewFindings } from "@/hooks/useReviewFindings";
import type { ReviewDiff } from "@/lib/review-git";
import type { ReviewUnavailableReason } from "@/lib/review-git";
import type { LastTurnUnavailableReason } from "@/lib/review-turn-read";
import { REVIEW_OPERATION_LABELS, isDestructiveReviewOperation, reviewOperationsForScope, type ReviewOperation, type ReviewOperationRequest } from "@/lib/review-operations";
import { reviewOutcomeMessage, type ReviewOutcomeTone } from "@/lib/review-outcome";
import { copyTextOrFail } from "@/lib/clipboard";
import { reviewApplyCommand } from "@/lib/review-apply-command";
import { decideReviewRefresh, releaseReviewRefresh, reviewReadIsPending } from "@/lib/review-refresh-state";
import { DEFAULT_REVIEW_FILE_VIEW, DEFAULT_REVIEW_SELECTION, type ReviewFileView, type ReviewSelection } from "@/lib/review-selection";
import { reviewBindingLabel, reviewOwnerBody, reviewOwnerSearchParams, type ReviewOwner } from "@/lib/review-owner";
import { commitDisabledReason, scopeCanCommit } from "@/lib/review-commit";
import { automaticReviewRequest } from "@/lib/review-auto-review";
import { readReviewSettings } from "@/lib/review-settings-store";
import type { ReviewBranchChoices } from "@/lib/review-branch-rules";
import type { ReviewPublishState } from "@/lib/review-publish-ui";
import { openExternal } from "@/lib/open-external";
import { requestReviewRepository } from "@/lib/review-repository-client";
import type { ReviewBranchComparison } from "@/lib/review-empty-state";
import { REVIEW_UNTRACKED_FILE_CEILING } from "@/lib/review-limits";
import { DEFAULT_REVIEW_DISPLAY_PREFERENCES } from "@/lib/review-display-preferences";
import {
  ReviewDisplayPreferences, ReviewExpandDiffsItem, ReviewFullFilesItem, ReviewWhiteSpaceItem, ReviewWordDiffsItem,
} from "./ReviewDisplayPreferences";
import { ReviewRichPreviewItem } from "./ReviewNoisePreferences";
import { DEFAULT_REVIEW_NOISE_PREFERENCES } from "@/lib/review-noise-preferences";
import { reviewPrClient } from "@/lib/review-pr-client";
import { ReviewPullRequests } from "./ReviewPullRequests";
import { ReviewPrDetail } from "./ReviewPrDetail";
import { ReviewChoices } from "./ReviewChoices";
import { ReviewOrphanComments } from "./ReviewOrphanComments";
import { ReviewOrphanFindings } from "./ReviewOrphanFindings";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewCommitForm, type CommitOutcome, type CommitSubmission } from "./ReviewCommitForm";
import { ReviewBranchSetupForm, type BranchSetupOutcome, type BranchSetupSubmission } from "./ReviewBranchSetupForm";
import { ReviewPublishForm, type PublishOutcome, type PublishSubmission } from "./ReviewPublishForm";
import { ReviewFiles } from "./ReviewFiles";
import type { FileReviewOrigin } from "@/lib/file-review-origin";
import type { ReviewSlashOutcome, ReviewSlashRequest } from "@/lib/review-slash-entries";
import type { ReviewDelivery } from "@/lib/review-settings";
import styles from "./review.module.css";

/*
 * The header follows the reference application's own review header, observed
 * in the running application and in its shipped values:
 *
 *   row 1   scope dropdown, then the +N -N totals, then the actions cluster
 *           (more, split view, file list) and Commit or push
 *
 * Refresh is a row in the options menu and has no icon in the cluster. The
 * reference declares one Refresh string, and declares it as a menu item.
 *   row 2   the comparison branch selector, only in Branch scope
 *
 * The colours are Reeve's theme tokens; the arrangement follows the reference.
 */

const SCOPES = [
  { kind: "lastTurn", label: "Last turn" },
  { kind: "branch", label: "Branch" },
  { kind: "uncommitted", label: "Uncommitted" },
  { kind: "unstaged", label: "Unstaged" },
  { kind: "staged", label: "Staged" },
  { kind: "commit", label: "Commits" },
] as const;

type Result =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /**
   * Review cannot run in this directory: it is outside a Git repository, or
   * Git is missing. A Retry would fail the same way, so the panel says what is
   * wrong instead of offering one.
   */
  | {
      kind: "unavailable";
      title: string;
      message: string;
      retryable: boolean;
      /**
       * Why, as the reader gave it. The panel words the state from this and
       * the empty state decides its way forward from it: a directory outside
       * a repository can be cured, and a missing Git cannot.
       */
      reason?: string;
    }
  | {
      kind: "ready";
      value: ReviewDiff & {
        skippedPaths?: string[];
        /**
         * Tools the turn ran that did not record which files they wrote. What
         * they did cannot be told apart from anyone else's work, so the patch
         * is a part of the turn rather than the whole of it.
         */
        incompleteTools?: string[];
        /**
         * Files that changed but carry no trusted evidence the agent changed
         * them. They are kept out of the patch, and named rather than dropped.
         */
        unattributedPaths?: string[];
      };
    };

/**
 * Every reason Review can be unavailable, titled. Typed over the reasons
 * themselves so a new one is a typecheck failure here rather than a view that
 * silently falls back to a generic heading.
 */
const UNAVAILABLE_TITLES: Record<ReviewUnavailableReason | LastTurnUnavailableReason | "attribution-unavailable", string> = {
  "not-a-repository": "No Git repository here",
  "git-missing": "Git is not available",
  "diff-too-large": "This diff is too large to show",
  "no-record": "No last turn recorded",
  "in-progress": "Last turn is still running",
  "session-mismatch": "Last turn belongs to another workspace",
  "baseline-missing": "Last turn is no longer available",
  unsettled: "Last turn did not finish",
  "budget-exceeded": "Last turn exceeded the snapshot limit",
  "capture-failed": "Last turn could not be recorded",
  "store-unavailable": "Last turn storage is unavailable",
  "attribution-unavailable": "Last turn cannot be attributed",
};

/*
 * A reason both readers can give needs a heading true to the one that gave it:
 * a Git read that is too large is a diff, and a recorded turn that is too
 * large is that turn. Consulted only for the recorded turn, and only for a
 * reason listed here, so the exhaustive record above remains the gate that a
 * new reason must be titled before it can reach the panel. Typed over both
 * unions because this reason belongs to each of them.
 */
const LAST_TURN_TITLES: Partial<Record<ReviewUnavailableReason | LastTurnUnavailableReason, string>> = {
  "diff-too-large": "Last turn is too large to show",
};

/**
 * What the review left out of the untracked files, and where to find it.
 *
 * These files are not in the diff and not in the file list either, so the
 * count is the only trace of them the panel can offer.
 */
function untrackedOmissionMessage(count: number): string {
  const subject = count === 1 ? "1 untracked file is" : `${count.toLocaleString("en-GB")} untracked files are`;
  const object = count === 1 ? "it" : "them";
  return `${subject} missing from this diff and from the file list. Review reads at most ${REVIEW_UNTRACKED_FILE_CEILING.toLocaleString("en-GB")} untracked files, and stops adding ${object} before the diff outgrows what it can hold. Open ${object} from the file explorer to read ${object}.`;
}

/** How often a last turn reported as still running is asked about again. */
const LAST_TURN_SETTLE_POLL_MS = 3_000;

/** Why a commit was refused, in words the human can act on. */
const COMMIT_REFUSALS: Record<string, string> = {
  "no-changes": "There is nothing staged to commit.",
  "stale-files": "These changes moved since the form opened, so nothing was committed.",
  "message-empty": "Write a commit message first.",
  "message-invalid": "That message has no subject line.",
  "hidden-staged-paths": "Changes staged outside this review would be committed too.",
  "stale-index": "What is staged changed while the form was open, so nothing was committed.",
  "index-changed-while-staging": "Something else staged changes while this ran, so the commit stopped.",
  "untrusted-project": "Trust this Project before committing: its hooks run when Git commits.",
  "branch-exists": "That branch already exists.",
  "branch-invalid": "Git will not accept that branch name.",
  "branch-empty": "Name the branch to create.",
};

/** Why the primary action cannot run, shown before it is pressed. */
const COMMIT_DISABLED: Record<string, string> = {
  committing: "Committing…",
  loadingDiff: "Loading changes…",
  noChanges: "There is nothing to commit",
  unavailable: "Committing is unavailable here",
};

/** What stopped a commit once Git had started writing. */
const COMMIT_FAILURES: Record<string, string> = {
  "checkout-failed": "The branch was not created, so nothing was committed.",
  "hook-rejected": "A Git hook in this Project refused the commit.",
  "identity-missing": "Git has no name and email configured for this repository.",
  "nothing-to-commit": "Git found nothing to commit.",
  unknown: "Git could not complete the commit.",
};

/** Why a branch could not be taken, in words the human can act on. */
const BRANCH_REFUSALS: Record<string, string> = {
  "branch-empty": "Name the branch.",
  "branch-invalid": "Git will not accept that branch name.",
  "branch-exists": "That branch already exists. Check it out instead.",
  "branch-missing": "That branch is not here any more.",
  "checked-out-elsewhere": "Another Worktree has that branch checked out, so Git will not take it here.",
  "already-current": "This Worktree is already on that branch.",
  "untrusted-project": "Trust this Project before changing its branch: its hooks run when Git checks out.",
};

/** What stopped a branch change once Git had started writing. */
const BRANCH_FAILURES: Record<string, string> = {
  "set-branch-failed": "The branch was not created, so nothing changed.",
  "checkout-failed": "The branch was created but this Worktree stayed where it was.",
  unknown: "Git did not end up on that branch. Check the Worktree before carrying on.",
};

/** Every way publishing ends other than a request that exists afterwards. */
const PUBLISH_RESULTS: Record<string, (value: { forge?: string; refusal?: string; blocked?: string; existing?: { number: number } }) => PublishOutcome> = {
  exists: (value) => ({
    tone: "warning",
    message: `This branch already has ${value.forge === "gitlab" ? "a merge request" : "a pull request"}: #${value.existing?.number}.`,
  }),
  refused: (value) => ({ tone: "warning", message: PUBLISH_REFUSALS[value.refusal ?? ""] ?? "The host refused this." }),
  blocked: (value) => ({ tone: "warning", message: PUBLISH_BLOCKED[value.blocked ?? ""] ?? "Publishing is unavailable here." }),
  failed: () => ({ tone: "danger", message: "The host could not create it. Nothing was published." }),
  uncertain: () => ({
    tone: "warning",
    // Never retried: the host may have created it already.
    message: "The host did not confirm this. Check it there before trying again.",
  }),
};

const PUBLISH_REFUSALS: Record<string, string> = {
  "title-empty": "Write a title first.",
  "already-exists": "The host says this branch already has one.",
  "no-commits": "This branch has no commits the base does not already have.",
  "not-permitted": "This account cannot open one on that repository.",
  "head-not-published": "The remote does not have this branch yet. Push it first.",
  "auth-required": "Sign in to the host's command line tool for this repository, then try again.",
};

const PUBLISH_BLOCKED: Record<string, string> = {
  "no-branch": "You are not on a branch, so there is nothing to publish.",
  "no-remote": "This Project has no remote to publish to.",
  "unsupported-remote": "This Project's remote is not a GitHub or GitLab repository.",
  "cli-missing": "Install the host's command line tool, then try again.",
  "auth-required": "Sign in to the host's command line tool for this repository, then refresh.",
  "base-missing": "This Project names no default branch to merge into.",
  "untrusted-project": "Trust this Project before publishing from it.",
  unavailable: "The host could not be read, so publishing is unavailable. Refresh and try again.",
};

/** Why a push did not go through, in words that do not leak Git's output. */
const PUSH_PROBLEMS: Record<string, string> = {
  auth: "The remote refused the credentials, and nothing here can ask you for them.",
  "non-fast-forward": "The remote has commits this branch does not. Pull first.",
  "no-upstream": "This branch has no upstream yet.",
  "no-branch": "You are not on a branch.",
  "no-remote": "This repository has no remote configured.",
  "nothing-to-push": "Everything on this branch is already pushed.",
  unknown: "This branch could not be pushed.",
};

/** What the last operation did, kept until the next one starts. */
interface OperationOutcome {
  tone: ReviewOutcomeTone;
  message: string;
  failed: { path: string; message: string }[];
  /** Named in the operation and never attempted, such as a conflicted file. */
  skipped: { path: string; message: string }[];
}

/** The glyph the reference pairs with each action in its section pill. */
function SectionActionIcon({ operation }: { operation: ReviewOperation }) {
  if (operation === "revert") {
    return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5a5 5 0 1 0 1.6-3.7" /><path d="M2.5 2.4v3.2h3.2" />
    </svg>;
  }
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" />
    <path d="M5.4 8h5.2" />{operation === "stage" && <path d="M8 5.4v5.2" />}
  </svg>;
}

function ChevronDown() {

  return (
    <span className={styles.scopeChevron} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 3.5 3 3 3-3" />
      </svg>
    </span>
  );
}

/** The commit node on a line, before "Commit or push", as the reference draws it. */
function CommitGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <line x1="1.5" y1="8" x2="5" y2="8" />
      <circle cx="8" cy="8" r="2.6" />
      <line x1="10.6" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}

export function ReviewPanel({ active = true, tabId, owner, selection = DEFAULT_REVIEW_SELECTION, onSelectionChange, onOpenFile, onAtMention, onAddToComposer, onRequestReview, reviewStartedAt = 0, delivery = "current-chat", onDeliveryChange }: {
  active?: boolean;
  tabId: string;
  /**
   * The Project, Worktree and Session this Tab was opened for. Everything the
   * panel reads is read for this owner and every request carries it, so the
   * panel cannot follow the selected Session onto work it was not opened
   * beside.
   */
  owner: ReviewOwner;
  selection?: ReviewSelection;
  onSelectionChange: (selection: ReviewSelection) => void;
  onOpenFile: (filePath: string, fileName: string, origin?: FileReviewOrigin) => void;
  /** Add a changed file as an @reference to the owning Session's composer. */
  onAtMention?: (relativePath: string) => void;
  /**
   * Write text into the owning Session's composer. Absent when this Tab's
   * own Session is not the selected one, which is what stops a comment
   * reaching a conversation it was not written for.
   */
  onAddToComposer?: (text: string) => void;
  /**
   * Ask the agent to review what this Tab is showing. Absent when no Session
   * owns this Tab, as with the comment handover.
   */
  onRequestReview?: (request: ReviewSlashRequest) => Promise<ReviewSlashOutcome>;
  /**
   * When a review the human asked for was last dispatched, including from the
   * composer. Arms the experimental trigger for reviews this panel did not
   * start itself.
   */
  reviewStartedAt?: number;
  /** Where a requested review is answered. Picked per review. */
  delivery?: ReviewDelivery;
  onDeliveryChange?: (delivery: ReviewDelivery) => void;
}) {
  const cwd = owner.worktreePath;
  /** The Session this Tab was bound to, which may be none. Never substituted. */
  const sessionId = owner.sessionId;
  /*
   * One identity for the whole panel, held across renders. Every read below
   * depends on it, so rebuilding it each render would reload the diff every
   * time a filter character was typed.
   */
  const context = useMemo(
    () => ({ tabId, owner: { projectRoot: owner.projectRoot, worktreePath: owner.worktreePath, sessionId: owner.sessionId } }),
    [tabId, owner.projectRoot, owner.worktreePath, owner.sessionId],
  );
  const binding = useMemo(() => reviewBindingLabel(owner), [owner]);
  const { kind, comparisonBranch, comparisonLabel, commit } = selection;
  const [branchMetadata, setBranchMetadata] = useState<{
    defaultBranch: string | null;
    currentBranch: string | null;
    remotes?: string[];
    indexDigest?: string | null;
    indexPaths?: string[];
  } | null>(null);
  const resolvedComparison = comparisonBranch || branchMetadata?.defaultBranch || "";
  /*
   * The comparison an empty state can offer out of itself: Git's own ref to
   * open the review with, and the short name to say it by. The toolbar
   * shortens the same ref the same way, so both read alike.
   */
  const branchRecovery = useMemo<ReviewBranchComparison | null>(() => {
    const value = branchMetadata?.defaultBranch;
    return value ? { value, label: value.replace(/^refs\/(heads|remotes)\//, "") } : null;
  }, [branchMetadata]);
  const revision = kind === "branch" ? resolvedComparison : kind === "commit" ? commit : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [commitsOpen, setCommitsOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** The last review this panel asked for: whether it is in flight, and why it was refused. */
  const [reviewRequest, setReviewRequest] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [commitOpen, setCommitOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const commitTrigger = useRef<HTMLButtonElement>(null);
  const branchTrigger = useRef<HTMLButtonElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const gitTrigger = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [refresh, setRefresh] = useState(0);
  const resultOwner = JSON.stringify([cwd, sessionId, kind, revision]);
  const [loaded, setLoaded] = useState<{ owner: string; result: Result }>({ owner: resultOwner, result: { kind: "loading" } });
  const latestLoaded = useRef(loaded);
  latestLoaded.current = loaded;
  const currentResultOwner = useRef(resultOwner);
  currentResultOwner.current = resultOwner;
  const editors = useRef(new Map<string, string>());
  const deferred = useRef<{ owner: string; result: Result } | null>(null);
  const [deferredOwner, setDeferredOwner] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<{ owner: string; message: string } | null>(null);
  const [backgroundRefresh, setBackgroundRefresh] = useState(0);
  /**
   * The experimental trigger's whole state: whether a review the human
   * started has armed it, whether a change is waiting, and how many
   * follow-ups are left before it stops.
   */
  const [smartReview, setSmartReview] = useState<Readonly<SmartReviewState>>(IDLE_SMART_REVIEW);
  /**
   * Whether the owning Session is working, which a follow-up waits out.
   * `null` until the stream says, and again if it drops: unknown is not idle.
   */
  const [sessionRunning, setSessionRunning] = useState<boolean | null>(null);
  /**
   * Bumped when the owning Session starts or settles a run.
   *
   * The findings live in the Session transcript, not in the Worktree, so the
   * file watcher that refreshes the diff never hears about a review that has
   * just finished. Without this the card would wait for a manual refresh.
   */
  const [findingsRefresh, setFindingsRefresh] = useState(0);
  /** Whether this window is the one in front of the human. */
  const [documentVisible, setDocumentVisible] = useState(true);
  useEffect(() => {
    const read = () => setDocumentVisible(document.visibilityState === "visible");
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);
  /*
   * The owner whose last turn is still being recorded, as the last read said —
   * not as the panel looks. A second prompt is read while an older turn's diff
   * is still on screen, and that read is kept off the screen to protect it, so
   * the view cannot be what decides whether to ask again.
   */
  const [awaitingTurn, setAwaitingTurn] = useState<string | null>(null);
  /** Whether a comment is being written against the changes on screen. */
  const editorOpen = useCallback((owner: string) => [...editors.current.values()].includes(owner), []);
  const onCommentEditingChange = useCallback((id: string, editing: boolean) => {
    if (editing) editors.current.set(id, resultOwner);
    else editors.current.delete(id);
    // Another editor can mount in the same effect flush; inspect after that flush.
    queueMicrotask(() => {
      if (currentResultOwner.current !== resultOwner) return;
      const pending = deferred.current;
      if (pending?.owner !== resultOwner) return;
      const showing = latestLoaded.current.owner === resultOwner ? latestLoaded.current.result : null;
      const released = releaseReviewRefresh({ held: pending.result, showing, commentEditorOpen: editorOpen(resultOwner) });
      if (!released && editorOpen(resultOwner)) return;
      deferred.current = null;
      setDeferredOwner(null);
      if (released) setLoaded({ owner: resultOwner, result: released });
    });
  }, [editorOpen, resultOwner]);
  /*
   * A commit is written and cannot change, so nothing is watched for it and
   * nothing is claimed about watching it. Every other scope reads the Worktree
   * as it is now, so each of them follows it.
   */
  const immutableScope = kind === "commit";
  const live = useReviewLiveUpdates({ context, active: active && !immutableScope && !selection.pullRequestView,
    onInvalidate: (event) => { if (event.cwd === cwd) setBackgroundRefresh((value) => value + 1); } });
  const result = useMemo<Result>(() => loaded.owner === resultOwner ? loaded.result : { kind: "loading" }, [loaded, resultOwner]);
  const [pendingOperation, setPendingOperation] = useState<ReviewOperationRequest | null>(null);
  const [skipFurtherConfirmations, setSkipFurtherConfirmations] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [outcome, setOutcome] = useState<OperationOutcome | null>(null);
  const [commitFormOpen, setCommitFormOpen] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitOutcome, setCommitOutcome] = useState<CommitOutcome | null>(null);
  const [commitHidden, setCommitHidden] = useState<string[]>([]);
  const [pushState, setPushState] = useState<{
    branch: string | null;
    upstream: string | null;
    ahead: number;
    remotes: string[];
    blocked: string | null;
  } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchChoices, setBranchChoices] = useState<ReviewBranchChoices | null>(null);
  const [branchOutcome, setBranchOutcome] = useState<BranchSetupOutcome | null>(null);
  const [publishFormOpen, setPublishFormOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishState, setPublishState] = useState<ReviewPublishState | null>(null);
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcome | null>(null);
  const ownerKey = useMemo(() => reviewCommentOwnerKey({ sessionId, cwd }), [sessionId, cwd]);
  /*
   * The comments in hand, and whose they are, held together.
   *
   * They are read for the new owner during the render that changes owner
   * rather than in an effect afterwards, because a render that showed the
   * previous owner's comments under the new owner is a render in which a click
   * could file them there.
   */
  const [held, setHeld] = useState<{ owner: string; comments: ReviewComment[] }>(
    () => ({ owner: ownerKey, comments: readReviewComments(ownerKey) }),
  );
  if (held.owner !== ownerKey) setHeld({ owner: ownerKey, comments: readReviewComments(ownerKey) });
  // Memoised because everything downstream of it is: an owner mismatch that
  // built a fresh empty array each render would replace every reading taken
  // from it, including where each comment sits in the diff.
  const comments = useMemo(() => held.owner === ownerKey ? held.comments : [], [held, ownerKey]);
  // Read during a callback rather than closed over, so a handler created in an
  // earlier render cannot decide that an owner it no longer sees is current.
  const currentOwner = useRef(ownerKey);
  currentOwner.current = ownerKey;
  const changeComments = useCallback((owner: string, apply: (current: ReviewComment[]) => ReviewComment[]) => {
    const next = mutateReviewComments(owner, currentOwner.current, apply);
    if (next) setHeld({ owner, comments: next });
  }, []);
  const needsRevision = kind === "branch" || kind === "commit";
  const fileView = selection.fileView ?? DEFAULT_REVIEW_FILE_VIEW;
  /*
   * The selection as it is now, for a write that arrives after the render that
   * made its handler. The scroll keeper writes the reading position from an
   * unmount cleanup, and React runs a cleanup with the props of the last
   * committed render. Spreading the captured selection there would put the
   * previous scope back and undo the change that caused the unmount.
   */
  const latestSelection = useRef(selection);
  latestSelection.current = selection;
  /**
   * A file-view write, kept to the owner and the selection that are current.
   *
   * Two late writes reach here from the same unmount cleanup. A scope change
   * destroys the list, and the write that follows carries the selection of the
   * render before it, which the ref above answers. A Session or directory
   * change destroys the list too, and the file view that write carries is the
   * previous owner's reading of a different diff. The owner is captured at the
   * callsite and checked here, so that write is dropped rather than filed
   * under whoever is on screen now.
   */
  const applyFileView = useCallback((owner: string, fileView: ReviewFileView) => {
    if (owner !== currentOwner.current) return;
    onSelectionChange({ ...latestSelection.current, fileView });
  }, [onSelectionChange]);
  const diffMode = selection.diffMode ?? "unified";
  const displayPreferences = selection.displayPreferences ?? DEFAULT_REVIEW_DISPLAY_PREFERENCES;
  const noisePreferences = selection.noisePreferences ?? DEFAULT_REVIEW_NOISE_PREFERENCES;
  const sectionOperations = useMemo(() => reviewOperationsForScope(kind, "section"), [kind]);
  const fileOperations = useMemo(() => reviewOperationsForScope(kind, "file"), [kind]);
  const hunkOperations = useMemo(() => reviewOperationsForScope(kind, "hunk"), [kind]);

  useEffect(() => {
    const controller = new AbortController();
    const params = reviewOwnerSearchParams(context, { kind: "metadata" });
    void fetch(`/api/git/review/choices?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const metadata = await response.json();
        if (!controller.signal.aborted) setBranchMetadata(metadata);
      }).catch(() => { if (!controller.signal.aborted) setBranchMetadata(null); });
    return () => controller.abort();
  }, [context, kind, refresh]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbar.current?.contains(event.target)) {
        setMenuOpen(false); setCommitsOpen(false); setBranchesOpen(false); setMoreOpen(false); setCommitOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (selection.pullRequestView) return;
    if (needsRevision && !revision) return;
    const setResult = (next: Result) => {
      if (currentResultOwner.current !== resultOwner) return;
      const current = latestLoaded.current;
      // Terminal reads clear it; a read still settling holds it.
      if (kind === "lastTurn" && next.kind !== "loading") {
        setAwaitingTurn(reviewReadIsPending(next) ? resultOwner : null);
      }
      const decision = decideReviewRefresh({
        showing: current.owner === resultOwner ? current.result : null,
        incoming: next,
        commentEditorOpen: editorOpen(resultOwner),
      });
      if (decision.kind === "ignore") return;
      if (decision.kind === "warn") {
        setRefreshWarning({ owner: resultOwner, message: decision.message });
        return;
      }
      // A read that arrived supersedes the sentence about one that did not.
      setRefreshWarning(null);
      if (decision.kind === "hold") {
        deferred.current = { owner: resultOwner, result: decision.state };
        setDeferredOwner(resultOwner);
        return;
      }
      deferred.current = null;
      setDeferredOwner(null);
      if (decision.kind === "show") setLoaded({ owner: resultOwner, result: decision.state });
    };
    if (kind === "lastTurn" && !sessionId) {
      setResult({ kind: "unavailable", title: "Select a Session", message: "Open a Session in this workspace to review its last turn.", retryable: false });
      return;
    }
    const controller = new AbortController();
    setResult({ kind: "loading" });
    const params = reviewOwnerSearchParams(context, { scope: kind });
    if (kind === "branch") params.set("base", revision);
    if (kind === "commit") params.set("revision", revision);
    /*
     * Hiding whitespace is a different reading of the diff rather than a
     * filter over the one already here, so it travels with the request and
     * changing it fetches again. The digests the answer carries stay those of
     * the exact reading, so an operation or an expansion still validates.
     */
    if (displayPreferences.hideWhitespace) params.set("hideWhitespace", "1");
    void fetch(`/api/git/review?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const reason = typeof value?.reason === "string" ? value.reason : null;
          if (!reason) throw new Error(value.error || "Changes could not be loaded.");
          setResult({
            kind: "unavailable",
            title: (kind === "lastTurn" ? LAST_TURN_TITLES[reason as keyof typeof LAST_TURN_TITLES] : undefined)
              ?? (reason in UNAVAILABLE_TITLES
                ? UNAVAILABLE_TITLES[reason as keyof typeof UNAVAILABLE_TITLES]
                : "Changes cannot be reviewed here"),
            message: value.error || "Changes cannot be reviewed in this directory.",
            retryable: kind === "lastTurn" ? value.retryable === true : reason === "git-missing",
            reason,
          });
          return;
        }
        if (kind === "lastTurn" && (value.scope?.kind !== "lastTurn" || value.scope.sessionId !== sessionId)) {
          throw new Error("The last turn response does not belong to this Session.");
        }
        setResult({ kind: "ready", value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ kind: "error", message: error instanceof Error ? error.message : "Changes could not be loaded." });
      });
    return () => controller.abort();
  }, [context, editorOpen, kind, needsRevision, revision, refresh, backgroundRefresh, sessionId, resultOwner, selection.pullRequestView, displayPreferences.hideWhitespace]);

  /*
   * A run that starts or settles changes two things this Worktree's watcher
   * cannot see, because both are recorded in the Session's own store: what the
   * last turn is, and what the latest review found. So both are read again
   * here, from the one stream that reports the run.
   */
  useReviewTurnActivity({
    sessionId,
    active: active && !selection.pullRequestView,
    onActivity: () => {
      if (kind === "lastTurn") setBackgroundRefresh((value) => value + 1);
      setFindingsRefresh((value) => value + 1);
    },
  });

  /*
   * The owning Session's run state, watched only while the experimental
   * trigger is armed. It is how a follow-up waits for the review it hangs
   * from to finish instead of talking over it.
   */
  useReviewTurnActivity({
    sessionId,
    active: active && smartReview.armed && !selection.pullRequestView,
    onActivity: (running) => setSessionRunning(running),
  });

  // The record can lag the run it describes, so a turn reported as still
  // being recorded is asked about again until it is not.
  useEffect(() => {
    if (!active || kind !== "lastTurn" || awaitingTurn !== resultOwner) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setBackgroundRefresh((value) => value + 1);
    }, LAST_TURN_SETTLE_POLL_MS);
    return () => clearInterval(timer);
  }, [active, awaitingTurn, kind, resultOwner]);

  /** Every file the current scope is showing, which is what "all" acts on. */
  const sectionTargets = useMemo(() => result.kind === "ready"
    ? Object.entries(result.value.fileRevisions).map(([path, revision]) => ({ path, revision }))
    : [], [result]);

  /*
   * Whether the diff is known to be less than the turn. None of the three
   * omissions present is not proof of the opposite — an edit made by hand
   * leaves no record either — so this claims nothing about the rest.
   */
  const lastTurnPartial = kind === "lastTurn" && result.kind === "ready" && Boolean(
    result.value.incompleteTools?.length || result.value.unattributedPaths?.length || result.value.skippedPaths?.length,
  );

  /** The floating section actions cover the foot of the changed-files list. */
  const sectionPillVisible = sectionOperations.length > 0 && sectionTargets.length > 0;

  const applyOperation = useCallback(async (request: ReviewOperationRequest) => {
    setOperationBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/git/review/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        /*
         * Which reading the hunk was chosen from travels with the operation.
         * Hiding whitespace draws a different diff, and the server resolves a
         * hunk taken from it back to the exact hunk before applying anything.
         */
        body: JSON.stringify(reviewOwnerBody(context, {
          operation: request.operation,
          scope: { kind },
          targets: request.targets,
          hideWhitespace: displayPreferences.hideWhitespace,
        })),
      });
      const value = await response.json();
      if (!response.ok) {
        setOutcome({ tone: "danger", message: value.error || "These changes could not be applied.", failed: [], skipped: [] });
        return;
      }
      const { tone, message } = reviewOutcomeMessage({
        operation: request.operation,
        targetKind: request.targetKind,
        status: value.status,
        path: request.path,
        hunkNumber: request.hunkNumber,
      });
      setOutcome({ tone, message, failed: value.failed ?? [], skipped: value.skipped ?? [] });
    } catch {
      setOutcome({ tone: "danger", message: "These changes could not be applied.", failed: [], skipped: [] });
    } finally {
      setOperationBusy(false);
      // Read the diff again whatever happened: after a refusal the panel must
      // show the state that refused it, not the one that asked.
      setRefresh((value) => value + 1);
    }
  }, [context, displayPreferences.hideWhitespace, kind]);

  const requestOperation = useCallback((request: ReviewOperationRequest) => {
    if (isDestructiveReviewOperation(request.operation) && shouldConfirmRevert()) {
      setSkipFurtherConfirmations(false);
      setPendingOperation(request);
      return;
    }
    void applyOperation(request);
  }, [applyOperation]);

  /** What the panel is showing, which is what a commit may carry knowingly. */
  const reviewedPaths = useMemo(() => result.kind === "ready" ? Object.keys(result.value.fileRevisions) : [], [result]);
  /**
   * What the panel is currently showing, as content.
   *
   * The per-file digests Review already computes, so "did anything change"
   * is answered by the changes rather than by who is running. A change made
   * by the human, by the model, or by another tool reads the same here.
   */
  const reviewFingerprint = useMemo(
    () => result.kind === "ready"
      ? JSON.stringify(Object.entries(result.value.fileRevisions).sort())
      : null,
    [result],
  );
  /** The same fingerprint, for effects that must not re-run when it moves. */
  const reviewFingerprintRef = useRef(reviewFingerprint);
  reviewFingerprintRef.current = reviewFingerprint;

  /*
   * Queue every change, including ones that arrive while the Session works.
   * Nothing is dropped; the follow-up waits for a quiet moment below.
   */
  useEffect(() => {
    if (reviewFingerprint === null) return;
    setSmartReview((state) => noteSmartReviewChange(state, { fingerprint: reviewFingerprint }));
  }, [reviewFingerprint]);
  const canCommit = scopeCanCommit(kind);
  // R14 describes two scopes only: uncommitted changes, or a branch against a
  // chosen base. Reeve's other views have no scope a request could name.
  const canRequestReview = kind === "branch"
    ? Boolean(selection.comparisonBranch)
    : kind === "uncommitted" || kind === "staged" || kind === "unstaged";

  /**
   * Send one review request, however it was asked for.
   *
   * Every path through this panel goes here, so a delivery that comes back
   * unsent is reported rather than dropped. A composed prompt handed back is
   * exactly that: this panel has no composer, so nobody sent it.
   */
  const dispatchReview = useCallback(async (request: ReviewSlashRequest): Promise<ReviewDispatchResult> => {
    if (!onRequestReview) return { error: null, accepted: false, deferred: false };
    setReviewRequest({ busy: true, error: null });
    const outcome = await onRequestReview(request);
    const error = outcome.kind === "error"
      ? outcome.error
      : outcome.kind === "prompt"
        ? "The review was composed but not sent."
        : null;
    setReviewRequest({ busy: false, error });
    return {
      error,
      accepted: outcome.kind === "delivered",
      deferred: outcome.kind === "error" && outcome.deferred === true,
    };
  }, [onRequestReview]);

  const askForReview = useCallback(async () => {
    const { error } = await dispatchReview(kind === "branch"
      ? { mode: "branch", base: selection.comparisonBranch, message: "" }
      : { mode: "uncommitted", base: null, message: "" });
    // Only a review the human asked for arms the experimental trigger.
    // Armed against what this review is about to look at, so the same content
    // never counts as a change afterwards.
    if (!error) setSmartReview(armSmartReview(readReviewSettings(), reviewFingerprint));
  }, [dispatchReview, kind, reviewFingerprint, selection.comparisonBranch]);
  const commitDisabled = commitDisabledReason({
    committing: commitBusy,
    loading: result.kind === "loading",
    repositoryAvailable: result.kind !== "unavailable",
    changeCount: reviewedPaths.length,
  });

  /** Reviewed changes the index does not hold yet, named before any staging. */
  const unstagedPaths = useMemo(() => {
    if (kind !== "uncommitted") return [];
    const staged = new Set(branchMetadata?.indexPaths ?? []);
    return reviewedPaths.filter((path) => !staged.has(path));
  }, [branchMetadata, kind, reviewedPaths]);

  /** The remote this branch would push to: its upstream's, or the only one. */
  const pushRemote = pushState?.upstream?.includes("/")
    ? pushState.upstream.slice(0, pushState.upstream.indexOf("/"))
    : pushState?.remotes?.[0] ?? branchMetadata?.remotes?.[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/git/review/push?${reviewOwnerSearchParams(context)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const value = await response.json();
        if (!controller.signal.aborted) setPushState(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [context, refresh]);

  /**
   * The review that may follow an act Reeve just performed (R17).
   *
   * Both preferences ship off, so this does nothing until the human arms one,
   * and it runs only after a push or a publish they asked for. The request
   * itself is Review 13's: this decides whether to ask, never what to ask.
   */
  const startAutomaticReviews = useCallback(async (
    act: "push" | "publish",
    publishedBase?: string | null,
  ): Promise<string | null> => {
    if (!onRequestReview) return null;
    // What to ask, and whether to ask at all, is decided and tested beside
    // the preferences rather than here.
    const request = automaticReviewRequest(readReviewSettings(), act, {
      kind,
      comparisonBranch: selection.comparisonBranch,
      publishedBase,
    });
    if (!request) return null;
    return (await dispatchReview(request)).error;
  }, [dispatchReview, kind, onRequestReview, selection.comparisonBranch]);

  /*
   * Which question the armed trigger is about. A late answer from a request
   * sent for an older Tab, Session or scope must not touch the new state.
   */
  const smartReviewGeneration = useRef(0);

  /*
   * A follow-up, once the Session is quiet and the changes have stopped
   * arriving. The delay coalesces an editing burst into one review. The
   * decision itself, including the bound, is made beside the preference.
   */
  useEffect(() => {
    const due = smartReviewDue(smartReview, {
      sessionRunning,
      // A window nobody is looking at is not a moment to start a review in.
      panelVisible: active && documentVisible,
      scopeReviewable: !selection.pullRequestView && !immutableScope && kind !== "lastTurn",
      resultReady: result.kind === "ready",
      requestBusy: reviewRequest.busy,
    });
    if (!due) return;
    // The first ask waits for the Worktree to go quiet. A refused ask waits
    // longer, because the composer is still finishing the turn it refused for.
    const first = smartReview.attemptsLeft === SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT;
    const timer = setTimeout(() => {
      const request = smartReviewRequest(readReviewSettings(), { kind, comparisonBranch: selection.comparisonBranch });
      if (!request) {
        setSmartReview(IDLE_SMART_REVIEW);
        return;
      }
      const generation = smartReviewGeneration.current;
      const fingerprint = reviewFingerprintRef.current ?? "";
      /*
       * The allowance is spent on the answer, never on the ask. A composed
       * prompt the composer refused reviewed nothing, so it costs an attempt
       * and the follow-up is asked for again. Anything else is a real failure
       * and stops the trigger.
       */
      void dispatchReview(request).then((dispatched) => {
        if (generation !== smartReviewGeneration.current) return;
        setSmartReview((state) => {
          if (dispatched.accepted) return consumeSmartReview(state, { fingerprint });
          return dispatched.deferred ? deferSmartReview(state) : IDLE_SMART_REVIEW;
        });
      });
    }, first ? SMART_REVIEW_SETTLE_MS : SMART_REVIEW_RETRY_MS);
    return () => clearTimeout(timer);
    // `reviewFingerprint` is a dependency so that each further change restarts
    // the settle delay, which is what turns an editing burst into one review.
    // The timer itself reads the ref, so it always asks about the last state.
  }, [active, dispatchReview, documentVisible, immutableScope, kind, result.kind, reviewFingerprint, reviewRequest.busy, selection.comparisonBranch, selection.pullRequestView, sessionRunning, smartReview]);

  /*
   * A different Tab, a different Session, or a different scope is a different
   * question, and the review that armed this was about the old one.
   */
  useEffect(() => {
    smartReviewGeneration.current += 1;
    setSmartReview(IDLE_SMART_REVIEW);
    setSessionRunning(null);
  }, [context.tabId, sessionId, kind, selection.comparisonBranch, selection.pullRequestView]);

  /*
   * A review the human asked for from the composer arms the trigger too. The
   * panel's own ask arms it directly; this covers the other door.
   */
  useEffect(() => {
    if (!reviewStartedAt) return;
    setSmartReview(armSmartReview(readReviewSettings(), reviewFingerprintRef.current));
  }, [reviewStartedAt]);

  const pushBranch = useCallback(async () => {
    if (!pushRemote) return;
    setPushBusy(true);
    setCommitOutcome(null);
    try {
      const response = await fetch("/api/git/review/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewOwnerBody(context, { remote: pushRemote })),
      });
      const value = await response.json();
      if (response.ok && value.status === "pushed") {
        // The push happened because the human asked for it, which is what an
        // armed trigger is allowed to follow.
        const followUp = await startAutomaticReviews("push");
        setCommitOutcome({
          tone: "success",
          message: [`Pushed ${value.branch} to ${value.remote}.`, followUp].filter(Boolean).join(" "),
          hidden: [],
        });
      } else {
        setCommitOutcome({
          tone: "danger",
          message: PUSH_PROBLEMS[value.blocked ?? value.pushFailure ?? ""] ?? "This branch could not be pushed.",
          hidden: [],
        });
      }
    } catch {
      setCommitOutcome({ tone: "danger", message: "This branch could not be pushed.", hidden: [] });
    } finally {
      setPushBusy(false);
      setRefresh((value) => value + 1);
    }
  }, [context, pushRemote, startAutomaticReviews]);

  /*
   * The branches this Worktree could work on, read only while the form that
   * offers them is open: which branch another Worktree holds changes without
   * this panel being told.
   */
  useEffect(() => {
    if (!branchFormOpen) return;
    const controller = new AbortController();
    void fetch(`/api/git/review/branch?${reviewOwnerSearchParams(context)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const value = await response.json();
        if (!controller.signal.aborted) setBranchChoices(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [branchFormOpen, context, refresh]);

  /** What publishing would do, read while the form is open, for the same reason. */
  useEffect(() => {
    // The Git menu needs it too: it is what decides whether the action says
    // pull request or merge request.
    if (!publishFormOpen && !commitOpen) return;
    const controller = new AbortController();
    void fetch(`/api/git/review/publish?${reviewOwnerSearchParams(context)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const value = await response.json();
        if (!controller.signal.aborted) setPublishState(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [publishFormOpen, commitOpen, context, refresh]);

  const submitBranchSetup = useCallback(async (submission: BranchSetupSubmission) => {
    setBranchBusy(true);
    setBranchOutcome(null);
    try {
      const response = await fetch("/api/git/review/branch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewOwnerBody(context, { mode: submission.mode, name: submission.name })),
      });
      const value = await response.json();
      if (!response.ok) {
        setBranchOutcome({ tone: "danger", message: value.error || "The branch could not be set." });
        return;
      }
      if (value.status === "switched") {
        setBranchOutcome(null);
        setCommitOutcome({
          tone: "success",
          message: value.created ? `Created ${value.branch} and working here.` : `Working on ${value.branch}.`,
          hidden: [],
        });
        setBranchFormOpen(false);
        return;
      }
      setBranchOutcome(value.status === "refused"
        ? { tone: "warning", message: BRANCH_REFUSALS[value.refusal] ?? "That branch cannot be used here." }
        : { tone: "danger", message: BRANCH_FAILURES[value.failure] ?? BRANCH_FAILURES.unknown });
    } catch {
      setBranchOutcome({ tone: "danger", message: "The branch could not be set." });
    } finally {
      setBranchBusy(false);
      setRefresh((value) => value + 1);
    }
  }, [context]);

  const generatePublishMessage = useCallback(async () => {
    const response = await fetch("/api/git/review/publish/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewOwnerBody(context, { base: publishState?.base ?? "" })),
    }).catch(() => null);
    if (!response?.ok) return null;
    const value = await response.json().catch(() => null);
    return value?.ok ? { title: String(value.message.title), body: String(value.message.body) } : null;
  }, [context, publishState]);

  const submitPublish = useCallback(async (submission: PublishSubmission) => {
    setPublishBusy(true);
    setPublishOutcome(null);
    try {
      const response = await fetch("/api/git/review/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewOwnerBody(context, {
          title: submission.title,
          body: submission.body,
          base: submission.base,
          draft: submission.draft,
          pushFirst: submission.pushFirst,
          // Absent unless the human ticked it, because it writes history.
          ...(submission.commitFirst ? { commitFirst: submission.commitFirst } : {}),
        })),
      });
      const value = await response.json();
      if (!response.ok) {
        setPublishOutcome({ tone: "danger", message: value.error || "The pull request could not be created." });
        return;
      }
      if (value.status === "push-failed") {
        const problem = value.push?.blocked ?? value.push?.pushFailure ?? "unknown";
        setPublishOutcome({ tone: "danger", message: `${PUSH_PROBLEMS[problem] ?? "This branch could not be pushed."} Nothing was published.` });
        return;
      }
      if (value.status === "published") {
        const noun = value.forge === "gitlab" ? "Merge request" : "Pull request";
        // A push that happened on the way is a review-worthy act too, but the
        // publish is the one the human asked for, so the trigger is publish,
        // and the review is pinned to what the branch was published into.
        const followUp = await startAutomaticReviews("publish", submission.base || publishState?.base || null);
        setPublishOutcome({
          tone: "success",
          message: [`${noun} #${value.number} created${value.draft ? " as a draft" : ""}.`, followUp].filter(Boolean).join(" "),
          url: value.url,
        });
        return;
      }
      setPublishOutcome(PUBLISH_RESULTS[value.status as keyof typeof PUBLISH_RESULTS]?.(value)
        ?? { tone: "danger", message: "The pull request could not be created." });
    } catch {
      setPublishOutcome({ tone: "danger", message: "The pull request could not be created." });
    } finally {
      setPublishBusy(false);
      setRefresh((value) => value + 1);
    }
  }, [context, publishState, startAutomaticReviews]);

  const generateCommitMessage = useCallback(async () => {
    const response = await fetch("/api/git/review/commit/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewOwnerBody(context, {})),
    }).catch(() => null);
    if (!response?.ok) return null;
    const value = await response.json().catch(() => null);
    return value?.ok ? String(value.message) : null;
  }, [context]);

  const submitCommit = useCallback(async (submission: CommitSubmission) => {
    setCommitBusy(true);
    setCommitOutcome(null);
    try {
      const response = await fetch("/api/git/review/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reviewOwnerBody(context, {
          scope: { kind },
          message: submission.message,
          reviewedPaths,
          // Only what the human agreed to stage, and only the paths that are
          // not staged already. Nothing is staged without being named first.
          stagePaths: submission.stageReviewed && unstagedPaths.length ? unstagedPaths : undefined,
          acknowledgedHiddenPaths: submission.acknowledgedHiddenPaths,
          expectedIndexDigest: branchMetadata?.indexDigest ?? undefined,
          // The digests this panel was showing, frozen as the form opened.
          expectedFileRevisions: result.kind === "ready" ? result.value.fileRevisions : undefined,
          createBranch: submission.createBranch,
          // The server decides whether an upstream is set, from the branch itself.
          push: submission.push && pushRemote ? { remote: pushRemote } : undefined,
        })),
      });
      const value = await response.json();
      if (!response.ok) {
        setCommitOutcome({ tone: "danger", message: value.error || "These changes could not be committed.", hidden: [] });
        return;
      }
      if (value.status === "refused") {
        setCommitHidden(value.refusal === "hidden-staged-paths" ? value.hiddenPaths ?? [] : []);
        setCommitOutcome({ tone: "warning", message: COMMIT_REFUSALS[value.refusal] ?? "This commit was refused.", hidden: value.hiddenPaths ?? [] });
        return;
      }
      if (value.status === "failed") {
        const staged = (value.stagedPaths ?? []).length;
        const branchNote = value.createdBranch ? ` The branch ${value.branch} was created and kept.` : "";
        const stagedNote = staged ? ` ${staged} ${staged === 1 ? "change was" : "changes were"} staged and left staged.` : "";
        setCommitOutcome({
          tone: "danger",
          message: `${COMMIT_FAILURES[value.failure] ?? COMMIT_FAILURES.unknown}${branchNote}${stagedNote}`,
          hidden: value.hiddenPaths ?? [],
        });
        return;
      }
      const short = typeof value.commit === "string" ? value.commit.slice(0, 7) : "";
      setCommitHidden([]);
      setCommitOutcome(value.status === "committed-not-pushed"
        ? { tone: "warning", message: `Committed ${short} on ${value.branch}. ${PUSH_PROBLEMS[value.pushFailure ?? "unknown"]}`, hidden: value.hiddenPaths ?? [] }
        : { tone: "success", message: `Committed ${short} on ${value.branch}${value.pushed ? " and pushed it" : ""}.`, hidden: value.hiddenPaths ?? [] });
      setCommitFormOpen(false);
    } catch {
      setCommitOutcome({ tone: "danger", message: "These changes could not be committed.", hidden: [] });
    } finally {
      setCommitBusy(false);
      setRefresh((value) => value + 1);
    }
  }, [branchMetadata, context, kind, pushRemote, result, reviewedPaths, unstagedPaths]);

  // An operation's own refresh must not wipe the sentence describing it, so
  // the result of the last one is cleared when the human moves somewhere else.
  useEffect(() => { setOutcome(null); }, [cwd, kind, revision]);

  /** A comment's path, named the way the owning Session resolves it. */
  const toSessionPath = useCallback((filePath: string) => result.kind === "ready"
    ? reviewReferencePath(result.value.repositoryRoot, result.value.cwd, filePath)
    : filePath, [result]);

  /*
   * Every comment placed against the diff on screen, worked out once here.
   *
   * Two surfaces answer for the same comment — the diff it is drawn on, and the
   * text handed to the composer — and a comment that has moved must not be one
   * line to the panel and another to the agent. Nothing stored is changed by
   * this: the anchor and the revision each comment was written against stay as
   * they are, and where it sits now is read from them again each time.
   */
  /**
   * The files this review is drawing, by repository-relative path.
   *
   * A review that has not been read yet offers nothing to place against, and
   * an empty map is the honest way to say so: every comment comes back
   * detached, and every finding comes back on no line, rather than sitting on
   * numbers nobody has checked. They are all still in the answer, so they can
   * still be read and handed over.
   *
   * The comments and the findings are placed against this one map, so the two
   * cannot come to disagree about which revision they were measured against.
   */
  const filesOnScreen = useMemo(() => {
    const files = new Map<string, { patch: string; revision?: string }>();
    if (result.kind === "ready") {
      const revisions = result.value.fileRevisions ?? {};
      for (const file of reviewFilesFromPatch(result.value.patch)) {
        files.set(file.path, { patch: file.patch, revision: revisions[file.path] });
      }
    }
    return files;
  }, [result]);

  const placedComments = useMemo(() => {
    return placeReviewComments(comments, filesOnScreen);
  }, [comments, filesOnScreen]);

  /**
   * Whether the changed-file list is on screen to draw comments itself.
   *
   * It is absent more often than it looks: a review whose work is all
   * committed draws an empty state, one still reading draws a message, and one
   * waiting for a branch or a commit draws a prompt. None of those are reasons
   * for somebody's notes to leave the screen.
   */
  const filesShown = !(needsRevision && !revision)
    && result.kind === "ready"
    && Boolean(result.value.patch || result.value.conflictedFiles?.length);

  const saveComment = useCallback((filePath: string, draft: ReviewCommentDraft) => {
    const now = new Date().toISOString();
    const revisionForFile = result.kind === "ready" ? result.value.fileRevisions[filePath] ?? "" : "";
    // The owner this save belongs to is the one on screen as it is made; the
    // comment is folded into whatever storage holds for that owner now.
    changeComments(ownerKey, (current) => {
      const existing = draft.id ? current.find((comment) => comment.id === draft.id) : undefined;
      return upsertReviewComment(current, {
        id: draft.id ?? newReviewCommentId(),
        path: filePath,
        side: draft.side,
        startLine: draft.startLine,
        endLine: draft.endLine,
        // Editing keeps the revision it was written against, because the lines
        // it points at are still that patch's lines.
        revision: existing?.revision ?? revisionForFile,
        // The anchor comes from the diff, which is the only place that knows
        // what the lines say; an edit that carries none keeps the one it had.
        ...(draft.anchor ?? existing?.anchor ? { anchor: draft.anchor ?? existing?.anchor } : {}),
        body: draft.body,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    });
  }, [changeComments, ownerKey, result]);

  const handoffComments = useCallback((selected: readonly PlacedReviewComment[], handoff: ReviewCommentHandoff) => {
    if (!onAddToComposer || selected.length === 0) return;
    onAddToComposer(reviewCommentsComposerText(selected, handoff, toSessionPath));
  }, [onAddToComposer, toSessionPath]);

  /*
   * The findings of this Session's latest review, placed against the same
   * files the comments are. The route reads only the Session this Review Tab
   * belongs to, so a Tab with no Session beside it asks for nothing.
   */
  const findings = useReviewFindings({
    context,
    ownerKey,
    files: filesOnScreen,
    // One value for both doors: the panel's own refresh, and a run that settled.
    refresh: `${refresh}:${findingsRefresh}`,
    enabled: Boolean(sessionId) && !selection.pullRequestView,
  });

  /**
   * What every surface that draws a finding is given.
   *
   * Putting a finding away is the only act offered on it. The model's words
   * are in the Session transcript, and nothing here writes over them or takes
   * them out of it.
   */
  const findingsHandling = useMemo<ReviewFindingsHandling>(() => ({
    findings: findings.visible,
    isFindingDismissed: findings.isDismissed,
    onDismissFinding: findings.dismiss,
    onRestoreFinding: findings.restore,
    onAddFindingToChat: onAddToComposer
      ? (placed) => onAddToComposer(reviewFindingsComposerText([placed], toSessionPath))
      : undefined,
  }), [findings.visible, findings.isDismissed, findings.dismiss, findings.restore, onAddToComposer, toSessionPath]);

  /* The totals beside the scope, summed over the loaded patch's own files. */
  const stats = useMemo(() => {
    if (result.kind !== "ready") return null;
    return reviewFilesFromPatch(result.value.patch, result.value.conflictedFiles ?? [])
      .reduce((total, file) => ({
        additions: total.additions + (file.additions ?? 0),
        deletions: total.deletions + (file.deletions ?? 0),
      }), { additions: 0, deletions: 0 });
  }, [result]);

  /*
   * The whole review as one runnable command, for the options menu's copy row.
   *
   * Recorded against Review 19: the reference copies the review's entire
   * patch inside a command that changes to the repository top level and pipes
   * it into `git apply --3way`. The scope is the review, not a file and not a
   * hunk, so it is built from the same patch the panel already holds. Null
   * while there is nothing to apply, which is what disables the row.
   */
  const applyCommand = useMemo(() => (result.kind === "ready"
    ? reviewApplyCommand({ repositoryRoot: result.value.repositoryRoot, patch: result.value.patch })
    : null), [result]);

  const copyApplyCommand = useCallback(async () => {
    if (!applyCommand) return;
    setMoreOpen(false);
    try {
      await copyTextOrFail(applyCommand);
      setOutcome({ tone: "success", message: "A git apply command for this review was copied.", failed: [], skipped: [] });
    } catch {
      setOutcome({ tone: "danger", message: "The clipboard refused this copy.", failed: [], skipped: [] });
    }
  }, [applyCommand]);

  /*
   * The next useful comparison, from an empty state that has nothing of its
   * own to show. The branch it names is the one the toolbar would resolve to,
   * so arriving there shows exactly what the empty state offered.
   */
  const viewBranchDiff = useCallback((branch: ReviewBranchComparison) => {
    onSelectionChange({ ...selection, kind: "branch", comparisonBranch: branch.value, comparisonLabel: branch.label });
  }, [onSelectionChange, selection]);

  if (selection.pullRequestView) {
    const view = selection.pullRequestView;
    return <section className={styles.panel} aria-label="Pull request review">
      <div className={styles.toolbar}>
        <Button size="sm" tone="ghost" onClick={() => onSelectionChange({ ...selection, pullRequestView: undefined })}>Local changes</Button>
        <span className={styles.toolbarActions}>
          <Button ref={moreTrigger} size="sm" tone="ghost" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>Display options</Button>
          <Menu open={moreOpen} label="PR display options" triggerRef={moreTrigger} onClose={() => setMoreOpen(false)}>
            <ReviewDisplayPreferences preferences={displayPreferences} fullFileLoadingAvailable={false}
              onChange={(preferences) => onSelectionChange({ ...selection, displayPreferences: preferences })} />
          </Menu>
        </span>
      </div>
      {view.kind === "list" ? <ReviewPullRequests key={context.tabId} context={context} client={reviewPrClient}
        onSelect={(repository, pull) => onSelectionChange({ ...selection, pullRequestView: { kind: "selected", repository, pull } })} />
        : <ReviewPrDetail key={JSON.stringify([context.tabId, view.repository, view.pull.number, view.pull.headSha])}
          context={context} repository={view.repository} pull={view.pull} client={reviewPrClient} displayPreferences={displayPreferences}
          onBack={() => onSelectionChange({ ...selection, pullRequestView: { kind: "list" } })} onOpenFile={onOpenFile} onAddToComposer={onAddToComposer} />}
    </section>;
  }

  return (
    <section className={styles.panel} aria-label="Review changes">
      <div className={styles.toolbar} ref={toolbar} data-branch-review={kind === "branch"}>
        {/*
          * The scope and its totals are one cell, the way the reference keeps
          * them in one component: the header is a two-column grid, and the
          * comparison branch is a second row across both columns.
          */}
        <div className={styles.toolbarLead}>
          <div className={styles.scope}>
            <Button ref={trigger} size="sm" tone="ghost" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); setCommitsOpen(false); setBranchesOpen(false); setMoreOpen(false); setCommitOpen(false); }}>
              {kind === "commit" ? `Commit ${revision.slice(0, 7)}` : SCOPES.find((scope) => scope.kind === kind)?.label}
              <ChevronDown />
            </Button>
            <Menu open={menuOpen} label="Review scope" onClose={() => setMenuOpen(false)} triggerRef={trigger} className={styles.menu}>
              <MenuItem onClick={() => { onSelectionChange({ ...selection, pullRequestView: { kind: "list" } }); setMenuOpen(false); }}>Pull requests</MenuItem>
              <MenuItem role="menuitemradio" checked={kind === "lastTurn"} disabled={!sessionId} title={!sessionId ? "Select a Session in this workspace" : undefined}
                onClick={() => { onSelectionChange({ ...selection, kind: "lastTurn" }); setMenuOpen(false); }}>Last turn</MenuItem>
              <div className={styles.menuSeparator} role="separator" />
              {SCOPES.filter((scope) => scope.kind !== "commit" && scope.kind !== "lastTurn").map((scope) => <MenuItem key={scope.kind} role="menuitemradio" checked={kind === scope.kind} onClick={() => {
                onSelectionChange({ ...selection, kind: scope.kind }); setMenuOpen(false);
              }}>{scope.label}</MenuItem>)}
              <div className={styles.submenuAnchor}>
                <MenuItem ref={commitTrigger} aria-haspopup="menu" aria-expanded={commitsOpen} onClick={() => setCommitsOpen(!commitsOpen)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") { event.preventDefault(); setCommitsOpen(true); }
                  }}>Commits <span aria-hidden="true">›</span></MenuItem>
                <Menu open={menuOpen && commitsOpen} label="Commits" triggerRef={commitTrigger} className={styles.submenu}
                  onClose={() => setCommitsOpen(false)} onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "ArrowLeft") { event.preventDefault(); setCommitsOpen(false); commitTrigger.current?.focus(); }
                  }}>
                  {menuOpen && commitsOpen && <ReviewChoices key={context.tabId} context={context} kind="commit" base={resolvedComparison || undefined} selected={kind === "commit" ? revision : ""}
                    onSelect={(value) => { onSelectionChange({ ...selection, kind: "commit", commit: value }); setCommitsOpen(false); setMenuOpen(false); trigger.current?.focus(); }} />}
                </Menu>
              </div>
            </Menu>
          </div>

          {stats && (
            <span className={styles.diffStat} aria-label={`${stats.additions} additions, ${stats.deletions} deletions`}>
              <span className={styles.additions}>+{stats.additions.toLocaleString("en-GB")}</span>
              <span className={styles.deletions}>−{stats.deletions.toLocaleString("en-GB")}</span>
            </span>
          )}

          {/* What is being reviewed, so a second Review Tab is never a guess. */}
          <span className={styles.binding} title={binding.hasSession
            ? `Reviewing ${binding.worktree} in ${binding.project}, beside this Session`
            : `Reviewing ${binding.worktree} in ${binding.project}. No Session is bound to this Tab.`}>
            {binding.isMainCheckout ? binding.project : `${binding.project} / ${binding.worktree}`}
          </span>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.toolbarCluster}>
            <span className={styles.toolbarButton}>
              <IconButton ref={moreTrigger} label="Review options" aria-haspopup="menu" aria-expanded={moreOpen}
                onClick={() => { setMoreOpen(!moreOpen); setCommitOpen(false); }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="3" cy="8" r="1.1" /><circle cx="8" cy="8" r="1.1" /><circle cx="13" cy="8" r="1.1" />
                </svg>
              </IconButton>
              <Menu open={moreOpen} label="Review options" triggerRef={moreTrigger} className={styles.menu} onClose={() => setMoreOpen(false)}>
                {/*
                  * The reference's own options menu, in its recorded order and
                  * wording: refresh and word wrap above the divider, then the
                  * five display and patch rows below it. The divider is a real
                  * group boundary in the reference, not decoration.
                  */}
                <MenuItem onClick={() => { setRefresh((value) => value + 1); setMoreOpen(false); }}>Refresh</MenuItem>
                <MenuItem role="menuitemcheckbox" checked={selection.wrapLines ?? false} onClick={() => {
                  onSelectionChange({ ...selection, wrapLines: !selection.wrapLines });
                }}>{selection.wrapLines ? "Disable word wrap" : "Enable word wrap"}</MenuItem>
                <div className={styles.menuSeparator} role="separator" />
                {kind !== "lastTurn" && <ReviewFullFilesItem preferences={displayPreferences}
                  onChange={(preferences) => onSelectionChange({ ...selection, displayPreferences: preferences })} />}
                {/* The generated filter belongs to the changed-files tree's own
                    filter menu, per R5, and lives there rather than here. */}
                <ReviewRichPreviewItem preferences={noisePreferences}
                  onChange={(preferences) => onSelectionChange({ ...selection, noisePreferences: preferences })} />
                <ReviewWordDiffsItem preferences={displayPreferences}
                  onChange={(preferences) => onSelectionChange({ ...selection, displayPreferences: preferences })} />
                <ReviewWhiteSpaceItem preferences={displayPreferences}
                  onChange={(preferences) => onSelectionChange({ ...selection, displayPreferences: preferences })} />
                <MenuItem disabled={!applyCommand} onClick={() => { void copyApplyCommand(); }}>Copy git apply command</MenuItem>
                {/*
                  * Reeve's own rows, kept below the reference's set so the
                  * recorded order above stays exact. The reference carries
                  * expand and collapse in this menu too, under a condition
                  * that has not been read, so it sits here rather than in a
                  * guessed position.
                  */}
                <div className={styles.menuSeparator} role="separator" />
                <ReviewExpandDiffsItem preferences={displayPreferences}
                  onChange={(preferences) => onSelectionChange({ ...selection, displayPreferences: preferences })} />
                {/*
                  * Offered only where there is a finding to show or to bring
                  * back. Putting one away hides it from the diff and leaves
                  * the review turn in the conversation, so this row is how it
                  * comes back.
                  */}
                {findings.placed.length > 0 && <MenuItem role="menuitemcheckbox" checked={findings.showDismissed}
                  onClick={() => findings.setShowDismissed(!findings.showDismissed)}>
                  <span className={styles.choiceLabel}>Show dismissed findings</span>
                  {findings.dismissedCount > 0 && <span className={styles.choiceDetail}>
                    {findings.dismissedCount === 1 ? "One is put away" : `${findings.dismissedCount} are put away`}
                  </span>}
                </MenuItem>}
                {onRequestReview && (
                  <>
                    {/* The one action here that starts a turn. */}
                    <MenuItem disabled={reviewRequest.busy || !canRequestReview} onClick={() => {
                      setMoreOpen(false);
                      void askForReview();
                    }}>
                      <span className={styles.choiceLabel}>
                        {reviewRequest.busy ? "Asking for a review…" : "Ask the agent to review these changes"}
                      </span>
                      {!canRequestReview && <span className={styles.choiceDetail}>Review the uncommitted changes or a base branch</span>}
                      {reviewRequest.error && <span className={styles.choiceDetail}>{reviewRequest.error}</span>}
                    </MenuItem>
                    <MenuItem role="menuitemradio" checked={delivery === "current-chat"}
                      onClick={() => onDeliveryChange?.("current-chat")}>Answer in this Session</MenuItem>
                    <MenuItem role="menuitemradio" checked={delivery === "review-chat"}
                      onClick={() => onDeliveryChange?.("review-chat")}>Answer in a new review chat</MenuItem>
                  </>
                )}
              </Menu>
            </span>
            <IconButton label={diffMode === "split" ? "Switch to unified diff" : "Switch to split diff"}
              onClick={() => onSelectionChange({ ...selection, diffMode: diffMode === "split" ? "unified" : "split" })}>
              {/*
                * The reference marks the diff presentation with a red and a
                * green bar inside a rounded frame, whether split or unified.
                */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="2.4" stroke="currentColor" strokeWidth="1.2" />
                <rect x="4.1" y="4.9" width="3.3" height="6.2" rx="0.9" fill="var(--ui-danger)" />
                <rect x="8.6" y="4.9" width="3.3" height="6.2" rx="0.9" fill="var(--ui-success)" />
              </svg>
            </IconButton>
            <IconButton label={fileView.showFiles ? "Hide files" : "Show files"}
              className={fileView.showFiles ? styles.filesToggleActive : undefined}
              onClick={() => onSelectionChange({ ...selection, fileView: { ...fileView, showFiles: !fileView.showFiles } })}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1.8 4.2A1.7 1.7 0 0 1 3.5 2.5h2.6l1.5 1.5h4.9a1.7 1.7 0 0 1 1.7 1.7v6.1a1.7 1.7 0 0 1-1.7 1.7H3.5a1.7 1.7 0 0 1-1.7-1.7Z" />
                <path d="M5.5 9.6h5" />
              </svg>
            </IconButton>
          </div>
          <span className={styles.toolbarButton}>
            {/*
              * The primary action opens the commit form in one click, the way
              * the reference's action row does; the chevron beside it holds the
              * rest, each carrying its own reason when it cannot run.
              */}
            <button type="button" className={styles.commitButton}
              disabled={!canCommit || Boolean(commitDisabled)}
              title={!canCommit ? "Commit from the uncommitted or staged view" : commitDisabled ? COMMIT_DISABLED[commitDisabled] : undefined}
              onClick={() => { setCommitOutcome(null); setCommitHidden([]); setCommitFormOpen(true); }}>
              <CommitGlyph />
              Commit or push
            </button>
            <button ref={gitTrigger} type="button" className={styles.commitMore} aria-haspopup="menu" aria-expanded={commitOpen}
              aria-label="More Git actions"
              onClick={() => { setCommitOpen(!commitOpen); setMoreOpen(false); }}>
              <ChevronDown />
            </button>
            <Menu open={commitOpen} label="Git actions" triggerRef={gitTrigger} className={styles.commitMenu} onClose={() => setCommitOpen(false)}>
              <MenuItem disabled={Boolean(pushState?.blocked) || pushBusy || !pushRemote} onClick={() => {
                setCommitOpen(false);
                void pushBranch();
              }}>
                <span className={styles.choiceLabel}>
                  {pushState?.ahead ? `Push ${pushState.ahead} ${pushState.ahead === 1 ? "commit" : "commits"}` : "Push"}
                  {pushRemote ? ` to ${pushRemote}` : ""}
                </span>
                {pushState?.blocked && <span className={styles.choiceDetail}>{PUSH_PROBLEMS[pushState.blocked]}</span>}
              </MenuItem>
              <MenuItem disabled={!canCommit} onClick={() => {
                setCommitOpen(false);
                setCommitOutcome(null);
                setCommitHidden([]);
                setCommitFormOpen(true);
              }}>
                <span className={styles.choiceLabel}>Create branch and commit</span>
                {!canCommit && <span className={styles.choiceDetail}>Uncommitted or staged changes only</span>}
              </MenuItem>
              <MenuItem onClick={() => {
                setCommitOpen(false);
                setBranchOutcome(null);
                setBranchFormOpen(true);
              }}>
                <span className={styles.choiceLabel}>Work here</span>
                <span className={styles.choiceDetail}>
                  {branchMetadata?.currentBranch ? `On ${branchMetadata.currentBranch}` : "Create a branch, or check one out"}
                </span>
              </MenuItem>
              <MenuItem onClick={() => {
                setCommitOpen(false);
                setPublishOutcome(null);
                setPublishFormOpen(true);
              }}>
                <span className={styles.choiceLabel}>
                  {publishState?.forge === "gitlab" ? "Create merge request" : "Create pull request"}
                </span>
                {publishState?.existing && <span className={styles.choiceDetail}>
                  #{publishState.existing.number} is already open for this branch
                </span>}
              </MenuItem>
            </Menu>
          </span>
        </div>

        {kind === "branch" && <div className={`${styles.scope} ${styles.branchScope}`} >
          {branchMetadata?.currentBranch && <span className={styles.branchRange}>{branchMetadata.currentBranch} <span aria-hidden="true">→</span></span>}
          <Button ref={branchTrigger} size="sm" tone="ghost" aria-haspopup="menu" aria-expanded={branchesOpen}
            onClick={() => { setBranchesOpen(!branchesOpen); setMenuOpen(false); setCommitsOpen(false); }}>{comparisonLabel || resolvedComparison.replace(/^refs\/(heads|remotes)\//, "") || "Select branch"}<ChevronDown /></Button>
          <Menu open={branchesOpen} label="Comparison branch" triggerRef={branchTrigger} className={styles.branchMenu} onClose={() => setBranchesOpen(false)}>
            {branchesOpen && <ReviewChoices key={context.tabId} context={context} kind="branch" selected={revision}
              onSelect={(value, label) => { onSelectionChange({ ...selection, comparisonBranch: value, comparisonLabel: label }); setBranchesOpen(false); }} />}
          </Menu>
        </div>}
      </div>
      <div className={styles.content}>
        {(live.warning || (refreshWarning?.owner === resultOwner && refreshWarning.message)) && <p className={styles.message} role="status">
          {live.warning || refreshWarning?.message} <Button size="sm" tone="ghost" onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>
        </p>}
        {deferredOwner === resultOwner && <p className={styles.message} role="status">Files changed. Save or cancel the open comment before the diff updates.</p>}
        {comments.length > 0 && <div className={styles.commentBar} role="group" aria-label="Review comments">
          <span className={styles.commentCount}>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>
          {onAddToComposer
            ? <>
              <Button size="sm" tone="ghost" onClick={() => handoffComments(placedComments, "notes")}>Add to chat</Button>
              <Button size="sm" tone="ghost" onClick={() => handoffComments(placedComments, "changes")}>Request changes</Button>
            </>
            /*
             * Two different refusals, and one of them used to read as the
             * other. A Tab bound to no Session needs a chat opened here. A Tab
             * bound to one that is not the selected Session needs that Session,
             * and being told to open this Project's chat is no help to someone
             * who has just opened one.
             */
            : <span className={styles.commentNote}>{sessionId
              ? "Select the Session this Tab was opened beside to hand them over"
              : "Open this Project's chat to hand them over"}</span>}
        </div>}
        {outcome && <div className={styles.outcome} data-tone={outcome.tone} role={outcome.tone === "success" ? "status" : "alert"}>
          <div className={styles.outcomeBody}>
            <p className={styles.outcomeMessage}>{outcome.message}</p>
            {outcome.failed.length > 0 && <ul className={styles.outcomeFailures}>
              {outcome.failed.map((failure) => <li key={failure.path}>
                <span className={styles.brightName}>{failure.path}</span> {failure.message}
              </li>)}
            </ul>}
            {outcome.skipped.length > 0 && <ul className={styles.outcomeFailures}>
              {outcome.skipped.map((entry) => <li key={entry.path}>
                <span className={styles.brightName}>{entry.path}</span> {entry.message}
              </li>)}
            </ul>}
          </div>
          <IconButton label="Dismiss this result" onClick={() => setOutcome(null)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="m3 3 6 6M9 3l-6 6" />
            </svg>
          </IconButton>
        </div>}
        {!filesShown && placedComments.length > 0 && <ReviewOrphanComments entries={placedComments}
          canAddToChat={Boolean(onAddToComposer)}
          onSaveComment={saveComment}
          onRemoveComment={(id) => changeComments(ownerKey, (current) => removeReviewComment(current, id))}
          onAddCommentToChat={(entry) => handoffComments([entry], "notes")} />}
        {/* No diff is on screen, so every finding is kept here instead. */}
        {!filesShown && findings.visible.length > 0
          && <ReviewOrphanFindings entries={findings.visible} handling={findingsHandling} />}
        {findings.unavailable && <p className={styles.message}>{findings.unavailable}</p>}
        {needsRevision && !revision ? <p className={styles.message}>Select {kind === "branch" ? "a comparison branch" : "a commit"} to review.</p>
          : result.kind === "loading" ? <p className={styles.message} role="status">Refreshing changes</p>
          : result.kind === "unavailable" ? <ReviewEmptyState
              situation={{ kind: "unavailable", title: result.title, description: result.message, retryable: result.retryable, reason: result.reason }}
              scope={kind} branchComparison={branchRecovery}
              onRetry={() => setRefresh((value) => value + 1)}
              onViewBranchDiff={viewBranchDiff}
              onCreateRepository={() => requestReviewRepository(context)}
              /*
               * A repository now exists where there was none. The read that
               * reported its absence is asked again, and the success is said
               * in the results bar, which survives that read — said inside the
               * empty state it would be replaced before it could be read.
               */
              onRepositoryCreated={() => {
                setOutcome({ tone: "success", message: "A Git repository was started here. Nothing has been staged or committed.", failed: [], skipped: [] });
                setRefresh((value) => value + 1);
              }} />
          : result.kind === "error" ? <ReviewEmptyState situation={{ kind: "error", description: result.message }}
              scope={kind} branchComparison={branchRecovery}
              onRetry={() => setRefresh((value) => value + 1)} onViewBranchDiff={viewBranchDiff} />
          : <>
            {kind === "lastTurn" && <p className={styles.message} role="status">Recorded changes from this Session’s last turn. Full-file context is not available for snapshots.</p>}
            {/* One sentence for the shortfall, before any of it is itemised. */}
            {lastTurnPartial && <p className={styles.message} role="status">
              This is part of the turn, not all of it. What is missing from the diff is named below.
            </p>}
            {kind === "lastTurn" && Boolean(result.value.skippedPaths?.length) && <div className={styles.message} role="status">
              <p>These files could not be captured and are not included:</p>
              <ul>{result.value.skippedPaths?.map((path) => <li key={path}>{path}</li>)}</ul>
            </div>}
            {/*
              * Shown before the diff, and whether or not the diff is empty: an
              * empty patch with omissions behind it would otherwise read as
              * "the agent changed nothing", which is a different claim.
              */}
            {kind === "lastTurn" && Boolean(result.value.unattributedPaths?.length) && <div className={styles.message} role="status">
              <p>These files changed, but there is no trusted record that the agent changed them, so they are not shown as its work:</p>
              <ul>{result.value.unattributedPaths?.map((path) => <li key={path}>{path}</li>)}</ul>
            </div>}
            {kind === "lastTurn" && Boolean(result.value.incompleteTools?.length) && <div className={styles.message} role="status">
              <p>Changes from these tools could not be fully verified, so what they did may be missing from this diff:</p>
              <ul>{result.value.incompleteTools?.map((tool) => <li key={tool}>{tool}</li>)}</ul>
            </div>}
            {result.value.omittedUntrackedFiles > 0 && <p className={styles.message} role="status">
              {untrackedOmissionMessage(result.value.omittedUntrackedFiles)}
            </p>}
            {result.value.patch || result.value.conflictedFiles?.length ? <ReviewFiles onCommentEditingChange={onCommentEditingChange}
              scope={result.value.scope}
              /*
               * Keyed by owner: a comment being written belongs to the Session
               * and directory it was started in, so when either changes the
               * editors are gone rather than left open over someone else's
               * comments.
               */
              key={ownerKey}
              /* The same string as a value: a key cannot be read from inside. */
              ownerKey={ownerKey}
              patch={result.value.patch} repositoryRoot={result.value.repositoryRoot}
              context={context}
              reviewCwd={result.value.cwd}
              onOpenFile={onOpenFile}
              onAtMention={onAtMention}
              untrackedFiles={result.value.untrackedFiles}
              conflictedFiles={result.value.conflictedFiles}
              fileView={fileView}
              onFileViewChange={(fileView) => applyFileView(ownerKey, fileView)}
              reserveBottomPadding={sectionPillVisible}
              displayPreferences={{ ...displayPreferences, loadFullFiles: kind !== "lastTurn" && displayPreferences.loadFullFiles }}
              noisePreferences={noisePreferences}
              onNoisePreferencesChange={(preferences) => onSelectionChange({ ...selection, noisePreferences: preferences })}
              diffMode={diffMode}
              fileOperations={fileOperations}
              hunkOperations={hunkOperations}
              operationBusy={operationBusy}
              onOperate={requestOperation}
              comments={placedComments}
              findings={findingsHandling}
              canAddToChat={Boolean(onAddToComposer)}
              onSaveComment={saveComment}
              onRemoveComment={(id) => changeComments(ownerKey, (current) => removeReviewComment(current, id))}
              onAddCommentToChat={(entry) => handoffComments([entry], "notes")}
              fileRevisions={result.value.fileRevisions ?? {}} viewedRevisions={selection.viewedRevisions}
              onViewedChange={kind === "branch" ? (path, revision) => {
                const viewedRevisions = { ...selection.viewedRevisions };
                if (revision === null) delete viewedRevisions[path]; else viewedRevisions[path] = revision;
                onSelectionChange({ ...selection, viewedRevisions });
              } : undefined}
              wrapLines={selection.wrapLines ?? false} onToggleWrap={() => onSelectionChange({ ...selection, wrapLines: !selection.wrapLines })} />
              /* An empty patch is only "no changes" with nothing behind it. */
              : <ReviewEmptyState scope={kind} branchComparison={branchRecovery}
                onViewBranchDiff={viewBranchDiff}
                situation={lastTurnPartial
                  ? {
                      kind: "stated",
                      title: "Nothing from this turn can be shown",
                      description: "The files named above are all this turn left behind that Review can account for.",
                    }
                  : result.value.omittedUntrackedFiles > 0
                    ? {
                        kind: "stated",
                        title: "No reviewable changes",
                        description: "The untracked files described above are the only changes here, and Review cannot show them.",
                      }
                    : { kind: "no-changes", scope: kind, lastTurnRecorded: kind === "lastTurn" }} />}
          </>}
      </div>
      {/*
        * The section actions, where the reference puts them: a floating pill
        * centred over the diff, clear of the file list and the toolbar. Its
        * contents follow the scope, which is why the staged view shows only
        * Unstage all.
        */}
      {sectionPillVisible && <div className={styles.sectionPill}>
        <div className={styles.sectionPillRow}>
          {sectionOperations.map((operation) => <Button key={operation} size="sm" tone="ghost"
            className={styles.sectionAction} disabled={operationBusy}
            onClick={() => requestOperation({ operation, targetKind: "section", targets: sectionTargets })}>
            <SectionActionIcon operation={operation} />
            {REVIEW_OPERATION_LABELS[operation].section}
          </Button>)}
        </div>
      </div>}
      <Dialog open={pendingOperation !== null} title="Revert changes?"
        description="This action removes all of these changes."
        size="sm" dismissible={!operationBusy}
        onOpenChange={(open) => { if (!open) setPendingOperation(null); }}>
        <label className={styles.confirmSkip}>
          <input type="checkbox" checked={skipFurtherConfirmations}
            onChange={(event) => setSkipFurtherConfirmations(event.target.checked)} />
          Don&apos;t ask again
        </label>
        <div className={styles.confirmActions}>
          <Button onClick={() => setPendingOperation(null)}>Cancel</Button>
          <Button tone="danger" loading={operationBusy} onClick={() => {
            const request = pendingOperation;
            setPendingOperation(null);
            if (!request) return;
            if (skipFurtherConfirmations) stopConfirmingRevert();
            void applyOperation(request);
          }}>Confirm</Button>
        </div>
      </Dialog>
      <ReviewCommitForm open={commitFormOpen} busy={commitBusy}
        disabledReason={commitDisabled}
        currentBranch={branchMetadata?.currentBranch ?? null}
        remote={pushRemote}
        hiddenPaths={commitHidden}
        unstagedPaths={unstagedPaths}
        indexCount={branchMetadata?.indexPaths?.length ?? 0}
        outcome={commitOutcome}
        onGenerate={generateCommitMessage}
        onSubmit={(submission) => void submitCommit(submission)}
        onClose={() => setCommitFormOpen(false)} />
      <ReviewBranchSetupForm open={branchFormOpen} busy={branchBusy}
        choices={branchChoices}
        outcome={branchOutcome}
        onSubmit={(submission) => void submitBranchSetup(submission)}
        onClose={() => setBranchFormOpen(false)} />
      <ReviewPublishForm open={publishFormOpen} busy={publishBusy}
        state={publishState}
        outcome={publishOutcome}
        onGenerate={generatePublishMessage}
        onSubmit={(submission) => void submitPublish(submission)}
        onOpen={(url) => openExternal(url)}
        onWorkHere={() => { setPublishFormOpen(false); setBranchOutcome(null); setBranchFormOpen(true); }}
        onClose={() => setPublishFormOpen(false)} />
    </section>
  );
}
