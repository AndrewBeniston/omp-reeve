import assert from "node:assert/strict";
import test from "node:test";
import { FILE_SOURCE_AUTOSAVE_DELAY, FileSourceAutosave } from "./file-source-autosave.ts";

/*
 * Autosave is the other destructive path: it writes without being asked. What
 * matters is that it never writes twice at once, never writes over somebody
 * else's change, and never silently drops a change it could not merge.
 *
 * Time is injected rather than waited for.
 */

function harness(options = {}) {
  const timers = [];
  const writes = [];
  const states = [];
  const conflicts = [];
  let pending = null;
  const machine = new FileSourceAutosave({
    content: options.content ?? "a\n",
    mtimeMs: options.mtimeMs ?? 1,
    readOnly: options.readOnly,
    write: (content, expectedMtimeMs) => {
      writes.push({ content, expectedMtimeMs });
      return options.answer
        ? Promise.resolve(options.answer(content, expectedMtimeMs))
        : new Promise((resolve) => { pending = resolve; });
    },
    onState: (state) => states.push(state),
    onExternalConflict: (disk) => conflicts.push(disk),
    schedule: (run, delay) => { timers.push({ run, delay }); return timers.length - 1; },
    cancel: (id) => { if (timers[id]) timers[id] = null; },
  });
  return {
    machine, writes, states, conflicts, timers,
    fire: () => { const due = timers.filter(Boolean); timers.length = 0; for (const timer of due) timer.run(); },
    answer: (result) => { pending?.(result); pending = null; },
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

test("an edit waits the reference delay, and text typed mid-write is written after it, not beside it", async () => {
  const harnessed = harness();
  harnessed.machine.edit("b\n");
  assert.deepEqual(harnessed.writes, []);
  assert.equal(harnessed.timers.filter(Boolean)[0].delay, FILE_SOURCE_AUTOSAVE_DELAY);

  harnessed.fire();
  assert.deepEqual(harnessed.writes, [{ content: "b\n", expectedMtimeMs: 1 }]);

  // Typed while that write is still in the air: one write at a time.
  harnessed.machine.edit("c\n");
  assert.equal(harnessed.writes.length, 1);

  harnessed.answer({ outcome: "saved", mtimeMs: 2 });
  await harnessed.settle();
  harnessed.fire();
  await harnessed.settle();
  // The newer text goes out against the time the first write produced.
  assert.deepEqual(harnessed.writes[1], { content: "c\n", expectedMtimeMs: 2 });
});

test("a conflict whose disk text is already what was being written only adopts the new time", async () => {
  const harnessed = harness({ answer: () => ({ outcome: "conflict", content: "b\n", mtimeMs: 9 }) });
  harnessed.machine.edit("b\n");
  harnessed.fire();
  await harnessed.settle();
  const last = harnessed.states.at(-1);
  assert.equal(last.status, "clean");
  assert.equal(last.mtimeMs, 9);
  assert.equal(harnessed.writes.length, 1);
  assert.deepEqual(harnessed.conflicts, []);
});

test("a change elsewhere in the file is merged and written back; the human's text survives", async () => {
  const harnessed = harness({
    content: "one\ntwo\nthree\n",
    answer: () => ({ outcome: "conflict", content: "one\ntwo\nTHREE\n", mtimeMs: 7 }),
  });
  harnessed.machine.edit("ONE\ntwo\nthree\n");
  harnessed.fire();
  await harnessed.settle();
  assert.deepEqual(harnessed.conflicts, []);
  assert.equal(harnessed.machine.text(), "ONE\ntwo\nTHREE\n");
  harnessed.fire();
  await harnessed.settle();
  // Written against the time the disk now carries, never the stale one.
  assert.deepEqual(harnessed.writes.at(-1), { content: "ONE\ntwo\nTHREE\n", expectedMtimeMs: 7 });
});

test("a change to the same lines is held, not overwritten, and nothing more is written", async () => {
  const harnessed = harness({
    content: "one\ntwo\n",
    answer: () => ({ outcome: "conflict", content: "theirs\ntwo\n", mtimeMs: 4 }),
  });
  harnessed.machine.edit("mine\ntwo\n");
  harnessed.fire();
  await harnessed.settle();
  assert.deepEqual(harnessed.conflicts, ["theirs\ntwo\n"]);
  assert.equal(harnessed.states.at(-1).status, "conflict");

  // Editing on top of a held conflict keeps typing alive and still writes
  // nothing: the file on disk is somebody else's until a human says otherwise.
  harnessed.machine.edit("mine again\ntwo\n");
  harnessed.fire();
  await harnessed.settle();
  assert.equal(harnessed.writes.length, 1);

  harnessed.machine.resolve("theirs\ntwo\n", 4);
  harnessed.machine.edit("agreed\ntwo\n");
  harnessed.fire();
  await harnessed.settle();
  assert.deepEqual(harnessed.writes.at(-1), { content: "agreed\ntwo\n", expectedMtimeMs: 4 });
});

test("a read-only document is never written, however much it is edited", async () => {
  const harnessed = harness({ readOnly: true });
  harnessed.machine.edit("b\n");
  harnessed.fire();
  await harnessed.machine.save();
  assert.deepEqual(harnessed.writes, []);
});
