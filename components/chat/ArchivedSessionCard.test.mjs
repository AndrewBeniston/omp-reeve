import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ArchivedSessionCard, restoreArchivedSession } = await jiti.import("./ArchivedSessionCard.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const sidebarSource = await readFile(new URL("../SessionSidebar.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8");

test("the archived Session card shows its recorded title and action", () => {
  const html = renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ArchivedSessionCard, {
      sessionId: "session-id",
      onRestored() {},
    })),
  );

  assert.match(html, /This task is archived/);
  assert.match(html, /Unarchive this task to open it/);
  assert.match(html, />Unarchive and open</);
});

test("restore progress, success, and failure use the recorded strings", () => {
  assert.equal(enLocale.messages["transcript.archived.restoringDescription"], "Restoring this chat and its workspace…");
  assert.equal(enLocale.messages["transcript.archived.restoredDescription"], "This chat has been restored");
  assert.equal(enLocale.messages["transcript.archived.unarchiveError"], "Could not unarchive this task");
});

test("unarchive and open sends one restore request before selecting the Session", async () => {
  const calls = [];
  let selected = 0;
  await restoreArchivedSession("session/id", () => { selected += 1; }, async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 204 });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/sessions/session%2Fid");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), { archived: false });
  assert.equal(selected, 1);
});

test("a failed restore keeps the Session archived", async () => {
  let selected = 0;
  await assert.rejects(
    restoreArchivedSession("session-id", () => { selected += 1; }, async () => new Response(null, { status: 503 })),
    /HTTP 503/,
  );
  assert.equal(selected, 0);
});

test("a direct Session link recovers archive state from the persisted archive list", () => {
  assert.match(sidebarSource, /fetch\("\/api\/sessions\?archived=1"/);
  assert.match(sidebarSource, /archived:\s*true/);
  assert.match(sidebarSource, /onInitialRestoreDone\?\.\(\)/);
});

test("an archived Session replaces regular transcript rows with its card row", () => {
  assert.match(chatWindowSource, /archivedSessionId\s*\?\s*\[\{ kind: "archived" as const, sessionId: archivedSessionId \}\]\s*:\s*buildTranscriptRows/);
});
