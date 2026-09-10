import assert from "node:assert/strict";
import test from "node:test";

const {
  buildProjectChoices,
  filterProjectChoices,
  projectEnvironmentFromWorktrees,
  projectLabel,
  projectSlug,
  rememberAddedProjectPath,
} = await import("./project-selection.ts");

const session = (id, cwd, projectRoot, modified) => ({
  id,
  path: `/sessions/${id}.jsonl`,
  cwd,
  projectRoot,
  created: modified,
  modified,
  messageCount: 1,
  firstMessage: id,
});

test("keeps filesystem roots visible and formats folder names for people", () => {
  assert.equal(projectSlug("/"), "/");
  assert.equal(projectLabel("/"), "/");
  assert.equal(projectLabel("/repos/omp-cwd-design-fixture"), "OMP Cwd Design Fixture");
});

test("builds ordered local project choices from Sessions, added paths, and the selected project", () => {
  const choices = buildProjectChoices({
    sessions: [
      session("main", "/repos/omp-web", "/repos/omp-web", "2026-01-03T00:00:00Z"),
      session("worktree", "/repos/omp-web-worktrees/feature", "/repos/omp-web", "2026-01-02T00:00:00Z"),
      session("help", "/repos/help-self", "/repos/help-self", "2026-01-01T00:00:00Z"),
      session("chat", "/Users/example/omp-cwd-20260907", "/Users/example/omp-cwd-20260907", "2026-01-04T00:00:00Z"),
    ],
    addedPaths: ["/repos/new-project"],
    projectOrder: ["/repos/help-self", "/repos/omp-web"],
    removedProjectKeys: new Set(),
    selectedPath: "/repos/omp-web",
  });

  assert.deepEqual(choices.map((choice) => choice.path), [
    "/repos/new-project",
    "/repos/help-self",
    "/repos/omp-web",
  ]);
  assert.equal(choices[2].label, "OMP Web");
  assert.equal(choices[2].slug, "omp-web");
  assert.equal(choices[2].selected, true);
});

test("filters hidden projects and searches labels, slugs, and complete paths", () => {
  const choices = buildProjectChoices({
    sessions: [
      session("one", "/repos/help-self", "/repos/help-self", "2026-01-02T00:00:00Z"),
      session("two", "/work/client/Photo Augmentation", "/work/client/Photo Augmentation", "2026-01-01T00:00:00Z"),
    ],
    addedPaths: [],
    projectOrder: [],
    removedProjectKeys: new Set(["/repos/help-self"]),
    selectedPath: null,
  });

  assert.deepEqual(choices.map((choice) => choice.path), ["/work/client/Photo Augmentation"]);
  assert.equal(filterProjectChoices(choices, "photo").length, 1);
  assert.equal(filterProjectChoices(choices, "/work/client").length, 1);
  assert.equal(filterProjectChoices(choices, "missing").length, 0);
});

test("maps local main and worktree paths to their branch labels", () => {
  const response = {
    isGit: true,
    projectRoot: "/repos/omp-web",
    worktrees: [
      { path: "/repos/omp-web", branch: "main", isMain: true },
      { path: "/repos/omp-web-worktrees/feature", branch: "feature/card", isMain: false },
    ],
  };

  assert.deepEqual(projectEnvironmentFromWorktrees("/repos/omp-web", response), {
    environment: "Local",
    branch: "main",
    projectRoot: "/repos/omp-web",
  });
  assert.deepEqual(projectEnvironmentFromWorktrees("/repos/omp-web-worktrees/feature", response), {
    environment: "Worktree",
    branch: "feature/card",
    projectRoot: "/repos/omp-web",
  });
  assert.deepEqual(projectEnvironmentFromWorktrees("/tmp/plain", { isGit: false, worktrees: [] }), {
    environment: "Local",
    branch: null,
    projectRoot: null,
  });
});

test("adding a removed project restores it across both project entry points", () => {
  const values = new Map([
    ["reeve:added-project-paths", JSON.stringify(["/repos/old"])],
    ["omp-web:removed-projects", JSON.stringify(["/repos/new", "/repos/hidden"])],
  ]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };

  rememberAddedProjectPath(storage, "/repos/new");

  assert.deepEqual(JSON.parse(values.get("reeve:added-project-paths")), ["/repos/new", "/repos/old"]);
  assert.deepEqual(JSON.parse(values.get("omp-web:removed-projects")), ["/repos/hidden"]);
});
