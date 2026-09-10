import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { click, focused, mount, press, settle } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { SearchableSelect } = await jiti.import("./SearchableSelect.tsx");
const h = React.createElement;

const options = [
  { value: "default", label: "Default" },
  { value: "compact", label: "Compact" },
];

test("SearchableSelect passes control identity and ARIA relationships to its trigger", () => {
  const html = renderToStaticMarkup(React.createElement(SearchableSelect, {
    id: "layout-density",
    value: "default",
    options,
    onChange() {},
    "aria-labelledby": "layout-density-label",
    "aria-describedby": "layout-density-description layout-density-error",
    "aria-invalid": true,
  }));

  assert.match(html, /<button[^>]*id="layout-density"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-labelledby="layout-density-label"/);
  assert.match(html, /aria-describedby="layout-density-description layout-density-error"/);
  assert.match(html, /aria-invalid="true"/);
});

test("SearchableSelect preserves the existing ariaLabel property", () => {
  const html = renderToStaticMarkup(React.createElement(SearchableSelect, {
    value: "default",
    options,
    onChange() {},
    ariaLabel: "Layout density",
  }));

  assert.match(html, /aria-label="Layout density"/);
});

async function openSelect(props = {}) {
  const changes = [];
  const view = await mount(h(SearchableSelect, {
    value: "default",
    options,
    ariaLabel: "Layout density",
    onChange(value) { changes.push(value); },
    ...props,
  }));
  const trigger = view.container.querySelector("[role=combobox]");
  await click(trigger);
  await settle();
  return { ...view, changes, trigger };
}

test("SearchableSelect opens its list, moves the active option, and reports a choice", async () => {
  const view = await openSelect();

  const search = view.container.querySelector("input");
  assert.equal(focused(), search, "The list must take focus on its search field.");
  assert.equal(view.trigger.getAttribute("aria-expanded"), "true");

  const optionNodes = view.container.querySelectorAll("[role=option]");
  assert.equal(optionNodes.length, 2);
  assert.equal(optionNodes[0].getAttribute("data-active"), "true");

  await press(search, "ArrowDown");
  assert.equal(view.container.querySelectorAll("[role=option]")[1].getAttribute("data-active"), "true");

  await press(search, "Enter");
  await settle();

  assert.deepEqual(view.changes, ["compact"]);
  assert.equal(view.container.querySelector("[role=listbox]"), null, "A choice closes the list.");
  await view.unmount();
});

test("SearchableSelect keeps Escape for its own list", async () => {
  const view = await openSelect();
  const search = view.container.querySelector("input");

  const event = await press(search, "Escape");
  await settle();

  assert.equal(view.container.querySelector("[role=listbox]"), null, "Escape closes the list.");
  assert.equal(event.defaultPrevented, true, "The select marks Escape handled.");
  assert.equal(event.propagationStopped, true, "The select stops Escape at its own list.");
  assert.deepEqual(view.changes, []);
  await view.unmount();
});
