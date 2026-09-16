import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { getFileIcon } = await jiti.import("./FileIcons.tsx");

const icon = (name) => {
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null, getFileIcon(name)));
  return markup.match(/data-icon="([^"]+)"/)?.[1] ?? null;
};

test("a file named by its path is the same file as one named by itself", () => {
  // A Review heading names a file by where it is; a tree row names it by
  // itself. Both are the same file, so both draw the same icon.
  assert.equal(icon("components/review/ReviewFiles.tsx"), icon("ReviewFiles.tsx"));
  assert.equal(icon("components/review/ReviewFiles.tsx"), "typescript-react");
  assert.equal(icon("app/package-lock.json"), "npm-lock");
  assert.equal(icon("config/.gitignore"), "git");
  assert.equal(icon("deploy/Dockerfile"), "docker");
  // A Windows host names its paths the other way round.
  assert.equal(icon("lib\\review\\notes.md"), "markdown");
});

test("a name with nothing to go on is the generic file", () => {
  assert.equal(icon("LICENSE"), "_file");
  assert.equal(icon("some/dir/unknown.zzz"), "_file");
});
