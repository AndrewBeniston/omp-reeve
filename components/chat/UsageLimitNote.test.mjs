import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf, click } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { UsageLimitNote } = await jiti.import("./UsageLimitNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

function failedMessage(errorMessage) {
  return { role: "assistant", content: [], model: "test", provider: "test", stopReason: "error", errorMessage };
}

async function renderNote(props) {
  return mount(h(I18nProvider, null, h(UsageLimitNote, props)));
}

test("shows a retry action for an OMP-classified usage limit with a known deadline", async () => {
  const view = await renderNote({ message: failedMessage("Usage limit reached retry-after-ms=2000"), onRetry: () => {} });
  const note = view.container.querySelector('[data-transcript-note="usage-limit"]');

  assert.ok(note);
  assert.equal(note.getAttribute("role"), "alert");
  assert.match(textOf(note), /You've hit your usage limit\. Try again at .+Retry in [12]s/);
  assert.ok(note.querySelector("time")?.getAttribute("dateTime"));
  await view.unmount();
});

test("updates the countdown each second, stops at zero, and retries automatically once", async () => {
  const retries = [];
  const view = await renderNote({ message: failedMessage("Usage limit reached retry-after-ms=1000"), onRetry: (automatic) => retries.push(automatic) });
  const button = view.container.querySelector("button");

  assert.equal(textOf(button), "Retry in 1s");
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
  assert.deepEqual(retries, [true]);
  assert.equal(textOf(button), "Retry in 0s");
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
  assert.deepEqual(retries, [true]);
  await view.unmount();
});

test("manual retry cancels the pending automatic retry", async () => {
  const retries = [];
  const view = await renderNote({ message: failedMessage("Usage limit reached retry-after-ms=1000"), onRetry: (automatic) => retries.push(automatic) });

  await click(view.container.querySelector("button"));
  assert.deepEqual(retries, [false]);
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
  assert.deepEqual(retries, [false]);
  await view.unmount();
});

test("shows a plain retry when OMP supplies no timing", async () => {
  const retries = [];
  const view = await renderNote({ message: failedMessage("Usage limit reached"), onRetry: (automatic) => retries.push(automatic) });
  const note = view.container.querySelector('[data-transcript-note="usage-limit"]');

  assert.equal(textOf(note), "You've hit your usage limit. Try again later.Retry");
  assert.equal(note.querySelector("time"), null);
  await click(note.querySelector("button"));
  assert.deepEqual(retries, [false]);
  await view.unmount();
});

test("leaves unclassified provider errors to the ordinary error treatment", async () => {
  const view = await renderNote({ message: failedMessage("The provider connection failed"), onRetry: () => {} });

  assert.equal(view.container.querySelector('[data-transcript-note="usage-limit"]'), null);
  await view.unmount();
});

test("does not claim upgrade or credit actions without OMP action data", () => {
  const source = readFileSync(new URL("./UsageLimitNote.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /upgrade|addCredits|workspaceMember|workspaceOwner/i);
});

test("uses the existing font variable and a draining progress fill", () => {
  const css = readFileSync(new URL("./usage-limit-note.module.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("./UsageLimitNote.tsx", import.meta.url), "utf8");
  assert.match(css, /font-family:\s*var\(--font-sans\)/);
  assert.match(source, /transform:\s*`scaleX\(\$\{progress\}\)`/);
});

test("stores all usage-limit strings in both locales and re-exports the note", async () => {
  for (const key of [
    "transcript.usageLimit.retry",
    "transcript.usageLimit.retryWithDeadline",
    "transcript.usageLimit.retryCountdown",
    "transcript.usageLimit.retryAction",
  ]) {
    assert.ok(enLocale.messages[key]);
    assert.ok(zhCNLocale.messages[key]);
  }
  const { UsageLimitNote: ReExported } = await jiti.import("./transcript-rows.ts");
  assert.equal(ReExported, UsageLimitNote);
});
