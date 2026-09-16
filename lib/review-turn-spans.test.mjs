import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { stepTurnLifecycle, isAwaitingSettle, IDLE_TURN_LIFECYCLE } = await jiti.import("./review-turn-spans.ts");

function walk(events) {
  let state = IDLE_TURN_LIFECYCLE;
  const opened = [];
  const closed = [];
  for (const event of events) {
    const decision = stepTurnLifecycle(state, event);
    state = decision.state;
    if (decision.open) opened.push(decision.open.promptId);
    if (decision.close) {
      closed.push(`${decision.close.promptId}:${decision.close.status}:${decision.close.capture ? "capture" : "no-capture"}`);
    }
  }
  return { state, opened, closed };
}

const start = { type: "prompt_started", promptId: "p1" };
const began = { type: "agent_started" };
const terminalEnd = { type: "agent_ended", terminal: true };
const continuingEnd = { type: "agent_ended", terminal: false };
const settled = { type: "prompt_settled" };

test("a span closes only once both the prompt has settled and the run has stopped", () => {
  // Settle first, terminal end second.
  assert.deepEqual(walk([start, began, settled, terminalEnd]).closed, ["p1:completed:capture"]);
  // Terminal end first, settle second: the same close, whichever order.
  assert.deepEqual(walk([start, began, terminalEnd, settled]).closed, ["p1:completed:capture"]);

  // Neither alone is enough.
  assert.deepEqual(walk([start, began, settled]).closed, []);
  assert.deepEqual(walk([start, began, terminalEnd]).closed, []);
});

test("a queued continuation holds the span open until the run really stops", () => {
  const { closed, state } = walk([
    start, began,
    settled,
    // The SDK marks this end non-terminal: a steer or follow-up will continue.
    continuingEnd,
    { type: "continuation" },
    began,
    terminalEnd,
  ]);

  assert.deepEqual(closed, ["p1:completed:capture"], "a continuation must not end the span early");
  assert.equal(state.promptId, null);
});

test("an interruption waits for the same two facts, then records itself as one", () => {
  assert.deepEqual(
    walk([start, began, { type: "abort_requested" }, settled, terminalEnd]).closed,
    ["p1:interrupted:capture"],
  );
  // The request alone, and a settle without a stop, both leave it open.
  assert.deepEqual(walk([start, began, { type: "abort_requested" }]).closed, []);
  assert.deepEqual(walk([start, began, { type: "abort_requested" }, settled]).closed, []);
});

test("a prompt that fails before the run starts closes at once", () => {
  assert.deepEqual(
    walk([start, { type: "prompt_settled", failed: true }]).closed,
    ["p1:failed:capture"],
  );
  // Once a run has started, a failure still waits for it to stop.
  assert.deepEqual(walk([start, began, { type: "prompt_settled", failed: true }]).closed, []);
  assert.deepEqual(
    walk([start, began, { type: "prompt_settled", failed: true }, terminalEnd]).closed,
    ["p1:failed:capture"],
  );
});

test("a run that never reports its end records no end state", () => {
  assert.deepEqual(
    walk([start, began, settled, { type: "settle_timeout" }]).closed,
    ["p1:interrupted:no-capture"],
    "a workspace still under the run's hand must not be recorded as finished",
  );
});

test("a new prompt ends an unfinished one without trusting its end state", () => {
  assert.deepEqual(
    walk([start, began, { type: "prompt_started", promptId: "p2" }, began, settled, terminalEnd]).closed,
    ["p1:superseded:no-capture", "p2:completed:capture"],
  );
  // One that had already settled and stopped is safe to capture.
  assert.deepEqual(
    walk([start, began, settled, terminalEnd, { type: "prompt_started", promptId: "p2" }]).opened,
    ["p1", "p2"],
  );
});

test("events outside a span change nothing", () => {
  assert.deepEqual(walk([{ type: "continuation" }, terminalEnd, settled, { type: "settle_timeout" }]).closed, []);
});

test("a run that starts again cancels the end the run before it reported", () => {
  // The terminal end is followed by another run, so the settle that arrives
  // after it must not close a span over a workspace still being written.
  assert.deepEqual(walk([start, began, terminalEnd, began, settled]).closed, []);
  assert.deepEqual(walk([start, began, terminalEnd, began, settled, terminalEnd]).closed, ["p1:completed:capture"]);
});

test("only a prompt owed half its ending is waited on", () => {
  const awaiting = (events) => isAwaitingSettle(walk(events).state);

  // Nothing has ended yet, so there is nothing to wait for.
  assert.equal(awaiting([start]), false);
  assert.equal(awaiting([start, began]), false);
  // One half has arrived without the other.
  assert.equal(awaiting([start, began, terminalEnd]), true);
  assert.equal(awaiting([start, began, settled]), false, "a run still executing is not stuck");
  assert.equal(awaiting([start, began, settled, continuingEnd]), true, "a promised continuation may never come");
  // The continuation arrived, so the clock stops again.
  assert.equal(awaiting([start, began, settled, continuingEnd, began]), false);
  // Closed spans wait for nothing.
  assert.equal(awaiting([start, began, settled, terminalEnd]), false);
});
