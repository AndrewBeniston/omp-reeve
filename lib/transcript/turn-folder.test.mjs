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

test("assistant text starts a provisional final-answer phase", () => {
  const beforeText = foldTurns(fixture.phaseEvents.slice(0, 4))[0];
  const afterText = foldTurns(fixture.phaseEvents.slice(0, 5))[0];

  assert.equal(beforeText.phase, "idle");
  assert.equal(beforeText.settled, false);
  assert.equal(afterText.phase, "final-answer");
  assert.equal(afterText.settled, false);
  assert.deepEqual(afterText.items[1].textPhases, ["final-answer"]);
});

test("later thinking reclassifies the preceding assistant text as prework", () => {
  const turn = foldTurns(fixture.phaseEvents.slice(0, 6))[0];

  assert.equal(turn.phase, "prework");
  assert.deepEqual(turn.items[1].textPhases, ["prework", undefined]);
});

test("tool and sub-agent activity reclassify preceding assistant text", () => {
  const toolCall = {
    ...fixture.phaseEvents[6],
    message: {
      ...fixture.phaseEvents[6].message,
      content: fixture.phaseEvents[6].message.content.filter(block => block.type !== "thinking"),
    },
  };

  for (const activity of [toolCall, fixture.phaseEvents[8], fixture.phaseEvents[11]]) {
    const turn = foldTurns([...fixture.phaseEvents.slice(0, 5), activity])[0];
    assert.equal(turn.phase, "prework");
    assert.equal(turn.items[1].textPhases[0], "prework");
  }
});

test("a later assistant reply starts the final-answer phase and prompt_done settles it", () => {
  const provisional = foldTurns(fixture.phaseEvents.slice(0, 14))[0];
  const settled = foldTurns(fixture.phaseEvents)[0];

  assert.equal(provisional.phase, "final-answer");
  assert.equal(provisional.settled, false);
  assert.deepEqual(provisional.items[1].textPhases, ["prework", undefined, undefined]);
  assert.deepEqual(provisional.items[3].textPhases, ["final-answer"]);
  assert.equal(settled.phase, "final-answer");
  assert.equal(settled.settled, true);
});

test("prompt_done settles a Turn without a final assistant reply", () => {
  const turn = foldTurns([...fixture.phaseEvents.slice(0, 12), fixture.phaseEvents.at(-1)])[0];

  assert.equal(turn.phase, "prework");
  assert.equal(turn.settled, true);
});

test("live events and Session entries settle the same assistant phases", () => {
  const expected = {
    phase: "final-answer",
    settled: true,
    textPhases: [["prework", undefined, undefined], ["final-answer"]],
  };
  const project = records => {
    const turn = foldTurns(records)[0];
    return {
      phase: turn.phase,
      settled: turn.settled,
      textPhases: turn.items.filter(item => item.message.role === "assistant").map(item => item.textPhases),
    };
  };

  assert.deepEqual(project(fixture.phaseEvents), expected);
  assert.deepEqual(project(fixture.phaseEntries), expected);
});

test("live work reopens a Turn loaded from a Session entry", () => {
  const records = [fixture.phaseEntries[0], fixture.phaseEvents[0], ...fixture.phaseEvents.slice(3, 6)];
  const turn = foldTurns(records)[0];

  assert.equal(turn.phase, "prework");
  assert.equal(turn.settled, false);
  assert.deepEqual(turn.items[1].textPhases, ["prework", undefined]);
});
