import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { POST } = await jiti.import("./route.ts");
const { allowFileRoot } = await jiti.import("../../../../lib/file-access.ts");

function request(filePath) {
  return new Request("http://localhost:30141/api/citations/exists", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:30141" },
    body: JSON.stringify({ filePath }),
  });
}

test("reports citation existence without returning its private path", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "reeve-citation-"));
  const filePath = path.join(root, "existing.ts");
  allowFileRoot(root);
  await writeFile(filePath, "export {};\n");
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const candidate of [filePath, path.join(root, "missing.ts")]) {
    const response = await POST(request(candidate));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { exists: candidate === filePath });
    assert.doesNotMatch(body, /reeve-citation|\/tmp\//);
  }
});
