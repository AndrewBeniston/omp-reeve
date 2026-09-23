import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { selectLiveActivityHeader } = await jiti.import("./live-activity-header.ts");

function call(toolName, input = {}, result) {
  return {
    block: { type: "toolCall", toolCallId: `${toolName}-${Math.random()}`, toolName, input },
    result,
  };
}

const finished = { role: "toolResult", toolCallId: "finished", content: [] };

test("selects the summary for a closed, complete, or older Activity area", () => {
  const calls = [call("read")];
  assert.equal(selectLiveActivityHeader({ calls, closed: true, inProgress: true, latestVisible: true, exploring: false }).kind, "summary");
  assert.equal(selectLiveActivityHeader({ calls, closed: false, inProgress: false, latestVisible: true, exploring: false }).kind, "summary");
  assert.equal(selectLiveActivityHeader({ calls, closed: false, inProgress: true, latestVisible: false, exploring: false }).kind, "summary");
});

test("exploration selects the newest running command, then the newest command", () => {
  const olderRunning = call("bash", { command: "older" });
  const newerFinished = call("bash", { command: "newer" }, finished);
  const selected = selectLiveActivityHeader({
    calls: [olderRunning, newerFinished],
    closed: false,
    inProgress: true,
    latestVisible: true,
    exploring: true,
  });
  assert.equal(selected.kind, "activity");
  assert.equal(selected.call, olderRunning);

  const finishedOnly = selectLiveActivityHeader({
    calls: [newerFinished],
    closed: false,
    inProgress: true,
    latestVisible: true,
    exploring: true,
  });
  assert.equal(finishedOnly.kind, "activity");
  assert.equal(finishedOnly.call, newerFinished);
});

test("selects the newest unfinished non-command Activity item", () => {
  const running = call("read");
  const selected = selectLiveActivityHeader({
    calls: [running, call("grep", { query: "done" }, finished)],
    closed: false,
    inProgress: true,
    latestVisible: true,
    exploring: false,
  });
  assert.equal(selected.kind, "activity");
  assert.equal(selected.call, running);
});

test("selects thinking when no unfinished Activity item exists", () => {
  const selected = selectLiveActivityHeader({
    calls: [call("read", {}, finished)],
    closed: false,
    inProgress: true,
    latestVisible: true,
    exploring: false,
  });
  assert.deepEqual(selected, { kind: "thinking" });
});

test("an automatic approval review in the newest unfinished position selects thinking", () => {
  const selected = selectLiveActivityHeader({
    calls: [{
      ...call("read"),
      metadata: { automaticApprovalReview: true },
    }],
    closed: false,
    inProgress: true,
    latestVisible: true,
    exploring: false,
  });
  assert.deepEqual(selected, { kind: "thinking" });
});
