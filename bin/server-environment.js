"use strict";

function buildServerEnvironment(baseEnvironment, { hostname, webAuthFile, launchCwd }) {
  return {
    ...baseEnvironment,
    OMP_WEB_HOSTNAME: hostname,
    OMP_WEB_AUTH_FILE: webAuthFile,
    OMP_WEB_LAUNCH_CWD: launchCwd,
  };
}

module.exports = { buildServerEnvironment };
