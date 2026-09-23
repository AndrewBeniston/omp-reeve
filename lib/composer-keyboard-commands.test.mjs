import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { COMPOSER_COMMANDS, UNAVAILABLE_COMPOSER_COMMANDS, matchDefaultComposerCommand, readComposerEnterBehavior, runComposerCommand, shouldSendWithEnterBehavior, nextThinkingLevel } = await jiti.import("./composer-keyboard-commands.ts");

test("the registry records every reference command once with shipped titles", () => {
  assert.equal(COMPOSER_COMMANDS.length, 12);
  assert.equal(UNAVAILABLE_COMPOSER_COMMANDS.length, 7);
  assert.equal(new Set([...COMPOSER_COMMANDS, ...UNAVAILABLE_COMPOSER_COMMANDS].map((command) => command.id)).size, 19);
  assert.ok(COMPOSER_COMMANDS.some((command) => command.title === "Open model picker"));
});

test("default command matching preserves platform modifiers", () => {
  assert.equal(matchDefaultComposerCommand({ key: "u", metaKey: true }), "composer.addFiles");
  assert.equal(matchDefaultComposerCommand({ key: "M", ctrlKey: true, shiftKey: true }), "composer.openModelPicker");
  assert.equal(matchDefaultComposerCommand({ key: "d", ctrlKey: true, shiftKey: true }), "composer.startDictation");
  assert.equal(matchDefaultComposerCommand({ key: "d", metaKey: true, shiftKey: true }), null);
});

test("workspace commands invoke their supplied control callback", () => {
  let command = null;
  assert.equal(runComposerCommand("composer.toggleWorktreeMode", value => { command = value; }), true);
  assert.equal(command, "composer.toggleWorktreeMode");
  assert.equal(runComposerCommand("composer.openProjectPicker", value => { command = value; }), true);
  assert.equal(command, "composer.openProjectPicker");
  assert.equal(runComposerCommand("composer.toggleWorktreeMode"), false);
  assert.equal(runComposerCommand("composer.openProjectPicker"), false);
});

test("the send shortcut setting has three values and defaults to enter", () => {
  assert.equal(readComposerEnterBehavior(null), "enter");
  assert.equal(readComposerEnterBehavior("cmdIfMultiline"), "cmdIfMultiline");
  assert.equal(readComposerEnterBehavior("cmdAlways"), "cmdAlways");
  assert.equal(readComposerEnterBehavior("invalid"), "enter");
});

test("each send behavior preserves Shift+Enter as a line break", () => {
  for (const behavior of ["enter", "cmdIfMultiline", "cmdAlways"]) {
    assert.equal(shouldSendWithEnterBehavior({ key: "Enter", shiftKey: true, behavior, isComposing: false, recentlyComposed: false, isMultiline: false }), false);
  }
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", behavior: "enter", isComposing: false, recentlyComposed: false, isMultiline: false }), true);
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", behavior: "cmdIfMultiline", isComposing: false, recentlyComposed: false, isMultiline: false }), true);
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", behavior: "cmdIfMultiline", isComposing: false, recentlyComposed: false, isMultiline: true }), false);
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", ctrlKey: true, behavior: "cmdIfMultiline", isComposing: false, recentlyComposed: false, isMultiline: true }), true);
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", behavior: "cmdAlways", isComposing: false, recentlyComposed: false, isMultiline: false }), false);
  assert.equal(shouldSendWithEnterBehavior({ key: "Enter", metaKey: true, behavior: "cmdAlways", isComposing: false, recentlyComposed: false, isMultiline: true }), true);
});

test("reasoning commands move through the supplied state order", () => {
  const steps = ["off", "low", "medium", "high"];
  assert.equal(nextThinkingLevel("low", "increase", steps), "medium");
  assert.equal(nextThinkingLevel("low", "decrease", steps), "off");
  assert.equal(nextThinkingLevel("high", "cycle", steps), null);
});
