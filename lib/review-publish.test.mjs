import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  publishReviewBranch,
  readDefaultBranch,
  readLocalChanges,
  readPublishState,
} from "./review-publish.ts";
import {
  classifyPublishFailure,
  commitFirstProblem,
  forgeForRemoteUrl,
  parseForgeRequestUrl,
  parseRemoteRepository,
  publishVocabulary,
} from "./review-publish-ui.ts";

/**
 * A repository with a bare remote of its own, so pushing and reading the
 * remote back are real. No host is ever reached: the forge tool is a stub.
 */
function fixture(t) {
  const home = mkdtempSync(path.join(tmpdir(), "reeve-publish-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const bare = path.join(home, "remote.git");
  const cwd = path.join(home, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  execFileSync("git", ["init", "-q", "-b", "main", cwd]);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git("add", "."); git("commit", "-qm", "base");
  git("remote", "add", "origin", bare);
  git("push", "-q", "--set-upstream", "origin", "main");
  // What a clone records for itself, which is where the base branch is read from.
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  return { cwd, git, bare };
}

/** A forge tool that answers from a script and records what it was asked. */
function forgeStub(answers = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    const key = `${command} ${args[0]} ${args[1]}`;
    const answer = answers[key] ?? { code: 0, stdout: "[]", stderr: "" };
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { run, calls };
}

test("a remote names its forge, or is left unsupported rather than guessed at", () => {
  assert.equal(forgeForRemoteUrl("git@github.com:owner/repo.git"), "github");
  assert.equal(forgeForRemoteUrl("https://github.com/owner/repo"), "github");
  assert.equal(forgeForRemoteUrl("https://gitlab.com/owner/repo.git"), "gitlab");
  assert.equal(forgeForRemoteUrl("git@gitlab.example.com:owner/repo.git"), "gitlab");
  assert.equal(forgeForRemoteUrl("https://bitbucket.org/owner/repo"), null);
  assert.equal(forgeForRemoteUrl("/srv/git/repo.git"), null);
});

test("GitLab is the same surface relabelled, as the reference has it", () => {
  assert.equal(publishVocabulary("github").noun, "pull request");
  assert.equal(publishVocabulary("gitlab").noun, "merge request");
  assert.match(publishVocabulary("gitlab").draft, /draft merge request/);
  assert.match(publishVocabulary("github").view, /View pull request/);
});

test("the base branch comes from what the clone already recorded", async (t) => {
  const { cwd } = fixture(t);
  assert.equal(await readDefaultBranch(cwd, "origin"), "main");
});

test("state reports the branch, its base, and that the remote has it", async (t) => {
  const { cwd, git } = fixture(t);
  // Renamed after the push, so the reading is real and no host is reached.
  git("remote", "set-url", "origin", "git@github.com:owner/repo.git");
  const { run } = forgeStub();
  const state = await readPublishState(cwd, run);
  assert.equal(state.forge, "github");
  assert.equal(state.head, "main");
  assert.equal(state.base, "main");
  assert.equal(state.headPublished, true);
  assert.equal(state.unpushed, 0);
  assert.equal(state.blocked, null);
});

test("a remote no forge is known for blocks publishing rather than running a tool", async (t) => {
  const { cwd } = fixture(t);
  const { run, calls } = forgeStub();
  const state = await readPublishState(cwd, run);
  assert.equal(state.blocked, "unsupported-remote");
  assert.equal(calls.length, 0);
  /*
   * A read that stopped here measured nothing about the remote. Reporting
   * false would have the form say the remote does not have the branch, which
   * it said even after a verified push.
   */
  assert.equal(state.headPublished, null);
  assert.equal(state.unpushed, null);
});

test("an open request on this branch is offered instead of a second one", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run } = forgeStub({
    "gh pr list": { code: 0, stderr: "", stdout: JSON.stringify([{ number: 7, title: "Already open", url: "https://github.com/owner/repo/pull/7", isDraft: true }]) },
  });
  const state = await readPublishState(cwd, run);
  assert.deepEqual(state.existing, { number: 7, title: "Already open", url: "https://github.com/owner/repo/pull/7", isDraft: true });

  const result = await publishReviewBranch({ cwd, title: "New", body: "", base: "main", draft: false }, run);
  assert.equal(result.status, "exists");
  assert.equal(result.existing.number, 7);
});

test("GitLab reads its own field names for the same answer", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://gitlab.com/owner/repo.git");
  const { run, calls } = forgeStub({
    "glab mr list": { code: 0, stderr: "", stdout: JSON.stringify([{ iid: 3, title: "Open", web_url: "https://gitlab.com/owner/repo/-/merge_requests/3", draft: true }]) },
  });
  const state = await readPublishState(cwd, run);
  assert.equal(state.forge, "gitlab");
  assert.equal(state.existing.number, 3);
  assert.equal(state.existing.isDraft, true);
  assert.deepEqual(calls[0].args, ["mr", "list", "--repo", "https://gitlab.com/owner/repo", "--source-branch", "main", "--output", "json"]);
});

test("a created pull request is read back from the URL the tool printed", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run, calls } = forgeStub({
    "gh pr create": { code: 0, stderr: "", stdout: "https://github.com/owner/repo/pull/12\n" },
  });
  const result = await publishReviewBranch({ cwd, title: "A change", body: "Why.", base: "main", draft: true }, run);
  assert.equal(result.status, "published");
  assert.equal(result.number, 12);
  assert.equal(result.url, "https://github.com/owner/repo/pull/12");
  assert.equal(result.draft, true);
  const create = calls.find((call) => call.args[1] === "create");
  assert.deepEqual(create.args, ["pr", "create", "--repo", "github.com/owner/repo", "--base", "main", "--head", "main", "--title", "A change", "--body", "Why.", "--draft"]);
  // The listing and the creation are bound to the same repository, which is
  // what a checkout with more than one remote depends on.
  const list = calls.find((call) => call.args[1] === "list");
  assert.deepEqual(list.args.slice(2, 4), create.args.slice(2, 4));
});

test("a draft merge request is the same act with GitLab words", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://gitlab.com/owner/repo.git");
  const { run, calls } = forgeStub({
    "glab mr create": { code: 0, stderr: "", stdout: "https://gitlab.com/owner/repo/-/merge_requests/4\n" },
  });
  const result = await publishReviewBranch({ cwd, title: "A change", body: "Why.", base: "main", draft: true }, run);
  assert.equal(result.status, "published");
  assert.equal(result.number, 4);
  const create = calls.find((call) => call.args[1] === "create");
  assert.deepEqual(create.args, ["mr", "create", "--repo", "https://gitlab.com/owner/repo", "--source-branch", "main", "--target-branch", "main", "--title", "A change", "--description", "Why.", "--yes", "--draft"]);
});

test("a listing that cannot be read leaves publishing unavailable, never open", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  // An empty body, a shape that is not a list, a list holding something that
  // is not a request, and a request that cannot be identified.
  const unreadable = [
    "",
    "   ",
    "not json at all",
    JSON.stringify({ number: 5 }),
    JSON.stringify([null]),
    JSON.stringify([false]),
    JSON.stringify([42]),
    JSON.stringify(["https://github.com/owner/repo/pull/1"]),
    JSON.stringify([["number", 1]]),
    JSON.stringify([{ title: "No identity" }]),
    JSON.stringify([{ number: 4, url: "https://github.com/owner/repo/pull/9" }]),
  ];
  for (const stdout of unreadable) {
    const { run, calls } = forgeStub({ "gh pr list": { code: 0, stdout, stderr: "" } });
    const state = await readPublishState(cwd, run);
    assert.equal(state.existing, null);
    assert.equal(state.blocked, "unavailable", `unreadable listing: ${stdout || "(empty)"}`);
    const result = await publishReviewBranch({ cwd, title: "A change", body: "", base: "main", draft: false }, run);
    assert.equal(result.status, "blocked");
    assert.equal(result.blocked, "unavailable");
    assert.equal(calls.some((call) => call.args[1] === "create"), false);
  }
});

test("an empty list is the one answer that means there is no request", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run } = forgeStub({ "gh pr list": { code: 0, stdout: "[]", stderr: "" } });
  const state = await readPublishState(cwd, run);
  assert.equal(state.existing, null);
  assert.equal(state.blocked, null);
});

test("only this repository's own request URL is accepted, and only in its own shape", () => {
  const repository = parseRemoteRepository("https://github.com/owner/repo.git");
  assert.deepEqual(repository, { host: "github.com", port: "", owner: "owner", name: "repo" });
  const accepted = parseForgeRequestUrl("github", repository, "https://github.com/owner/repo/pull/12");
  assert.deepEqual(accepted, { number: 12, url: "https://github.com/owner/repo/pull/12" });

  for (const rejected of [
    "http://github.com/owner/repo/pull/12",
    "https://user:secret@github.com/owner/repo/pull/12",
    "https://github.com:8443/owner/repo/pull/12",
    "https://github.com/owner/repo/issues/12",
    "https://github.com/owner/repo/pull/12/files",
    "https://github.com/owner/repo/pull/twelve",
    "https://github.com/owner/repo/pull/12?tab=files",
    "https://github.com/someone/other/pull/12",
    "https://github.com/owner/repo",
    "not a url",
  ]) {
    assert.equal(parseForgeRequestUrl("github", repository, rejected), null, rejected);
  }
});

test("a self-hosted host keeps its port, and only that port", () => {
  const repository = parseRemoteRepository("https://gitlab.example.com:8443/group/sub/repo.git");
  assert.deepEqual(repository, { host: "gitlab.example.com", port: "8443", owner: "group/sub", name: "repo" });
  assert.deepEqual(
    parseForgeRequestUrl("gitlab", repository, "https://gitlab.example.com:8443/group/sub/repo/-/merge_requests/5"),
    { number: 5, url: "https://gitlab.example.com:8443/group/sub/repo/-/merge_requests/5" },
  );
  assert.equal(parseForgeRequestUrl("gitlab", repository, "https://gitlab.example.com/group/sub/repo/-/merge_requests/5"), null);
  // The other forge's path shape is not this one's.
  assert.equal(parseForgeRequestUrl("gitlab", repository, "https://gitlab.example.com:8443/group/sub/repo/pull/5"), null);
});

test("a request listed for another repository is not read as there being none", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run } = forgeStub({
    "gh pr list": { code: 0, stderr: "", stdout: JSON.stringify([{ number: 9, title: "Elsewhere", url: "https://github.com/someone/other/pull/9", isDraft: false }]) },
  });
  const state = await readPublishState(cwd, run);
  assert.equal(state.existing, null);
  assert.equal(state.blocked, "unavailable");
});

test("a created URL outside the bound repository is reported as unknown", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run } = forgeStub({
    "gh pr create": { code: 0, stderr: "", stdout: "https://github.com/someone/other/pull/3\n" },
  });
  const result = await publishReviewBranch({ cwd, title: "A change", body: "", base: "main", draft: false }, run);
  assert.equal(result.status, "uncertain");
});

test("a branch the remote does not have is refused rather than pushed from here", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  git("checkout", "-q", "-b", "codex/local-only");
  const { run, calls } = forgeStub();
  const result = await publishReviewBranch({ cwd, title: "A change", body: "", base: "main", draft: false }, run);
  assert.equal(result.status, "refused");
  assert.equal(result.refusal, "head-not-published");
  assert.equal(calls.some((call) => call.args[1] === "create"), false);
});

test("a tool that was cut off is reported as unknown, never sent again", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run, calls } = forgeStub({
    "gh pr create": { code: 1, stdout: "", stderr: "", timedOut: true },
  });
  const result = await publishReviewBranch({ cwd, title: "A change", body: "", base: "main", draft: false }, run);
  assert.equal(result.status, "uncertain");
  assert.equal(calls.filter((call) => call.args[1] === "create").length, 1);
});

test("exit zero without a URL is not a promise that one was created", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  const { run } = forgeStub({ "gh pr create": { code: 0, stdout: "done\n", stderr: "" } });
  const result = await publishReviewBranch({ cwd, title: "A change", body: "", base: "main", draft: false }, run);
  assert.equal(result.status, "uncertain");
});

test("a refusal is named only from what the tool said", () => {
  assert.equal(classifyPublishFailure({ code: 1, stdout: "", stderr: "a pull request already exists for owner:branch" }), "already-exists");
  assert.equal(classifyPublishFailure({ code: 1, stdout: "", stderr: "No commits between main and main" }), "no-commits");
  assert.equal(classifyPublishFailure({ code: 1, stdout: "", stderr: "gh auth login required" }), "auth-required");
  assert.equal(classifyPublishFailure({ code: 1, stdout: "", stderr: "disk full" }), null);
});

test("local changes are counted, tracked and untracked alike", async (t) => {
  const { cwd, git } = fixture(t);
  assert.deepEqual((await readLocalChanges(cwd)).paths, []);
  writeFileSync(path.join(cwd, "base.txt"), "edited\n");
  writeFileSync(path.join(cwd, "fresh.txt"), "new\n");
  git("add", "fresh.txt");
  writeFileSync(path.join(cwd, "loose.txt"), "loose\n");
  assert.deepEqual((await readLocalChanges(cwd)).paths, ["base.txt", "fresh.txt", "loose.txt"]);
});

test("the snapshot digest moves when a tracked change is edited again", async (t) => {
  const { cwd } = fixture(t);
  const clean = await readLocalChanges(cwd);
  writeFileSync(path.join(cwd, "base.txt"), "one\n");
  const first = await readLocalChanges(cwd);
  writeFileSync(path.join(cwd, "base.txt"), "two\n");
  const second = await readLocalChanges(cwd);
  assert.notEqual(first.digest, clean.digest);
  // The same path, different content: a commit here would carry work the form
  // never showed, so the digest has to differ.
  assert.deepEqual(first.paths, second.paths);
  assert.notEqual(first.digest, second.digest);
});

test("state reports what is local and the digest it was read with", async (t) => {
  const { cwd, git } = fixture(t);
  git("remote", "set-url", "origin", "https://github.com/owner/repo.git");
  writeFileSync(path.join(cwd, "base.txt"), "edited\n");
  const { run } = forgeStub();
  const state = await readPublishState(cwd, run);
  assert.equal(state.uncommitted, 1);
  assert.equal(state.snapshot, (await readLocalChanges(cwd)).digest);
});

test("a commit problem is named from what the commit reported", () => {
  assert.match(commitFirstProblem({ status: "refused", refusal: "untrusted-project" }), /Trust this Project/);
  assert.match(commitFirstProblem({ status: "refused", refusal: "stale-index" }), /moved while they were committed/);
  assert.match(commitFirstProblem({ status: "failed", failure: "identity-missing" }), /name and email/);
  assert.match(commitFirstProblem({ status: "failed", failure: "hook-rejected" }), /commit hook refused/);
  // Every one of them says the same last thing, because it is the same truth.
  for (const result of [{ status: "refused", refusal: "no-changes" }, { status: "failed", failure: "unknown" }]) {
    assert.match(commitFirstProblem(result), /Nothing was published\.$/);
  }
});

test("an untracked file edited at the same path moves the digest", async (t) => {
  const { cwd } = fixture(t);
  writeFileSync(path.join(cwd, "fresh.txt"), "one\n");
  const first = await readLocalChanges(cwd);
  writeFileSync(path.join(cwd, "fresh.txt"), "two\n");
  const second = await readLocalChanges(cwd);
  // The listing alone cannot tell these apart, and a commit would carry the
  // second content under the first snapshot.
  assert.deepEqual(first.paths, ["fresh.txt"]);
  assert.deepEqual(second.paths, ["fresh.txt"]);
  assert.notEqual(first.digest, second.digest);
});

test("a link out of the repository is read by its target path, never by its content", async (t) => {
  const { cwd } = fixture(t);
  const outside = path.join(mkdtempSync(path.join(tmpdir(), "reeve-outside-")), "secret.txt");
  writeFileSync(outside, "first\n");
  symlinkSync(outside, path.join(cwd, "link.txt"));
  const first = await readLocalChanges(cwd);
  writeFileSync(outside, "second, and much longer\n");
  const second = await readLocalChanges(cwd);
  // The bytes outside the repository are not read, so they cannot move it.
  assert.equal(first.digest, second.digest);
  rmSync(path.join(cwd, "link.txt"));
  symlinkSync(path.join(outside, "..", "other.txt"), path.join(cwd, "link.txt"));
  // The link itself is part of the change, so its own target does move it.
  assert.notEqual((await readLocalChanges(cwd)).digest, first.digest);
});

test("a staged content the working tree does not hold is covered as well", async (t) => {
  const { cwd, git } = fixture(t);
  writeFileSync(path.join(cwd, "base.txt"), "staged one\n");
  git("add", "base.txt");
  writeFileSync(path.join(cwd, "base.txt"), "working\n");
  const first = await readLocalChanges(cwd);
  writeFileSync(path.join(cwd, "base.txt"), "staged two\n");
  git("add", "base.txt");
  writeFileSync(path.join(cwd, "base.txt"), "working\n");
  const second = await readLocalChanges(cwd);
  // The listing says MM both times, and the working tree is the same text.
  // Only the index moved, and the snapshot has to say so.
  assert.notEqual(first.digest, second.digest);
});

test("more untracked files than a review reads leave no snapshot at all", async (t) => {
  const { cwd } = fixture(t);
  for (let index = 0; index <= 256; index += 1) writeFileSync(path.join(cwd, `new-${index}.txt`), "x\n");
  const local = await readLocalChanges(cwd);
  assert.equal(local.paths.length, 257);
  // No digest, so the form offers no commit and the server matches nothing.
  assert.equal(local.digest, "");
});
