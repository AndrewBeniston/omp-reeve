import assert from "node:assert/strict";
import test from "node:test";

import {
  agentBrowserBadge,
  agentBrowserDescription,
  agentBrowserPhase,
} from "./AgentBrowserAccess";

const closed = { granted: false, openThisLaunch: false, restartRequired: false, cdpUrl: null };
const open = { granted: true, openThisLaunch: true, restartRequired: false, cdpUrl: "http://127.0.0.1:63682" };
const justGranted = { granted: true, openThisLaunch: false, restartRequired: true, cdpUrl: null };
const justWithdrawn = { granted: false, openThisLaunch: true, restartRequired: true, cdpUrl: "http://127.0.0.1:63682" };

test("the four states a grant and a launch can be in are all distinguished", () => {
  assert.equal(agentBrowserPhase(closed, true), "closed");
  assert.equal(agentBrowserPhase(open, true), "open");
  assert.equal(agentBrowserPhase(justGranted, true), "opens-next-launch");
  assert.equal(agentBrowserPhase(justWithdrawn, true), "closes-next-launch");
  assert.equal(agentBrowserPhase(null, true), "loading");
  assert.equal(agentBrowserPhase(closed, false), "unsupported");
});

test("a human who has just granted access is not told the agent can connect", () => {
  // The grant is read before Chromium starts, so it takes effect next launch.
  // Saying "open" here would send them to an address nothing is listening on.
  const text = agentBrowserDescription(agentBrowserPhase(justGranted, true));

  assert.match(text, /restart/i);
  assert.match(text, /nothing is listening/i);
  assert.equal(agentBrowserBadge("opens-next-launch").label, "Opens on restart");
});

test("a human who has just withdrawn access is told the door is still open", () => {
  // This is the dangerous one. The switch is already on this process and
  // cannot be taken back, so a reassuring badge here would be a lie.
  const phase = agentBrowserPhase(justWithdrawn, true);
  const text = agentBrowserDescription(phase);

  assert.match(text, /still open/i);
  assert.match(text, /right now/i);
  const badge = agentBrowserBadge(phase);
  assert.equal(badge.label, "Still open");
  assert.equal(badge.tone, "danger", "a withdrawn-but-open door must not look safe");
});

test("closed is the reassuring state, and open is not", () => {
  assert.equal(agentBrowserBadge("closed").tone, "success");
  // Open is a working feature, not a problem, but it is not a resting state
  // either: something can drive the application while it is on.
  assert.equal(agentBrowserBadge("open").tone, "warning");
  assert.match(agentBrowserDescription("closed"), /cannot see or drive/i);
});

test("the open state says what is actually exposed", () => {
  // A human reading this decides whether to grant it. The signed-in-session
  // consequence is the one that is easy to miss.
  assert.match(agentBrowserDescription("open"), /signed in/i);
});
