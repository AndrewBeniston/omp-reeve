import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { TurnErrorBoundary } = await jiti.import("./TurnErrorBoundary.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

let shouldFail = true;

function TurnContent() {
  if (shouldFail) throw new Error("render failed");
  return h("p", null, "Turn rendered");
}

test("one failed Turn does not stop the other Turns and retry re-renders it", async () => {
  const view = await mount(
    h(
      I18nProvider,
      null,
      h(TurnErrorBoundary, { title: "This turn couldn't render", retryLabel: "Try again" },
        h(TurnContent),
      ),
      h("p", null, "Other Turn rendered"),
    ),
  );

  assert.match(textOf(view.container), /This turn couldn't render/);
  assert.match(textOf(view.container), /Try again/);
  assert.match(textOf(view.container), /Other Turn rendered/);

  shouldFail = false;
  const retry = Array.from(view.container.querySelectorAll("button"))
    .find((button) => textOf(button) === "Try again");
  assert.ok(retry);
  await click(retry);

  assert.match(textOf(view.container), /Turn rendered/);
  assert.doesNotMatch(textOf(view.container), /This turn couldn't render/);
  await view.unmount();
  shouldFail = true;
});

test("each Turn is mounted in the transcript render path and the component has no UI literals", async () => {
  const [boundary, chatWindow, messages, css] = await Promise.all([
    readFile(new URL("./TurnErrorBoundary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("./turn-error-boundary.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(chatWindow, /const turnRenderStart = row\.kind === "turn"/);
  assert.match(chatWindow, /<TurnErrorBoundary[\s\S]*turnContent[\s\S]*<\/TurnErrorBoundary>/);
  assert.match(boundary, /this\.props\.title/);
  assert.match(boundary, /this\.props\.retryLabel/);
  assert.doesNotMatch(boundary, /This turn|Try again/);
  assert.match(messages, /"transcript\.turnRenderError\.title": "This turn couldn't render"/);
  assert.match(messages, /"transcript\.turnRenderError\.retry": "Try again"/);
  assert.match(css, /font-family:\s*var\(--font-sans\)/);
});
