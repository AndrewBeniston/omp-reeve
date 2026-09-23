import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const { foldTurns } = await createJiti(import.meta.url).import("./turn-folder.ts");
const fixture = JSON.parse(readFileSync(new URL("./recorded-event-stream.json", import.meta.url), "utf8"));

function text(message) {
  return typeof message.content === "string"
    ? message.content
    : message.content?.filter(part => part.type === "text").map(part => part.text).join("") ?? "";
}

function contents(turns) {
  return turns.map(turn => turn.items.map(item => text(item.message)));
}

test("recorded OMP events preserve message order and keep delivered steering and follow-up in the interrupted Turn", () => {
  const turns = foldTurns(fixture.events);

  assert.deepEqual(contents(turns), [
    ["First question", "Reply 1", "Steered detail", "Reply 2", "Queued detail", "Reply 3"],
    ["Second question", "Reply 4"],
  ]);
});

test("Session entries alone restore the recorded Session in source order", () => {
  const turns = foldTurns(fixture.entries);

  assert.deepEqual(contents(turns), [
    ["First question", "Reply 1", "Steered detail", "Reply 2"],
    ["Queued detail", "Reply 3"],
    ["Second question", "Reply 4"],
  ]);
  assert.deepEqual(turns.flatMap(turn => turn.items.map(item => item.entryId)), fixture.entries.map(entry => entry.id));
});

test("Session entries can precede live events in one fold", () => {
  const secondRun = fixture.events.findIndex((event, index) => event.type === "agent_start" && index > 0);
  const history = fixture.entries.slice(0, 2);
  const turns = foldTurns([...history, ...fixture.events.slice(secondRun)]);

  assert.deepEqual(contents(turns), [
    ["First question", "Reply 1"],
    ["Second question", "Reply 4"],
  ]);
});

test("a persisted steering marker keeps its user message in the preceding Turn", () => {
  const entries = fixture.entries.filter(entry => ["First question", "Reply 1", "Steered detail", "Reply 2", "Second question"].includes(text(entry.message)));

  assert.deepEqual(contents(foldTurns(entries)), [
    ["First question", "Reply 1", "Steered detail", "Reply 2"],
    ["Second question"],
  ]);
});

test("stream updates replace one provisional message instead of adding duplicate messages", () => {
  const start = fixture.events.findIndex(event => event.type === "message_start" && event.message?.role === "assistant");
  const partial = fixture.events.slice(0, start + 2);

  assert.equal(foldTurns(partial)[0].items.length, 2);
  assert.equal(foldTurns(partial)[0].items[1].message.role, "assistant");
});
