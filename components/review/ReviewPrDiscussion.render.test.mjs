import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewPrDiscussion } = await jiti.import("./ReviewPrDiscussion.tsx");

const words = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** One open thread: the viewer's own comment, and somebody else's. */
const thread = (extra = {}) => ({
  id: "T1", path: "src/a.ts", startLine: 4, endLine: 4, side: "additions",
  resolved: false, outdated: false, canReply: true, canResolve: true,
  comments: [
    { id: "MINE", author: "fixture-reviewer", body: "my own note", createdAt: "now", url: "u", canEdit: true, canDelete: true },
    { id: "THEIRS", author: "fixture-author", body: "their note", createdAt: "now", url: "u", canEdit: false, canDelete: false },
  ],
  ...extra,
});

const identity = { remoteId: "slot", hostname: "github.fixture.invalid", owner: "reeve-fixture",
  repository: "pull-request-fixture", account: "fixture-reviewer", number: 4, headSha: "a".repeat(40), baseSha: "b".repeat(40) };

const pinned = { headSha: identity.headSha, baseSha: identity.baseSha };

const render = (overrides = {}) => renderToStaticMarkup(React.createElement(ReviewPrDiscussion, {
  owner: "owner-key", context: { tabId: "review:tab", owner: { projectRoot: "/f", worktreePath: "/f", sessionId: "s" } },
  identity, pinned, client: { publish: async () => ({ kind: "confirmed", ids: [] }), revisions: async () => pinned },
  drafts: [], onDraftsChange: () => {}, threads: [thread()], complete: true, onRefresh: () => {},
  canComment: true, canApprove: true, canRequestChanges: true, restriction: null,
  onLocate: () => {}, ...overrides,
}));

test("a thread offers the actions the host permits on it", () => {
  const said = words(render());
  assert.match(said, /Write reply/);
  assert.match(said, /Resolve/);
});

test("a resolved thread offers to reopen it rather than resolve it again", () => {
  const markup = render({ threads: [thread({ resolved: true })] });
  assert.match(markup, />Unresolve</);
  assert.doesNotMatch(markup, />Resolve</, "a resolved thread was still offered a Resolve");
});

test("only the viewer's own comment is offered for editing or deleting", () => {
  const markup = render();
  // The offer is made once, beside the comment the host says is the viewer's.
  assert.equal(markup.match(/Delete from GitHub/g).length, 1);
  assert.equal(markup.match(/>Edit</g).length, 1);
});

test("a read-only discussion stays readable and offers no way to write to it", () => {
  const markup = render({ restriction: "GitHub did not confirm what this account may do in this repository." });
  const said = words(markup);
  // The words people already published are the point of reading it at all.
  assert.match(said, /my own note/);
  assert.match(said, /their note/);
  assert.doesNotMatch(said, /Write reply/);
  assert.doesNotMatch(said, /Delete from GitHub/);
  assert.doesNotMatch(markup, />Edit</);
});

test("a thread action leaves the local drafts alone until a human confirms one", () => {
  // Nothing is drafted by drawing the discussion, so backing out of a
  // confirmation has nothing to leave behind.
  assert.match(words(render()), /No local drafts for this revision/);
});

/** One saved line comment, written against whichever revision is given. */
const lineDraft = (extra = {}) => ({
  id: "D1", saved: true, updatedAt: "2026-09-15T00:00:00Z", pinned,
  publication: { action: "inline", path: "src/a.ts", side: "additions", startLine: 4, endLine: 4, body: "worth saying" },
  ...extra,
});

test("a comment written against an earlier revision is kept, dated, and not offered for publication", () => {
  const older = lineDraft({ id: "OLD", pinned: { headSha: "c".repeat(40), baseSha: "" } });
  const markup = render({ drafts: [lineDraft(), older] });
  const said = words(markup);
  assert.match(said, /Written against an earlier revision/);
  assert.match(said, /Written against cccccccc/);
  // The words survive; only their placement on today's lines does not.
  assert.equal(markup.match(/worth saying/g).length, 2);
  // One Publish button, for the comment written against the revision on screen.
  assert.equal(markup.match(/>Publish to GitHub</g).length, 1);
  assert.equal(markup.match(/>Delete local draft</g).length, 2, "a dated comment could not be discarded");
});

test("a record that a write may have landed stays visible whatever revision is showing", () => {
  // A resolve carries no revision, so a revision split must never hide it: it
  // is the only thing telling a person the write may already be on GitHub.
  const record = { id: "R1", saved: true, uncertain: true, updatedAt: "now",
    publication: { action: "resolve", threadId: "T1" } };
  const said = words(render({ drafts: [record] }));
  assert.match(said, /Resolve thread/);
  assert.match(said, /Publication is unconfirmed/);
  assert.doesNotMatch(said, /Written against an earlier revision/);
});

test("nothing is submitted by drawing the panel", () => {
  const markup = render({ drafts: [lineDraft(), { id: "V1", saved: true, updatedAt: "now",
    publication: { action: "review", event: "approve", body: "looks right" } }] });
  // The confirmation is the only route to a write, and it is not open here.
  assert.doesNotMatch(markup, /Submit review/);
  assert.match(words(markup), /looks right/);
});

test("an unconfirmed write to a thread closes every route back to that thread", () => {
  // The mark guards the record; this guards the action. A second press would
  // otherwise mint a fresh record and send the same mutation again.
  const record = { id: "R1", saved: true, uncertain: true, updatedAt: "now",
    publication: { action: "resolve", threadId: "T1" } };
  const markup = render({ drafts: [record] });
  const said = words(markup);
  assert.match(said, /A write to this thread is unconfirmed/);
  assert.match(said, /Discard unconfirmed record/);
  assert.doesNotMatch(said, /Delete local draft/, "the escape hatch still read as deleting a draft");
  for (const label of ["Write reply", "Resolve", "Edit", "Delete from GitHub"]) {
    const button = new RegExp(`<button[^>]*>${label}<`);
    const match = markup.match(new RegExp(`<button[^>]*disabled[^>]*>${label}<`));
    assert.ok(!button.test(markup) || match, `${label} was still live beside an unconfirmed write`);
  }
});

test("a thread with nothing outstanding keeps its actions live", () => {
  const markup = render();
  assert.doesNotMatch(words(markup), /A write to this thread is unconfirmed/);
  assert.doesNotMatch(markup, /<button[^>]*disabled[^>]*>Write reply</);
});


test("an unconfirmed write aimed at a comment explains itself beside that comment", () => {
  // The thread-level reason does not fire for a comment-aimed record, so
  // without this the Edit and Delete buttons go dead with nothing to read.
  const record = { id: "R2", saved: true, uncertain: true, updatedAt: "now",
    publication: { action: "delete", commentId: "MINE" } };
  const said = words(render({ drafts: [record] }));
  assert.match(said, /A write to this comment is unconfirmed/);
  assert.doesNotMatch(said, /A write to this thread is unconfirmed/);
});


test("an unconfirmed comment from an earlier revision keeps its warning and its acknowledgement", () => {
  // The dated card is a second place a draft can appear. It must not be a
  // second set of rules: uncertainty and the discard gate travel with the
  // draft, not with the section it happens to be listed in.
  const older = { id: "OLD", saved: true, uncertain: true, updatedAt: "now",
    pinned: { headSha: "c".repeat(40), baseSha: "" },
    publication: { action: "inline", path: "src/a.ts", side: "additions", startLine: 4, endLine: 4, body: "worth saying" } };
  const said = words(render({ drafts: [older] }));
  assert.match(said, /Written against an earlier revision/);
  assert.match(said, /Publication is unconfirmed/);
  assert.match(said, /Discard unconfirmed record/);
  assert.doesNotMatch(said, /Delete local draft/, "a dated unconfirmed record offered a direct delete");
});
