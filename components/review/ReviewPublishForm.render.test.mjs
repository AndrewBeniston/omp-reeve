import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { React, click, domDocument, mount, textOf, typeInto } from "../../test/dom-harness.mjs";

/**
 * The commit and push local changes option (R16), as a human meets it.
 *
 * It writes history, so what matters here is that it is off until it is
 * ticked, that it will not travel without a message, and that what it sends
 * carries the snapshot the form was showing.
 */
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewPublishForm } = await jiti.import("./ReviewPublishForm.tsx");

const h = React.createElement;

/** A checkbox the harness can tick: React reads the change, not the click. */
async function tick(input) {
  const propsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
  const onChange = propsKey ? input[propsKey].onChange : undefined;
  if (!onChange) throw new Error("The checkbox carries no React change handler.");
  await React.act(async () => {
    input.checked = true;
    onChange({ target: input, currentTarget: input, preventDefault() {}, stopPropagation() {} });
  });
}

const STATE = {
  forge: "github", remote: "origin", repository: { host: "github.com", port: "", owner: "owner", name: "repo" },
  head: "codex/work", base: "main", headPublished: true, unpushed: 0,
  uncommitted: 2, snapshot: "snapshot-1", existing: null, blocked: null,
};

async function form(state = {}) {
  const submissions = [];
  const view = await mount(h(ReviewPublishForm, {
    open: true, busy: false, state: { ...STATE, ...state }, outcome: null,
    onGenerate: async () => null, onSubmit: (submission) => submissions.push(submission),
    onOpen: () => {}, onWorkHere: () => {}, onClose: () => {},
  }));
  // The Dialog is drawn into its own layer on the body, not into the mount.
  const dialog = [...domDocument.body.querySelectorAll("[data-dialog-layer]")].at(-1);
  const field = (id) => dialog.querySelector("[id='" + id + "']");
  const commitBox = () => [...dialog.querySelectorAll("label")]
    .find((label) => /Commit and push/.test(textOf(label)))?.querySelector("input") ?? null;
  const publish = () => [...dialog.querySelectorAll("button")]
    .find((button) => /Create pull request/.test(textOf(button)));
  return { view, dialog, submissions, field, commitBox, publish };
}

test("the local changes option is offered, and it commits nothing until it is ticked", async () => {
  const { view, dialog, submissions, field, commitBox, publish } = await form();
  assert.match(textOf(dialog), /2 local changes are not committed yet\./);
  assert.notEqual(commitBox(), null);
  // Nothing to type into until the human asks for a commit.
  assert.equal(field("review-publish-commit-message"), null);

  await typeInto(field("review-publish-title"), "A change");
  await click(publish());
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].commitFirst, null);
  await view.unmount();
});

test("a ticked option waits for a commit message, then carries it with the snapshot", async () => {
  const { view, dialog, submissions, field, commitBox, publish } = await form();
  await typeInto(field("review-publish-title"), "A change");
  await tick(commitBox());
  assert.notEqual(field("review-publish-commit-message"), null);
  assert.match(textOf(dialog), /Write a commit message before publishing\./);
  assert.equal(publish().hasAttribute("disabled"), true);

  await typeInto(field("review-publish-commit-message"), "Commit the work");
  await click(publish());
  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0].commitFirst, { message: "Commit the work", snapshot: "snapshot-1" });
  await view.unmount();
});

test("nothing about committing appears when there is nothing local", async () => {
  const { view, dialog, commitBox } = await form({ uncommitted: 0 });
  assert.equal(commitBox(), null);
  assert.doesNotMatch(textOf(dialog), /not committed yet/);
  await view.unmount();
});

test("a state that carries no snapshot offers no commit, because none was read", async () => {
  const { view, commitBox } = await form({ uncommitted: 3, snapshot: null });
  assert.equal(commitBox(), null);
  await view.unmount();
});
