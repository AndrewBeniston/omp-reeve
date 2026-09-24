import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("uses the Divider as the only completed-turn disclosure", () => {
  assert.doesNotMatch(source, /ProcessDetailsGroup/);
  assert.doesNotMatch(source, /assistantPosition === -1 \|\| live/);
  assert.match(
    source,
    /rendered\.push\(\s*<Divider[\s\S]*?forceExpanded=\{!finalAnswerMessage\}[\s\S]*?<ActivityHeader/,
  );
});

test("a live Activity header never repeats the running Activity row", () => {
  assert.match(source, /const headerRepeatsRow = selectLiveActivityHeader\(headerInput\)\.kind === "activity"/);
  assert.match(source, /\{headerRepeatsRow \? null : <ActivityHeader input=\{headerInput\} \/>\}/);
});
