import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

import {
  BASELINE_RULE,
  compareBaseline,
  loadBaseline,
  scanSource,
} from "../../scripts/check-ui-style-boundaries.mjs";
import { UI_STYLE_EXCEPTIONS } from "../../scripts/ui-style-exceptions.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { AnsiSegment, isAnsiRuntimeColor } = await jiti.import("./AnsiSegment.tsx");

const repositoryRootUrl = new URL("../../", import.meta.url);
const repositoryRoot = fileURLToPath(repositoryRootUrl);
const adapterPath = "components/ui/AnsiSegment.tsx";
const callSitePaths = [
  "components/ChatWindow.tsx",
  "components/MessageView.tsx",
  "components/ExtensionStatusBar.tsx",
  "components/chat/ToolActivity.tsx",
];

function renderSegment(segment, preserveUnstyledSpan = false) {
  return renderToStaticMarkup(
    React.createElement(AnsiSegment, { segment, preserveUnstyledSpan }),
  );
}

test("validates typed ANSI runtime colors before applying them", () => {
  assert.equal(isAnsiRuntimeColor("#16a34a"), true);
  assert.equal(isAnsiRuntimeColor("rgb(255, 0, 196)"), true);
  assert.equal(isAnsiRuntimeColor("#12"), false);
  assert.equal(isAnsiRuntimeColor("rgb(256, 0, 0)"), false);
  assert.equal(isAnsiRuntimeColor("var(--ui-success)"), false);

  assert.throws(
    () => renderSegment({ text: "bad", style: { color: "rgb(256, 0, 0)" } }),
    /Invalid ANSI foreground color/,
  );
  assert.throws(
    () => renderSegment({ text: "bad", style: { backgroundColor: "var(--ui-danger)" } }),
    /Invalid ANSI background color/,
  );
});

test("preserves every parsed ANSI presentation attribute", () => {
  const html = renderSegment({
    text: "terminal",
    style: {
      color: "#16a34a",
      backgroundColor: "rgb(1, 2, 3)",
      fontWeight: 700,
      opacity: 0.65,
      fontStyle: "italic",
      textDecoration: "underline",
    },
  });

  assert.match(html, /^<span style="[^"]+">terminal<\/span>$/);
  assert.match(html, /color:#16a34a/);
  assert.match(html, /background-color:rgb\(1, 2, 3\)/);
  assert.match(html, /font-weight:700/);
  assert.match(html, /opacity:0\.65/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /text-decoration:underline/);
});

test("preserves each call site's unstyled segment markup", () => {
  const segment = { text: "plain", style: {} };

  assert.equal(renderSegment(segment), "plain");
  assert.equal(renderSegment(segment, true), "<span>plain</span>");
});

test("ANSI call sites contain no intrinsic style attributes", async () => {
  for (const path of callSitePaths) {
    const content = await readFile(new URL(path, repositoryRootUrl), "utf8");
    const violations = scanSource({ path, content, exceptions: [] })
      .filter((violation) => violation.rule === "no-inline-style-attribute");

    assert.deepEqual(violations, [], path);
  }
});

test("the checker and baseline permit one ANSI adapter usage only", async () => {
  const baseline = await loadBaseline(repositoryRoot);
  const ansiExceptions = UI_STYLE_EXCEPTIONS.filter((exception) => (
    exception.rule === "no-inline-style-attribute" && /ANSI/.test(exception.reason)
  ));

  assert.deepEqual(
    ansiExceptions.map(({ file, rule }) => ({ file, rule })),
    [{ file: adapterPath, rule: "no-inline-style-attribute" }],
  );
  assert.equal(baseline.limits[adapterPath]?.["no-inline-style-attribute"], 1);

  for (const path of callSitePaths) {
    assert.equal(baseline.limits[path]?.["no-inline-style-attribute"], undefined, path);
  }

  const content = await readFile(new URL(adapterPath, repositoryRootUrl), "utf8");
  const suppressed = new Map();
  const violations = scanSource({
    path: adapterPath,
    content,
    exceptions: UI_STYLE_EXCEPTIONS,
    suppressed,
  });

  assert.deepEqual(violations, []);
  assert.equal(suppressed.get(`${adapterPath}|no-inline-style-attribute`), 1);
});

test("the checker rejects a second ANSI adapter usage", async () => {
  const baseline = await loadBaseline(repositoryRoot);
  const content = `${await readFile(new URL(adapterPath, repositoryRootUrl), "utf8")}\nconst GrowthProbe = () => <i style={{}} />;\n`;
  const suppressed = new Map();

  scanSource({
    path: adapterPath,
    content,
    exceptions: UI_STYLE_EXCEPTIONS,
    suppressed,
  });
  const violations = compareBaseline(suppressed, baseline);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.equal(violations[0].path, adapterPath);
});
