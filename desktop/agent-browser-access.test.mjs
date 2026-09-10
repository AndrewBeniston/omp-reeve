import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  activePortFilePath,
  cdpDiscoveryUrl,
  grantFilePath,
  planAgentBrowserAccess,
  readActivePort,
  readAgentBrowserGrant,
  removeStalePortFile,
  writeAgentBrowserGrant,
} = require("./agent-browser-access.cjs");

function userData() {
  return mkdtempSync(join(tmpdir(), "reeve-agent-browser-"));
}

test("the door is shut until a human opens it", () => {
  const dir = userData();
  assert.equal(readAgentBrowserGrant(dir), false);

  const plan = planAgentBrowserAccess(readAgentBrowserGrant(dir));
  assert.equal(plan.open, false);
  assert.deepEqual(plan.switches, [], "a launch with no grant must carry no debugging switch");
  rmSync(dir, { recursive: true, force: true });
});

test("a granted launch asks for an ephemeral port on loopback only", () => {
  const plan = planAgentBrowserAccess(true);

  assert.equal(plan.open, true);
  const switches = Object.fromEntries(plan.switches);
  // Port 0 lets the system choose, so the number differs every launch and
  // cannot be written down and attacked later.
  assert.equal(switches["remote-debugging-port"], "0");
  // The protocol has no authentication of its own. Bound anywhere but loopback,
  // another machine on the network could drive this browser.
  assert.equal(switches["remote-debugging-address"], "127.0.0.1");
});

test("a launch without the grant clears the port a previous launch left behind", () => {
  const dir = userData();
  // Chromium does not remove this file when the switch is absent. Verified
  // against Electron 44: launch with the switch, then without, and the file
  // survives holding the old port. Anything reading it would hand the agent a
  // port that refuses every connection.
  writeFileSync(activePortFilePath(dir), "63682\n/devtools/browser/abc\n");

  const plan = planAgentBrowserAccess(false);
  assert.equal(plan.removeStalePortFile, true);

  assert.equal(removeStalePortFile(dir), true);
  assert.equal(readActivePort(dir), null, "a dead port survived into a closed launch");
  rmSync(dir, { recursive: true, force: true });
});

test("a granted launch keeps the port file, because Chromium is about to write it", () => {
  assert.equal(planAgentBrowserAccess(true).removeStalePortFile, false);
});

test("the grant is recorded privately and survives a read", () => {
  const dir = userData();
  assert.equal(writeAgentBrowserGrant(dir, true), true);
  assert.equal(readAgentBrowserGrant(dir), true);

  // The file records a decision about this machine. Nobody else needs to read it.
  assert.equal(statSync(grantFilePath(dir)).mode & 0o077, 0);
  assert.match(JSON.parse(readFileSync(grantFilePath(dir), "utf8")).decidedAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(writeAgentBrowserGrant(dir, false), false);
  assert.equal(readAgentBrowserGrant(dir), false);
  rmSync(dir, { recursive: true, force: true });
});

test("nothing malformed can mean yes", () => {
  const dir = userData();
  for (const contents of ["", "{", "null", "[]", '"granted"', '{"granted":"true"}', '{"granted":1}']) {
    writeFileSync(grantFilePath(dir), contents);
    assert.equal(readAgentBrowserGrant(dir), false, `${contents} was read as a grant`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("the port is read from the first line, and nonsense is refused", () => {
  const dir = userData();
  writeFileSync(activePortFilePath(dir), "63682\n/devtools/browser/abc\n");
  assert.equal(readActivePort(dir), 63682);

  for (const contents of ["", "0\n", "-1\n", "70000\n", "not-a-port\n"]) {
    writeFileSync(activePortFilePath(dir), contents);
    assert.equal(readActivePort(dir), null, `${JSON.stringify(contents)} was read as a port`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("what the agent is given is the HTTP discovery endpoint", () => {
  // The SDK's normalizeConnectedCdpUrl refuses a ws:// URL and wants exactly
  // this shape, so it is the only one worth reporting.
  assert.equal(cdpDiscoveryUrl(63682), "http://127.0.0.1:63682");
  assert.equal(cdpDiscoveryUrl(null), null);
});
