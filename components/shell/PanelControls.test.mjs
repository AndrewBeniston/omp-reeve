import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { PanelControls } = await jiti.import("./PanelControls.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(PanelControls, {
      maximised: false,
      onToggleMaximised() {},
      panelOpen: true,
      onTogglePanel() {},
      ...props,
    })),
  );
}

test("the panel controls say which way the width toggle goes, and teach its chord", () => {
  const ordinary = render({});
  assert.match(ordinary, /aria-label="Maximise panel"/);
  assert.match(ordinary, /aria-pressed="false"/);
  // The same chord the View menu registers.
  assert.match(ordinary, /title="Maximise panel · Ctrl\+\]"/);

  const maximised = render({ maximised: true });
  assert.match(maximised, /aria-label="Restore panel width"/);
  assert.match(maximised, /aria-pressed="true"/);
});

test("the Tab strip carries the width toggle alone", () => {
  // Panel visibility is the header's control, as it is in the reference.
  const markup = render({});
  assert.equal(markup.match(/<button/g).length, 1);
  assert.doesNotMatch(markup, /Hide file panel/);
});

test("panel visibility joins the strip only while the panel covers the header", () => {
  // At full width Reeve's header is not on screen, and this corner is where
  // the reference keeps its own side panel toggle.
  const markup = render({ maximised: true });
  assert.equal(markup.match(/<button/g).length, 2);
  assert.match(markup, /aria-label="Hide file panel"/);
});
