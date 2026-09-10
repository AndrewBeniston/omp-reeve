import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { ApiSelect, Check, NumInput, SecretTextInput, TextInput } = await jiti.import("./model-fields.tsx");
const { FormField } = await jiti.import("../ui/FormField.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function render(element) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, element));
}

test("FormField gives its control the id the label points at", () => {
  const html = render(React.createElement(FormField, {
    id: "models-provider-base-url",
    label: "Base URL",
    description: "Where the provider lives",
  }, React.createElement(TextInput, { value: "", onChange() {} })));

  assert.match(html, /<label for="models-provider-base-url"/);
  assert.match(html, /<input[^>]*id="models-provider-base-url"/);
  assert.match(html, /aria-describedby="models-provider-base-url-description"/);
});

test("a secret field hides the value and offers a reveal control", () => {
  const html = render(React.createElement(SecretTextInput, {
    value: "sk-secret",
    onChange() {},
    "aria-label": "API Key",
  }));

  assert.match(html, /<input[^>]*type="password"/);
  assert.match(html, /aria-label="API Key"/);
  assert.match(html, /<button[^>]*aria-label="Show details"/);
  assert.doesNotMatch(html, /value="sk-secret"[^>]*type="text"/);
});

test("a number field stays a number input and keeps its placeholder", () => {
  const html = render(React.createElement(NumInput, {
    value: "",
    onChange() {},
    placeholder: "128000",
    "aria-label": "Context window",
  }));

  assert.match(html, /type="number"/);
  assert.match(html, /placeholder="128000"/);
});

test("a checkbox field reports its own checked state", () => {
  const html = render(React.createElement(Check, {
    label: "Reasoning / thinking",
    checked: true,
    onChange() {},
  }));

  assert.match(html, /<input type="checkbox" checked=""/);
  assert.match(html, /Reasoning \/ thinking/);
});

test("the API picker adds a none option only when the field is optional", () => {
  const options = ["openai-completions", "anthropic-messages"];
  const optional = render(React.createElement(ApiSelect, { value: "", onChange() {}, options }));
  const required = render(React.createElement(ApiSelect, {
    value: "openai-completions",
    onChange() {},
    options,
    required: true,
  }));

  assert.match(optional, /none/);
  assert.doesNotMatch(required, /none/);
  assert.match(required, /role="combobox"/);
});
