import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { createTranscriptFollowState, reduceTranscriptFollow } = await jiti.import("./transcript-follow.ts");

function metrics(distance = 0, clientHeight = 600) {
  return { scrollTop: 4000 - clientHeight - distance, scrollHeight: 4000, clientHeight };
}

function observe(state, phase, options = {}) {
  return reduceTranscriptFollow(state, {
    turn: { phase },
    metrics: options.metrics ?? metrics(),
    preworkContentHeight: options.preworkContentHeight ?? 0,
    spacerHeight: options.spacerHeight ?? 0,
    working: options.working ?? false,
    now: options.now ?? 0,
    event: options.event ?? "phase",
    userIntent: options.userIntent,
  });
}

test("the follow mode changes with the Turn phase", () => {
  let state = createTranscriptFollowState(metrics(0));
  assert.equal(state.mode, "user_follow");

  state = observe(state, "prework").state;
  assert.equal(state.mode, "prework_follow");

  state = observe(state, "final-answer").state;
  assert.equal(state.mode, "user_follow");

  state = observe(state, "idle").state;
  assert.equal(state.mode, "user_follow");

  state = createTranscriptFollowState(metrics(120));
  assert.equal(state.mode, "static");
  state = observe(state, "prework", { metrics: metrics(120) }).state;
  assert.equal(state.mode, "prework_watch");
  state = observe(state, "final-answer", { metrics: metrics(120) }).state;
  assert.equal(state.mode, "static");

  state = observe(state, "prework", { metrics: metrics(120) }).state;
  state = observe(state, "idle", { metrics: metrics(120) }).state;
  assert.equal(state.mode, "static");
});

test("prework watch follows once prework content crosses the viewport height", () => {
  let state = createTranscriptFollowState(metrics(120));
  state = observe(state, "prework", {
    metrics: metrics(120),
    preworkContentHeight: 599,
  }).state;
  assert.equal(state.mode, "prework_watch");

  state = observe(state, "prework", {
    event: "content",
    metrics: metrics(120),
    preworkContentHeight: 600,
  }).state;
  assert.equal(state.mode, "prework_watch");

  state = observe(state, "prework", {
    event: "content",
    metrics: metrics(120),
    preworkContentHeight: 601,
  }).state;
  assert.equal(state.mode, "prework_follow");
});

test("a recent user scroll detaches follow and an expired direction does not", () => {
  let state = createTranscriptFollowState(metrics());
  state = observe(state, "prework", { preworkContentHeight: 650 }).state;
  assert.equal(state.mode, "prework_follow");

  state = observe(state, "prework", {
    event: "scroll", metrics: metrics(10), preworkContentHeight: 650,
    now: 2001, userIntent: { direction: "away", at: 1000 },
  }).state;
  assert.equal(state.mode, "prework_follow", "the direction expires after 1,000 ms");

  state = observe(state, "prework", {
    event: "scroll", metrics: metrics(20), preworkContentHeight: 650,
    now: 2002, userIntent: { direction: "away", at: 1002 },
  }).state;
  assert.equal(state.mode, "prework_watch", "an intent at the 1,000 ms boundary remains valid");

  state = observe(state, "prework", {
    event: "content", metrics: metrics(20), preworkContentHeight: 700,
  }).state;
  assert.equal(state.mode, "prework_watch", "later content must not resume follow after a user scroll");

  state = observe(state, "final-answer", { metrics: metrics(20) }).state;
  assert.equal(state.mode, "static");
});

test("a user scroll away from the final answer stops user follow", () => {
  let state = createTranscriptFollowState(metrics());
  state = observe(state, "final-answer").state;
  state = observe(state, "final-answer", {
    event: "scroll", metrics: metrics(8),
    now: 10, userIntent: { direction: "away", at: 10 },
  }).state;
  assert.equal(state.mode, "static");
});

test("the scroll-to-bottom button follows the current Turn phase", () => {
  let state = createTranscriptFollowState(metrics(120));
  state = observe(state, "prework", { metrics: metrics(120) }).state;
  assert.equal(state.mode, "prework_watch");
  state = observe(state, "prework", { event: "button", metrics: metrics(120) }).state;
  assert.equal(state.mode, "prework_follow");

  state = observe(state, "final-answer", { metrics: metrics(120) }).state;
  assert.equal(state.mode, "user_follow");
  state = observe(state, "final-answer", {
    event: "scroll", metrics: metrics(140),
    now: 40, userIntent: { direction: "away", at: 40 },
  }).state;
  assert.equal(state.mode, "static");
  state = observe(state, "final-answer", { event: "button", metrics: metrics(140) }).state;
  assert.equal(state.mode, "user_follow");
  state = observe(state, "idle", { metrics: metrics(140) }).state;
  assert.equal(state.mode, "user_follow");

  state = createTranscriptFollowState(metrics(140));
  state = observe(state, "idle", { event: "button", metrics: metrics(140) }).state;
  assert.equal(state.mode, "user_follow");
});

test("content changes request an instant end move only in a follow mode", () => {
  let state = createTranscriptFollowState(metrics());
  state = observe(state, "prework").state;
  let result = observe(state, "prework", { event: "content", preworkContentHeight: 200 });
  assert.equal(result.scrollToEndInstantly, true);

  state = observe(result.state, "final-answer").state;
  result = observe(state, "final-answer", { event: "content" });
  assert.equal(result.scrollToEndInstantly, true);

  state = observe(result.state, "final-answer", {
    event: "scroll", metrics: metrics(10),
    now: 50, userIntent: { direction: "away", at: 50 },
  }).state;
  result = observe(state, "final-answer", { event: "content", metrics: metrics(50) });
  assert.equal(result.scrollToEndInstantly, false);

  state = createTranscriptFollowState(metrics(120));
  state = observe(state, "prework", { metrics: metrics(120) }).state;
  result = observe(state, "prework", {
    event: "content", metrics: metrics(120), preworkContentHeight: 200,
  });
  assert.equal(result.scrollToEndInstantly, false);
});

test("the button uses a 24 px band beyond the response spacer", () => {
  let state = createTranscriptFollowState(metrics(120));
  let result = observe(state, "idle", { metrics: metrics(24), working: true });
  assert.deepEqual(result.button, { visible: false, workingDots: false });

  state = result.state;
  result = observe(state, "idle", { metrics: metrics(25), working: true });
  assert.deepEqual(result.button, { visible: true, workingDots: true });

  state = result.state;
  result = observe(state, "prework", {
    metrics: metrics(124), spacerHeight: 100, working: true,
  });
  assert.deepEqual(result.button, { visible: false, workingDots: false });

  state = result.state;
  result = observe(state, "prework", {
    metrics: metrics(125), spacerHeight: 100, working: false,
  });
  assert.deepEqual(result.button, { visible: true, workingDots: false });
});

test("a deliberate return to the end restores follow", () => {
  let state = createTranscriptFollowState(metrics());
  state = observe(state, "prework").state;
  state = observe(state, "prework", {
    event: "scroll", metrics: metrics(16),
    now: 10, userIntent: { direction: "away", at: 10 },
  }).state;
  assert.equal(state.mode, "prework_watch");

  state = observe(state, "prework", {
    event: "scroll", metrics: metrics(0),
    now: 20, userIntent: { direction: "toward", at: 20 },
  }).state;
  assert.equal(state.mode, "prework_follow");

  state = observe(state, "final-answer").state;
  state = observe(state, "final-answer", {
    event: "scroll", metrics: metrics(32),
    now: 30, userIntent: { direction: "away", at: 30 },
  }).state;
  assert.equal(state.mode, "static");
  state = observe(state, "final-answer", {
    event: "scroll", metrics: metrics(24),
    now: 40, userIntent: { direction: "toward", at: 40 },
  }).state;
  assert.equal(state.mode, "user_follow");
});
