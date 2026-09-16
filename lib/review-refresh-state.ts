/**
 * What a refresh is allowed to do to the view a reader is already looking at.
 *
 * Review reads its changes again for several reasons — a file was saved
 * outside the application, an operation finished, the reader pressed Refresh —
 * and a reader in the middle of a diff does not want any of them to move the
 * ground under them. The rules are the same whichever reason started the read,
 * so they live here rather than inside the panel: a read that says nothing
 * changed leaves the view alone, a read that arrives while a comment is being
 * written waits for it, and a read that failed reports itself without taking
 * the diff away.
 */

/** A read of the changes, in the states the panel can be in. */
export type ReviewLoadState<TValue> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "unavailable"; title: string; message: string; retryable: boolean }
  | { kind: "ready"; value: TValue };

export type ReviewRefreshDecision<TValue> =
  /** Show it: the first read, or a change the reader is free to receive. */
  | { kind: "show"; state: ReviewLoadState<TValue> }
  /** Identical to what is on screen. Position, expansion, and marks stay. */
  | { kind: "unchanged" }
  /** Hold it until the open comment is saved or cancelled. */
  | { kind: "hold"; state: ReviewLoadState<TValue> }
  /** Say what went wrong beside the diff that is still good. */
  | { kind: "warn"; message: string }
  /** Nothing to do, and nothing to say. */
  | { kind: "ignore" };

export interface ReviewRefreshInput<TValue> {
  /** What the reader can see now, or nothing on the first read. */
  showing: ReviewLoadState<TValue> | null;
  /** What came back. */
  incoming: ReviewLoadState<TValue>;
  /** True while a comment editor holds text that a replacement would discard. */
  commentEditorOpen: boolean;
}

/**
 * Whether two reads describe the same changes.
 *
 * Compared by value because every read builds fresh objects, so identity would
 * report every refresh as a change and reset a diff nobody touched. The server
 * builds each payload the same way from the same fields, so key order is
 * stable between reads of one scope.
 */
export function sameReviewChanges(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Whether this read will answer differently later without anyone touching a
 * file — a turn that is still being recorded.
 *
 * Asked of the read that arrived rather than of the view, because a read can
 * be kept off the screen and still be the reason to ask again: a turn still
 * settling is reported beside an older diff, and that diff is exactly what
 * would make a view-based test conclude there was nothing to wait for.
 */
export function reviewReadIsPending<TValue>(state: ReviewLoadState<TValue>): boolean {
  return state.kind === "unavailable" && state.retryable;
}

export function decideReviewRefresh<TValue>({
  showing, incoming, commentEditorOpen,
}: ReviewRefreshInput<TValue>): ReviewRefreshDecision<TValue> {
  // Whatever is on screen is worth more than a spinner over the top of it.
  if (incoming.kind === "loading") return showing ? { kind: "ignore" } : { kind: "show", state: incoming };
  // Nothing is being read yet, so there is nothing to disturb.
  if (!showing || showing.kind !== "ready") return { kind: "show", state: incoming };
  /*
   * A read that failed is news about the read, not about the changes, so it is
   * reported beside the diff rather than in place of it. That holds for a
   * refresh the reader asked for: being owed an answer is not the same as
   * being owed the loss of a draft.
   */
  if (incoming.kind !== "ready") return { kind: "warn", message: incoming.message };
  if (sameReviewChanges(showing.value, incoming.value)) return { kind: "unchanged" };
  if (commentEditorOpen) return { kind: "hold", state: incoming };
  return { kind: "show", state: incoming };
}

/**
 * The held read, once the comment that held it is finished with.
 *
 * Returns nothing while an editor is still open, and nothing when what is on
 * screen has caught up with the held read on its own — an operation inside the
 * panel reads the diff again, and a held read describing the same changes has
 * nothing left to deliver.
 */
export function releaseReviewRefresh<TValue>({ held, showing, commentEditorOpen }: {
  held: ReviewLoadState<TValue> | null;
  showing: ReviewLoadState<TValue> | null;
  commentEditorOpen: boolean;
}): ReviewLoadState<TValue> | null {
  if (!held || commentEditorOpen) return null;
  if (showing?.kind === "ready" && held.kind === "ready" && sameReviewChanges(showing.value, held.value)) return null;
  return held;
}
