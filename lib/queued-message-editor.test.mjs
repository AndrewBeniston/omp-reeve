import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { QueuedMessageEditor } = await jiti.import("./queued-message-editor.ts");

function textMessage(text) {
  return { role: "user", content: [{ type: "text", text }], timestamp: 1 };
}

function hiddenCompanion(text) {
  return {
    role: "custom",
    customType: "ultrathink-notice",
    content: text,
    display: false,
    attribution: "user",
    timestamp: 1,
  };
}

function makeAgent(steering = [], followUp = []) {
  let queues = { steering, followUp };
  return {
    peekSteeringQueue: () => queues.steering,
    peekFollowUpQueue: () => queues.followUp,
    replaceQueues(nextSteering, nextFollowUp) {
      queues = { steering: [...nextSteering], followUp: [...nextFollowUp] };
    },
    read: () => queues,
  };
}

test("exposes stable queue identifiers and image metadata", () => {
  const image = { type: "image", data: "AQID", mimeType: "image/png" };
  const agent = makeAgent([], [
    { role: "user", content: [{ type: "text", text: "First" }, image], timestamp: 1 },
    textMessage("Second"),
  ]);
  const editor = new QueuedMessageEditor(agent, (() => {
    let value = 0;
    return () => `queue-${++value}`;
  })());

  const first = editor.snapshot();
  const second = editor.snapshot();

  assert.deepEqual(first, second);
  assert.deepEqual(first.items.map(({ id, kind, text, imageCount }) => ({ id, kind, text, imageCount })), [
    { id: "queue-1", kind: "followUp", text: "First", imageCount: 1 },
    { id: "queue-2", kind: "followUp", text: "Second", imageCount: 0 },
  ]);
  assert.equal(first.items[0].imagePreview, "data:image/png;base64,AQID");
});

test("removes and restores one queue item with its hidden companions", () => {
  const companion = hiddenCompanion("hidden");
  const first = textMessage("First");
  const second = textMessage("Second");
  const agent = makeAgent([], [companion, first, second]);
  const editor = new QueuedMessageEditor(agent, (() => {
    let value = 0;
    return () => `queue-${++value}`;
  })());
  const [firstItem] = editor.snapshot().items;

  const removed = editor.remove(firstItem.id);
  assert.ok(removed);
  assert.deepEqual(agent.read().followUp, [second]);

  editor.restore(removed);
  assert.deepEqual(agent.read().followUp, [companion, first, second]);
  assert.equal(editor.snapshot().items[0].id, firstItem.id);
});

test("reorders user queue groups without moving internal messages", () => {
  const first = textMessage("First");
  const second = textMessage("Second");
  const internal = { role: "developer", content: "internal", timestamp: 1 };
  const agent = makeAgent([], [first, internal, second]);
  const editor = new QueuedMessageEditor(agent, (() => {
    let value = 0;
    return () => `queue-${++value}`;
  })());
  const [firstItem, secondItem] = editor.snapshot().items;

  editor.reorder([secondItem.id, firstItem.id]);

  assert.deepEqual(agent.read().followUp, [second, internal, first]);
  assert.deepEqual(editor.snapshot().items.map((item) => item.text), ["Second", "First"]);
});

test("moves one queued follow-up into the steering queue", () => {
  const first = textMessage("First");
  const second = textMessage("Second");
  const agent = makeAgent([], [first, second]);
  const editor = new QueuedMessageEditor(agent, () => crypto.randomUUID());
  const [, secondItem] = editor.snapshot().items;

  assert.equal(editor.moveToSteering(secondItem.id), true);
  assert.deepEqual(agent.read(), { steering: [second], followUp: [first] });
  assert.equal(editor.snapshot().items[0].kind, "steer");
});

test("marks item as failed with error summary and clears failure", () => {
  const first = textMessage("First");
  const agent = makeAgent([], [first]);
  const editor = new QueuedMessageEditor(agent, () => "queue-1");

  assert.equal(editor.snapshot().items[0].status, "queued");
  assert.equal(editor.snapshot().items[0].errorSummary, undefined);

  assert.equal(editor.markFailed("queue-1", "Connection timed out"), true);
  const failedSnapshot = editor.snapshot();
  assert.equal(failedSnapshot.items[0].status, "failed");
  assert.equal(failedSnapshot.items[0].errorSummary, "Connection timed out");

  assert.equal(editor.clearFailed("queue-1"), true);
  const clearedSnapshot = editor.snapshot();
  assert.equal(clearedSnapshot.items[0].status, "queued");
  assert.equal(clearedSnapshot.items[0].errorSummary, undefined);
});

test("restores a failed item at a specified position and avoids duplicating an existing item", () => {
  const first = textMessage("First");
  const agent = makeAgent([], [first]);
  const editor = new QueuedMessageEditor(agent, () => "queue-1");

  // Reconnecting with existing item should update without duplicating
  const insertedExisting = editor.restoreUserItem({
    id: "queue-1",
    kind: "followUp",
    text: "First",
    status: "failed",
    errorSummary: "Failed earlier",
  });
  assert.equal(insertedExisting, false);
  assert.equal(editor.snapshot().items.length, 1);
  assert.equal(editor.snapshot().items[0].status, "failed");
  assert.equal(editor.snapshot().items[0].errorSummary, "Failed earlier");

  // Restoring a new item into position 0
  const insertedNew = editor.restoreUserItem({
    id: "queue-0",
    kind: "followUp",
    text: "Inserted",
    position: 0,
    status: "failed",
    errorSummary: "Prior failure",
  });
  assert.equal(insertedNew, true);
  assert.equal(editor.snapshot().items.length, 2);
  assert.equal(editor.snapshot().items[0].id, "queue-0");
  assert.equal(editor.snapshot().items[0].text, "Inserted");
  assert.equal(editor.snapshot().items[0].status, "failed");
  assert.equal(editor.snapshot().items[1].id, "queue-1");
});
