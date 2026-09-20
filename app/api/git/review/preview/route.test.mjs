import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { createJiti } from "jiti";
import { OWNER_FIELDS, OWNER_QUERY, reviewOwnerServerStub } from "../owner-stub.mjs";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const previewModule = await jiti.import("@/lib/review-preview");
const scopeModule = await jiti.import("@/lib/review-scope-request");

/**
 * The route, with only its readers replaced.
 *
 * The suffix rule and the scope parsing are the real ones, because what this
 * asks is whether the route refuses a kind it must never put on this origin,
 * and a stubbed suffix rule would answer for the stub instead.
 */
function endpoint(sides, pullRequest = {}) {
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const calls = { git: 0, host: 0 };
  vm.runInNewContext(code, {
    exports, Buffer, URL, URLSearchParams,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/file-access") return {
        getAllowedFileRoots: async () => ["/project"],
        isFilePathAllowed: () => true,
        isExistingFilePathAllowed: () => true,
      };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub({});
      if (name === "@/lib/review-commit-git") return { repositoryRoot: async () => "/project" };
      if (name === "@/lib/review-git") return {
        isGitReadableScope: (scope) => scope.kind !== "lastTurn",
        reviewUnavailableResponse: () => null,
      };
      if (name === "@/lib/review-preview-source") return { readReviewPreviewSides: async () => { calls.git += 1; return sides; } };
      if (name === "@/lib/review-github") return {
        resolveRepositoryRoot: async () => "/project",
        resolveRemote: async () => pullRequest.remote ?? null,
      };
      if (name === "@/lib/review-pr-preview-source") return {
        readPullRequestPreviewSides: async () => { calls.host += 1; return pullRequest.sides ?? { status: "unavailable" }; },
      };
      if (name === "@/lib/review-preview") return previewModule;
      if (name === "@/lib/review-scope-request") return scopeModule;
      throw new Error("Unexpected import " + name);
    },
  });
  return { ...exports, calls };
}

const PDF = Buffer.from("%PDF-1.4 fixture", "utf8").toString("base64");
const SVG = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "utf8").toString("base64");
const ready = (side) => ({ status: "ready", revision: "r1", old: null, new: side });
const get = (route, path, side = "new") =>
  route.GET({ nextUrl: new URL(`http://x/api/git/review/preview?${OWNER_QUERY}&scopeKind=uncommitted&path=${encodeURIComponent(path)}&side=${side}`) });

/** The pull request a panel is pinned to, as a request names one. */
const PR_QUERY = [
  "scopeKind=pullRequest",
  "scopeRemoteId=remote-1",
  "scopeNumber=7",
  `scopeHeadSha=${"a".repeat(40)}`,
  `scopeBaseSha=${"b".repeat(40)}`,
].join("&");
const PR_SCOPE = { kind: "pullRequest", remoteId: "remote-1", number: 7, headSha: "a".repeat(40), baseSha: "b".repeat(40) };
const REMOTE = { id: "remote-1", remoteName: "origin", host: "github.com", owner: "acme", name: "widgets" };
const getPr = (route, path) =>
  route.GET({ nextUrl: new URL(`http://x/api/git/review/preview?${OWNER_QUERY}&${PR_QUERY}&path=${encodeURIComponent(path)}&side=new`) });

test("a PDF is served, stated as a PDF and shown in place", async () => {
  const route = endpoint(ready({ mediaType: "application/pdf", base64: PDF, bytes: 16 }));
  const response = await get(route, "docs/spec.pdf");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString("base64"), PDF);
});

test("an SVG is refused, because serving one here would be a same-origin document", async () => {
  // The bytes below carry script. Returned inside JSON and drawn in an img
  // they execute nothing; served inline from this origin they would run as
  // Reeve. The suffix is refused before anything is read.
  const route = endpoint(ready({ mediaType: "image/svg+xml", base64: SVG, bytes: 70 }));
  const response = await get(route, "art/mark.svg");
  assert.equal(response.status, 404);
  const body = await response.text();
  assert.doesNotMatch(body, /svg|script|alert/i);
});

test("a PDF name carrying another type is refused on the side's own type", async () => {
  // A rename can put an SVG at a path ending .pdf, so passing the suffix
  // check is not passing the check.
  const route = endpoint(ready({ mediaType: "image/svg+xml", base64: SVG, bytes: 70 }));
  const response = await get(route, "art/renamed.pdf");
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /svg|script|alert/i);
});

test("markdown and images are refused too: only a framed kind is served here", async () => {
  for (const path of ["notes.md", "art/logo.png", "lib/index.ts"]) {
    const route = endpoint(ready({ mediaType: "text/markdown", base64: PDF, bytes: 16 }));
    assert.equal((await get(route, path)).status, 404, path);
  }
});

test("a pull request PDF is served from the host read, never from the Project", async () => {
  // The Project holds no revision of a pull request. A Git read here would
  // answer with whatever the working tree happens to have at that path.
  const route = endpoint(ready({ mediaType: "application/pdf", base64: PDF, bytes: 16 }), {
    remote: REMOTE, sides: ready({ mediaType: "application/pdf", base64: PDF, bytes: 16 }),
  });
  const response = await getPr(route, "docs/spec.pdf");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString("base64"), PDF);
  assert.equal(route.calls.host, 1);
  assert.equal(route.calls.git, 0);
});

test("a pull request preview is read as the whole answer a POST asks for", async () => {
  const answer = { status: "ready", revision: "r1", old: null, new: { mediaType: "image/png", base64: "AAAA", bytes: 3 } };
  const route = endpoint(ready(null), { remote: REMOTE, sides: answer });
  const response = await route.POST({ json: async () => ({ ...OWNER_FIELDS, scope: PR_SCOPE, path: "art/logo.png", current: true }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), answer);
  assert.equal(route.calls.git, 0);
});

test("a pull request naming a remote this Project does not have is refused", async () => {
  const route = endpoint(ready(null), { remote: null });
  const response = await getPr(route, "docs/spec.pdf");
  assert.equal(response.status, 400);
  assert.equal(route.calls.host, 0);
  assert.equal(route.calls.git, 0);
});

test("a pull request scope missing half its pair is not a scope at all", async () => {
  const route = endpoint(ready(null), { remote: REMOTE });
  const url = `http://x/api/git/review/preview?${OWNER_QUERY}&scopeKind=pullRequest&scopeRemoteId=remote-1&scopeNumber=7&scopeHeadSha=${"a".repeat(40)}&path=docs%2Fspec.pdf&side=new`;
  const response = await route.GET({ nextUrl: new URL(url) });
  assert.equal(response.status, 400);
  assert.equal(route.calls.host, 0);
});
