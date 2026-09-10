import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const require = createRequire(import.meta.url);
const React = require("react");
const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { TabBar } = await jiti.import("./TabBar.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const tabs = [
  { id: "alpha", kind: "file", label: "alpha.ts", filePath: "/project/alpha.ts" },
  { id: "notes", kind: "file", label: "notes.md", filePath: "/project/notes.md" },
  { id: "sources", kind: "sources", label: "Sources", sourceSessionId: "session-1", sources: [] },
];

const browserTabs = [
  ...tabs,
  { id: "browser:1", kind: "browser", label: "Electron", url: "https://electronjs.org/docs" },
];

function render(activeTabId = "notes", list = tabs, extraProps = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TabBar, {
        tabs: list,
        activeTabId,
        onSelectTab() {},
        onCloseTab() {},
        ...extraProps,
      }),
    ),
  );
}

test("renders file labels, close labels, and active tab markup", () => {
  const html = render();

  assert.match(html, />alpha\.ts</);
  assert.match(html, />notes\.md</);
  assert.match(html, />Sources</);
  assert.match(html, /title="\/project\/alpha\.ts"/);
  assert.match(html, /aria-label="Close alpha\.ts"/);
  assert.match(html, /data-tab-id="notes"[^>]*data-active="true"/);
  assert.match(html, /data-tab-id="alpha"[^>]*data-active="false"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-tab-id="notes"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html, /data-tab-id="alpha"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
});

test("a browser tab shows its page name and its address", () => {
  const html = render("browser:1", browserTabs);

  // The page named itself, so the Tab carries that name rather than a URL.
  assert.match(html, />Electron</);
  // The address is the tooltip: it is the Tab's most specific identity, the way
  // a path is for a file.
  assert.match(html, /title="https:\/\/electronjs\.org\/docs"/);
  assert.match(html, /data-tab-id="browser:1"[^>]*data-active="true"/);
});

test("the new browser tab control appears only when it can be used", () => {
  const without = render("notes", tabs);
  assert.doesNotMatch(without, /aria-label="New tab"/);

  const withControl = render("notes", tabs, {
    newTabActions: [{ id: "browser", label: "Browser", keys: "⌘T", run() {} }],
  });
  assert.match(withControl, /aria-label="New tab"/);
});

test("the launcher is absent when nothing can be opened", () => {
  assert.doesNotMatch(render("notes", tabs, { newTabActions: [] }), /aria-label="New tab"/);
});

test("selects and closes tabs through the callback props", () => {
  const selected = [];
  const closed = [];
  const reactInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previousDispatcher = reactInternals.H;
  reactInternals.H = {
    useContext: () => ({ t: (key) => key === "i18n.close" ? "Close" : key }),
    useState: (initial) => [initial, () => {}],
  };

  try {
    const tree = TabBar({
      tabs,
      activeTabId: "notes",
      onSelectTab: (id) => selected.push(id),
      onCloseTab: (id) => closed.push(id),
    });
    // Find the Tab and its close control rather than indexing by position: the
    // strip gained a trailing control, and a positional index makes an
    // unrelated addition look like a regression.
    const children = [tree.props.children].flat(2).filter(Boolean);
    const alphaTab = children.find((child) => child?.props?.["data-tab-id"] === "alpha");
    assert.ok(alphaTab, "the alpha tab is rendered");
    const closeButton = [alphaTab.props.children]
      .flat(2)
      .find((child) => typeof child?.props?.label === "string" && child.props.label.includes("alpha.ts"));
    assert.ok(closeButton, "the alpha tab has a close control");
    let propagationStopped = false;

    alphaTab.props.onClick();
    alphaTab.props.onKeyDown({
      key: "ArrowRight",
      preventDefault() {},
      currentTarget: { parentElement: null },
    });
    closeButton.props.onClick({
      stopPropagation() {
        propagationStopped = true;
      },
    });

    assert.deepEqual(selected, ["alpha", "notes"]);
    assert.deepEqual(closed, ["alpha"]);
    assert.equal(propagationStopped, true);
  } finally {
    reactInternals.H = previousDispatcher;
  }
});
