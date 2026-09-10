import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { WhatsNewView, readLastSeenVersion, LAST_SEEN_VERSION_KEY } = await jiti.import("./WhatsNewDialog.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const releases = [
  {
    version: "0.5.1", date: "2026-09-15", support: false,
    sections: [{ title: "Fixed", items: [{ kind: "bullet", text: "A crash on start." }] }],
  },
  {
    version: "0.5.0", date: "2026-09-08", support: true,
    sections: [
      { title: "Summary", items: [{ kind: "paragraph", text: "The first public release." }] },
      { title: "Added", items: [{ kind: "bullet", text: "Updates." }, { kind: "bullet", text: "What's New." }] },
    ],
  },
];

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null,
      React.createElement(WhatsNewView, { onPage() {}, onDone() {}, ...props })),
  );
}

test("page one lists every unseen release with its sections", () => {
  const html = render({ releases, showSupport: true, page: 0 });
  assert.match(html, /Reeve 0\.5\.1/);
  assert.match(html, /Reeve 0\.5\.0/);
  assert.match(html, /A crash on start\./);
  assert.match(html, /The first public release\./);
  assert.match(html, /<li>(<span>)?Updates\.(<\/span>)?<\/li>/);
  assert.match(html, /Continue/);
  assert.doesNotMatch(html, />Done</);
  assert.doesNotMatch(html, /Support on Ko-fi/);
});

test("backtick spans render as inline code", () => {
  const html = render({ releases: [{ version: "0.5.1", date: null, support: false, sections: [{ title: "Fixed", items: [{ kind: "bullet", text: "Reads `~/.omp` again." }] }] }], showSupport: false, page: 0 });
  assert.match(html, /<code[^>]*>~\/\.omp<\/code>/);
  assert.doesNotMatch(html, /`/);
});

test("page two is the support page with Ko-fi and GitHub actions", () => {
  const html = render({ releases, showSupport: true, page: 1 });
  assert.match(html, /Help Reeve keep growing/);
  assert.match(html, /Support on Ko-fi/);
  assert.match(html, /Star Reeve on GitHub/);
  assert.match(html, /Back/);
  assert.match(html, />Done</);
  assert.doesNotMatch(html, /Continue/);
});

test("without the support flag there is one page, no dots, and Done", () => {
  const html = render({ releases: [releases[0]], showSupport: false, page: 0 });
  assert.match(html, />Done</);
  assert.doesNotMatch(html, /Continue/);
  assert.doesNotMatch(html, /data-active/);
});

test("the last seen version reads from storage and tolerates a missing store", () => {
  assert.equal(readLastSeenVersion(null), null);
  assert.equal(readLastSeenVersion({ getItem: (key) => (key === LAST_SEEN_VERSION_KEY ? "0.5.0" : null) }), "0.5.0");
  assert.equal(readLastSeenVersion({ getItem: () => { throw new Error("blocked"); } }), null);
});
