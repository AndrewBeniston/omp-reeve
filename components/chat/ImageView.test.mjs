import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createJiti } from "jiti";
import { click, DomEvent, domDocument, focused, mount, press } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ImageView } = await jiti.import("./ImageView.tsx");
const { ToolActivity } = await jiti.import("./ToolActivity.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const image = (data) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });
const view = (images) => mount(React.createElement(I18nProvider, null, React.createElement(ImageView, { images })));

test("the image view counts images and renders its strip only when expanded", async () => {
  const single = await view([image("one")]);
  try {
    assert.match(single.container.textContent, /Viewed an image/);
    assert.equal(single.container.querySelector("[data-image-view-strip]"), null);
    await click(single.container.querySelector("button"));
    assert.equal(single.container.querySelector("img")?.getAttribute("alt"), "Inspected image");
    assert.equal(single.container.querySelector("[data-image-view-strip]")?.querySelectorAll("img").length, 1);
  } finally { await single.unmount(); }

  const many = await view([image("one"), image("two"), image("three")]);
  try { assert.match(many.container.textContent, /Viewed 3 images/); } finally { await many.unmount(); }
});

test("the image tool row uses the counted disclosure only for image results", async () => {
  const result = { role: "toolResult", toolCallId: "call-1", content: [image("one")] };
  const viewInstance = await mount(React.createElement(I18nProvider, null,
    React.createElement(ToolActivity, { block: { type: "toolCall", toolCallId: "call-1", toolName: "inspect_image", input: {} }, result })));
  try {
    assert.match(viewInstance.container.textContent, /Viewed an image/);
    assert.equal(viewInstance.container.querySelector("[data-image-view-strip]"), null);
  } finally { await viewInstance.unmount(); }
});

test("the dialog closes with Escape, traps focus, and returns focus to the image", async () => {
  const viewInstance = await view([image("one")]);
  try {
    await click(viewInstance.container.querySelector("button"));
    const opener = viewInstance.container.querySelector("img")?.parentElement;
    await click(opener);
    const dialog = domDocument.body.querySelector("[role='dialog']");
    assert.ok(dialog);
    assert.equal(focused()?.getAttribute("aria-label"), "Close image preview");
    await press(dialog, "Tab");
    assert.ok(dialog.contains(focused()));
    await press(dialog, "Escape");
    assert.equal(domDocument.body.querySelector("[role='dialog']"), null);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    assert.equal(focused(), opener);
  } finally { await viewInstance.unmount(); }
});

test("a failed image has a named unavailable state", async () => {
  const viewInstance = await view([image("one")]);
  try {
    await click(viewInstance.container.querySelector("button"));
    await React.act(async () => { viewInstance.container.querySelector("img").dispatchEvent(new DomEvent("error")); });
    assert.equal(viewInstance.container.querySelector("[role='img']")?.getAttribute("aria-label"), "Image unavailable");
  } finally { await viewInstance.unmount(); }
});
