import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { readToolOutcome, attributeInterval, blobHashOf, TURN_PROVENANCE_VERSION } = await jiti.import(
  "./review-turn-attribution.ts",
);

const recorded = (writes, extra = {}) => ({ version: TURN_PROVENANCE_VERSION, writes, opaqueTools: [], ...extra });

const details = (value) => ({ details: value });

test("a write is held to the content it was given, whatever was there before", () => {
  const outcome = readToolOutcome({ toolName: "write", args: { path: "a.txt", content: "one\n" } });
  // No requirement on the prior state: the whole file is replaced, so nothing
  // of anyone else's can survive into what it writes.
  assert.deepEqual(outcome, { kind: "claims", groups: [[{ path: "a.txt", expects: blobHashOf("one\n") }]] });
});

test("a failed tool establishes nothing, even if the bytes would have matched", () => {
  const outcome = readToolOutcome({
    toolName: "write", args: { path: "a.txt", content: "one\n" }, isError: true,
  });
  assert.deepEqual(outcome, { kind: "opaque", tool: "write" });
});

test("an edit is held to the whole file it reports before and after", () => {
  const outcome = readToolOutcome({
    toolName: "edit",
    args: { path: "a.txt" },
    result: details({ path: "a.txt", oldText: "before\n", newText: "after\n" }),
  });
  assert.deepEqual(outcome, {
    kind: "claims",
    groups: [[{ path: "a.txt", requires: blobHashOf("before\n"), expects: blobHashOf("after\n") }]],
  });
});

test("a create requires the file to have been absent, and a delete expects it to be gone", () => {
  const created = readToolOutcome({
    toolName: "edit", args: {}, result: details({ path: "new.txt", newText: "fresh\n" }),
  });
  assert.deepEqual(created.groups, [[{ path: "new.txt", requires: null, expects: blobHashOf("fresh\n") }]]);

  const deleted = readToolOutcome({
    toolName: "edit", args: {}, result: details({ path: "old.txt", oldText: "gone\n" }),
  });
  assert.deepEqual(deleted.groups, [[{ path: "old.txt", requires: blobHashOf("gone\n"), expects: null }]]);
});

test("a rename accounts for both paths", () => {
  const outcome = readToolOutcome({
    toolName: "edit",
    args: {},
    result: details({ path: "to.txt", sourcePath: "from.txt", oldText: "text\n", newText: "text\n" }),
  });
  // One group: the two paths are one fact, and are applied together or not
  // at all.
  assert.deepEqual(outcome.groups, [[
    { path: "from.txt", requires: blobHashOf("text\n"), expects: null },
    { path: "to.txt", expects: blobHashOf("text\n") },
  ]]);
});

test("an edit whose snapshots were pruned says nothing usable and is a gap", () => {
  // The tool dropped oldText and newText past its own budget, so the result no
  // longer says what the file holds.
  const outcome = readToolOutcome({
    toolName: "edit", args: {}, result: details({ path: "big.txt", snapshotsPruned: true }),
  });
  assert.deepEqual(outcome, { kind: "opaque", tool: "edit" });
});

test("a multi-file edit that pruned one file is a gap as well as a claim", () => {
  // One file proved, one dropped past the snapshot budget. Returning the claim
  // without naming the tool would leave incompleteTools empty, which says every
  // change was accounted for — and one was not.
  const outcome = readToolOutcome({
    toolName: "edit",
    args: {},
    result: details({
      perFileResults: [
        { path: "a.txt", oldText: "a\n", newText: "A\n" },
        { path: "b.txt", snapshotsPruned: true },
      ],
    }),
  });
  assert.deepEqual(outcome.groups, [[{ path: "a.txt", requires: blobHashOf("a\n"), expects: blobHashOf("A\n") }]]);
  assert.equal(outcome.incompleteTool, "edit");
});

test("a multi-file edit is read file by file", () => {
  const outcome = readToolOutcome({
    toolName: "edit",
    args: {},
    result: details({
      perFileResults: [
        { path: "a.txt", oldText: "a\n", newText: "A\n" },
        { path: "b.txt", snapshotsPruned: true },
      ],
    }),
  });
  assert.deepEqual(outcome.groups, [[{ path: "a.txt", requires: blobHashOf("a\n"), expects: blobHashOf("A\n") }]]);
});

test("a tool that cannot write decides nothing, and anything unchecked is a gap", () => {
  for (const name of ["read", "grep", "glob", "ast_grep", "think", "todo", "inspect_image"]) {
    assert.deepEqual(readToolOutcome({ toolName: name, args: {} }), { kind: "ignored" }, name);
  }
  for (const name of ["bash", "task", "eval", "browser", "ast_edit", "some_plugin_tool"]) {
    assert.deepEqual(readToolOutcome({ toolName: name, args: { path: "a.txt" } }), { kind: "opaque", tool: name }, name);
  }
});

const entry = (path, afterHash) => ({ path, afterHash });

test("a turn with no record at all is refused, never drawn as an empty diff", () => {
  assert.deepEqual(attributeInterval(undefined, [entry("a.txt", "h1")]), {
    kind: "unavailable",
    reason: "attribution-unavailable",
  });
});

test("only files that end on the bytes the run was held to are its work", () => {
  const provenance = recorded([{ path: "a.txt", hash: "h1" }]);
  assert.deepEqual(attributeInterval(provenance, [entry("a.txt", "h1"), entry("b.txt", "h2")]), {
    kind: "attributed",
    paths: ["a.txt"],
    unattributedPaths: ["b.txt"],
    incompleteTools: [],
  });
});

test("a file somebody wrote over afterwards stops being the run's work", () => {
  const provenance = recorded([{ path: "a.txt", hash: "h1" }]);
  const attributed = attributeInterval(provenance, [entry("a.txt", "h2")]);
  assert.deepEqual(attributed.paths, []);
  assert.deepEqual(attributed.unattributedPaths, ["a.txt"]);
});

test("a shell in the turn narrows what is shown, and is named rather than hidden", () => {
  // The shell is the agent too, so what it did is missing coverage rather than
  // somebody else's work. What other tools proved still stands.
  const provenance = recorded([{ path: "a.txt", hash: "h1" }], { opaqueTools: ["bash"] });
  assert.deepEqual(attributeInterval(provenance, [entry("a.txt", "h1"), entry("b.txt", "h2")]), {
    kind: "attributed",
    paths: ["a.txt"],
    unattributedPaths: ["b.txt"],
    incompleteTools: ["bash"],
  });
});

test("a record that stopped keeping up claims nothing and says so", () => {
  const provenance = recorded([{ path: "a.txt", hash: "h1" }], { overflowed: true });
  const attributed = attributeInterval(provenance, [entry("a.txt", "h1")]);
  assert.deepEqual(attributed.paths, []);
  assert.deepEqual(attributed.unattributedPaths, ["a.txt"]);
  assert.equal(attributed.incompleteTools.length, 1);
});

test("a record written by an older Reeve is refused, never read as this one", () => {
  // The shape this shipped with before: different field names, no version, and
  // writes recorded under rules this version no longer applies.
  const old = { writes: [{ path: "a.txt", hash: "h1" }], unsupported: [], unverified: [{ path: "b.txt" }] };
  assert.deepEqual(attributeInterval(old, [entry("a.txt", "h1")]), {
    kind: "unavailable",
    reason: "attribution-unavailable",
  });
});

test("a record that is not shaped like one is refused rather than read", () => {
  for (const broken of [
    null,
    "provenance",
    { version: TURN_PROVENANCE_VERSION },
    { version: TURN_PROVENANCE_VERSION, writes: "all", opaqueTools: [] },
    { version: TURN_PROVENANCE_VERSION, writes: [{ path: 7, hash: "h1" }], opaqueTools: [] },
    { version: TURN_PROVENANCE_VERSION, writes: [], opaqueTools: [{}] },
    { version: 99, writes: [], opaqueTools: [] },
  ]) {
    assert.deepEqual(
      attributeInterval(broken, [entry("a.txt", "h1")]),
      { kind: "unavailable", reason: "attribution-unavailable" },
      JSON.stringify(broken),
    );
  }
});
