import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJiti } from "jiti";
import { NextRequest } from "next/server";

const temporaryRoot = mkdtempSync(join(tmpdir(), "omp-web-proxy-"));
const previousEnvironment = {
  authFile: process.env.OMP_WEB_AUTH_FILE,
  desktopToken: process.env.OMP_WEB_DESKTOP_TOKEN,
  password: process.env.OMP_WEB_PASSWORD,
};

process.env.OMP_WEB_AUTH_FILE = join(temporaryRoot, "missing-auth.json");
process.env.OMP_WEB_DESKTOP_TOKEN = "desktop-launch-token";
process.env.OMP_WEB_PASSWORD = "locked-password";

const { proxy } = await createJiti(import.meta.url, {
  moduleCache: false,
  tryNative: false,
  tsconfigPaths: true,
}).import("./proxy.ts");

test.after(() => {
  for (const [name, value] of Object.entries({
    OMP_WEB_AUTH_FILE: previousEnvironment.authFile,
    OMP_WEB_DESKTOP_TOKEN: previousEnvironment.desktopToken,
    OMP_WEB_PASSWORD: previousEnvironment.password,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function healthRequest(challenge, extraHeaders = {}) {
  return new NextRequest("http://127.0.0.1:30142/api/desktop-health", {
    method: "GET",
    headers: {
      host: "127.0.0.1:30142",
      "x-omp-desktop-challenge": challenge,
      ...extraHeaders,
    },
  });
}

test("the desktop health check bypasses password auth with a valid challenge", () => {
  const response = proxy(healthRequest("5d57f7c5-42c8-42e1-b386-fc72002dd366"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("the desktop health check rejects a malformed challenge", () => {
  const response = proxy(healthRequest("malformed"));

  assert.equal(response.status, 401);
});

test("the desktop health check still rejects cross-site requests", () => {
  const response = proxy(healthRequest("5d57f7c5-42c8-42e1-b386-fc72002dd366", {
    "sec-fetch-site": "cross-site",
  }));

  assert.equal(response.status, 403);
});
