import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ALLOW_PERSONAL_BUILD_PATH,
  NEUTRAL_BUILD_PATHS,
  namesAPerson,
  refuseBuildPath,
} from "./build-path.mjs";

test("a build from a home directory is refused on every platform", () => {
  // Reeve 0.5.0 shipped the maintainer's home directory in 159 files, because
  // Next writes the project directory into the server bundle.
  for (const root of ["/Users/someone/code/reeve", "/home/someone/reeve", "C:\\Users\\someone\\reeve"]) {
    const refusal = refuseBuildPath(root, {});
    assert.ok(refusal, `${root} was allowed`);
    assert.match(refusal, /would bake/);
    assert.match(refusal, /RELEASING\.md/);
  }
});

test("a neutral path builds without complaint", () => {
  for (const root of Object.values(NEUTRAL_BUILD_PATHS)) {
    assert.equal(refuseBuildPath(root, {}), null, `${root} was refused`);
  }
  assert.equal(refuseBuildPath("/build/reeve", {}), null);
  assert.equal(refuseBuildPath("/opt/reeve", {}), null);
});

test("the refusal names the neutral path for the platform being built on", () => {
  assert.match(refuseBuildPath("/Users/a/x", {}, "darwin"), /\/tmp\/reeve\/build/);
  assert.match(refuseBuildPath("/home/a/x", {}, "linux"), /\/tmp\/reeve\/build/);
  assert.match(refuseBuildPath("C:\\Users\\a\\x", {}, "win32"), /C:\\reeve\\build/);
});

test("a developer building locally can say so", () => {
  assert.equal(refuseBuildPath("/Users/a/x", { [ALLOW_PERSONAL_BUILD_PATH]: "1" }), null);
  // Only exactly "1". A leftover empty or "0" must not open the gate.
  assert.ok(refuseBuildPath("/Users/a/x", { [ALLOW_PERSONAL_BUILD_PATH]: "0" }));
  assert.ok(refuseBuildPath("/Users/a/x", { [ALLOW_PERSONAL_BUILD_PATH]: "" }));
});

test("the same rule finds a path baked into a built file", () => {
  // This is what the verifier greps the packaged bundle with.
  assert.equal(namesAPerson('{"clientModules":{"/Users/someone/reeve/app/page.tsx":1}}'), true);
  assert.equal(namesAPerson("webpack://_N_E/home/someone/reeve/app"), true);
  assert.equal(namesAPerson("C:\\Users\\someone\\reeve\\app"), true);
  assert.equal(namesAPerson('{"clientModules":{"/tmp/reeve/build/app/page.tsx":1}}'), false);
});

test("both halves of the guard are wired in, not merely written", () => {
  const stage = readFileSync(join(import.meta.dir, "stage-desktop.mjs"), "utf8");
  assert.match(stage, /refuseBuildPath\(root, process\.env\)/);

  // The scan runs on the packaged output, which is the thing that shipped
  // wrong. Checking the source tree is what missed it the first time.
  const verify = readFileSync(join(import.meta.dir, "verify-desktop-package.mjs"), "utf8");
  assert.match(verify, /verifyNoPersonalPaths\(resources\)/);
  assert.match(verify, /namesAPerson/);
});
