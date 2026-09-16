import assert from "node:assert/strict";
import test from "node:test";
import { fileRevisionsForPatch } from "./review-git.ts";
import { readPullRequestPreviewSides } from "./review-pr-preview-source.ts";

/** A 1x1 PNG, so a side holds real image bytes rather than text called one. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGE_BASE = "c".repeat(40);
const BLOB = "d".repeat(40);

const REMOTE = { id: "remote-1", remoteName: "origin", host: "github.com", owner: "acme", name: "widgets" };
const SCOPE = { kind: "pullRequest", remoteId: REMOTE.id, number: 7, headSha: HEAD, baseSha: BASE };

const CHANGED_IMAGE = [
  "diff --git a/art/logo.png b/art/logo.png",
  "index 1111111..2222222 100644",
  "Binary files a/art/logo.png and b/art/logo.png differ",
  "",
].join("\n");

const ADDED_IMAGE = [
  "diff --git a/art/new.png b/art/new.png",
  "new file mode 100644",
  "index 0000000..2222222",
  "Binary files /dev/null and b/art/new.png differ",
  "",
].join("\n");

const contents = (revision, filePath = "art/logo.png") =>
  `repos/acme/widgets/contents/${filePath}?ref=${revision}`;
const COMPARE = `repos/acme/widgets/compare/${BASE}...${HEAD}?per_page=1`;

const file = (bytes, overrides = {}) => ({
  type: "file", size: bytes.length, encoding: "base64", content: bytes.toString("base64"), sha: BLOB, ...overrides,
});

/**
 * The host, answering exactly what it is asked for.
 *
 * The calls are kept because half of what this module has to get right is
 * which revision it asked for, and a right-looking answer read at the wrong
 * revision is the failure the pinning exists to prevent.
 */
function host({ patch = CHANGED_IMAGE, revisions = [{ headRefOid: HEAD, baseRefOid: BASE }], api = {} } = {}) {
  const calls = [];
  let read = 0;
  const runner = async (args) => {
    calls.push(args.join(" "));
    if (args[0] === "pr" && args[1] === "view") {
      const answer = revisions[Math.min(read, revisions.length - 1)];
      read += 1;
      return { code: 0, stdout: JSON.stringify(answer), stderr: "" };
    }
    if (args[0] === "pr" && args[1] === "diff") return { code: 0, stdout: patch, stderr: "" };
    if (args[0] === "api") {
      const answer = api[args[3]];
      if (!answer) return { code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };
      return { code: 0, stdout: JSON.stringify(answer), stderr: "" };
    }
    throw new Error(`Unexpected command ${args.join(" ")}`);
  };
  return { runner, calls };
}

const sides = (runner, filePath = "art/logo.png", request = { current: true }, options = {}) =>
  readPullRequestPreviewSides(REMOTE, SCOPE, filePath, request, options, runner);

test("both sides are read at the pinned head and at the revision the patch is against", async () => {
  const { runner, calls } = host({ api: {
    [COMPARE]: { merge_base_commit: { sha: MERGE_BASE } },
    [contents(HEAD)]: file(PNG),
    [contents(MERGE_BASE)]: file(PNG),
  } });

  const result = await sides(runner);
  assert.equal(result.status, "ready");
  assert.equal(result.new.mediaType, "image/png");
  assert.equal(result.new.base64, PNG.toString("base64"));
  assert.equal(result.old.base64, PNG.toString("base64"));
  // The digest is the one the panel is showing, so a preview and a diff
  // cannot be of two different reads of the same file.
  assert.equal(result.revision, fileRevisionsForPatch(CHANGED_IMAGE)["art/logo.png"]);
  // The base branch tip is never read: it moves while a pull request is open,
  // and the before side belongs to the merge base.
  assert.ok(!calls.some((call) => call.includes(contents(BASE))));
});

test("a pull request that moved during the read is refused, not answered", async () => {
  const moved = { headRefOid: "e".repeat(40), baseRefOid: BASE };
  const { runner, calls } = host({ revisions: [{ headRefOid: HEAD, baseRefOid: BASE }, moved], api: {
    [COMPARE]: { merge_base_commit: { sha: MERGE_BASE } },
    [contents(HEAD)]: file(PNG),
    [contents(MERGE_BASE)]: file(PNG),
  } });

  const result = await sides(runner);
  assert.deepEqual(result, { status: "revision-moved" });
  assert.ok(!calls.some((call) => call.includes(`contents/art/logo.png?ref=${"e".repeat(40)}`)));
});

test("a pair that has already moved refuses before anything is read", async () => {
  const { runner, calls } = host({ revisions: [{ headRefOid: "e".repeat(40), baseRefOid: BASE }] });
  assert.deepEqual(await sides(runner), { status: "revision-moved" });
  assert.ok(!calls.some((call) => call.startsWith("pr diff")));
});

test("an added file has no old side and asks for no revision to hold one", async () => {
  const { runner, calls } = host({ patch: ADDED_IMAGE, api: {
    [contents(HEAD, "art/new.png")]: file(PNG),
  } });

  const result = await sides(runner, "art/new.png");
  assert.equal(result.status, "ready");
  assert.equal(result.old, null);
  assert.equal(result.new.bytes, PNG.length);
  assert.ok(!calls.some((call) => call.includes("compare/")));
});

test("a side the host declines to inline is read as the blob it names", async () => {
  const { runner } = host({ patch: ADDED_IMAGE, api: {
    [contents(HEAD, "art/new.png")]: file(PNG, { encoding: "none", content: "" }),
    [`repos/acme/widgets/git/blobs/${BLOB}`]: { content: `${PNG.toString("base64").slice(0, 20)}\n${PNG.toString("base64").slice(20)}`, encoding: "base64" },
  } });

  const result = await sides(runner, "art/new.png");
  assert.equal(result.status, "ready");
  assert.equal(result.new.base64, PNG.toString("base64"));
});

test("a file past the read cap is refused with its size, and its bytes are never carried", async () => {
  const { runner, calls } = host({ patch: ADDED_IMAGE, api: {
    [contents(HEAD, "art/new.png")]: file(PNG, { size: 50 * 1024 * 1024 }),
  } });

  assert.deepEqual(await sides(runner, "art/new.png"), { status: "too-large", bytes: 50 * 1024 * 1024 });
  assert.ok(!calls.some((call) => call.includes("git/blobs/")));
});

test("a shape asked for without bytes reads the size and nothing else", async () => {
  const { runner } = host({ patch: ADDED_IMAGE, api: {
    [contents(HEAD, "art/new.png")]: file(PNG),
  } });

  const result = await sides(runner, "art/new.png", { current: true }, { includeBytes: false });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.new, { mediaType: "image/png", base64: null, bytes: PNG.length });
});

test("a file this review does not hold, and one it cannot preview, each say so", async () => {
  const { runner } = host({ api: { [COMPARE]: { merge_base_commit: { sha: MERGE_BASE } } } });
  assert.deepEqual(await sides(runner, "art/other.png"), { status: "not-in-review" });

  const text = host({ patch: CHANGED_IMAGE.replace(/art\/logo\.png/g, "notes.txt") });
  assert.deepEqual(await sides(text.runner, "notes.txt"), { status: "unsupported" });
});

test("a caller pinned to an older digest is told the file moved", async () => {
  const { runner } = host({ api: {
    [COMPARE]: { merge_base_commit: { sha: MERGE_BASE } },
    [contents(HEAD)]: file(PNG),
    [contents(MERGE_BASE)]: file(PNG),
  } });

  const result = await sides(runner, "art/logo.png", { revision: "an-older-digest" });
  assert.equal(result.status, "stale");
  assert.equal(result.revision, fileRevisionsForPatch(CHANGED_IMAGE)["art/logo.png"]);
});

test("a host that refuses the read leaves the panel with nothing known, not with bytes", async () => {
  const { runner } = host({ api: {} });
  const result = await sides(runner);
  assert.deepEqual(result, { status: "unavailable" });
});
