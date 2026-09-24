import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");

test("keeps the mobile Composer footer inside a 390px form", () => {
  const mobileRules = css.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const coarseRules = css.match(/@media \(max-width: 640px\) and \(pointer: coarse\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(mobileRules, /\.toolbar\s*\{[^}]*width:\s*100%;[^}]*margin-right:\s*0;[^}]*margin-left:\s*0;/);
  assert.match(mobileRules, /\.toolbarRight\s*\{[^}]*min-width:\s*0;/);
  assert.match(mobileRules, /\.toolbarLeft\s*\{[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*100%;/);
  assert.match(mobileRules, /\.modelSelector\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  assert.match(mobileRules, /\.modelName\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
  assert.match(coarseRules, /\.toolbarLeft button,[\s\S]*?min-width:\s*var\(--ui-control-touch\);[\s\S]*?min-height:\s*var\(--ui-control-touch\);/);
});
