import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { SkillSearchForm } = await jiti.import("./SkillDiscovery.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

class FakeNode {
  constructor(nodeType, nodeName, ownerDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.tagName = nodeType === 1 ? nodeName : undefined;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, before) {
    child.parentNode = this;
    const index = this.childNodes.indexOf(before);
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((item) => item !== listener));
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && !event.propagationStopped && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = value
      ? [new FakeText(String(value), this.ownerDocument)]
      : [];
  }
}

class FakeText extends FakeNode {
  constructor(value, ownerDocument) {
    super(3, "#text", ownerDocument);
    this.nodeValue = value;
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value) {
    this.nodeValue = String(value);
  }
}

class FakeElement extends FakeNode {
  constructor(name, ownerDocument) {
    super(1, name.toUpperCase(), ownerDocument);
    this.namespaceURI = "http://www.w3.org/1999/xhtml";
    this.attributes = new Map();
    this.style = {};
    this.value = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

function createDom() {
  const document = {
    nodeType: 9,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
    createElement(name) {
      return new FakeElement(name, document);
    },
    createElementNS(_namespace, name) {
      return new FakeElement(name, document);
    },
    createTextNode(value) {
      return new FakeText(value, document);
    },
  };
  const window = {
    document,
    HTMLElement: FakeElement,
    HTMLIFrameElement: class HTMLIFrameElement extends FakeElement {},
    getSelection() { return null; },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: "en", languages: ["en"] },
  };
  document.defaultView = window;
  document.documentElement = new FakeElement("html", document);
  const container = new FakeElement("div", document);
  return { container, document, window };
}

function findElement(node, nodeName) {
  if (node.nodeName === nodeName) return node;
  for (const child of node.childNodes) {
    const match = findElement(child, nodeName);
    if (match) return match;
  }
  return null;
}

function keyboardEvent(key) {
  return {
    type: "keydown",
    key,
    bubbles: true,
    cancelBubble: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

async function mountSearchForm(overrides = {}) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const dom = createDom();
  const searches = [];
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.navigator = dom.window.navigator;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const root = createRoot(dom.container);
  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(SkillSearchForm, {
          query: "camera",
          searching: false,
          onQueryChange() {},
          onSearch(query) { searches.push(query); },
          ...overrides,
        }),
      ),
    );
  });

  return {
    ...dom,
    searches,
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.navigator = previous.navigator;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

test("SkillSearchForm focuses the mounted search input", async (t) => {
  const mounted = await mountSearchForm();
  t.after(() => mounted.cleanup());

  const input = findElement(mounted.container, "INPUT");
  assert.ok(input);
  assert.equal(mounted.document.activeElement, input);
});

test("SkillSearchForm searches with Enter and ignores other keys", async (t) => {
  const mounted = await mountSearchForm();
  t.after(() => mounted.cleanup());

  const input = findElement(mounted.container, "INPUT");
  await act(async () => input.dispatchEvent(keyboardEvent("ArrowDown")));
  await act(async () => input.dispatchEvent(keyboardEvent("Enter")));

  assert.deepEqual(mounted.searches, ["camera"]);
});
