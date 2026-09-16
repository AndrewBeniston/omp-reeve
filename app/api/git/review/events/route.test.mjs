import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_QUERY, reviewOwnerServerStub } from "../owner-stub.mjs";

/**
 * The stream that tells a Review Tab its Worktree moved.
 *
 * The watcher itself is exercised against a real repository in
 * lib/review-watch.test.mjs. This asks the endpoint's own questions: does it
 * settle an owner first, does it refuse a repository outside the allowed
 * roots, does it say plainly when a directory cannot be watched at all, and
 * does one closed request release its subscription.
 */
function endpoint({ lexical = true, resolved = true, fail = false } = {}) {
  const repository = { root: "/project", gitDirectories: ["/project/.git"] };
  const subscriptions = [];
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/file-access") return {
        getAllowedFileRoots: async () => ["/project"],
        isFilePathAllowed: () => lexical,
        isExistingFilePathAllowed: () => resolved,
      };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub();
      if (name === "@/lib/review-watch") return {
        resolveReviewWatchRepository: async () => {
          if (fail) throw new Error("not a repository");
          return repository;
        },
        subscribeReviewWatch: (named, listener) => {
          const subscription = { repository: named, listener, stopped: false };
          subscriptions.push(subscription);
          return () => { subscription.stopped = true; };
        },
      };
    },
    TextEncoder, ReadableStream, Response, URL, URLSearchParams, JSON, setInterval, clearInterval, console,
  });
  return {
    subscriptions,
    open(query = OWNER_QUERY, signal) {
      return exports.GET({ nextUrl: new URL("http://localhost/?" + query), signal });
    },
  };
}

/** One SSE frame at a time, as a reader would receive them. */
function frames(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  return async function next() {
    const { value, done } = await reader.read();
    return done ? null : decoder.decode(value);
  };
}

test("an unauthorized request never reaches the watcher", async () => {
  const route = endpoint();
  const answer = await route.open("tabId=review:tab", new AbortController().signal);
  assert.equal(answer.status, 400);
  assert.deepEqual(route.subscriptions, []);
});

test("a repository outside the allowed roots is refused", async () => {
  for (const denial of [{ lexical: false }, { resolved: false }]) {
    const route = endpoint(denial);
    const answer = await route.open(OWNER_QUERY, new AbortController().signal);
    assert.equal(answer.status, 403);
    assert.deepEqual(await answer.json(), { error: "Access denied" });
    assert.deepEqual(route.subscriptions, []);
  }
});

test("a directory that cannot be watched says so, and says what to do instead", async () => {
  const route = endpoint({ fail: true });
  const answer = await route.open(OWNER_QUERY, new AbortController().signal);
  assert.equal(answer.status, 409);
  assert.match((await answer.json()).error, /Refresh Review manually/);
  assert.deepEqual(route.subscriptions, []);
});

test("an open stream carries the watcher's events and releases its subscription when the reader leaves", async () => {
  const route = endpoint();
  const controller = new AbortController();
  const answer = await route.open(OWNER_QUERY, controller.signal);
  assert.equal(answer.headers.get("Content-Type"), "text/event-stream");
  assert.equal(answer.headers.get("Cache-Control"), "no-cache, no-transform");
  assert.equal(route.subscriptions.length, 1);
  assert.deepEqual(route.subscriptions[0].repository, { root: "/project", gitDirectories: ["/project/.git"] });

  const next = frames(answer);
  route.subscriptions[0].listener({ type: "ready", limited: false });
  assert.equal(await next(), 'data: {"type":"ready","limited":false}\n\n');
  route.subscriptions[0].listener({ type: "status", limited: true });
  assert.equal(await next(), 'data: {"type":"status","limited":true}\n\n');

  controller.abort();
  assert.equal(route.subscriptions[0].stopped, true);
});

test("a request already abandoned leaves no watch behind", async () => {
  const route = endpoint();
  const controller = new AbortController();
  controller.abort();
  const answer = await route.open(OWNER_QUERY, controller.signal);
  assert.equal(answer.status, 200);
  assert.equal(route.subscriptions.every((subscription) => subscription.stopped), true);
});
