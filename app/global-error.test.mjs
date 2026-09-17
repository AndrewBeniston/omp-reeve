import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const { default: GlobalError } = await createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  moduleCache: false,
  tsconfigPaths: true,
  tryNative: false,
}).import("./global-error.tsx");

test("global error uses the Reeve theme and recovery actions", () => {
  const html = renderToStaticMarkup(React.createElement(GlobalError, {
    error: new Error("fixture"),
  }));

  assert.match(html, /This page couldn’t load/);
  assert.match(html, /Reload to try again, or go back\./);
  assert.match(html, /var\(--font-sans\)/);
  assert.doesNotMatch(html, /Inter/);
  assert.match(html, /var\(--ui-main\)/);
  assert.match(html, /html#__next_error__/);
  assert.match(html, /var\(--ui-text\)/);
  assert.match(html, /var\(--ui-text-muted\)/);
  assert.match(html, /var\(--ui-border\)/);
  assert.match(html, /var\(--ui-accent\)/);
  assert.match(html, /omp-theme-config/);
  assert.match(html, />Reload<\/button>/);
  assert.match(html, />Back<\/button>/);
});
