import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./chat-window.module.css", import.meta.url), "utf8");
const composerCss = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");
const tokensCss = await readFile(new URL("../../app/tokens.css", import.meta.url), "utf8");
const chatWindow = await readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8");

function rule(name) {
  const match = new RegExp(`^\\.${name} \\{([^}]*)\\}`, "m").exec(css);
  assert.ok(match, `the module declares .${name}`);
  const declarations = new Map();
  for (const part of match[1].split(";")) {
    const [property, ...rest] = part.split(":");
    if (rest.length === 0) continue;
    declarations.set(property.trim(), rest.join(":").trim());
  }
  return declarations;
}

/**
 * Solve one flex column.
 *
 * The transcript pane carries flex: 1 and the composer dock keeps its content
 * height. The solver returns the height the transcript pane receives.
 */
function transcriptHeight({ rootHeight, composerHeight }) {
  return Math.max(0, rootHeight - composerHeight);
}

test("the chat root lays its children out as one flex column", () => {
  const root = rule("chatRoot");

  assert.equal(root.get("display"), "flex");
  assert.equal(root.get("flex-direction"), "column");
  assert.equal(root.get("height"), "100%");
  assert.equal(root.get("overflow"), "hidden");
});

test("the transcript pane takes the free height and the composer dock does not", () => {
  const pane = rule("transcriptPane");
  const dock = rule("composerDock");

  assert.equal(pane.get("flex"), "1");
  assert.equal(pane.get("min-height"), "0");
  assert.equal(pane.get("overflow"), "hidden");
  // The dock stays in normal flow. An absolute dock would cover the transcript.
  assert.equal(dock.has("flex"), false);
  assert.equal(dock.get("position"), "relative");
  assert.notEqual(dock.get("position"), "absolute");
  assert.notEqual(dock.get("position"), "fixed");
});

test("the composer dock keeps a gap above the window edge", () => {
  const dock = rule("composerDock");

  // The Codex composer floats above the window edge. A dock with no bottom
  // padding puts the composer border on the last pixel row.
  assert.equal(dock.get("padding-bottom"), "var(--space-4)");
  // The same gap on both sides when the pane is narrow.
  assert.equal(dock.get("padding-inline"), "var(--space-4)");
});

test("the transcript scroller reserves its gutter and keeps the pane gap separate", () => {
  const scroll = rule("transcriptScroll");
  const gutter = rule("transcriptGutter");
  const measure = rule("transcriptMeasure");

  assert.equal(scroll.get("scrollbar-gutter"), "stable both-edges");
  assert.equal(gutter.get("padding"), "0 var(--space-4)");
  assert.equal(measure.get("max-width"), "var(--thread-content-max-width)");
});

test("the composer surface reads as the brightest of the three shell surfaces and has no border", async () => {
  const composerRule = /^\.composer \{([^}]*)\}/m.exec(composerCss);
  assert.ok(composerRule, "composer.module.css declares .composer");
  // Codex: the composer has a hairline in its shadow recipe, not a border.
  assert.match(composerRule[1], /background:\s*var\(--ui-composer\);/);
  assert.match(composerRule[1], /min-height:\s*var\(--composer-frame-min-height\);/);
  assert.match(composerRule[1], /border-radius:\s*var\(--radius-composer\);/);
  assert.doesNotMatch(composerRule[1], /\bborder:\s*1px solid/);
  assert.match(composerRule[1], /box-shadow:\s*var\(--shadow-composer\);/);
});

test("the empty Composer frame keeps the measured 98px minimum", () => {
  assert.match(tokensCss, /--composer-frame-min-height:\s*98px;/);
  assert.match(composerCss, /\.composerContent\s*\{[^}]*padding:\s*14px var\(--space-3\) 0;/);
  assert.match(composerCss, /\.textareaGeometry\s*\{[^}]*transform:\s*translateY\(var\(--composer-text-nudge\)\);/);
  assert.doesNotMatch(composerCss, /padding:\s*calc\(14px \+ var\(--composer-text-nudge\)\)/);
});

test("the scroll region grows and shrinks with the space the pane receives", () => {
  const scroll = rule("transcriptScroll");

  assert.equal(scroll.get("flex"), "1");
  assert.equal(scroll.get("overflow-y"), "auto");
});

test("a taller composer removes height from the transcript", () => {
  const rootHeight = 900;
  const short = transcriptHeight({ rootHeight, composerHeight: 120 });
  const tall = transcriptHeight({ rootHeight, composerHeight: 320 });

  assert.equal(short, 780);
  assert.equal(tall, 580);
  assert.equal(tall < short, true, "growth removes transcript space");
  assert.equal(short + 120, rootHeight, "the two children fill the root exactly");
  assert.equal(tall + 320, rootHeight, "no child overlaps the other");
});

test("the transcript needs no observer and no measured variable for clearance", () => {
  // Normal flex flow already guarantees the clearance, so ChatWindow must not
  // carry a ResizeObserver or a measured composer height for this purpose.
  assert.doesNotMatch(chatWindow, /ResizeObserver/);
  assert.doesNotMatch(chatWindow, /composerHeight/);
  assert.doesNotMatch(css, /--composer-height/);
  assert.match(css, /Composer clearance/);
});
