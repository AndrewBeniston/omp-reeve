import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { React, click, domDocument, focused, mount, press, typeInto } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { AddProviderPicker } = await jiti.import("./AddProviderPicker.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

const oauthProviders = [
  { id: "anthropic", name: "Anthropic", usesCallbackServer: true, loggedIn: false },
  { id: "google", name: "Gemini", usesCallbackServer: true, loggedIn: true },
];

const apiKeyProviders = [
  { id: "groq", displayName: "Groq", configured: false, modelCount: 3 },
  { id: "mistral", displayName: "Mistral", configured: true, modelCount: 9 },
];

async function mountPicker() {
  const calls = { escape: 0, oauth: [], apiKey: [], custom: 0, closed: 0 };

  function Harness() {
    const [open, setOpen] = React.useState(false);
    return h(
      "div",
      {
        onKeyDown: (event) => { if (event.key === "Escape") calls.escape += 1; },
      },
      h("button", { type: "button", id: "add-provider", onClick: () => setOpen(true) }, "Add provider"),
      open
        ? h(AddProviderPicker, {
          oauthProviders,
          apiKeyProviders,
          onSelectOAuth: (id) => calls.oauth.push(id),
          onSelectApiKey: (id) => calls.apiKey.push(id),
          onAddCustom: () => { calls.custom += 1; },
          onClose: () => { calls.closed += 1; setOpen(false); },
        })
        : null,
    );
  }

  const view = await mount(h(I18nProvider, null, h(Harness)));
  const trigger = view.container.querySelector("#add-provider");
  trigger.focus();
  await click(trigger);
  return { ...view, calls, trigger };
}

function dialog() {
  return domDocument.body.querySelector("[role='dialog']");
}

function controls() {
  return dialog().querySelectorAll("button:not([disabled]),input:not([disabled])");
}

function searchField() {
  return dialog().querySelector("input");
}

test("the picker opens as a named dialog and gives focus to its search field", async () => {
  const view = await mountPicker();

  const surface = dialog();
  assert.ok(surface, "the picker must render a dialog");
  assert.equal(surface.getAttribute("aria-modal"), "true");

  const labelId = surface.getAttribute("aria-labelledby");
  const heading = domDocument.body.querySelectorAll("h2").find((node) => node.getAttribute("id") === labelId);
  assert.equal(heading.textContent, "Add provider");
  assert.equal(focused(), searchField());
  await view.unmount();
});

test("Escape closes the picker, stops at the dialog, and restores trigger focus", async () => {
  const view = await mountPicker();

  await press(searchField(), "Escape");

  assert.equal(view.calls.closed, 1);
  assert.equal(dialog(), null);
  assert.equal(view.calls.escape, 0, "the settings surface must not see the Escape");
  assert.equal(focused(), view.trigger);
  await view.unmount();
});

test("the search field filters the provider cards and keeps what the reader typed", async () => {
  const view = await mountPicker();
  const field = searchField();

  await typeInto(field, "groq");

  assert.equal(field.value, "groq");
  const labels = controls()
    .filter((control) => control.tagName === "BUTTON")
    .map((control) => control.textContent);
  assert.equal(labels.length, 1);
  assert.match(labels[0], /Groq/);
  await view.unmount();
});

test("a filtered card still reports its provider and then closes the picker", async () => {
  const view = await mountPicker();
  await typeInto(searchField(), "groq");

  await click(controls().find((control) => control.tagName === "BUTTON"));

  assert.deepEqual(view.calls.apiKey, ["groq"]);
  assert.equal(view.calls.closed, 1);
  assert.equal(focused(), view.trigger);
  await view.unmount();
});

test("a configured provider and a logged-in provider stay out of the picker", async () => {
  const view = await mountPicker();
  const labels = controls()
    .filter((control) => control.tagName === "BUTTON")
    .map((control) => control.textContent)
    .join(" | ");

  assert.match(labels, /Anthropic/);
  assert.match(labels, /Groq/);
  assert.doesNotMatch(labels, /Mistral/);
  assert.doesNotMatch(labels, /Gemini/);
  await view.unmount();
});
