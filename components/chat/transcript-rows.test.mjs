import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const { buildTranscriptRows, finalAnswerPosition, presentationAssistantPosition } = await createJiti(import.meta.url).import("./transcript-rows.ts");
const recorded = JSON.parse(readFileSync(new URL("../../lib/transcript/recorded-event-stream.json", import.meta.url), "utf8"));

function displayedMessages(rows) {
  return rows.flatMap((row) => row.kind === "message" ? [row.item.message] : row.kind === "model-change" ? [] : row.items.map((item) => item.message));
}

test("a saved Session renders one row per message in Turn order", () => {
  const messages = recorded.entries.map((entry) => entry.message);
  const ids = recorded.entries.map((entry) => entry.id);
  const rows = buildTranscriptRows(messages, ids, null, false);
  const turns = rows.filter((row) => row.kind === "turn");

  assert.deepEqual(displayedMessages(rows), messages);
  assert.deepEqual(turns.map((turn) => turn.id), [ids[0], ids[4], ids[6]]);
  assert.deepEqual(turns[0].items.map((item) => item.entryId), ids.slice(0, 4));
  assert.equal(turns[0].phase, "final-answer");
  assert.equal(turns[0].settled, true);
});

test("model-change notes appear before the next Turn and after the final Turn", () => {
  const messages = [
    { role: "user", content: "First question" },
    { role: "assistant", content: [{ type: "text", text: "First answer" }] },
    { role: "user", content: "Second question" },
    { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
  ];
  const modelChanges = [
    { entryId: "model-1", position: 2, fromModel: "openai/a", toModel: "anthropic/b" },
    { entryId: "model-2", position: 4, fromModel: "anthropic/b", toModel: "google/c" },
  ];

  const rows = buildTranscriptRows(messages, ["u1", "a1", "u2", "a2"], null, false, modelChanges);

  assert.deepEqual(rows.map((row) => [row.kind, row.id]), [
    ["turn", "u1"],
    ["model-change", "model-1"],
    ["turn", "u2"],
    ["model-change", "model-2"],
  ]);
  assert.deepEqual(displayedMessages(rows), messages);
  assert.deepEqual(rows.filter((row) => row.kind === "model-change").map((row) => row.note), [
    { fromModel: "openai/a", toModel: "anthropic/b" },
    { fromModel: "anthropic/b", toModel: "google/c" },
  ]);
});

test("a live Session adds its provisional assistant message to the active Turn once", () => {
  const messages = recorded.phaseEntries.slice(0, 3).map((entry) => entry.message);
  const ids = recorded.phaseEntries.slice(0, 3).map((entry) => entry.id);
  const streamingMessage = recorded.phaseEvents[12].message;
  const rows = buildTranscriptRows(messages, ids, streamingMessage, true);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "turn");
  assert.equal(rows[0].phase, "final-answer");
  assert.equal(rows[0].settled, false);
  assert.deepEqual(rows[0].items.map((item) => item.index), [0, 1, 2, 3]);
  assert.equal(rows[0].items[3].streaming, true);
  assert.equal(rows[0].items[3].entryId, undefined);
  assert.deepEqual(displayedMessages(rows), [...messages, streamingMessage]);
});

test("a saved compaction and its continuation stay in transcript order", () => {
  const compaction = { role: "custom", customType: "compaction", content: "Earlier work", display: true };
  const answer = { role: "assistant", content: [{ type: "text", text: "Continued answer" }] };
  const user = { role: "user", content: "Next question" };
  const nextAnswer = { role: "assistant", content: [{ type: "text", text: "Next answer" }] };
  const messages = [compaction, answer, user, nextAnswer];
  const rows = buildTranscriptRows(messages, ["c", "a", "u", "n"], null, false);

  assert.deepEqual(displayedMessages(rows), messages);
  assert.equal(rows[0].kind, "compaction");
  assert.deepEqual(rows[0].items.map((item) => item.index), [0, 1]);
  assert.equal(rows[0].phase, "final-answer");
  assert.deepEqual(rows[0].items[1].textPhases, ["final-answer"]);
  assert.equal(rows.at(-1).kind, "turn");
  assert.equal(rows.at(-1).id, "u");
});

test("the final answer position follows the folder's text phases", () => {
  const entries = recorded.phaseEntries;
  const rows = buildTranscriptRows(entries.map((entry) => entry.message), entries.map((entry) => entry.id), null, false);
  const turn = rows[0];

  assert.equal(turn.kind, "turn");
  assert.deepEqual(turn.items[1].textPhases, ["prework", undefined, undefined]);
  assert.equal(finalAnswerPosition(turn.items), 3);
  assert.equal(finalAnswerPosition(turn.items.slice(0, 3)), -1);
  assert.equal(presentationAssistantPosition(turn.items.slice(0, 3)), 1);
});

test("a delivered follow-up stays in the active live Turn", () => {
  const first = recorded.entries.slice(0, 2).map((entry) => entry.message);
  const user = { role: "user", content: "Live question" };
  const reply = { role: "assistant", content: [{ type: "text", text: "First reply" }] };
  const followUp = { role: "user", content: "Queued detail" };
  const nextReply = { role: "assistant", content: [{ type: "text", text: "Next reply" }] };
  const rows = buildTranscriptRows([...first, user, reply, followUp, nextReply], ["saved-user", "saved-reply"], null, true);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].items.map((item) => item.message), [user, reply, followUp, nextReply]);
  assert.equal(rows[1].settled, false);
});

test("a running manual compaction appends a live compaction row", () => {
  const messages = [{ role: "user", content: "Question" }];
  const rows = buildTranscriptRows(messages, ["u1"], null, false, [], {
    isCompacting: true,
    source: "manual",
  });
  const compactionRow = rows.find((row) => row.kind === "compaction");
  assert.ok(compactionRow);
  assert.equal(compactionRow.completed, false);
  assert.equal(compactionRow.source, "manual");
  assert.equal(compactionRow.items.length, 0);
  assert.equal(rows.at(-1)?.kind, "compaction");
});

test("a running automatic compaction appends a live compaction row", () => {
  const messages = [{ role: "user", content: "Question" }];
  const rows = buildTranscriptRows(messages, ["u1"], null, false, [], {
    isCompacting: true,
    source: "automatic",
  });
  const compactionRow = rows.find((row) => row.kind === "compaction");
  assert.ok(compactionRow);
  assert.equal(compactionRow.completed, false);
  assert.equal(compactionRow.source, "automatic");
  assert.equal(compactionRow.items.length, 0);
  assert.equal(rows.at(-1)?.kind, "compaction");
});

test("a compaction_end with error appends an error compaction row", () => {
  const messages = [{ role: "user", content: "Question" }];
  const rows = buildTranscriptRows(messages, ["u1"], null, false, [], {
    isCompacting: false,
    source: "automatic",
    error: "Context window exceeded limit",
  });
  const compactionRow = rows.find((row) => row.kind === "compaction");
  assert.ok(compactionRow);
  assert.equal(compactionRow.completed, true);
  assert.equal(compactionRow.error, "Context window exceeded limit");
  assert.equal(compactionRow.items.length, 0);
  assert.equal(rows.at(-1)?.kind, "compaction");
});

test("a finished compaction note replaces the running note without duplicate row", () => {
  const savedCompaction = {
    role: "custom",
    customType: "compaction",
    content: "Summary of earlier messages",
    display: true,
    details: { source: "manual" },
  };
  const messages = [savedCompaction];
  const rowsFinished = buildTranscriptRows(messages, ["c1"], null, false, [], null);
  const compactionRowsFinished = rowsFinished.filter((row) => row.kind === "compaction");
  assert.equal(compactionRowsFinished.length, 1);
  assert.equal(compactionRowsFinished[0].completed, true);
  assert.equal(compactionRowsFinished[0].source, "manual");

  const rowsWithState = buildTranscriptRows(messages, ["c1"], null, false, [], {
    isCompacting: true,
    source: "manual",
  });
  const compactionRowsWithState = rowsWithState.filter((row) => row.kind === "compaction");
  assert.equal(compactionRowsWithState.length, 1);
  assert.equal(compactionRowsWithState[0].completed, true);
});
