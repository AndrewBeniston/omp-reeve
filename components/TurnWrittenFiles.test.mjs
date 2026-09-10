import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { TurnWrittenFiles } = await jiti.import("./TurnWrittenFiles.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(TurnWrittenFiles, props)),
  );
}

test("renders file actions in the supplied order", () => {
  const html = render({
    files: [{ filePath: "/abs/out/report.html" }, { filePath: "/abs/out/data.json" }],
    onOpenFile() {},
  });

  assert.match(html, /data-written-files="true"/);
  assert.match(html, /title="\/abs\/out\/report\.html"/);
  assert.match(html, /title="\/abs\/out\/data\.json"/);
  assert.match(html, /aria-label="Open report\.html"/);
  assert.match(html, /aria-label="Open data\.json"/);
  assert.ok(html.indexOf("report.html") < html.indexOf("data.json"));

  const rootTag = html.match(/^<div[^>]*>/)?.[0] ?? "";
  const buttonTags = [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
  assert.doesNotMatch(rootTag, /style=/);
  assert.equal(buttonTags.length, 2);
  assert.match(buttonTags[0], /type="button"/);
  assert.match(buttonTags[0], /data-written-file="\/abs\/out\/report\.html"/);
  assert.match(buttonTags[1], /type="button"/);
  assert.match(buttonTags[1], /data-written-file="\/abs\/out\/data\.json"/);
  for (const buttonTag of buttonTags) assert.doesNotMatch(buttonTag, /style=/);
});

test("renders nothing when no files were written", () => {
  assert.equal(render({ files: [], onOpenFile() {} }), "");
});
