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

function render(activeTabId = "notes") {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TabBar, {
        tabs,
        activeTabId,
        onSelectTab() {},
        onCloseTab() {},
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
  const alphaTab = tree.props.children[0];
    const closeButton = alphaTab.props.children[2];
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
