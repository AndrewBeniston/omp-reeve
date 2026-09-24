import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { AssistantResponseAnnouncer } = await jiti.import("./AssistantResponseAnnouncer.tsx");
const {
  trimToLastCompleteWord,
  derivePlainText,
  resetAnnouncerState,
  getResponseAnnouncerState,
} = await jiti.import("./useAssistantResponseAnnouncer.ts");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

function mountAnnouncer(props) {
  return mount(h(I18nProvider, null, h(AssistantResponseAnnouncer, props)));
}

async function waitTimer(ms = 80) {
  await React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

test.beforeEach(() => {
  resetAnnouncerState();
});

test("A polite live region exists for the assistant response and sets its text directly", async () => {
  const view = await mountAnnouncer({
    responseId: "resp-1",
    isStreaming: true,
    plainText: "Hello world ",
  });

  const region = view.container.querySelector("[role='status']");
  assert.ok(region, "polite live region must exist");
  assert.equal(region.getAttribute("aria-live"), "polite");
  assert.equal(region.getAttribute("aria-atomic"), "true");
  assert.equal(textOf(region), "Response started");

  await view.unmount();
});

test("Each response owns its announcement cursor and timer", async () => {
  const view1 = await mountAnnouncer({
    responseId: "resp-a",
    isStreaming: true,
    plainText: "First response text ",
  });

  const view2 = await mountAnnouncer({
    responseId: "resp-b",
    isStreaming: true,
    plainText: "Second response text ",
  });

  const stateA = getResponseAnnouncerState("resp-a");
  const stateB = getResponseAnnouncerState("resp-b");

  assert.ok(stateA, "state A must exist");
  assert.ok(stateB, "state B must exist");
  assert.notEqual(stateA, stateB, "must be independent state records");
  assert.equal(stateA.cursor, 0);
  assert.equal(stateB.cursor, 0);

  await view1.unmount();
  await view2.unmount();
});

test("The started announcement reads 'Response started', writes once, and records empty cursor", async () => {
  let announceCount = 0;
  const announcements = [];

  const view = await mountAnnouncer({
    responseId: "resp-started",
    isStreaming: true,
    plainText: "Initial stream ",
    onAnnounce(msg) {
      announceCount++;
      announcements.push(msg);
    },
  });

  const region = view.container.querySelector("[role='status']");
  assert.equal(textOf(region), "Response started");
  assert.equal(announceCount, 1);
  assert.deepEqual(announcements, ["Response started"]);

  const state = getResponseAnnouncerState("resp-started");
  assert.equal(state.cursor, 0);
  assert.equal(state.started, true);

  // Re-render with same streaming state: should not re-announce "Response started"
  await view.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "resp-started",
      isStreaming: true,
      plainText: "Initial stream updated ",
      onAnnounce(msg) {
        announceCount++;
        announcements.push(msg);
      },
    }))
  );

  assert.equal(announcements.filter((m) => m === "Response started").length, 1);

  await view.unmount();
});

test("A progress announcement ends on a complete word using the platform word segmenter", () => {
  assert.equal(trimToLastCompleteWord("Hello world ", "en"), "Hello world");
  assert.equal(trimToLastCompleteWord("Hello world this is a test ", "en"), "Hello world this is a test");
  assert.equal(trimToLastCompleteWord("Hello world this is a tes", "en"), "Hello world this is a");
  assert.equal(trimToLastCompleteWord("Hello world.", "en"), "Hello world");
  assert.equal(trimToLastCompleteWord("Hello", "en"), "");
  assert.equal(trimToLastCompleteWord("你好世界正在进行", "zh-CN"), "你好世界正在");
});

test("A deterministic fallback handles a locale that Intl.Segmenter lacks", () => {
  const fallbackResult = trimToLastCompleteWord("Hello world in pro", "unsupported-locale-xyz");
  assert.equal(fallbackResult, "Hello world in");

  const fallbackWithSpace = trimToLastCompleteWord("Hello world ", "unsupported-locale-xyz");
  assert.equal(fallbackWithSpace, "Hello world");

  const fallbackChinese = trimToLastCompleteWord("你好世界正在进行", "unsupported-locale-xyz");
  assert.equal(fallbackChinese, "你好世界正在进");
});

test("The progress announcement runs on interval and carries only text not announced before", async () => {
  const announcements = [];

  const view = await mountAnnouncer({
    responseId: "resp-progress",
    isStreaming: true,
    plainText: "First chunk ",
    intervalMs: 50,
    onAnnounce(msg) {
      announcements.push(msg);
    },
  });

  assert.equal(announcements[0], "Response started");

  // Wait for first interval
  await waitTimer(80);

  assert.ok(announcements.includes("Response: First chunk"), "must announce first complete chunk");

  // Update plain text with next chunk
  await view.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "resp-progress",
      isStreaming: true,
      plainText: "First chunk and then second chunk ",
      intervalMs: 50,
      onAnnounce(msg) {
        announcements.push(msg);
      },
    }))
  );

  // Wait for next interval
  await waitTimer(80);

  assert.ok(
    announcements.includes("Response: and then second chunk"),
    "must carry only the newly received text that was not announced before",
  );

  await view.unmount();
});

test("Streamed token updates do not postpone the progress announcement", async () => {
  const announcements = [];
  const view = await mountAnnouncer({
    responseId: "resp-streaming",
    isStreaming: true,
    plainText: "First ",
    intervalMs: 100,
    onAnnounce(msg) {
      announcements.push(msg);
    },
  });
  const initialTimer = getResponseAnnouncerState("resp-streaming")?.timerId;
  assert.ok(initialTimer);

  await waitTimer(60);
  await view.render(h(I18nProvider, null, h(AssistantResponseAnnouncer, {
    responseId: "resp-streaming",
    isStreaming: true,
    plainText: "First token ",
    intervalMs: 100,
    onAnnounce(msg) {
      announcements.push(msg);
    },
  })));
  assert.equal(getResponseAnnouncerState("resp-streaming")?.timerId, initialTimer);
  await waitTimer(60);

  assert.ok(announcements.some((message) => message.startsWith("Response: ")));
  await view.unmount();
});

test("The completion announcement reads 'Response complete: {content}' when unannounced text remains and 'Response complete' when none remains", async () => {
  // Case A: Unannounced text remains
  const announcementsA = [];
  const viewA = await mountAnnouncer({
    responseId: "resp-complete-a",
    isStreaming: true,
    plainText: "Start of text ",
    intervalMs: 50,
    onAnnounce(msg) {
      announcementsA.push(msg);
    },
  });

  // Wait for progress announcement
  await waitTimer(80);

  // End streaming with additional text
  await viewA.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "resp-complete-a",
      isStreaming: false,
      plainText: "Start of text and final words.",
      intervalMs: 50,
      onAnnounce(msg) {
        announcementsA.push(msg);
      },
    }))
  );

  const regionA = viewA.container.querySelector("[role='status']");
  assert.equal(textOf(regionA), "Response complete: and final words.");
  await viewA.unmount();

  // Case B: No unannounced text remains
  const announcementsB = [];
  const viewB = await mountAnnouncer({
    responseId: "resp-complete-b",
    isStreaming: true,
    plainText: "All text already here ",
    intervalMs: 50,
    onAnnounce(msg) {
      announcementsB.push(msg);
    },
  });

  // Wait for progress interval to announce the content
  await waitTimer(80);

  // End streaming with no new text
  await viewB.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "resp-complete-b",
      isStreaming: false,
      plainText: "All text already here",
      intervalMs: 50,
      onAnnounce(msg) {
        announcementsB.push(msg);
      },
    }))
  );

  const regionB = viewB.container.querySelector("[role='status']");
  assert.equal(textOf(regionB), "Response complete");
  await viewB.unmount();
});

test("An announce-on-mount input makes a response that mounts already complete announce", async () => {
  // Without announceOnMount: mounted complete does not announce
  const announcementsWithout = [];
  const viewWithout = await mountAnnouncer({
    responseId: "resp-mount-without",
    isStreaming: false,
    plainText: "Historical response.",
    announceOnMount: false,
    onAnnounce(msg) {
      announcementsWithout.push(msg);
    },
  });

  assert.equal(announcementsWithout.length, 0);
  await viewWithout.unmount();

  // With announceOnMount: mounted complete announces
  const announcementsWith = [];
  const viewWith = await mountAnnouncer({
    responseId: "resp-mount-with",
    isStreaming: false,
    plainText: "Instant response.",
    announceOnMount: true,
    onAnnounce(msg) {
      announcementsWith.push(msg);
    },
  });

  assert.equal(announcementsWith.length, 1);
  assert.equal(announcementsWith[0], "Response complete: Instant response.");
  const region = viewWith.container.querySelector("[role='status']");
  assert.equal(textOf(region), "Response complete: Instant response.");
  await viewWith.unmount();
});

test("Completion, unmount, Session change, and superseding response each cancel the timer", async () => {
  // 1. Completion cancels timer
  const view1 = await mountAnnouncer({
    responseId: "timer-comp",
    isStreaming: true,
    plainText: "Test text ",
  });
  const state1 = getResponseAnnouncerState("timer-comp");
  assert.ok(state1.timerId !== null, "timer must be active while streaming");

  await view1.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "timer-comp",
      isStreaming: false,
      plainText: "Test text",
    }))
  );
  assert.equal(state1.timerId, null, "completion must cancel timer");
  await view1.unmount();

  // 2. Unmount cancels timer
  const view2 = await mountAnnouncer({
    responseId: "timer-unmount",
    isStreaming: true,
    plainText: "Test text ",
  });
  const state2 = getResponseAnnouncerState("timer-unmount");
  assert.ok(state2.timerId !== null);
  await view2.unmount();
  assert.equal(state2.timerId, null, "unmount must cancel timer");

  // 3. Session change cancels timer
  const view3 = await mountAnnouncer({
    responseId: "timer-session",
    sessionId: "session-1",
    isStreaming: true,
    plainText: "Test text ",
  });
  const state3 = getResponseAnnouncerState("timer-session");
  assert.ok(state3.timerId !== null);

  await view3.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "timer-session",
      sessionId: "session-2",
      isStreaming: false,
      plainText: "Test text",
    }))
  );
  assert.equal(state3.timerId, null, "session change must cancel timer");
  await view3.unmount();

  // 4. Superseding response cancels timer
  const view4 = await mountAnnouncer({
    responseId: "timer-super",
    isStreaming: true,
    plainText: "Test text ",
  });
  const state4 = getResponseAnnouncerState("timer-super");
  assert.ok(state4.timerId !== null);

  await view4.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "timer-super",
      isStreaming: true,
      superseded: true,
      plainText: "Test text",
    }))
  );
  assert.equal(state4.timerId, null, "superseded response must cancel timer");
  await view4.unmount();
});

test("Reconnect reconciles a missed completion without repeating announced text", async () => {
  const announcements = [];
  const view = await mountAnnouncer({
    responseId: "resp-reconnect",
    sessionId: "sess-rec",
    isStreaming: true,
    plainText: "Part one announced ",
    intervalMs: 50,
    onAnnounce(msg) {
      announcements.push(msg);
    },
  });

  // Wait for progress announcement
  await waitTimer(80);
  assert.ok(announcements.includes("Response: Part one announced"));

  // Simulate disconnect and reconnect: response completed while away with more text
  await view.render(
    h(I18nProvider, null, h(AssistantResponseAnnouncer, {
      responseId: "resp-reconnect",
      sessionId: "sess-rec",
      isStreaming: false,
      plainText: "Part one announced and part two finished.",
      intervalMs: 50,
      onAnnounce(msg) {
        announcements.push(msg);
      },
    }))
  );

  // Must announce only the remaining portion
  assert.ok(
    announcements.includes("Response complete: and part two finished."),
    "must announce only unannounced text on reconnect",
  );
  assert.ok(
    !announcements.includes("Response complete: Part one announced and part two finished."),
    "must not repeat announced text",
  );

  await view.unmount();
});

test("Concurrent responses cannot overwrite each other's live text", async () => {
  const view = await mount(
    h(
      I18nProvider,
      null,
      h("div", null, [
        h(AssistantResponseAnnouncer, {
          key: "c1",
          responseId: "concurrent-1",
          isStreaming: false,
          announceOnMount: true,
          plainText: "First response",
        }),
        h(AssistantResponseAnnouncer, {
          key: "c2",
          responseId: "concurrent-2",
          isStreaming: false,
          announceOnMount: true,
          plainText: "Second response",
        }),
      ])
    )
  );

  const region1 = view.container.querySelector("[data-response-id='concurrent-1']");
  const region2 = view.container.querySelector("[data-response-id='concurrent-2']");

  assert.ok(region1);
  assert.ok(region2);
  assert.equal(textOf(region1), "Response complete: First response");
  assert.equal(textOf(region2), "Response complete: Second response");

  await view.unmount();
});

test("derivePlainText extracts text from content blocks", () => {
  const blocks = [
    { type: "text", text: "Paragraph 1" },
    { type: "thinking", thinking: "Internal reasoning" },
    { type: "toolCall", toolCallId: "tc1", toolName: "bash", input: {} },
    { type: "text", text: "Paragraph 2" },
  ];
  assert.equal(derivePlainText(blocks), "Paragraph 1\nParagraph 2");
  assert.equal(derivePlainText("Raw string"), "Raw string");
  assert.equal(derivePlainText(undefined), "");
});
