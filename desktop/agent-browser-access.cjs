/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

/**
 * The agent's door to the browser.
 *
 * Reeve's Browser tabs are Chromium pages, so an agent can drive them over the
 * ordinary debugging protocol with no relay and no extension. That protocol is
 * served only when Chromium is started with a switch, and Chromium reads that
 * switch before the application is ready.
 *
 * That timing is the whole security design, not a limitation to work around.
 * The grant is recorded to disk and takes effect at the next launch, so nothing
 * in a running Reeve can open the door. A renderer that had been taken over
 * cannot grant a browser that was not already granted, because by the time it
 * runs, the decision is hours old and made by a human.
 *
 * Everything here is pure or touches one file, so the decisions are testable
 * without launching anything.
 */

/** The file that records the human's grant. Read before app-ready. */
const GRANT_FILENAME = "agent-browser-access.json";

/**
 * Chromium writes the port it actually bound to this file in userData.
 *
 * It is written when the switch is present and, crucially, **not removed when
 * it is absent**: a launch without the switch leaves the previous launch's file
 * sitting there with a dead port. Anything that read it to learn whether the
 * door was open would hand the agent a port that refuses every connection.
 */
const ACTIVE_PORT_FILENAME = "DevToolsActivePort";

/**
 * Ask for an ephemeral port on loopback only.
 *
 * Port 0 lets the operating system choose, so the number differs every launch
 * and nothing can be written down and attacked later. The address matters more:
 * bound to anything other than loopback, the debugging protocol would let
 * another machine on the network drive this browser, and the protocol has no
 * authentication of its own.
 */
const REQUESTED_PORT = "0";
const LOOPBACK = "127.0.0.1";

function grantFilePath(userDataDir) {
  return join(userDataDir, GRANT_FILENAME);
}

function activePortFilePath(userDataDir) {
  return join(userDataDir, ACTIVE_PORT_FILENAME);
}

/**
 * Whether the human has granted the agent the browser.
 *
 * Anything unreadable, missing, or not exactly `true` reads as no grant. There
 * is deliberately no way for a malformed file to mean yes.
 */
function readAgentBrowserGrant(userDataDir) {
  try {
    const parsed = JSON.parse(readFileSync(grantFilePath(userDataDir), "utf8"));
    return parsed?.granted === true;
  } catch {
    return false;
  }
}

/**
 * Record the grant. It takes effect at the next launch, never this one.
 *
 * The timestamp is for the human, so a control can say when they granted it.
 */
function writeAgentBrowserGrant(userDataDir, granted) {
  const path = grantFilePath(userDataDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ granted: granted === true, decidedAt: new Date().toISOString() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return granted === true;
}

/**
 * The switches this launch should carry, and whether a stale port file must go.
 *
 * Pure: the caller supplies the grant and applies the result. Returning the
 * removal as part of the decision rather than doing it here keeps the whole
 * policy in one testable place.
 */
function planAgentBrowserAccess(granted) {
  if (!granted) {
    // The door is shut, so any record of a previous launch's port must go with
    // it. Left behind, it names a port that refuses every connection, and the
    // agent is told to try an endpoint that was never open.
    return { open: false, switches: [], removeStalePortFile: true };
  }
  return {
    open: true,
    switches: [
      ["remote-debugging-port", REQUESTED_PORT],
      ["remote-debugging-address", LOOPBACK],
    ],
    removeStalePortFile: false,
  };
}

/** Remove a port file left behind by an earlier launch. */
function removeStalePortFile(userDataDir) {
  const path = activePortFilePath(userDataDir);
  if (!existsSync(path)) return false;
  try {
    rmSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The port Chromium actually bound, read from the file it writes.
 *
 * The first line is the port. The second is a websocket path this does not use:
 * the SDK wants the HTTP discovery endpoint and rejects a websocket URL.
 */
function readActivePort(userDataDir) {
  try {
    const first = readFileSync(activePortFilePath(userDataDir), "utf8").split("\n")[0].trim();
    const port = Number(first);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

/**
 * What the human copies, and what the agent is given as `app.cdp_url`.
 *
 * The SDK requires the HTTP discovery endpoint and refuses a `ws://` URL, so
 * this is the only shape worth reporting.
 */
function cdpDiscoveryUrl(port) {
  return port === null ? null : `http://${LOOPBACK}:${port}`;
}

module.exports = {
  ACTIVE_PORT_FILENAME,
  GRANT_FILENAME,
  LOOPBACK,
  activePortFilePath,
  cdpDiscoveryUrl,
  grantFilePath,
  planAgentBrowserAccess,
  readActivePort,
  readAgentBrowserGrant,
  removeStalePortFile,
  writeAgentBrowserGrant,
};
