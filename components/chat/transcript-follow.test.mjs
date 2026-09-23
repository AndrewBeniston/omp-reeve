import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const {
  AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
  createTranscriptFollowState,
  distanceFromBottom,
  reduceTranscriptFollow,
} = await jiti.import("../../lib/transcript-follow.ts");
const {
  normalizeWheelIntent,
  normalizeTouchIntent,
  normalizeKeyIntent,
  captureScrollbarPointer,
  normalizeScrollbarPointerDownIntent,
  normalizeScrollbarDragIntent,
  selectScrollIntent,
} = await jiti.import("./transcript-follow-input.ts");
const {
  ACTIVE_TURN_BOTTOM_DISTANCE_PX,
  ACTIVE_TURN_SPACER_DURATION_MS,
  consumeActiveTurnSpacerHeight,
  getActiveTurnResponseSpacerHeight,
  resolveScrollBehavior,
  shouldMoveFollowTail,
} = await jiti.import("./transcript-follow.ts");

test("the active turn spacer uses the measured Codex response area", () => {
  assert.equal(ACTIVE_TURN_BOTTOM_DISTANCE_PX, 1);
  assert.equal(ACTIVE_TURN_SPACER_DURATION_MS, 500);
  assert.equal(getActiveTurnResponseSpacerHeight(1400), 1400 * (2 / 3));
  assert.equal(getActiveTurnResponseSpacerHeight(600), 360);
  assert.equal(getActiveTurnResponseSpacerHeight(240), 0);
  assert.equal(getActiveTurnResponseSpacerHeight(180), 0);
});

test("the active turn spacer survives streamed growth and shrinks only after user scrolling", () => {
  const target = getActiveTurnResponseSpacerHeight(600);
  assert.equal(target, 360);
  assert.equal(consumeActiveTurnSpacerHeight({
    currentHeight: target,
    targetHeight: target,
    placementScrollTop: 1200,
    currentScrollTop: 1200,
  }), 360, "streamed content alone preserves the reserved response area");
  assert.equal(consumeActiveTurnSpacerHeight({
    currentHeight: target,
    targetHeight: target,
    placementScrollTop: 1200,
    currentScrollTop: 1080,
  }), 240, "scrolling away consumes the reserved response area");
  assert.equal(consumeActiveTurnSpacerHeight({
    currentHeight: 240,
    targetHeight: target,
    placementScrollTop: 1200,
    currentScrollTop: 1150,
  }), 240, "scrolling toward the bottom cannot recreate consumed space");
  assert.equal(consumeActiveTurnSpacerHeight({
    currentHeight: 240,
    targetHeight: target,
    placementScrollTop: 1200,
    currentScrollTop: 800,
  }), 0, "the response meets the Composer after the user consumes the spacer");
});

test("the held active turn does not follow every streaming update", () => {
  assert.equal(shouldMoveFollowTail(true, true), false);
  assert.equal(shouldMoveFollowTail(true, false), true);
  assert.equal(shouldMoveFollowTail(false, false), false);
});

test("scrolling away past the reserved space removes the spacer", () => {
  assert.equal(consumeActiveTurnSpacerHeight({
    currentHeight: 360,
    targetHeight: 360,
    placementScrollTop: 1200,
    currentScrollTop: 840,
  }), 0, "the spacer must disappear after the reader scrolls above it");
});

function metrics(fromBottom, { clientHeight = 600, scrollHeight = 4000 } = {}) {
  return { scrollTop: scrollHeight - clientHeight - fromBottom, scrollHeight, clientHeight };
}

function observe(state, currentMetrics, options = {}) {
  return reduceTranscriptFollow(state, {
    turn: { phase: options.phase ?? "final-answer" },
    metrics: currentMetrics,
    preworkContentHeight: options.preworkContentHeight ?? 0,
    spacerHeight: options.spacerHeight ?? 0,
    working: options.working ?? true,
    now: options.now ?? 0,
    event: options.event ?? "scroll",
    userIntent: options.userIntent,
  });
}

test("the auto-follow bottom threshold measures 24 pixels", () => {
  assert.equal(AUTO_FOLLOW_BOTTOM_THRESHOLD_PX, 24);
});

test("reports the distance from the bottom of the transcript", () => {
  assert.equal(distanceFromBottom(metrics(0)), 0);
  assert.equal(distanceFromBottom(metrics(120)), 120);
});

test("treats 24 pixels as near the bottom and 25 pixels as away from it", () => {
  assert.equal(createTranscriptFollowState(metrics(23)).mode, "user_follow");
  assert.equal(createTranscriptFollowState(metrics(24)).mode, "user_follow");
  assert.equal(createTranscriptFollowState(metrics(25)).mode, "static");
});

test("detaches at once when the user scrolls up from the bottom", () => {
  const state = createTranscriptFollowState(metrics(0));
  const result = observe(state, metrics(20), {
    now: 100, userIntent: { direction: "away", at: 100 },
  });
  assert.equal(result.state.mode, "static");
});

test("detaches on an upward scroll that stays inside the 24 pixel band", () => {
  const state = createTranscriptFollowState(metrics(0));
  const result = observe(state, metrics(10), {
    now: 100, userIntent: { direction: "away", at: 100 },
  });
  assert.equal(result.state.mode, "static");
  assert.equal(distanceFromBottom(metrics(10)) <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX, true);
});

test("stays in follow mode while new content moves the transcript down", () => {
  const state = createTranscriptFollowState(metrics(0));
  const result = observe(state, metrics(12, { scrollHeight: 4200 }), { event: "content" });
  assert.equal(result.state.mode, "user_follow");
  assert.equal(result.scrollToEndInstantly, true);
});

test("stays in follow mode when the first scroll event has no earlier position", () => {
  const state = createTranscriptFollowState(metrics(4));
  assert.equal(observe(state, metrics(4)).state.mode, "user_follow");
});

test("returns to follow mode when the reader enters the 24 pixel band", () => {
  const state = createTranscriptFollowState(metrics(120));
  const result = observe(state, metrics(20), {
    now: 100, userIntent: { direction: "toward", at: 100 },
  });
  assert.equal(result.state.mode, "user_follow");
});

test("a downward drag that stops short of the bottom keeps follow mode", () => {
  const state = createTranscriptFollowState(metrics(500));
  const following = observe(state, metrics(500), { event: "button" }).state;
  const result = observe(following, metrics(400), {
    now: 100, userIntent: { direction: "toward", at: 100 },
  });
  assert.equal(result.state.mode, "user_follow");
});

test("keeps the current state for a downward jump with no user intent", () => {
  const detached = createTranscriptFollowState(metrics(500));
  const following = observe(detached, metrics(500), { event: "button" }).state;
  assert.equal(observe(following, metrics(400)).state.mode, "user_follow");
  assert.equal(observe(detached, metrics(400)).state.mode, "static");
});

test("an upward user scroll detaches while streaming tokens renew the programmatic window", () => {
  let state = createTranscriptFollowState(metrics(0));
  state = observe(state, metrics(0, { scrollHeight: 4200 }), { event: "content" }).state;
  state = observe(state, metrics(0, { scrollHeight: 4400 }), { event: "content" }).state;
  const intent = selectScrollIntent({ direction: "away", at: 1300 }, 1200, 1300);
  const result = observe(state, metrics(30, { scrollHeight: 4400 }), {
    now: 1300, userIntent: intent,
  });
  assert.equal(result.state.mode, "static");
  assert.equal(result.button.visible, true);
});

test("bottom layout jitter cannot alternate follow mode without user intent", () => {
  let state = createTranscriptFollowState(metrics(0));
  const states = [];
  const events = [
    { scrollTop: 3398, scrollHeight: 4000 },
    { scrollTop: 3418, scrollHeight: 4020 },
    { scrollTop: 3416, scrollHeight: 4020 },
    { scrollTop: 3436, scrollHeight: 4040 },
  ];

  for (const position of events) {
    state = observe(state, { ...position, clientHeight: 600 }).state;
    states.push(state.mode);
  }

  assert.deepEqual(states, ["user_follow", "user_follow", "user_follow", "user_follow"]);
});

test("drops smooth scrolling when the reader asks for reduced motion", () => {
  assert.equal(resolveScrollBehavior("smooth", true), "instant");
  assert.equal(resolveScrollBehavior("instant", true), "instant");
  assert.equal(resolveScrollBehavior("smooth", false), "smooth");
  assert.equal(resolveScrollBehavior("instant", false), "instant");
});

test("offers the scroll control when the reader detaches", () => {
  const detached = createTranscriptFollowState(metrics(40));
  const following = createTranscriptFollowState(metrics(0));
  assert.equal(observe(detached, metrics(40)).button.visible, true);
  assert.equal(observe(following, metrics(0)).button.visible, false);
  assert.equal(observe(detached, metrics(40), { working: false }).button.workingDots, false);
  assert.equal(observe(detached, metrics(40), { working: true }).button.workingDots, true);
});

test("the follow reducer hides the button while it follows beyond the band", () => {
  const state = createTranscriptFollowState(metrics(0));
  const result = reduceTranscriptFollow(state, {
    turn: { phase: "prework" }, metrics: metrics(80), preworkContentHeight: 0,
    spacerHeight: 0, working: true, now: 0, event: "content",
  });
  assert.equal(result.state.mode, "prework_follow");
  assert.deepEqual(result.button, { visible: false, workingDots: false });
});

test("wheel input converts line and page deltas into pixels", () => {
  assert.deepEqual(normalizeWheelIntent({ deltaY: -2, deltaMode: 1, viewportHeight: 600, at: 100 }),
    { direction: "away", at: 100, deltaY: -32 });
  assert.deepEqual(normalizeWheelIntent({ deltaY: 1.5, deltaMode: 2, viewportHeight: 600, at: 101 }),
    { direction: "toward", at: 101, deltaY: 900 });
});

test("touch input waits for a vertical move of 8 pixels", () => {
  assert.equal(normalizeTouchIntent({ startX: 20, startY: 20, x: 20, y: 27, at: 100 }), null);
  assert.equal(normalizeTouchIntent({ startX: 20, startY: 20, x: 32, y: 29, at: 100 }), null);
  assert.deepEqual(normalizeTouchIntent({ startX: 20, startY: 20, x: 20, y: 28, at: 100 }),
    { direction: "away", at: 100 });
  assert.deepEqual(normalizeTouchIntent({ startX: 20, startY: 20, x: 20, y: 12, at: 100 }),
    { direction: "toward", at: 100 });
});

test("scroll keys map direction and ignore handled or editable events", () => {
  for (const key of ["ArrowUp", "Home", "PageUp"]) {
    assert.deepEqual(normalizeKeyIntent({ key, at: 100 }), { direction: "away", at: 100 });
  }
  for (const key of ["ArrowDown", "End", "PageDown", " "]) {
    assert.deepEqual(normalizeKeyIntent({ key, at: 100 }), { direction: "toward", at: 100 });
  }
  assert.deepEqual(normalizeKeyIntent({ key: " ", shiftKey: true, at: 100 }),
    { direction: "away", at: 100 });
  assert.equal(normalizeKeyIntent({ key: "ArrowUp", repeat: true, at: 100 }), null);
  assert.equal(normalizeKeyIntent({ key: "ArrowUp", defaultPrevented: true, at: 100 }), null);
  assert.equal(normalizeKeyIntent({ key: "ArrowUp", editableTarget: true, at: 100 }), null);
  assert.equal(normalizeKeyIntent({ key: " ", buttonTarget: true, at: 100 }), null);
});

test("a scrollbar drag uses recorded pointer geometry", () => {
  const pointer = captureScrollbarPointer({
    x: 995, y: 180, rect: { left: 0, right: 1000, top: 100, bottom: 700 },
    clientWidth: 988, scrollTop: 500, scrollHeight: 2400, clientHeight: 600,
  });
  assert.ok(pointer);
  assert.equal(pointer.startY, 180);
  assert.equal(pointer.trackHeight, 600);
  assert.equal(pointer.startScrollTop, 500);
  assert.equal(pointer.thumbTop, 225);
  assert.equal(pointer.thumbHeight, 150);
  assert.deepEqual(normalizeScrollbarPointerDownIntent(pointer, 100),
    { direction: "away", at: 100 });
  assert.deepEqual(normalizeScrollbarDragIntent(pointer, { y: 150, at: 100 }),
    { direction: "away", at: 100 });
  assert.equal(captureScrollbarPointer({
    x: 500, y: 180, rect: { left: 0, right: 1000, top: 100, bottom: 700 },
    clientWidth: 988, scrollTop: 500, scrollHeight: 2400, clientHeight: 600,
  }), null);
});

test("programmatic scrolls are ignored for 700 ms unless the user acts again", () => {
  const earlierIntent = { direction: "away", at: 999 };
  assert.equal(selectScrollIntent(earlierIntent, 1000, 1699), null);
  assert.deepEqual(selectScrollIntent({ direction: "away", at: 1100 }, 1000, 1699),
    { direction: "away", at: 1100 });
  assert.deepEqual(selectScrollIntent(earlierIntent, 1000, 1700), earlierIntent);
});
