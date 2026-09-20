import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSourceAutosave } from "./file-source-autosave.ts";
import { autosaveResultFrom } from "./file-source-client.ts";
import { readFileSource, saveFileSource } from "./file-source.ts";

/*
 * Editing as the desktop does it, against a real file.
 *
 * The autosave machine and the writer are tested apart from each other
 * elsewhere; what these cover is the seam between them, which the move to an
 * atomic replace runs straight through. A save now leaves a different file
 * behind the same name, so the modification time the editor carries forward,
 * and the re-read that answers a conflict, are the two things that would break
 * quietly if that move were wrong.
 */

function editor(filePath, read, timers) {
  return new FileSourceAutosave({
    content: read.content,
    mtimeMs: read.mtimeMs,
    // The same reading of an outcome the browser applies, over a real write.
    write: async (content, expectedMtimeMs) =>
      autosaveResultFrom(true, await saveFileSource(filePath, content, expectedMtimeMs)),
    onState: () => {},
    schedule: (run) => { timers.push(run); return timers.length - 1; },
    cancel: (id) => { if (timers[id]) timers[id] = null; },
  });
}

async function fire(timers, machine) {
  const due = timers.filter(Boolean);
  timers.length = 0;
  for (const timer of due) timer();
  // Join the write the timer started. A fixed sleep guesses how long an
  // atomic replace takes, and a loaded machine takes longer than the guess.
  await machine.save();
}

function fixture() {
  return mkdtempSync(join(tmpdir(), "reeve-editing-"));
}

test("typing and waiting writes the file, and the next edit writes again", async () => {
  const directory = fixture();
  const file = join(directory, "notes.md");
  writeFileSync(file, "one\n");
  const timers = [];
  const machine = editor(file, await readFileSource(file), timers);

  machine.edit("one edited\n");
  await fire(timers, machine);
  assert.equal(readFileSync(file, "utf8"), "one edited\n");

  // The second save proves the modification time was carried forward from the
  // file the replace left behind, not from the one it replaced.
  machine.edit("one edited twice\n");
  await fire(timers, machine);
  assert.equal(readFileSync(file, "utf8"), "one edited twice\n");
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

test("somebody else's change elsewhere in the file is merged, and both survive", async () => {
  const directory = fixture();
  const file = join(directory, "shared.md");
  writeFileSync(file, "alpha\nbeta\ngamma\n");
  const timers = [];
  const machine = editor(file, await readFileSource(file), timers);

  machine.edit("ALPHA\nbeta\ngamma\n");
  writeFileSync(file, "alpha\nbeta\nGAMMA\n");
  await fire(timers, machine);

  // The refusal, the re-read and the merge all happened; what is left is the
  // text neither writer typed alone.
  assert.equal(machine.text(), "ALPHA\nbeta\nGAMMA\n");
  await fire(timers, machine);
  assert.equal(readFileSync(file, "utf8"), "ALPHA\nbeta\nGAMMA\n");
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

test("somebody else's change to the same lines is held, and their text stays on disk", async () => {
  const directory = fixture();
  const file = join(directory, "contested.md");
  writeFileSync(file, "first\nsecond\n");
  const timers = [];
  const conflicts = [];
  const read = await readFileSource(file);
  const machine = new FileSourceAutosave({
    content: read.content,
    mtimeMs: read.mtimeMs,
    write: async (content, expectedMtimeMs) =>
      autosaveResultFrom(true, await saveFileSource(file, content, expectedMtimeMs)),
    onState: () => {},
    onExternalConflict: (disk) => conflicts.push(disk),
    schedule: (run) => { timers.push(run); return timers.length - 1; },
    cancel: (id) => { if (timers[id]) timers[id] = null; },
  });

  machine.edit("mine\nsecond\n");
  writeFileSync(file, "theirs\nsecond\n");
  await fire(timers, machine);

  assert.deepEqual(conflicts, ["theirs\nsecond\n"]);
  // Nothing was overwritten: their file is exactly as they left it.
  assert.equal(readFileSync(file, "utf8"), "theirs\nsecond\n");

  // Editing on top of a held conflict still writes nothing.
  machine.edit("mine again\nsecond\n");
  await fire(timers, machine);
  assert.equal(readFileSync(file, "utf8"), "theirs\nsecond\n");

  // Once the human decides, the save is ordinary again.
  const current = await readFileSource(file);
  machine.resolve(current.content, current.mtimeMs);
  machine.edit("agreed\nsecond\n");
  await fire(timers, machine);
  assert.equal(readFileSync(file, "utf8"), "agreed\nsecond\n");
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});
