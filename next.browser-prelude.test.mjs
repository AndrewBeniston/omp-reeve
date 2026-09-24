import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)));
const jiti = createJiti(import.meta.url, {
  alias: { "@": repoRoot },
  interopDefault: true,
  moduleCache: false,
});
const { POST: postNewAgent } = await jiti.import("./app/api/agent/new/route.ts");

test("the SDK browser prelude loads after Next installs its require hook", () => {
  const probe = `
    await import("next/dist/server/require-hook");
    const { createBrowserPrelude } = await import("@oh-my-pi/pi-coding-agent/tools/browser");
    const prelude = createBrowserPrelude({ settings: { get: () => false } });
    if (prelude.name !== "browser") throw new Error("Unexpected prelude: " + prelude.name);
  `;
  const result = spawnSync(process.execPath, ["--bun", "-e", probe], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the new-session route treats a message without type as a prompt", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "reeve-new-agent-"));
  const sentCommands = [];
  const previousSessions = globalThis.__ompSessions;
  const previousLocks = globalThis.__ompStartLocks;
  const previousAllowedRoots = globalThis.__ompAllowedRootsCache;
  const session = {
    isAlive: () => true,
    async send(command) {
      sentCommands.push(command);
      return command.type === "get_state" ? {} : null;
    },
  };

  globalThis.__ompSessions = new Map();
  class TestStartLocks extends Map {
    get(key) {
      if (typeof key === "string" && key.startsWith("__new__")) {
        return Promise.resolve({ session, realSessionId: "test-session" });
      }
      return super.get(key);
    }
  }
  globalThis.__ompStartLocks = new TestStartLocks();
  globalThis.__ompAllowedRootsCache = {
    roots: new Set([resolve(cwd)]),
    expiresAt: Date.now() + 60_000,
  };

  t.after(async () => {
    globalThis.__ompSessions = previousSessions;
    globalThis.__ompStartLocks = previousLocks;
    globalThis.__ompAllowedRootsCache = previousAllowedRoots;
    await rm(cwd, { recursive: true, force: true });
  });

  const response = await postNewAgent(new Request("http://localhost:30141/api/agent/new", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:30141",
      origin: "http://localhost:30141",
    },
    body: JSON.stringify({ cwd, message: "Reply with ok." }),
  }));

  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(sentCommands.map((command) => command.type), ["get_state", "prompt"]);
});
