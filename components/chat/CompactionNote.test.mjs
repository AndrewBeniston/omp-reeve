import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { CompactionNote } = await jiti.import("./CompactionNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

test("renders running manual compaction inside shimmer with 'Compacting context'", async () => {
  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: false,
    source: "manual",
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');

  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "false");
  assert.equal(note?.getAttribute("data-source"), "manual");
  assert.ok(shimmer);
  assert.equal(textOf(shimmer), "Compacting context");
  await view.unmount();
});

test("renders finished manual compaction plain with 'Context compacted'", async () => {
  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: true,
    source: "manual",
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');

  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "true");
  assert.equal(note?.getAttribute("data-source"), "manual");
  assert.equal(shimmer, null);
  assert.match(textOf(note), /Context compacted/);
  await view.unmount();
});

test("renders running automatic compaction inside shimmer with 'Context automatically compacting'", async () => {
  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: false,
    source: "automatic",
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');

  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "false");
  assert.equal(note?.getAttribute("data-source"), "automatic");
  assert.ok(shimmer);
  assert.equal(textOf(shimmer), "Context automatically compacting");
  await view.unmount();
});

test("renders finished automatic compaction plain with 'Context automatically compacted'", async () => {
  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: true,
    source: "automatic",
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');

  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "true");
  assert.equal(note?.getAttribute("data-source"), "automatic");
  assert.equal(shimmer, null);
  assert.match(textOf(note), /Context automatically compacted/);
  await view.unmount();
});

test("shows error on note when compaction ends with error", async () => {
  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: true,
    source: "automatic",
    error: "Compaction failed due to timeout",
  })));
  const errorEl = view.container.querySelector('[role="alert"]');

  assert.ok(errorEl);
  assert.match(textOf(errorEl), /Compaction failed due to timeout/);
  await view.unmount();
});

test("renders summary body and file disclosure under the label row", async () => {
  const summary = [
    "Summary of earlier conversation",
    "",
    "<read-files>",
    "lib/a.ts",
    "</read-files>",
    "<modified-files>",
    "lib/b.ts",
    "</modified-files>",
  ].join("\n");

  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: true,
    source: "automatic",
    summary,
  })));

  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  assert.ok(note);
  assert.match(textOf(note), /Context automatically compacted/);
  assert.match(textOf(note), /Summary of earlier conversation/);
  const details = note?.querySelector("details");
  assert.ok(details);
  assert.match(textOf(details), /1 read, 1 modified/);
  await view.unmount();
});

test("survives a reload folding from the compaction entry in MessageView", async () => {
  const { MessageView } = await jiti.import("../MessageView.tsx");
  const compactionMessage = {
    role: "custom",
    customType: "compaction",
    content: "Saved summary from session file",
    display: true,
    timestamp: 1727000000000,
    details: {
      tokensBefore: 4000,
      firstKeptEntryId: "entry-1",
      source: "automatic",
    },
  };

  const view = await mount(h(I18nProvider, null, h(MessageView, {
    message: compactionMessage,
    isStreaming: false,
    toolResults: {},
  })));

  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  assert.ok(note);
  assert.match(textOf(note), /Context automatically compacted/);
  assert.match(textOf(note), /Saved summary from session file/);
  await view.unmount();
});

test("stores the compaction note strings in the transcript namespace", () => {
  assert.equal(enLocale.messages["transcript.contextManuallyCompacting"], "Compacting context");
  assert.equal(enLocale.messages["transcript.contextManuallyCompacted"], "Context compacted");
  assert.equal(enLocale.messages["transcript.contextAutomaticallyCompacting"], "Context automatically compacting");
  assert.equal(enLocale.messages["transcript.contextAutomaticallyCompacted"], "Context automatically compacted");

  assert.ok(zhCNLocale.messages["transcript.contextManuallyCompacting"]);
  assert.ok(zhCNLocale.messages["transcript.contextManuallyCompacted"]);
  assert.ok(zhCNLocale.messages["transcript.contextAutomaticallyCompacting"]);
  assert.ok(zhCNLocale.messages["transcript.contextAutomaticallyCompacted"]);
});

test("re-exports CompactionNote from transcript-rows", async () => {
  const { CompactionNote: ReExported } = await jiti.import("./transcript-rows.ts");
  assert.equal(ReExported, CompactionNote);
});

test("defines shimmer keyframes and reduced motion in CSS module", () => {
  const css = readFileSync(new URL("./compaction-note.module.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes chatPhaseShimmer/);
  assert.match(css, /prefers-reduced-motion/);
});

test("renders running manual compaction row from buildTranscriptRows", async () => {
  const { buildTranscriptRows } = await jiti.import("./transcript-rows.ts");
  const rows = buildTranscriptRows([{ role: "user", content: "hi" }], ["u1"], null, false, [], {
    isCompacting: true,
    source: "manual",
  });
  const row = rows.find((r) => r.kind === "compaction");
  assert.ok(row);

  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: row.completed,
    source: row.source,
    error: row.error,
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');
  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "false");
  assert.equal(note?.getAttribute("data-source"), "manual");
  assert.ok(shimmer);
  assert.equal(textOf(shimmer), "Compacting context");
  await view.unmount();
});

test("renders running automatic compaction row from buildTranscriptRows", async () => {
  const { buildTranscriptRows } = await jiti.import("./transcript-rows.ts");
  const rows = buildTranscriptRows([{ role: "user", content: "hi" }], ["u1"], null, false, [], {
    isCompacting: true,
    source: "automatic",
  });
  const row = rows.find((r) => r.kind === "compaction");
  assert.ok(row);

  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: row.completed,
    source: row.source,
    error: row.error,
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const shimmer = note?.querySelector('[data-shimmer="true"]');
  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "false");
  assert.equal(note?.getAttribute("data-source"), "automatic");
  assert.ok(shimmer);
  assert.equal(textOf(shimmer), "Context automatically compacting");
  await view.unmount();
});

test("renders error compaction row from buildTranscriptRows on compaction_end error", async () => {
  const { buildTranscriptRows } = await jiti.import("./transcript-rows.ts");
  const rows = buildTranscriptRows([{ role: "user", content: "hi" }], ["u1"], null, false, [], {
    isCompacting: false,
    source: "automatic",
    error: "Compaction aborted due to timeout",
  });
  const row = rows.find((r) => r.kind === "compaction");
  assert.ok(row);

  const view = await mount(h(I18nProvider, null, h(CompactionNote, {
    completed: row.completed,
    source: row.source,
    error: row.error,
  })));
  const note = view.container.querySelector('[data-transcript-note="compaction"]');
  const errorEl = view.container.querySelector('[role="alert"]');
  assert.ok(note);
  assert.equal(note?.getAttribute("data-completed"), "true");
  assert.ok(errorEl);
  assert.match(textOf(errorEl), /Compaction aborted due to timeout/);
  await view.unmount();
});
