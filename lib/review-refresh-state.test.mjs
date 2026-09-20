import assert from "node:assert/strict";
import test from "node:test";
import { decideReviewRefresh, releaseReviewRefresh, reviewReadIsPending, sameReviewChanges } from "./review-refresh-state.ts";

const ready = (patch) => ({ kind: "ready", value: { patch, fileRevisions: { "a.ts": "blob" } } });
const showing = ready("one");

test("the first read is shown, and a spinner never covers what is already read", () => {
  assert.deepEqual(
    decideReviewRefresh({ showing: null, incoming: ready("one"), commentEditorOpen: false }),
    { kind: "show", state: ready("one") },
  );
  assert.deepEqual(
    decideReviewRefresh({ showing: { kind: "loading" }, incoming: { kind: "loading" }, commentEditorOpen: false }),
    { kind: "ignore" },
  );
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: { kind: "loading" }, commentEditorOpen: false }),
    { kind: "ignore" },
  );
  // A last turn still running is read again until it settles, and each of
  // those reads must not blank the sentence explaining why there is no diff.
  const running = { kind: "unavailable", title: "Last turn is still running", message: "Wait for it.", retryable: true };
  assert.deepEqual(
    decideReviewRefresh({ showing: running, incoming: { kind: "loading" }, commentEditorOpen: false }),
    { kind: "ignore" },
  );
  assert.deepEqual(
    decideReviewRefresh({ showing: running, incoming: ready("one"), commentEditorOpen: true }),
    { kind: "show", state: ready("one") },
    "there is no diff to disturb and no comment can be open against one",
  );
});

test("a read describing the same changes leaves the view where it is", () => {
  assert.ok(sameReviewChanges(showing.value, ready("one").value));
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: ready("one"), commentEditorOpen: false }),
    { kind: "unchanged" },
  );
  // Even with a comment open: there is nothing to hold, so nothing is said.
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: ready("one"), commentEditorOpen: true }),
    { kind: "unchanged" },
  );
});

test("a change is held while a comment is being written, and shown when it is not", () => {
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: ready("two"), commentEditorOpen: true }),
    { kind: "hold", state: ready("two") },
  );
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: ready("two"), commentEditorOpen: false }),
    { kind: "show", state: ready("two") },
  );
});

test("a failed read is reported beside the diff it could not replace", () => {
  const failure = { kind: "error", message: "Changes could not be loaded." };
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: failure, commentEditorOpen: false }),
    { kind: "warn", message: "Changes could not be loaded." },
  );
  // Including a refresh the reader asked for: an answer they are owed is not
  // a draft they agreed to lose.
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: failure, commentEditorOpen: true }),
    { kind: "warn", message: "Changes could not be loaded." },
  );
  const gone = { kind: "unavailable", title: "Changes cannot be reviewed here", message: "Git is missing.", retryable: false };
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: gone, commentEditorOpen: false }),
    { kind: "warn", message: "Git is missing." },
  );
});

test("a held read waits for the editor, and is dropped once the view has caught up", () => {
  const held = ready("two");
  assert.equal(releaseReviewRefresh({ held, showing, commentEditorOpen: true }), null);
  assert.equal(releaseReviewRefresh({ held: null, showing, commentEditorOpen: false }), null);
  assert.equal(releaseReviewRefresh({ held, showing, commentEditorOpen: false }), held);
  assert.equal(releaseReviewRefresh({ held, showing: ready("two"), commentEditorOpen: false }), null);
});

test("a turn still being recorded is pending whatever the panel is showing", () => {
  const settling = { kind: "unavailable", title: "Last turn is still running", message: "Wait for it.", retryable: true };
  const gone = { kind: "unavailable", title: "No last turn recorded", message: "Nothing yet.", retryable: false };
  assert.equal(reviewReadIsPending(settling), true);
  assert.equal(reviewReadIsPending(gone), false);
  assert.equal(reviewReadIsPending(ready("one")), false);
  assert.equal(reviewReadIsPending({ kind: "error", message: "Changes could not be loaded." }), false);
  assert.equal(reviewReadIsPending({ kind: "loading" }), false);

  // The case that stranded a second prompt: the older turn keeps the screen,
  // so the decision is a warning, and only the read itself still knows there
  // is something to wait for.
  assert.deepEqual(
    decideReviewRefresh({ showing, incoming: settling, commentEditorOpen: false }),
    { kind: "warn", message: "Wait for it." },
  );
  assert.equal(reviewReadIsPending(settling), true);
});
