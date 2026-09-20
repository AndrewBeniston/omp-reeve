import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewFilePreviewView, ReviewUnpreviewableNotice } = await jiti.import("./ReviewFilePreview.tsx");
const { ReviewConflictNotice } = await jiti.import("./ReviewConflictNotice.tsx");
const { ReviewGeneratedFilterItem, ReviewGeneratedNotice, ReviewRichPreviewItem } = await jiti.import("./ReviewNoisePreferences.tsx");
const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

const text = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const png = (base64) => ({ mediaType: "image/png", base64, bytes: 3 });
const render = (element) => renderToStaticMarkup(element);
const preview = (kind, state, path = "art/logo.png") =>
  render(React.createElement(ReviewFilePreviewView, { kind, path, state }));

test("a changed image draws both versions, labelled before and after", () => {
  const markup = preview("image", { status: "ready", old: png("AAA"), new: png("BBB") });
  assert.match(markup, /data-sides="2"/);
  assert.match(markup, /src="data:image\/png;base64,AAA"/);
  assert.match(markup, /src="data:image\/png;base64,BBB"/);
  assert.match(text(markup), /Before/);
  assert.match(text(markup), /After/);
});

test("one version alone says which one it is and takes a single column", () => {
  assert.match(text(preview("image", { status: "ready", old: null, new: png("BBB") })), /Added/);
  const removed = preview("image", { status: "ready", old: png("AAA"), new: null });
  assert.match(text(removed), /Removed/);
  assert.match(removed, /data-sides="1"/);
});

test("a PDF is drawn in an object whose children carry the render failure", () => {
  const markup = preview("pdf", { status: "ready", old: null, new: { mediaType: "application/pdf", base64: "JVBE", bytes: 4 } }, "docs/spec.pdf");
  assert.match(markup, /<object[^>]+type="application\/pdf"/);
  // Chromium's built-in viewer draws the PDF itself; these children show only
  // where it cannot, which a measurement in Electron 44 put at neither the
  // data URL nor the default plugins preference.
  assert.match(text(markup), /could not be drawn/);
});

test("a refusal offers the file when there is somewhere to open it", () => {
  const refused = { status: "refused", message: "This file is no longer part of this review." };
  const withAction = renderToStaticMarkup(
    React.createElement(ReviewFilePreviewView, { kind: "image", path: "a.png", state: refused, onOpenFile: () => {} }),
  );
  assert.match(text(withAction), /Open file/);
  assert.doesNotMatch(text(preview("image", refused)), /Open file/);
});

test("an SVG is drawn in an image, so nothing in the reviewed file runs", () => {
  const markup = preview("svg", { status: "ready", old: null, new: { mediaType: "image/svg+xml", base64: "PHN2Zz48L3N2Zz4=", bytes: 11 } }, "art/mark.svg");
  assert.match(markup, /<img[^>]+src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(markup, /<svg/);
});

test("markdown is rendered as the text it holds, decoded as UTF-8", () => {
  const body = Buffer.from("# Héading\n", "utf8").toString("base64");
  const markup = preview("markdown", { status: "ready", old: null, new: { mediaType: "text/markdown", base64: body, bytes: 10 } }, "notes.md");
  assert.match(markup, /<h1[^>]*>Héading<\/h1>/);
});

test("a preview that is loading or refused never renders an empty pane", () => {
  assert.match(text(preview("image", { status: "loading" })), /Loading preview/);
  assert.match(text(preview("image", { status: "refused", message: "This file is no longer part of this review." })), /no longer part of this review/);
  // Ready with neither side is still something rather than nothing.
  assert.notEqual(text(preview("image", { status: "ready", old: null, new: null })), "");
});

test("an unpreviewable binary says it is binary, and anything else does not", () => {
  assert.match(text(render(React.createElement(ReviewUnpreviewableNotice, { binary: true }))), /Binary file changed/);
  assert.match(text(render(React.createElement(ReviewUnpreviewableNotice, { binary: false }))), /cannot be previewed/);
});

test("a conflicted file is presented as conflicted, and says what conflicts", () => {
  const markup = render(React.createElement(ReviewConflictNotice, { stages: ["base", "ours", "theirs"] }));
  assert.match(text(markup), /File has merge conflicts/);
  assert.match(text(markup), /Both sides changed this file/);
  assert.match(text(markup), /conflict markers rather than either side/);
  // Stages Git did not report still leave a file presented as conflicted.
  assert.match(text(render(React.createElement(ReviewConflictNotice, {}))), /File has merge conflicts/);
});

test("hidden generated files are counted and can be revealed", () => {
  assert.equal(render(React.createElement(ReviewGeneratedNotice, { hiddenCount: 0, onReveal: () => {} })), "");
  assert.match(text(render(React.createElement(ReviewGeneratedNotice, { hiddenCount: 1, onReveal: () => {} }))), /1 generated file hidden Show them/);
  assert.match(text(render(React.createElement(ReviewGeneratedNotice, { hiddenCount: 4, onReveal: () => {} }))), /4 generated files hidden/);
});

test("each preference is a checkbox that shows what it is currently set to", () => {
  const item = (component, preferences) =>
    render(React.createElement(component, { preferences, onChange: () => {} }));
  const off = { richPreview: false, hideGenerated: false };

  assert.match(item(ReviewGeneratedFilterItem, off), /role="menuitemcheckbox"[^>]*aria-checked="false"/);
  assert.match(item(ReviewGeneratedFilterItem, { ...off, hideGenerated: true }), /aria-checked="true"/);
  assert.match(text(item(ReviewGeneratedFilterItem, off)), /Hide generated files/);

  assert.match(item(ReviewRichPreviewItem, off), /aria-checked="false"/);
  assert.match(item(ReviewRichPreviewItem, { ...off, richPreview: true }), /aria-checked="true"/);
  // The reference's own label, recorded against Review 19, and imperative:
  // it names what the click will do, so it reads inversely to the state.
  assert.match(text(item(ReviewRichPreviewItem, off)), /Enable rich preview/);
  assert.match(text(item(ReviewRichPreviewItem, { ...off, richPreview: true })), /Disable rich preview/);
});

test("the generated filter lives in the changed-files filter menu, and rich preview in the panel's", () => {
  // R5 puts the generated checkbox in the changed-files tree's filter menu.
  // Moving it back to the panel's options menu would pass every other test
  // here, so its placement is asserted rather than assumed.
  const files = source("./ReviewFiles.tsx");
  const panel = source("./ReviewPanel.tsx");
  assert.match(files, /ReviewGeneratedFilterItem/);
  assert.match(files, /label="Filter options"/);
  assert.doesNotMatch(panel, /ReviewGeneratedFilterItem/);
  assert.match(panel, /ReviewRichPreviewItem/);
});
