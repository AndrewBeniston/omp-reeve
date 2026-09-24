import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;

const MODELS = [
  { id: "same", name: "Alpha", provider: "alpha", api: "anthropic-messages", reasoning: true, thinking: { efforts: ["low", "high"] } },
  { id: "same", name: "Beta", provider: "beta", api: "anthropic-messages", reasoning: true, thinking: { efforts: ["medium"] } },
];

function settings(enabledModels) {
  return {
    get(key) {
      if (key === "enabledModels") return enabledModels;
      if (key === "cycleOrder") return [];
      if (key === "modelRoles") return {};
      if (key === "modelTags") return {};
      return undefined;
    },
    getCwd: () => undefined,
    cloneForCwd: () => settings(enabledModels),
    getModelRole: () => undefined,
    getModelRoles: () => ({}),
    getModelRoleSource: () => "default",
    getModelRoleProvenance: () => "default",
  };
}

function runtime(enabledModels) {
  return {
    modelRegistry: {
      getAvailable: () => MODELS,
      getError: () => undefined,
    },
    settings: settings(enabledModels),
  };
}

async function request(cwd) {
  const response = await import("./route.ts").then((route) => route.GET(new Request(`http://localhost/api/models?cwd=${encodeURIComponent(cwd)}`)));
  return { status: response.status, body: await response.json() };
}

async function withRoute(t, enabledModels) {
  const cwd = await mkdtemp(join(tmpdir(), "reeve-models-route-"));
  const previousRuntime = globalThis.__ompRuntimePromise;
  const previousRoots = globalThis.__ompAllowedRootsCache;
  globalThis.__ompAllowedRootsCache = { roots: new Set([cwd]), expiresAt: Date.now() + 60_000 };
  globalThis.__ompRuntimePromise = Promise.resolve(runtime(enabledModels));
  t.after(async () => {
    globalThis.__ompRuntimePromise = previousRuntime;
    globalThis.__ompAllowedRootsCache = previousRoots;
    await rm(cwd, { recursive: true, force: true });
  });
  return request(cwd);
}

test("GET /api/models reports an unscoped model list", async (t) => {
  const { status, body } = await withRoute(t, undefined);
  assert.equal(status, 200);
  assert.equal(body.scoped, false);
  assert.deepEqual(body.modelList.map(({ provider, id }) => `${provider}/${id}`), ["alpha/same", "beta/same"]);
  assert.equal(JSON.stringify(body).includes("apiKey"), false);
});

test("GET /api/models reports a configured model scope", async (t) => {
  const { status, body } = await withRoute(t, ["alpha/same"]);
  assert.equal(status, 200);
  assert.equal(body.scoped, true);
  assert.deepEqual(body.modelList.map(({ provider, id }) => `${provider}/${id}`), ["alpha/same"]);
});
