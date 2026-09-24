import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, click, typeInto, settle, focused, DomEvent } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { GoalSetDialog } = await jiti.import("./GoalSetDialog.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;
const existingGoal = { id: "first", objective: "Old work", status: "active", tokensUsed: 12, timeUsedSeconds: 4, createdAt: 1000, updatedAt: 1000 };
const pausedGoal = { ...existingGoal, status: "paused" };

function dialog(props) {
  return h(I18nProvider, null, h(GoalSetDialog, { onClose() {}, onSubmit: async () => {}, ...props }));
}

async function open(props) {
  const view = await mount(dialog(props));
  const root = view.container.ownerDocument.body.querySelectorAll('[role="dialog"]').at(-1);
  assert.ok(root);
  return { view, root, objective: root.querySelector("textarea"), budget: root.querySelector('#goal-budget') };
}

test("a Goal requires an objective and explains its optional hard token budget", async () => {
  const { view, root, objective, budget } = await open();
  try {
    assert.equal(focused(), objective);
    assert.equal(objective.getAttribute("placeholder"), "Describe your goal, define measurable outcomes for best results");
    assert.equal(objective.getAttribute("required"), "");
    assert.match(root.textContent, /hard OMP Goal budget/i);
    assert.match(root.textContent, /context window/i);
    assert.equal(budget.value, "");
    assert.equal(budget.getAttribute("placeholder"), "No limit");
  } finally { await view.unmount(); }
});

test("a Goal with no limit sends no token budget", async () => {
  const submissions = [];
  const { view, root, objective } = await open({ onSubmit: async (...args) => submissions.push(args) });
  try {
    await typeInto(objective, "Finish the film");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.deepEqual(submissions, [[{ objective: "Finish the film" }, "create"]]);
  } finally { await view.unmount(); }
});

test("a Goal sends prepared Composer images with its creating Turn", async () => {
  const submissions = [];
  const image = { data: "aW1hZ2U=", mimeType: "image/png", previewUrl: "blob:goal-image" };
  const { view, root, objective } = await open({
    initialAttachments: [image],
    onSubmit: async (...args) => submissions.push(args),
  });
  try {
    assert.equal(root.querySelectorAll('[role="listitem"]').length, 1);
    await typeInto(objective, "Finish the film");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.deepEqual(submissions, [[{ objective: "Finish the film", attachments: [image] }, "create"]]);
  } finally { await view.unmount(); }
});

test("Goal submission failure preserves the draft and attachments", async () => {
  const submissions = [];
  const image = { data: "aW1hZ2U=", mimeType: "image/png", previewUrl: "blob:goal-image" };
  const { view, root, objective } = await open({
    initialAttachments: [image],
    onSubmit: async (...args) => { submissions.push(args); throw new Error("Failed to prepare goal attachments"); },
  });
  try {
    await typeInto(objective, "Keep this draft");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.equal(objective.value, "Keep this draft");
    assert.equal(root.querySelectorAll('[role="listitem"]').length, 1);
    assert.match(root.textContent, /Failed to prepare goal attachments/);
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.equal(submissions.length, 2);
  } finally {
    await view.unmount();
  }
});

test("a Goal accepts positive whole token budgets and rejects other values", async () => {
  const submissions = [];
  const { view, root, objective, budget } = await open({ onSubmit: async (...args) => submissions.push(args) });
  try {
    await typeInto(objective, "Finish the film");
    for (const invalid of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
      await typeInto(budget, invalid);
      await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
      assert.match(root.textContent, /positive whole number/i);
      assert.equal(submissions.length, 0);
    }
    await typeInto(budget, "200000");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.deepEqual(submissions, [[{ objective: "Finish the film", tokenBudget: 200000 }, "create"]]);
  } finally { await view.unmount(); }
});

test("an existing Goal requires explicit replacement confirmation", async () => {
  const submissions = [];
  const { view, root, objective } = await open({ existingGoal, onSubmit: async (...args) => submissions.push(args) });
  try {
    await typeInto(objective, "New work");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.equal(submissions.length, 0);
    assert.match(root.textContent, /Replace current goal\?/);
    assert.match(root.textContent, /New work/);
    await click(root.querySelector('button[type="button"][data-action="cancel-replace"]'));
    assert.equal(submissions.length, 0);
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    await click(root.querySelector('button[type="button"][data-action="confirm-replace"]'));
    await settle();
    assert.deepEqual(submissions, [[{ objective: "New work" }, "replace"]]);
  } finally { await view.unmount(); }
});

test("a paused Goal shows OMP's replacement reason", async () => {
  const submissions = [];
  const { view, root, objective } = await open({
    existingGoal: pausedGoal,
    onSubmit: async (...args) => {
      submissions.push(args);
      throw new Error("Only an active Goal can be replaced.");
    },
  });
  try {
    await typeInto(objective, "New work");
    await React.act(async () => { root.querySelector('form').dispatchEvent(new DomEvent('submit', { bubbles: true, cancelable: true })); });
    assert.equal(submissions.length, 0);
    assert.match(root.textContent, /Replace current goal\?/);
    await click(root.querySelector('button[type="button"][data-action="confirm-replace"]'));
    await settle();
    assert.match(root.textContent, /Only an active Goal can be replaced/);
  } finally { await view.unmount(); }
});

test("the creating message retains its Goal marker after Session reload", async () => {
  const { buildSessionContext } = await jiti.import("../../lib/session-reader.ts");
  const timestamp = "2026-09-23T12:00:00.000Z";
  const entries = [
    { type: "custom", customType: "goal-message", data: { objective: "Finish the film" }, id: "marker", parentId: null, timestamp },
    { type: "message", id: "goal-user", parentId: "marker", timestamp, message: { role: "user", content: [
      { type: "text", text: "Finish the film" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } },
    ], timestamp: Date.parse(timestamp) } },
    { type: "message", id: "next-user", parentId: "goal-user", timestamp, message: { role: "user", content: "Continue", timestamp: Date.parse(timestamp) } },
  ];
  const { messages, entryIds } = buildSessionContext(entries);
  assert.deepEqual(entryIds, ["goal-user", "next-user"]);
  assert.equal(messages[0].sentAsGoal, true);
  assert.deepEqual(messages[0].content, [
    { type: "text", text: "Finish the film" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } },
  ]);
  assert.notEqual(messages[1].sentAsGoal, true);
});

test("an orphan Goal marker never marks a different user message", async () => {
  const { buildSessionContext } = await jiti.import("../../lib/session-reader.ts");
  const timestamp = "2026-09-23T12:00:00.000Z";
  const entries = [
    { type: "custom", customType: "goal-message", data: { objective: "Finish the film" }, id: "marker", parentId: null, timestamp },
    { type: "message", id: "different-user", parentId: "marker", timestamp, message: { role: "user", content: "Ask another thing", timestamp: Date.parse(timestamp) } },
  ];
  assert.notEqual(buildSessionContext(entries).messages[0].sentAsGoal, true);
});

test("Goal retry reuses the created Goal and sends its marked message with images", async () => {
  const { useAgentSession } = await jiti.import("../../hooks/useAgentSession.ts");
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  const commands = [];
  let promptAttempts = 0;
  const created = { ...existingGoal, id: "new", objective: "Finish the film", tokenBudget: 200000, updatedAt: 2000 };
  const image = { data: "aW1hZ2U=", mimeType: "image/png", previewUrl: "blob:goal-image" };
  class ConnectedEventSource {
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 1;
    constructor() { queueMicrotask(() => this.onmessage?.({ data: '{"type":"connected"}' })); }
    close() { this.readyState = 2; }
  }
  globalThis.EventSource = ConnectedEventSource;
  globalThis.fetch = async (url, init) => {
    const command = init?.body ? JSON.parse(init.body) : null;
    if (command?.type === "goal") {
      commands.push(command);
      return { ok: true, async json() { return { success: true, data: command.op === "get"
        ? { goal: null, state: null }
        : { goal: created, state: { enabled: true, mode: "active", goal: created } } }; } };
    }
    if (command?.type === "prompt") {
      commands.push(command);
      promptAttempts += 1;
      if (promptAttempts === 1) {
        return { ok: false, async json() { return { error: "prompt rejected", code: "prompt_rejected", accepted: false }; } };
      }
      return { ok: true, async json() { return { success: true, data: null }; } };
    }
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() { return { sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
        context: { messages: [], entryIds: [], thinkingLevel: "off", model: null } }; } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: false }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  let client;
  function Harness() {
    client = useAgentSession({ session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    const input = { objective: "Finish the film", tokenBudget: 200000, attachments: [image] };
    await React.act(async () => {
      try { await client.handleGoalSubmit(input, "create"); } catch {}
      await client.handleGoalSubmit(input, "create");
    });
    const writes = commands.filter((command) => command.op !== "get");
    assert.deepEqual(writes, [
      { type: "goal", op: "create", objective: "Finish the film", tokenBudget: 200000 },
      { type: "prompt", message: "Finish the film", sentAsGoal: true, images: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] },
      { type: "prompt", message: "Finish the film", sentAsGoal: true, images: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] },
    ]);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
  }
});
