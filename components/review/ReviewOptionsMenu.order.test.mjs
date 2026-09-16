/**
 * The Review options menu's rows, in the reference's own order.
 *
 * Order and wording are the requirement here, and both are easy to lose to an
 * unrelated edit in a 1,700-line panel. The menu cannot be mounted without the
 * whole panel and its Git reads, so the order is asserted against the source
 * the panel composes it from.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("./ReviewPanel.tsx", import.meta.url), "utf8");
const rows = readFileSync(new URL("./ReviewDisplayPreferences.tsx", import.meta.url), "utf8");
const noise = readFileSync(new URL("./ReviewNoisePreferences.tsx", import.meta.url), "utf8");

/** Where the options menu opens, and where it closes. */
function optionsMenu() {
  const start = panel.indexOf('<Menu open={moreOpen} label="Review options"');
  assert.notEqual(start, -1, "the options menu is labelled as the reference labels it");
  const end = panel.indexOf("</Menu>", start);
  assert.notEqual(end, -1);
  return panel.slice(start, end);
}

test("the rows sit in the reference's recorded order, in two groups", () => {
  const menu = optionsMenu();
  const order = [
    ">Refresh<",
    "Enable word wrap",
    'role="separator"',
    "ReviewFullFilesItem",
    "ReviewRichPreviewItem",
    "ReviewWordDiffsItem",
    "ReviewWhiteSpaceItem",
    "Copy git apply command",
  ];
  let cursor = -1;
  for (const marker of order) {
    const at = menu.indexOf(marker, cursor + 1);
    assert.notEqual(at, -1, marker + " is in the options menu");
    assert.ok(at > cursor, marker + " comes after the row before it");
    cursor = at;
  }
});

test("Reeve's own rows stay below the reference's set", () => {
  const menu = optionsMenu();
  assert.ok(menu.indexOf("ReviewExpandDiffsItem") > menu.indexOf("Copy git apply command"),
    "expand and collapse sits below the reference's rows, not inside them");
  assert.equal(menu.match(/role="separator"/g).length, 2,
    "one divider for the reference's group boundary, one for Reeve's own rows");
});

test("every label is imperative, and white space is two words", () => {
  assert.match(rows, /"Don't load full files" : "Load full files"/);
  assert.match(rows, /"Disable word diffs" : "Enable word diffs"/);
  assert.match(rows, /"Show white space" : "Hide white space"/);
  assert.match(noise, /"Disable rich preview" : "Enable rich preview"/);
  assert.match(panel, /"Disable word wrap" : "Enable word wrap"/);
  // "Hide whitespace changes" was Reeve's own wording, and is not the reference's.
  assert.doesNotMatch(rows, /whitespace changes/);
});

test("the copy row is offered only when there is a review to copy", () => {
  assert.match(optionsMenu(), /disabled=\{!applyCommand\}/);
});
