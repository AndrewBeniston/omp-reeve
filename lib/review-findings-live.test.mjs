import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * A finding written by a real model, rather than by this test.
 *
 * Every other test of this area supplies the directive itself, which proves the
 * parsing and the placement and nothing about whether a model asked in Reeve's
 * own words writes one. This runs the composed review prompt through
 * `startRpcSession`, the path the browser uses, against a model the machine
 * really has, and reads the findings back.
 *
 * It is opt-in, and it names nothing of its own. A real prompt costs time and
 * reaches a model endpoint, so this runs only when REEVE_LIVE_BASE_URL and
 * REEVE_LIVE_MODEL_ID both say where to send it.
 */
const enabled = Boolean(process.env.REEVE_LIVE_BASE_URL && process.env.REEVE_LIVE_MODEL_ID);

test(
  "a real review turn puts a finding on the line it reviewed",
  {
    skip: enabled ? false : "set REEVE_LIVE_BASE_URL and REEVE_LIVE_MODEL_ID to run a real model turn",
    timeout: 600_000,
  },
  async () => {
    const { stdout } = await run(
      process.env.REEVE_LIVE_RUNTIME ?? "bun",
      [new URL("./review-findings-live-fixture.mjs", import.meta.url).pathname],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 540_000 },
    );
    const line = stdout.split("\n").find((entry) => entry.startsWith("LIVE_RESULT"));
    assert.ok(line, "the live fixture printed no result:\n" + stdout);
    const result = JSON.parse(line.slice("LIVE_RESULT".length));
    assert.equal(result.error, undefined, "the live fixture failed: " + result.error);

    // The request was recorded, and the turn really reached a model.
    assert.equal(result.recorded, true);
    assert.ok(result.eventTypes.includes("turn_end"), "no turn ended: " + JSON.stringify(result.eventTypes));
    assert.ok(result.answerCount > 0, "the model wrote no answer at all");

    // The model wrote the directive Reeve asked for, and Reeve read it.
    assert.ok(result.directiveSightings > 0, "the answer carried no directive:\n" + result.answerExtract);
    assert.equal(result.read.kind, "findings", "the read returned nothing: " + JSON.stringify(result.read));
    assert.equal(result.read.boundToRequest, true, "the finding was bound to another request");
    assert.ok(result.read.findings.length > 0);

    // It landed on the file under review, on a line that diff really showed.
    const [finding] = result.read.findings;
    assert.equal(finding.path, result.reviewedFile);
    const [placement] = result.placements;
    assert.equal(placement.state, "anchored", "the finding was not placed: " + JSON.stringify(placement));
    assert.equal(placement.startLine, finding.startLine);
  },
);
