import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const { buildTranscriptRows, finalAnswerPosition, presentationAssistantPosition } = await createJiti(import.meta.url).import("./transcript-rows.ts");
const recorded = JSON.parse(readFileSync(new URL("../../lib/transcript/recorded-event-stream.json", import.meta.url), "utf8"));

function displayedMessages(rows) {
  return rows.flatMap((row) => row.kind === "message" ? [row.item.message] : row.items.map((item) => item.message));
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
