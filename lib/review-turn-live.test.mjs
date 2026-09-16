import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The recorded interval, taken from a real prompt rather than a scripted one.
 *
 * Every other test in this area drives the recorder directly, which proves the
 * bookkeeping but never that the events the product subscribes to are the ones
 * the SDK really raises. This one runs a prompt through `startRpcSession` — the
 * path the browser uses — against a model the machine really has, and reads the
 * span that prompt left behind.
 *
 * It is opt-in, and it names nothing of its own. A real prompt costs time and
 * reaches a model endpoint, so this runs only when REEVE_LIVE_BASE_URL and
 * REEVE_LIVE_MODEL_ID both say where to send it. `bun test` on a machine that
 * has not set them skips it, and no request is ever sent to an endpoint the
 * runner did not name.
 */
const enabled = Boolean(process.env.REEVE_LIVE_BASE_URL && process.env.REEVE_LIVE_MODEL_ID);

test(
  "a real prompt records an interval holding the run's own work",
  {
    skip: enabled ? false : "set REEVE_LIVE_BASE_URL and REEVE_LIVE_MODEL_ID to run a real model turn",
    timeout: 600_000,
  },
  async () => {
    const { stdout } = await run(
      process.env.REEVE_LIVE_RUNTIME ?? "bun",
      [new URL("./review-turn-live-fixture.mjs", import.meta.url).pathname],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 540_000 },
    );
    const line = stdout.split("\n").find((entry) => entry.startsWith("LIVE_RESULT"));
    assert.ok(line, "the live fixture printed no result:\n" + stdout);
    const result = JSON.parse(line.slice("LIVE_RESULT".length));
    assert.equal(result.error, undefined, "the live fixture failed: " + result.error);

    // The Session held the model that was asked for, read from the Session
    // itself rather than repeated back from the request.
    assert.equal(
      result.usedModel,
      "live-fixture/" + process.env.REEVE_LIVE_MODEL_ID,
      "the Session ran a model nobody asked for",
    );

    // The prompt really reached a model and really ran tools.
    const started = result.toolEvents.filter((event) => event.type === "tool_execution_start");
    assert.ok(started.length > 0, "no tool ran, so this proves nothing: " + JSON.stringify(result.eventTypes));
    assert.equal(result.span.status, "completed");
    assert.equal(result.read.kind, "diff", "the read refused a real completed turn: " + result.read.reason);

    // The file the run edited, at the content it was asked for.
    const literal = (value) => value.split(".").join("\\.");
    assert.match(result.read.patch, new RegExp(literal(result.runFile)));
    assert.match(
      result.read.patch,
      new RegExp("\\+" + literal(result.runContent.trim())),
      "the edited file does not hold what the run was asked to write",
    );

    // Both hand edits really happened, and neither is laid at the agent's door.
    assert.ok(result.handEditLanded, "no hand edit was made while the prompt ran, so nothing was tested");
    const absent = (file, why) =>
      assert.doesNotMatch(result.read.patch, new RegExp("^.*" + literal(file) + ".*$", "m"), why);
    absent(result.handFile, "an edit made before the prompt was shown as its work");
    absent(result.handDuringFile, "an edit made by hand while the prompt ran was shown as its work");
    // Excluded, and named rather than hidden.
    assert.ok(
      (result.read.unattributedPaths ?? []).includes(result.handDuringFile),
      "the concurrent hand edit was dropped without being named",
    );

    // Whatever the run reached for that cannot be followed — a shell, most
    // likely — is named as a gap rather than passed over.
    const followable = new Set(["write", "edit", "read", "grep", "glob", "ast_grep", "think", "todo", "inspect_image"]);
    const opaque = [...new Set(started.map((event) => event.toolName).filter((name) => !followable.has(name)))];
    for (const name of opaque) {
      assert.ok(
        (result.read.incompleteTools ?? []).includes(name),
        name + " ran and was not named as a gap: " + JSON.stringify(result.read.incompleteTools),
      );
    }
  },
);
