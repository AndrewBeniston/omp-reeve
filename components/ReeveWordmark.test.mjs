import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ReeveWordmark } = await jiti.import("./ReeveWordmark.tsx");

test("renders the default Reeve wordmark through semantic markup", () => {
  const html = renderToStaticMarkup(React.createElement(ReeveWordmark));

  assert.match(html, /data-reeve-wordmark="true"/);
  assert.match(html, /data-gap="10"/);
  assert.match(html, /<svg[^>]*width="22"[^>]*height="22"/);
  assert.match(html, />Reeve<\/span>/);
  assert.doesNotMatch(html, /Plus Jakarta Sans|Inter/);

  const rootTag = html.match(/^<span[^>]*>/)?.[0] ?? "";
  const svgTag = html.match(/<svg[^>]*>/)?.[0] ?? "";
  const labelTag = html.match(/<span[^>]*data-reeve-wordmark-label="true"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(rootTag, /style=/);
  assert.doesNotMatch(svgTag, /style=/);
  assert.doesNotMatch(labelTag, /style=/);
});

test("preserves custom labels without a style prop boundary", () => {
  const html = renderToStaticMarkup(
    React.createElement(ReeveWordmark, {
      label: React.createElement("strong", null, "version"),
      monospace: true,
    }),
  );

  assert.match(html, /<strong>version<\/strong>/);
  assert.match(html, /data-monospace="true"/);
  assert.doesNotMatch(html, /style=/);
});
