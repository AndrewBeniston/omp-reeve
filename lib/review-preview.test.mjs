import assert from "node:assert/strict";
import test from "node:test";
import { reviewFileSuffix, reviewPreviewKind, reviewPreviewMediaType } from "./review-preview.ts";

test("raster images and PDFs preview whether or not rich preview is on", () => {
  for (const suffix of ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"]) {
    assert.equal(reviewPreviewKind({ path: `art/logo.${suffix}` }), "image", suffix);
    assert.equal(reviewPreviewKind({ path: `art/logo.${suffix}`, richPreview: true }), "image", suffix);
  }
  assert.equal(reviewPreviewKind({ path: "docs/spec.pdf" }), "pdf");
  assert.equal(reviewPreviewKind({ path: "docs/spec.pdf", richPreview: true }), "pdf");
});

test("SVG and markdown wait for rich preview, and markdown never previews a deletion", () => {
  assert.equal(reviewPreviewKind({ path: "art/mark.svg" }), null);
  assert.equal(reviewPreviewKind({ path: "art/mark.svg", richPreview: true }), "svg");
  for (const suffix of ["markdown", "md", "mdown", "mdx", "mkd"]) {
    assert.equal(reviewPreviewKind({ path: `notes.${suffix}` }), null, suffix);
    assert.equal(reviewPreviewKind({ path: `notes.${suffix}`, richPreview: true }), "markdown", suffix);
    assert.equal(reviewPreviewKind({ path: `notes.${suffix}`, richPreview: true, deleted: true }), null, suffix);
  }
  // A deleted image still previews: the deletion condition is markdown's alone.
  assert.equal(reviewPreviewKind({ path: "art/logo.png", deleted: true }), "image");
  assert.equal(reviewPreviewKind({ path: "art/mark.svg", richPreview: true, deleted: true }), "svg");
});

test("anything else is read as an ordinary diff", () => {
  for (const path of ["lib/index.ts", "Makefile", ".gitignore", "notes.txt", "archive.zip", "sheet.docx", "run.ipynb"]) {
    assert.equal(reviewPreviewKind({ path, richPreview: true }), null, path);
  }
});

test("the suffix is the final segment's extension, lowercased, on either separator", () => {
  assert.equal(reviewFileSuffix("a/b/c.PNG"), "png");
  assert.equal(reviewFileSuffix("a\\b\\c.Md"), "md");
  assert.equal(reviewFileSuffix("a.png/b"), "");
  assert.equal(reviewFileSuffix(".gitignore"), "");
  assert.equal(reviewFileSuffix("archive.tar.gz"), "gz");
  // A directory's dot must not become the file's extension.
  assert.equal(reviewPreviewKind({ path: "site.png/README" }), null);
  assert.equal(reviewPreviewKind({ path: "a/b.d/c.png" }), "image");
});

test("a previewable file names the media type its bytes are served as", () => {
  assert.equal(reviewPreviewMediaType("a/logo.jpg"), "image/jpeg");
  assert.equal(reviewPreviewMediaType("a/logo.jpeg"), "image/jpeg");
  assert.equal(reviewPreviewMediaType("a/mark.SVG"), "image/svg+xml");
  assert.equal(reviewPreviewMediaType("a/spec.pdf"), "application/pdf");
  assert.equal(reviewPreviewMediaType("a/notes.mdx"), "text/markdown");
  assert.equal(reviewPreviewMediaType("a/index.ts"), null);
});
