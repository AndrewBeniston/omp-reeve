import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { CollaborationAdapter } = await jiti.import("./collaboration-adapter.ts");

function makeHarness() {
  const starts = [];
  const stops = [];
  const changes = [];
  const host = {
    link: "room.write-terminal",
    webLink: "https://relay.example/#room.write-browser",
    viewLink: "room.view-terminal",
    webViewLink: "https://relay.example/#room.view-browser",
    participants: [{ name: "andrew", role: "host" }],
    async start(relayUrl, webUrl) {
      starts.push({ relayUrl, webUrl });
    },
    async stop(reason) {
      stops.push(reason);
    },
  };
  const session = {
    settings: {
      get(key) {
        if (key === "collab.relayUrl") return "relay.example";
        if (key === "collab.webUrl") return "https://relay.example";
        if (key === "collab.displayName") return "andrew";
        return undefined;
      },
    },
    sessionManager: {
      getSessionId: () => "session-1",
      getCwd: () => "/repo",
    },
    getContextUsage: () => ({ tokens: 120, contextWindow: 1000, percent: 12 }),
  };
  const adapter = new CollaborationAdapter({
    session,
    eventBus: { on: () => () => {} },
    createHost: (context) => {
      host.context = context;
      return host;
    },
    encodeQr: (url) => ({ size: 2, rows: ["10", "01"], url }),
    onChange: (snapshot) => changes.push(snapshot),
    onNotice() {},
    onQueueChange() {},
  });
  return { adapter, changes, host, starts, stops };
}

test("starts one encrypted OMP host and returns writable browser details", async () => {
  const { adapter, starts } = makeHarness();
  const result = await adapter.execute("");

  assert.deepEqual(starts, [{ relayUrl: "wss://relay.example", webUrl: "https://relay.example" }]);
  assert.equal(result.message, "Collaboration session started");
  assert.equal(result.collaboration.active, true);
  assert.equal(result.collaboration.mode, "write");
  assert.equal(result.collaboration.browserUrl, "https://relay.example/#room.write-browser");
  assert.equal(result.collaboration.viewBrowserUrl, "https://relay.example/#room.view-browser");
  assert.deepEqual(result.collaboration.qr, {
    size: 2,
    rows: ["10", "01"],
    url: "https://relay.example/#room.write-browser",
  });
});

test("switches the card to the read-only link without creating another host", async () => {
  const { adapter, starts } = makeHarness();
  await adapter.execute("");
  const result = await adapter.execute("view");

  assert.equal(starts.length, 1);
  assert.equal(result.collaboration.mode, "view");
  assert.equal(result.collaboration.qr.url, "https://relay.example/#room.view-browser");
});

test("reports participants and stops the host through one cleanup path", async () => {
  const { adapter, changes, host, stops } = makeHarness();
  await adapter.execute("");
  host.participants.push({ name: "guest", role: "guest", readOnly: true });
  host.context.statusLine.setCollabStatus({ role: "host", participantCount: 2 });

  const status = await adapter.execute("status");
  assert.equal(status.collaboration.participants.length, 2);
  assert.equal(changes.at(-1).participants.length, 2);

  const stopped = await adapter.execute("stop");
  assert.deepEqual(stops, ["host stopped"]);
  assert.equal(stopped.collaboration.active, false);
});

test("rejects unsupported collaboration subcommands", async () => {
  const { adapter } = makeHarness();
  await assert.rejects(adapter.execute("unknown-command"), /Usage: \/collab/);
});
