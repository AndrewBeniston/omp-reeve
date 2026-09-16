import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ApprovalNudge } = await jiti.import("./ApprovalNudge.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

async function renderNudge(props = {}) {
  return mount(h(I18nProvider, null, h(ApprovalNudge, { onAccept() {}, onDismiss() {}, ...props })));
}

function button(view, label) {
  return Array.from(view.container.querySelectorAll("button")).find((element) => textOf(element) === label);
}

test("the offer says what accepting costs, and offers both answers", async () => {
  const view = await renderNudge();
  const text = textOf(view.container);
  assert.match(text, /fewer approval prompts/i);
  // The consequence is stated where the decision is made.
  assert.match(text, /without asking you again/i);
  // And it describes what OMP does rather than promising a reviewer.
  assert.match(text, /potentially unsafe/i);
  assert.ok(button(view, "Approve for me"));
  assert.ok(button(view, "Keep approving by hand"));
  await view.unmount();
});

test("the offer takes no focus, so Enter answers the approval instead", async () => {
  const view = await renderNudge();
  await settle();
  // The offer lives inside the approval dialog. Stealing focus would make a
  // keyboard default widen permissions rather than answer the tool call.
  const active = view.container.ownerDocument.activeElement;
  assert.equal(view.container.contains(active), false);
  await view.unmount();
});

test("each answer is reported once, and neither is reported while one is saving", async () => {
  const answers = [];
  const view = await renderNudge({ onAccept: () => answers.push("accept"), onDismiss: () => answers.push("dismiss") });
  await click(button(view, "Keep approving by hand"));
  await click(button(view, "Approve for me"));
  assert.deepEqual(answers, ["dismiss", "accept"]);
  await view.unmount();

  const busy = await renderNudge({ busy: true, onAccept: () => answers.push("accept") });
  assert.ok(button(busy, "Approve for me").hasAttribute("disabled"));
  await busy.unmount();
});

test("a failed save is announced rather than swallowed", async () => {
  const view = await renderNudge({ error: "Approval mode could not be saved" });
  assert.match(textOf(view.container.querySelector("[role='alert']")), /could not be saved/);
  await view.unmount();
});
