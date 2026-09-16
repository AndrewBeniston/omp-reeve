import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { captureWorkspaceTree, diffCapturedTrees, filterSafetyArguments } = await jiti.import("./review-turn-capture.ts");

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

// Git also answers from the user's global and system configuration, so a
// machine with Git LFS reports filters this Project never configured. These
// tests point Git at one empty file, and put the environment back after.
let gitConfigRoot;
const savedGitConfig = {};

before(async () => {
  gitConfigRoot = await mkdtemp(join(tmpdir(), "reeve-git-config-"));
  const empty = join(gitConfigRoot, "config");
  await writeFile(empty, "");
  for (const name of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"]) {
    savedGitConfig[name] = process.env[name];
    process.env[name] = empty;
  }
});

after(async () => {
  for (const name of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"]) {
    if (savedGitConfig[name] === undefined) delete process.env[name];
    else process.env[name] = savedGitConfig[name];
  }
  if (gitConfigRoot) await rm(gitConfigRoot, { recursive: true, force: true });
});

function countObjects(directory) {
  let total = 0;
  const walk = (current) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      const next = join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else total += 1;
    }
  };
  walk(directory);
  return total;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "reeve-turn-"));
  const project = join(root, "project");
  const storePath = join(root, "agent", "review-turns", "stores", "span.git");
  await mkdir(project, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "a@b.c"]);
  await git(project, ["config", "user.name", "a"]);
  return { project, storePath };
}

test("a turn too large for one read refuses the way every other scope does", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "big.txt"), "one\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  const before = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  await writeFile(join(project, "big.txt"), "two\n");
  const after = await captureWorkspaceTree({ repositoryRoot: project, storePath });

  // The cap is lowered rather than the diff grown: what is under test is which
  // refusal a diff past the cap produces, not Git's buffering.
  await assert.rejects(
    () =>
      diffCapturedTrees({
        repositoryRoot: project,
        storePath,
        beforeTree: before.tree,
        afterTree: after.tree,
        byteCap: 8,
      }),
    (error) => {
      // The same typed reason, message, and status the other scopes give, so
      // the panel titles it instead of showing a record that appears to have
      // lost its snapshot.
      assert.equal(error.reason, "diff-too-large");
      return true;
    },
  );
});

test("a file the run deleted leaves the captured tree", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "gone.txt"), "bye\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  await rm(join(project, "gone.txt"));

  // `update-index --force-remove` refuses outside a work tree and fails
  // silently here, so without one the file stays in the tree and a deletion
  // never reaches the turn at all.
  const captured = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(captured.kind, "tree");
  const listed = await run("git", ["--git-dir", storePath, "ls-tree", "-r", "--name-only", captured.tree], {
    encoding: "utf8",
    env: { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: join(project, ".git", "objects") },
  });
  assert.equal(listed.stdout.trim(), "", "a deleted file survived into the captured tree");
});

test("a capture reads the working tree without writing to the Project", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "kept.txt"), "one\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  // The human has staged one change and then edited further.
  await writeFile(join(project, "kept.txt"), "staged\n");
  await git(project, ["add", "kept.txt"]);
  await writeFile(join(project, "kept.txt"), "working\n");
  await writeFile(join(project, "fresh.txt"), "new\n");

  const objectsBefore = countObjects(join(project, ".git", "objects"));
  const indexBefore = await readFile(join(project, ".git", "index"));

  const before = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(before.kind, "tree");

  // The agent changes a file that was clean, and the human's state is intact.
  await writeFile(join(project, "kept.txt"), "written by the run\n");
  const after = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(after.kind, "tree");

  assert.equal(countObjects(join(project, ".git", "objects")), objectsBefore, "no object written to the Project");
  assert.deepEqual(await readFile(join(project, ".git", "index")), indexBefore, "the Project index is untouched");
  assert.equal((await git(project, ["show", ":kept.txt"])).stdout, "staged\n");
  assert.equal((await git(project, ["for-each-ref", "--format=%(refname)"])).stdout.trim(), "refs/heads/master");

  const patch = await diffCapturedTrees({
    repositoryRoot: project,
    storePath,
    beforeTree: before.tree,
    afterTree: after.tree,
  });
  assert.equal(patch.kind, "patch");
  assert.match(patch.patch, /kept\.txt/);
  assert.match(patch.patch, /\+written by the run/);
  // fresh.txt stood still across the interval, so it is not part of it.
  assert.doesNotMatch(patch.patch, /fresh\.txt/);
});

test("a clean filter never runs during a capture, including status enumeration", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "a.txt"), "aaaaa\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  const marker = join(project, "filter-ran");
  await git(project, ["config", "filter.evil.clean", `sh -c 'echo x >> ${marker}; cat'`]);
  await writeFile(join(project, ".gitattributes"), "* filter=evil\n");
  // The same byte length as the committed content, so Git cannot decide the
  // file is modified from its size and must hash it — which is where a plain
  // status runs the project's filter.
  await writeFile(join(project, "a.txt"), "bbbbb\n");

  // Prove the fixture is capable of catching the filter before trusting it.
  await git(project, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  assert.equal(existsSync(marker), true, "a plain status is expected to run the filter");
  const invocationsBefore = (await readFile(marker, "utf8")).length;

  const result = await captureWorkspaceTree({ repositoryRoot: project, storePath });

  assert.equal(result.kind, "tree");
  assert.equal(
    (await readFile(marker, "utf8")).length,
    invocationsBefore,
    "an automatic capture must not run a project's own code",
  );
});

test("a converted file is named, not invented as a change", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, ".gitattributes"), "* text=auto\n");
  // Committed with LF, held on disk with CRLF: Git calls this file clean while
  // its bytes differ from its blob.
  await writeFile(join(project, "crlf.txt"), "one\r\ntwo\r\n");
  await writeFile(join(project, "plain.txt"), "steady\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  assert.equal((await git(project, ["status", "--porcelain", "crlf.txt"])).stdout.trim(), "", "fixture must start clean");

  const before = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(before.kind, "tree");

  await writeFile(join(project, "crlf.txt"), "one\r\nthree\r\n");
  await writeFile(join(project, "plain.txt"), "changed\n");
  const after = await captureWorkspaceTree({
    repositoryRoot: project,
    storePath,
    baselineOverlay: before.overlayPaths,
  });
  assert.equal(after.kind, "tree");
  assert.deepEqual(after.skippedPaths, ["crlf.txt"], "a file Git converts must be named as unrepresentable");

  const patch = await diffCapturedTrees({
    repositoryRoot: project,
    storePath,
    beforeTree: before.tree,
    afterTree: after.tree,
  });
  assert.equal(patch.kind, "patch");
  assert.match(patch.patch, /plain\.txt/, "a file with one representation still diffs");
  assert.doesNotMatch(patch.patch, /crlf\.txt/, "a converted file must not appear as an invented change");
});

test("a file the run puts back keeps one representation on both sides", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "a.txt"), "committed\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  // Dirty when the prompt starts, so the baseline holds it as raw bytes.
  await writeFile(join(project, "a.txt"), "edited by hand\n");

  const before = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.deepEqual(before.overlayPaths, ["a.txt"]);

  // The run restores the committed content, so Git now calls the file clean.
  await writeFile(join(project, "a.txt"), "committed\n");
  const after = await captureWorkspaceTree({
    repositoryRoot: project,
    storePath,
    baselineOverlay: before.overlayPaths,
  });

  const patch = await diffCapturedTrees({
    repositoryRoot: project,
    storePath,
    beforeTree: before.tree,
    afterTree: after.tree,
  });
  assert.equal(patch.kind, "patch");
  assert.match(patch.patch, /-edited by hand/, "the interval must show the work being undone");
  assert.match(patch.patch, /\+committed/);
});

test("a configured file-system monitor never runs during a capture", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "a.txt"), "aaaaa\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);

  const marker = join(project, "fsmonitor-ran");
  const hook = join(project, "hook.sh");
  await writeFile(hook, `#!/bin/sh\necho ran >> "${marker}"\nprintf '/\\0'\n`, { mode: 0o755 });
  await git(project, ["config", "core.fsmonitor", hook]);
  await writeFile(join(project, "a.txt"), "bbbbb\n");

  // The fixture must be able to catch the monitor before it is trusted.
  await git(project, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).catch(() => undefined);
  assert.equal(existsSync(marker), true, "a plain status is expected to run the monitor");
  const runsBefore = (await readFile(marker, "utf8")).length;

  const result = await captureWorkspaceTree({ repositoryRoot: project, storePath });

  assert.equal(result.kind, "tree");
  assert.equal(
    (await readFile(marker, "utf8")).length,
    runsBefore,
    "an automatic capture must not start a program the Project configured",
  );
});

test("a linked worktree captures, where its .git is a file rather than a directory", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "a.txt"), "main\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  const linked = join(project, "..", "linked");
  await git(project, ["worktree", "add", "-q", linked, "-b", "side"]);
  assert.equal(statSync(join(linked, ".git")).isFile(), true, "fixture must use a linked worktree");

  const before = await captureWorkspaceTree({ repositoryRoot: linked, storePath });
  assert.equal(before.kind, "tree", "a worktree's objects live in the repository it shares");

  await writeFile(join(linked, "a.txt"), "changed in the worktree\n");
  const after = await captureWorkspaceTree({
    repositoryRoot: linked,
    storePath,
    baselineOverlay: before.overlayPaths,
  });
  assert.equal(after.kind, "tree");

  const patch = await diffCapturedTrees({
    repositoryRoot: linked,
    storePath,
    beforeTree: before.tree,
    afterTree: after.tree,
  });
  assert.equal(patch.kind, "patch");
  assert.match(patch.patch, /\+changed in the worktree/);
});

test("an unborn HEAD captures, and a budget refuses instead of half-capturing", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "first.txt"), "no commits yet\n");

  const unborn = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(unborn.kind, "tree");

  const refused = await captureWorkspaceTree({
    repositoryRoot: project,
    storePath,
    budget: { maxFiles: 0, maxBytes: 1, maxMilliseconds: 1000 },
  });
  assert.deepEqual(refused, { kind: "unavailable", reason: "budget-exceeded" });

  // The deadline of the path a capture serves binds it as well as its own
  // budget, so an opening that has already spent its time captures nothing.
  const late = await captureWorkspaceTree({ repositoryRoot: project, storePath, deadlineAt: Date.now() - 1 });
  assert.deepEqual(late, { kind: "unavailable", reason: "budget-exceeded" });
});

test("a Project whose filter configuration cannot be read is refused, not assumed safe", async () => {
  const { project, storePath } = await fixture();
  await writeFile(join(project, "a.txt"), "one\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);

  // A repository with nothing configured answers that there is nothing to
  // neutralise, which is an empty answer rather than a failure.
  assert.deepEqual(await filterSafetyArguments(project), ["-c", "core.fsmonitor=false"]);

  // One whose configuration cannot be parsed answers nothing at all. Carrying
  // on would leave the Project's own filters live for the commands that
  // follow, so the capture is refused instead.
  await writeFile(join(project, ".git", "config"), "[core\nthis is not configuration\n");
  await assert.rejects(() => filterSafetyArguments(project), /filter configuration could not be read/);

  const result = await captureWorkspaceTree({ repositoryRoot: project, storePath });
  assert.equal(result.kind, "unavailable", "a capture ran against a Project it could not read the filters of");
});
