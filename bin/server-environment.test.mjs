import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildServerEnvironment } = require("./server-environment.js");

const launchValues = {
  hostname: "127.0.0.1",
  webAuthFile: "/tmp/omp-web-auth.json",
  launchCwd: "/tmp/project",
};

test("preserves the self-update flag without owning its default", () => {
  const defaultEnvironment = buildServerEnvironment(
    { EXISTING_VALUE: "preserved" },
    launchValues,
  );
  const overrideEnvironment = buildServerEnvironment(
    { OMP_WEB_DISABLE_SELF_UPDATE: "0" },
    launchValues,
  );

  assert.equal(defaultEnvironment.EXISTING_VALUE, "preserved");
  assert.equal(defaultEnvironment.OMP_WEB_HOSTNAME, launchValues.hostname);
  assert.equal(defaultEnvironment.OMP_WEB_AUTH_FILE, launchValues.webAuthFile);
  assert.equal(defaultEnvironment.OMP_WEB_LAUNCH_CWD, launchValues.launchCwd);
  assert.equal(defaultEnvironment.OMP_WEB_DISABLE_SELF_UPDATE, undefined);
  assert.equal(overrideEnvironment.OMP_WEB_DISABLE_SELF_UPDATE, "0");
});
