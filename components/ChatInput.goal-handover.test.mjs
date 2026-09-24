import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// #582: /goal hands the objective and the images to the Goal dialog. It must
// not call clearInput(), which deletes the uploads of every other attachment.
test("both /goal paths hand over without deleting other attachments", async () => {
  const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
  const handovers = [...source.matchAll(/onOpenGoal\([^)]*\);\s*\n\s*(\w+)\(\)/g)].map((match) => match[1]);
  assert.equal(handovers.length, 2);
  assert.deepEqual(handovers, ["clearForGoalHandover", "clearForGoalHandover"]);
  const helper = source.match(/const clearForGoalHandover = useCallback\(\(\) => \{[\s\S]*?\}, \[/)?.[0] ?? "";
  assert.doesNotMatch(helper, /clearDraft|setLocalAttachments|localAttachmentsRef/);
});
