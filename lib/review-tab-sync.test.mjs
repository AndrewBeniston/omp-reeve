import assert from "node:assert/strict";
import test from "node:test";
import { ReviewTabSync } from "./review-tab-sync.ts";

const owner = { projectRoot: "/projects/app", worktreePath: "/projects/app/tree", sessionId: "s-1" };
const tab = { tabId: "review:tab", owner, selection: null, active: true };

/** A server that answers when the test says so, and records what it was sent. */
function server() {
  const sent = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  return {
    sent,
    release: (value) => release(value),
    handler: (answer) => async (input, init) => {
      sent.push({ input, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
      return typeof answer === "function" ? answer(input, init) : answer ?? pending;
    },
  };
}

const json = (value, status = 200) => Response.json(value, { status });

test("an answer that arrives after the Project moved on is not this Project's answer", async () => {
  const remote = server();
  const sync = new ReviewTabSync(remote.handler());
  const restoring = sync.restore("/projects/app");
  // The human switches Project while the read is in flight.
  sync.changeProject();
  remote.release(json({ tabs: [tab] }));
  assert.deepEqual(await restoring, { status: "superseded" });

  const opening = sync.open("/projects/other", null);
  sync.changeProject();
  remote.release(json({ tab }));
  assert.deepEqual(await opening, { status: "superseded" });
});

test("a restore that fails says why, and the next attempt still runs", async () => {
  let attempt = 0;
  const sync = new ReviewTabSync(async () => {
    attempt += 1;
    return attempt === 1
      ? json({ error: "Reeve could not read its Review Tabs." }, 503)
      : json({ tabs: [tab] });
  });

  const failed = await sync.restore("/projects/app");
  assert.equal(failed.status, "failed");
  assert.equal(failed.message, "Reeve could not read its Review Tabs.");

  const second = await sync.restore("/projects/app");
  assert.equal(second.status, "ok");
  assert.deepEqual(second.value, [tab]);
});

test("a network that never answers is a failure, not a silent success", async () => {
  const sync = new ReviewTabSync(async () => { throw new Error("offline"); });
  assert.equal((await sync.restore("/projects/app")).status, "failed");
  assert.equal((await sync.open("/projects/app/tree", "s-1")).status, "failed");
  assert.equal((await sync.persist([tab])).status, "failed");
  assert.equal((await sync.close(tab)).status, "failed");
});

test("a save is reported as done only when every Tab was saved", async () => {
  const saved = [];
  const sync = new ReviewTabSync(async (input, init) => {
    const body = JSON.parse(init.body);
    if (body.tabId === "review:second") return json({ error: "What Review is showing could not be saved." }, 500);
    saved.push(body.tabId);
    return json({ tab });
  });

  const result = await sync.persist([tab, { ...tab, tabId: "review:second" }]);
  assert.equal(result.status, "failed");
  assert.deepEqual(saved, ["review:tab"]);

  const both = new ReviewTabSync(async () => json({ tab }));
  assert.deepEqual(await both.persist([tab]), { status: "ok", value: null });
});

test("a Tab closed while its selection was being saved stays closed", async () => {
  const attempted = [];
  const sync = new ReviewTabSync(async (input, init) => {
    attempted.push(init.method);
    // The record has gone, so the server refuses to write one back.
    return json({ error: "Access denied", reason: "unregistered-tab" }, 403);
  });

  // Refused because it no longer exists, which is what closing asked for: the
  // save reports success so the shell does not keep retrying a dead Tab.
  assert.deepEqual(await sync.persist([tab]), { status: "ok", value: null });
  assert.deepEqual(attempted, ["PUT"]);
});

test("a refusal that is not a closed Tab is a save that did not happen", async () => {
  for (const reason of ["denied", "owner-mismatch", "session-mismatch", "project-mismatch"]) {
    const sync = new ReviewTabSync(async () => json({ error: "Access denied", reason }, 403));
    const result = await sync.persist([tab]);
    assert.equal(result.status, "failed", `a ${reason} refusal was recorded as saved`);
    assert.equal(result.message, "Access denied");
  }

  const unreadable = new ReviewTabSync(async () => json({ error: "Reeve could not read its Review Tabs." }, 503));
  const result = await unreadable.persist([tab]);
  assert.equal(result.status, "failed");
  assert.equal(result.message, "Reeve could not read its Review Tabs.");
});

test("every request carries the whole owner", async () => {
  const remote = server();
  const sync = new ReviewTabSync(remote.handler(json({ tab, tabs: [tab] })));
  await sync.persist([tab]);
  await sync.close(tab);

  const [saved, closed] = remote.sent;
  assert.equal(saved.body.tabId, "review:tab");
  assert.equal(saved.body.cwd, "/projects/app/tree");
  assert.equal(saved.body.projectRoot, "/projects/app");
  assert.equal(saved.body.sessionId, "s-1");
  // Whether the panel was showing it travels with the selection, because the
  // browser remembers the panel's width but not whether it was open.
  assert.equal(saved.body.active, true);
  const params = new URL(closed.input, "http://fixture").searchParams;
  assert.equal(params.get("tabId"), "review:tab");
  assert.equal(params.get("cwd"), "/projects/app/tree");
  assert.equal(params.get("projectRoot"), "/projects/app");
  assert.equal(params.get("sessionId"), "s-1");
});
