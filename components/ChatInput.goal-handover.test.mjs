import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// #582: /goal hands the objective and the images to the Goal dialog. It must
// not call clearInput(), which deletes the uploads of every other attachment.
test("both /goal paths hand over without deleting other attachments", async () => {
  const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
  const lines = source.split("\n");
  const followers = lines.flatMap((line, index) => (
    /^\s*onOpenGoal\(.*\);\s*$/.test(line) ? [lines[index + 1].trim()] : []
  ));
  assert.ok(followers.length >= 2);
  assert.ok(!followers.includes("clearInput();"));
  const helper = source.match(/const clearForGoalHandover = useCallback\(\(\) => \{[\s\S]*?\}, \[/)?.[0] ?? "";
  assert.doesNotMatch(helper, /clearDraft|setLocalAttachments|localAttachmentsRef/);
});
