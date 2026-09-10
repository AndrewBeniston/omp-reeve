import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const {
  AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
  ACTIVE_TURN_BOTTOM_DISTANCE_PX,
  ACTIVE_TURN_SPACER_DURATION_MS,
  consumeActiveTurnSpacerHeight,
  distanceFromBottom,
  getActiveTurnResponseSpacerHeight,
  isNearBottom,
  nextPinnedStateForScrollEvent,
  nextPinnedState,
  resolveScrollBehavior,
  shouldOfferNewMessages,
  shouldFollowStreamingTail,
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
  assert.equal(shouldFollowStreamingTail({ pinned: true, activeTurnHeld: true }), false);
  assert.equal(shouldFollowStreamingTail({ pinned: true, activeTurnHeld: false }), true);
  assert.equal(shouldFollowStreamingTail({ pinned: false, activeTurnHeld: false }), false);
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

test("the auto-follow bottom threshold measures 48 pixels", () => {
  assert.equal(AUTO_FOLLOW_BOTTOM_THRESHOLD_PX, 48);
});

test("reports the distance from the bottom of the transcript", () => {
  assert.equal(distanceFromBottom(metrics(0)), 0);
  assert.equal(distanceFromBottom(metrics(120)), 120);
});

test("treats 48 pixels as near the bottom and 49 pixels as away from it", () => {
  assert.equal(isNearBottom(metrics(47)), true);
  assert.equal(isNearBottom(metrics(48)), true);
  assert.equal(isNearBottom(metrics(49)), false);
});

test("detaches at once when the user scrolls up from the bottom", () => {
  const pinned = nextPinnedState({
    pinned: true,
    previousScrollTop: 3400,
    metrics: { scrollTop: 3380, scrollHeight: 4000, clientHeight: 600 },
    userScrollIntent: true,
  });

  assert.equal(pinned, false);
});

test("detaches on an upward scroll that stays inside the 48 pixel band", () => {
  // The end sits 3400px down. A 10px lift keeps the reader 10px from the end.
  const pinned = nextPinnedState({
    pinned: true,
    previousScrollTop: 3400,
    metrics: { scrollTop: 3390, scrollHeight: 4000, clientHeight: 600 },
    userScrollIntent: true,
  });

  assert.equal(pinned, false);
  assert.equal(isNearBottom({ scrollTop: 3390, scrollHeight: 4000, clientHeight: 600 }), true);
});

test("stays pinned while new content moves the transcript down", () => {
  const pinned = nextPinnedState({
    pinned: true,
    previousScrollTop: 3400,
    metrics: metrics(12, { scrollHeight: 4200 }),
    userScrollIntent: false,
  });

  assert.equal(pinned, true);
});

test("stays pinned when the first scroll event has no earlier position", () => {
  const pinned = nextPinnedState({
    pinned: true,
    previousScrollTop: null,
    metrics: metrics(4),
    userScrollIntent: false,
  });

  assert.equal(pinned, true);
});

test("re-pins when the reader returns inside the 48 pixel band", () => {
  const pinned = nextPinnedState({
    pinned: false,
    previousScrollTop: 3000,
    metrics: metrics(20),
    userScrollIntent: true,
  });

  assert.equal(pinned, true);
});

test("detaches on a deliberate downward drag that stops short of the bottom", () => {
  const pinned = nextPinnedState({
    pinned: true,
    previousScrollTop: 2000,
    metrics: metrics(400),
    userScrollIntent: true,
  });

  assert.equal(pinned, false);
});

test("keeps the current state for a downward jump with no user intent", () => {
  const far = { previousScrollTop: 1000, metrics: metrics(400), userScrollIntent: false };

  assert.equal(nextPinnedState({ pinned: true, ...far }), true);
  assert.equal(nextPinnedState({ pinned: false, ...far }), false);
});

test("an upward user scroll detaches while streaming tokens renew the programmatic window", () => {
  let pinned = true;
  let previousScrollTop = 3400;

  const processScroll = ({ now, scrollTop, scrollHeight, ignoreUntil, userIntentUntil = 0 }) => {
    pinned = nextPinnedStateForScrollEvent({
      pinned,
      previousScrollTop,
      metrics: { scrollTop, scrollHeight, clientHeight: 600 },
      now,
      ignoreProgrammaticScrollUntil: ignoreUntil,
      userScrollIntentUntil: userIntentUntil,
    });
    previousScrollTop = scrollTop;
  };

  processScroll({ now: 1000, scrollTop: 3600, scrollHeight: 4200, ignoreUntil: 1700 });
  processScroll({ now: 1200, scrollTop: 3800, scrollHeight: 4400, ignoreUntil: 1900 });
  processScroll({
    now: 1300,
    scrollTop: 3770,
    scrollHeight: 4400,
    ignoreUntil: 2000,
    userIntentUntil: 2500,
  });

  assert.equal(pinned, false, "the upward user scroll overrides the renewed ignore window");
  assert.equal(shouldOfferNewMessages({ pinned, streaming: true }), true);
});

test("bottom layout jitter cannot alternate the pinned state without user intent", () => {
  let pinned = true;
  let previousScrollTop = 3400;
  const states = [];
  const events = [
    { scrollTop: 3398, scrollHeight: 4000 },
    { scrollTop: 3418, scrollHeight: 4020 },
    { scrollTop: 3416, scrollHeight: 4020 },
    { scrollTop: 3436, scrollHeight: 4040 },
  ];

  for (const metrics of events) {
    pinned = nextPinnedState({
      pinned,
      previousScrollTop,
      metrics: { ...metrics, clientHeight: 600 },
      userScrollIntent: false,
    });
    states.push(pinned);
    previousScrollTop = metrics.scrollTop;
  }

  assert.deepEqual(states, [true, true, true, true]);
});

test("drops smooth scrolling when the reader asks for reduced motion", () => {
  assert.equal(resolveScrollBehavior("smooth", true), "instant");
  assert.equal(resolveScrollBehavior("instant", true), "instant");
  assert.equal(resolveScrollBehavior("smooth", false), "smooth");
  assert.equal(resolveScrollBehavior("instant", false), "instant");
});

test("offers the new-message control only while a detached transcript streams", () => {
  assert.equal(shouldOfferNewMessages({ pinned: false, streaming: true }), true);
  assert.equal(shouldOfferNewMessages({ pinned: true, streaming: true }), false);
  assert.equal(shouldOfferNewMessages({ pinned: false, streaming: false }), false);
  assert.equal(shouldOfferNewMessages({ pinned: true, streaming: false }), false);
});
