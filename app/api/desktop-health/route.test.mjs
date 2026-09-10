import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createJiti } from "jiti";

test("the desktop health route proves ownership with the runtime token", async (t) => {
  const previous = process.env.OMP_WEB_DESKTOP_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.OMP_WEB_DESKTOP_TOKEN;
    else process.env.OMP_WEB_DESKTOP_TOKEN = previous;
  });

  process.env.OMP_WEB_DESKTOP_TOKEN = "launch-secret";
  const { GET } = await createJiti(import.meta.url, {
    moduleCache: false,
    tryNative: false,
  }).import("./route.ts");
  const challenge = "5d57f7c5-42c8-42e1-b386-fc72002dd366";
  const request = new Request("http://127.0.0.1:30142/api/desktop-health", {
    headers: { "x-omp-desktop-challenge": challenge },
  });
  const response = GET(request);
  const expectedProof = createHmac("sha256", "launch-secret").update(challenge).digest("hex");

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("X-OMP-Desktop-Proof"), expectedProof);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("the desktop health route stays unavailable outside the desktop", async () => {
  delete process.env.OMP_WEB_DESKTOP_TOKEN;
  const { GET } = await createJiti(import.meta.url, {
    moduleCache: false,
    tryNative: false,
  }).import("./route.ts");

  const request = new Request("http://127.0.0.1:30142/api/desktop-health", {
    headers: { "x-omp-desktop-challenge": "5d57f7c5-42c8-42e1-b386-fc72002dd366" },
  });
  assert.equal(GET(request).status, 404);
});

test("the desktop health route rejects a missing challenge", async (t) => {
  const previous = process.env.OMP_WEB_DESKTOP_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.OMP_WEB_DESKTOP_TOKEN;
    else process.env.OMP_WEB_DESKTOP_TOKEN = previous;
  });
  process.env.OMP_WEB_DESKTOP_TOKEN = "launch-secret";
  const { GET } = await createJiti(import.meta.url, {
    moduleCache: false,
    tryNative: false,
  }).import("./route.ts");

  assert.equal(GET(new Request("http://127.0.0.1:30142/api/desktop-health")).status, 400);
});
