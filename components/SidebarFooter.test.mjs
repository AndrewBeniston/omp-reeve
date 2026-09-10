import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SidebarFooter.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("./shell/sidebar-footer.module.css", import.meta.url), "utf8");

test("matches the Codex fallback footer without unavailable features", () => {
  assert.match(source, /onOpenSettings/);
  assert.match(source, /common\.settings/);
  assert.match(source, /sidebar\.help/);
  assert.match(source, /https:\/\/omp\.sh/);
  assert.doesNotMatch(source, />Voice<|sidebar\.voice/);
  assert.match(css, /\.footer\s*\{[^}]*height:\s*var\(--sidebar-footer-height\);[^}]*border-top:\s*1px solid var\(--ui-border\);/);
  assert.match(css, /\.footerRow\s*\{[^}]*height:\s*46px;[^}]*padding:\s*0 var\(--padding-row-x\);/);
});
