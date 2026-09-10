import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { default: manifest } = await jiti.import("./manifest.ts");

test("Reeve owns the browser and installed application identity", async () => {
  const layout = await readFile(new URL("./layout.tsx", import.meta.url), "utf8");
  const webManifest = manifest();

  assert.equal(webManifest.name, "Reeve");
  assert.equal(webManifest.short_name, "Reeve");
  assert.match(layout, /title: "Reeve"/);
  assert.match(layout, /applicationName: "Reeve"/);
  assert.doesNotMatch(layout, /title: "omp-web"|applicationName: "omp-web"/);
});
