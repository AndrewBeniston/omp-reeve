import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { groupSubagentRows, composeSubagentSummary } = await jiti.import("./subagent-group-summary.ts");
const { enLocale } = await jiti.import("../i18n/messages/en.ts");

const t = (key, params = {}) => enLocale.messages[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
const row = (id, name, state = "active", parentToolCallId = "call-1") => ({ id, name, state, parentToolCallId });

test("groups rows by anchor in reverse order and appends unclaimed background rows", () => {
  const groups = groupSubagentRows({
    activityGroups: [
      { anchorId: "call-1", rows: [row("a", "A"), row("b", "B")] },
      { anchorId: "call-2", rows: [row("b", "B", "active", "call-2"), row("c", "C", "active", "call-2")] },
    ],
    backgroundRows: [row("d", "D", "active", undefined)],
  });
  assert.deepEqual(groups.map((group) => [group.anchorId, group.rows.map((item) => item.id)]), [
    ["call-2", ["b", "c"]], ["call-1", ["a"]], [undefined, ["d"]],
  ]);
  assert.deepEqual(groupSubagentRows({ activityGroups: [{ anchorId: "empty", rows: [] }], backgroundRows: [] }), []);
});

test("names all agents up to three and uses a hidden count after that", () => {
  const sentence = (rows) => composeSubagentSummary(rows, t);
  assert.equal(sentence([row("a", "A")]), "A started working");
  assert.equal(sentence([row("a", "A"), row("b", "B")]), "A and B started working");
  assert.equal(sentence([row("a", "A"), row("b", "B"), row("c", "C")]), "A, B and C started working");
  assert.equal(sentence([row("a", "A"), row("b", "B"), row("c", "C"), row("d", "D")]), "A, B and 2 more started working");
});

test("derives the status with interrupted, updated, completed, then active precedence", () => {
  const sentence = (rows) => composeSubagentSummary(rows, t);
  assert.match(sentence([row("a", "A", "interrupted"), row("b", "B")]), / were interrupted$/);
  assert.match(sentence([row("a", "A", "interrupted")]), / was interrupted$/);
  assert.match(sentence([row("a", "A", "updated"), row("b", "B", "completed")]), / updated$/);
  assert.match(sentence([row("a", "A", "completed"), row("b", "B", "completed")]), / finished$/);
  assert.match(sentence([row("a", "A"), row("b", "B", "completed")]), / started working$/);
  assert.match(sentence([row("a", "A", "failed")]), / finished with errors$/);
  assert.match(sentence([row("a", "A", "progress")]), / made progress$/);
});
