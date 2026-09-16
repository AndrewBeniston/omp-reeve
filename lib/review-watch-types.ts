/**
 * What the server says about watching a Worktree.
 *
 * `ready` opens the stream, `change` asks for a fresh read, and `status`
 * carries only a change of coverage: a watcher that dies after the stream
 * opened would otherwise stay silent, and the panel would keep promising an
 * update that is never coming.
 */
export type ReviewWatchEvent = { type: "ready" | "change" | "status"; limited: boolean };

/** Some of the Worktree is watched, and some of it is not. */
export const REVIEW_WATCH_WARNING = "Some files cannot be watched for changes. Refresh to update this view.";

/** Nothing is watched here, so only a manual refresh will update the view. */
export const REVIEW_WATCH_UNAVAILABLE = "Changes here cannot be watched. Refresh to update this view.";
