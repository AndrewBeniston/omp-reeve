import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_FIELDS, reviewOwnerServerStub } from "../owner-stub.mjs";

/**
 * The apply endpoint's own responsibility: resolving a hunk to the one Git
 * will be asked to move, before it is asked to move anything.
 *
 * Which hunk that is, and whether it can be confirmed at all, is decided by
 * `lib/review-apply-request.ts` and tested against real Git there. What is
 * asked here is narrower: does this route resolve at all, does it say which
 * reading the hunk came from, and does a refusal stop the operation rather
 * than being reported beside one that already ran.
 */
function endpoint({ stale = [] } = {}) {
  const calls = [];
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub();
      if (name === "@/lib/review-git") return {
        applyReviewChange: async (...args) => {
          calls.push({ name: "applyReviewChange", args });
          return { status: "success", applied: ["one.txt"], skipped: [], failed: [], stale: [] };
        },
        reviewUnavailableResponse: () => null,
      };
      if (name === "@/lib/review-apply-request") return {
        resolveReviewApplyRequest: async (...args) => {
          calls.push({ name: "resolveReviewApplyRequest", args });
          return { targets: args[2], stale };
        },
      };
      if (name === "@/lib/review-hunk-binding") return { REVIEW_HUNK_TEXT_LIMIT: 3 * 1024 * 1024 };
      if (name === "@/lib/review-operations") return {
        reviewOperationsForScope: () => ["stage", "unstage", "revert"],
      };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return {
    calls,
    post: (body) => exports.POST({ json: async () => ({ ...OWNER_FIELDS, ...body }) }),
  };
}

const HUNK = {
  operation: "stage",
  scope: { kind: "unstaged" },
  targets: [{ path: "one.txt", revision: "digest", hunkIndex: 0, hunkText: "@@ -1,3 +1,4 @@\n context\n+added\n" }],
};

const ran = (calls) => calls.some((call) => call.name === "applyReviewChange");
const resolution = (calls) => calls.find((call) => call.name === "resolveReviewApplyRequest");

test("a hunk that cannot be confirmed is refused before Git is asked", async () => {
  const route = endpoint({ stale: ["one.txt"] });
  const body = await (await route.post(HUNK)).json();

  assert.equal(body.status, "stale");
  assert.deepEqual(body.stale, ["one.txt"]);
  assert.deepEqual(body.applied, []);
  assert.equal(ran(route.calls), false, "nothing was applied");
});

test("a hunk the server can confirm goes through", async () => {
  const route = endpoint();
  const body = await (await route.post(HUNK)).json();

  assert.equal(body.status, "success");
  assert.equal(ran(route.calls), true);
});

test("the reading the hunk was chosen from travels with the request", async () => {
  const hidden = endpoint();
  await hidden.post({ ...HUNK, hideWhitespace: true });
  assert.equal(resolution(hidden.calls).args[3].hideWhitespace, true);

  const shown = endpoint();
  await shown.post(HUNK);
  assert.equal(resolution(shown.calls).args[3].hideWhitespace, false);
});

test("a hunk that carries no text is rejected as a malformed request", async () => {
  const route = endpoint();
  const response = await route.post({ ...HUNK, targets: [{ path: "one.txt", revision: "digest", hunkIndex: 0 }] });

  assert.equal(response.status, 400);
  assert.equal(route.calls.length, 0);
});

test("hunk text that is not a hunk is rejected before anything is read", async () => {
  const route = endpoint();
  const response = await route.post({ ...HUNK, targets: [{ path: "one.txt", revision: "digest", hunkIndex: 0, hunkText: "not a hunk" }] });

  assert.equal(response.status, 400);
  assert.equal(route.calls.length, 0);
});

test("the targets Git is given are the ones resolving produced", async () => {
  const route = endpoint();
  await route.post({ ...HUNK, hideWhitespace: true });
  const applied = route.calls.find((call) => call.name === "applyReviewChange");

  assert.deepEqual(applied.args[3], resolution(route.calls).args[2]);
});
