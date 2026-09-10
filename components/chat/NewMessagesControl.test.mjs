import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { React, click, domDocument, mount, tabbable, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { NewMessagesControl } = await jiti.import("./NewMessagesControl.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

function mountControl(props) {
  return mount(h(I18nProvider, null, h(NewMessagesControl, { onGoToNewest() {}, ...props })));
}

test("stays away while the transcript follows the newest content", async () => {
  const view = await mountControl({ pinned: true, streaming: true });

  assert.equal(view.container.querySelector("button"), null);
  assert.equal(view.container.querySelector("[role='status']"), null);

  await view.unmount();
});

test("shows an arrow while a detached transcript is idle", async () => {
  const view = await mountControl({ pinned: false, streaming: false });

  assert.ok(view.container.querySelector("button").querySelector("svg"));

  await view.unmount();
});

test("appears when the stream continues and the transcript is detached", async () => {
  const view = await mountControl({ pinned: false, streaming: true });
  const region = view.container.querySelector("[role='status']");
  const button = view.container.querySelector("button");

  assert.ok(region, "the control sits in a live region");
  assert.equal(region.getAttribute("aria-live"), "polite");
  assert.ok(region.contains(button));
  // The name states the event and the action, so a screen reader is clear.
  assert.equal(button.getAttribute("aria-label"), "Scroll to bottom");
  assert.equal(textOf(button), "");

  await view.unmount();
});

test("reaches the control with the keyboard and runs the action", async () => {
  const calls = [];
  const view = await mountControl({
    pinned: false,
    streaming: true,
    onGoToNewest: () => calls.push("go"),
  });
  const button = view.container.querySelector("button");

  assert.deepEqual(tabbable(view.container), [button], "the control is the one tab stop");
  button.focus();
  assert.equal(domDocument.activeElement, button);

  // React maps Enter and Space on a button to a click.
  await click(button);
  assert.deepEqual(calls, ["go"]);

  await view.unmount();
});

test("leaves once the reader returns to the newest content", async () => {
  const view = await mountControl({ pinned: false, streaming: true });
  assert.ok(view.container.querySelector("button"));

  await view.render(h(I18nProvider, null, h(NewMessagesControl, {
    pinned: true,
    streaming: true,
    onGoToNewest() {},
  })));

  assert.equal(view.container.querySelector("button"), null);

  await view.unmount();
});

test("carries no decorative graphic into the accessible name", async () => {
  const view = await mountControl({ pinned: false, streaming: true });
  const graphic = view.container.querySelector("button").querySelector("span");

  assert.equal(graphic.getAttribute("aria-hidden"), "true");

  await view.unmount();
});
