import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";

/** The typed refusal the Git layer raises when Review cannot run at all. */
class ReviewUnavailableError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "ReviewUnavailableError";
    this.reason = reason;
  }
}

function endpoint({ branches = () => [], allowed = true } = {}) {
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "next/server") return { NextRequest: class {}, NextResponse };
      if (name === "@/lib/file-access") return {
        getAllowedFileRoots: async () => ["/project"],
        isExistingFilePathAllowed: () => allowed,
      };
      if (name === "@/lib/review-git") return {
        readReviewBranches: async () => branches(),
        defaultReviewBase: async () => "refs/remotes/origin/main",
        reviewUnavailableResponse: (error) => error instanceof ReviewUnavailableError
          ? {
              error: error.message,
              reason: error.reason,
              status: error.reason === "git-missing" ? 503 : error.reason === "diff-too-large" ? 413 : 409,
            }
          : null,
      };
      if (name === "@/lib/review-slash-entries") return {
        describeGitUnusable: (stderr) => /Xcode/i.test(stderr)
          ? "Git cannot run until the Xcode licence is accepted. Run `sudo xcodebuild -license` in a terminal, then try again."
          : `Git could not list the branches: ${stderr.trim()}`,
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return (search) => exports.GET({ nextUrl: { searchParams: new URLSearchParams(search) } });
}

test("a directory in a repository answers the gate without asking the remote", async () => {
  const get = endpoint({ branches: () => [{ ref: "refs/heads/work", name: "work", current: true }] });
  const probe = await get("cwd=/project&probe=1");
  assert.equal(probe.status, 200);
  assert.equal((await probe.json()).gitRoot, true);
  const listed = await (await get("cwd=/project")).json();
  assert.deepEqual(listed.branches, ["work"]);
  assert.equal(listed.currentBranch, "work");
});

test("each way Git can fail keeps its own reason and status", async () => {
  // Outside a repository: the gate closes, and says so.
  const outside = await endpoint({
    branches: () => { throw new ReviewUnavailableError("not-a-repository", "This directory is not in a Git repository, so there are no changes to review."); },
  })("cwd=/project&probe=1");
  assert.equal(outside.status, 409);
  assert.equal((await outside.json()).reason, "not-a-repository");

  // Git missing is a different failure and must not read as the first one.
  const missing = await endpoint({
    branches: () => { throw new ReviewUnavailableError("git-missing", "Git was not found on this computer, so changes cannot be read."); },
  })("cwd=/project&probe=1");
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).reason, "git-missing");
});

test("Git running and refusing is explained, not reported as a missing repository", async () => {
  const response = await endpoint({
    branches: () => { throw Object.assign(new Error("git for-each-ref failed"), { stderr: "Agreeing to the Xcode/iOS license requires admin privileges" }); },
  })("cwd=/project&probe=1");
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.reason, "git-unusable");
  assert.match(body.error, /sudo xcodebuild -license/);
});

test("a directory outside the allowed roots is refused before Git runs", async () => {
  const response = await endpoint({ allowed: false, branches: () => { throw new Error("Git should not have run"); } })("cwd=/elsewhere");
  assert.equal(response.status, 403);
});
