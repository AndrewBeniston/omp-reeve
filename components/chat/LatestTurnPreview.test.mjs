import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { React, click, domDocument, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { LatestTurnPreview, latestTurnPreview } = await jiti.import("./LatestTurnPreview.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content: [{ type: "text", text: content }] });

test("summarizes the latest Turn participant, state, and bounded text", () => {
  const turn = {
    kind: "turn",
    id: "latest",
    phase: "final-answer",
    settled: false,
    items: [
      { message: user("Please update the report."), index: 0, streaming: false },
      { message: assistant("A".repeat(240)), index: 1, streaming: true },
    ],
  };

  assert.deepEqual(latestTurnPreview(turn), {
    participant: "assistant",
    text: `${"A".repeat(140)}...`,
    working: true,
  });
});

test("shows the preview only while the latest Turn is away and returns to it", async () => {
  const calls = [];
  const turn = {
    kind: "turn",
    id: "latest",
    phase: "final-answer",
    settled: true,
    items: [
      { message: user("Question"), index: 0, streaming: false },
      { message: assistant("Answer"), index: 1, streaming: false },
    ],
  };
  const view = await mount(h(I18nProvider, null, h(LatestTurnPreview, {
    turn, visible: true, onSelect: () => calls.push("latest"),
  })));

  assert.match(textOf(view.container), /Assistant/);
  assert.match(textOf(view.container), /Answer/);
  assert.match(textOf(view.container), /Completed/);
  const button = view.container.querySelector("button");
  assert.equal(button.getAttribute("aria-label"), "Latest turn");
  await click(button);
  assert.deepEqual(calls, ["latest"]);
  assert.notEqual(domDocument.activeElement, button);

  await view.render(h(I18nProvider, null, h(LatestTurnPreview, {
    turn, visible: false, onSelect() {},
  })));
  assert.equal(view.container.querySelector("button"), null);
  await view.unmount();
});

test("announces one stable working status instead of streaming preview text", async () => {
  const turn = {
    kind: "turn", id: "latest", phase: "prework", settled: false,
    items: [{ message: assistant("First partial answer"), index: 0, streaming: true }],
  };
  const view = await mount(h(I18nProvider, null, h(LatestTurnPreview, { turn, visible: true, onSelect() {} })));
  const status = view.container.querySelector("[role='status']");
  assert.equal(status.textContent, "Latest turn. Working");
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(view.container.querySelector("button").textContent.includes("First partial answer"), true);
  await view.unmount();
});
