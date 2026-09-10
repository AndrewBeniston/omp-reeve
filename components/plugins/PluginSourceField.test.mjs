import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { PluginSourceField } = await jiti.import("./PluginSourceField.tsx");

class TestNode {
  constructor(ownerDocument, nodeType, nodeName) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
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
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }

  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event);
    if (event.bubbles !== false && !event.cancelBubble) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = value ? [new TestText(this.ownerDocument, value)] : [];
  }
}

class TestText extends TestNode {
  constructor(ownerDocument, value) {
    super(ownerDocument, 3, "#text");
    this.nodeValue = value;
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value) {
    this.nodeValue = value;
  }
}

class TestElement extends TestNode {
  constructor(ownerDocument, tagName) {
    super(ownerDocument, 1, tagName.toUpperCase());
    this.tagName = this.nodeName;
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
    createElement(tagName) {
      return new TestElement(document, tagName);
    },
    createElementNS(_namespace, tagName) {
      return new TestElement(document, tagName);
    },
    createTextNode(value) {
      return new TestText(document, value);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    document,
    HTMLElement: TestElement,
    HTMLIFrameElement: class HTMLIFrameElement extends TestElement {},
    getSelection() {
      return null;
    },
  };
  document.defaultView = window;
  document.documentElement = new TestElement(document, "html");
  const container = new TestElement(document, "div");
  return { container, document, window };
}

function findElement(node, tagName) {
  if (node.tagName === tagName.toUpperCase()) return node;
  for (const child of node.childNodes) {
    const match = findElement(child, tagName);
    if (match) return match;
  }
  return null;
}

async function mountField(props = {}) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const dom = createDom();
  const changes = [];
  let installs = 0;
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.container);

  await act(async () => {
    root.render(React.createElement(PluginSourceField, {
      source: "github:user/repo",
      busy: false,
      onSourceChange(value) {
        changes.push(value);
      },
      onInstall() {
        installs += 1;
      },
      ...props,
    }));
  });

  return {
    changes,
    dom,
    get installs() {
      return installs;
    },
    input: findElement(dom.container, "input"),
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

test("PluginSourceField focuses the input after mount", async (t) => {
  const mounted = await mountField();
  t.after(() => mounted.cleanup());

  assert.equal(mounted.dom.document.activeElement, mounted.input);
});

test("PluginSourceField installs a non-empty source with Enter", async (t) => {
  const mounted = await mountField();
  t.after(() => mounted.cleanup());

  await act(async () => {
    mounted.input.dispatchEvent({
      type: "keydown",
      key: "Enter",
      bubbles: true,
      cancelBubble: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
    });
  });

  assert.equal(mounted.installs, 1);
});

test("PluginSourceField ignores Enter while installation is busy", async (t) => {
  const mounted = await mountField({ busy: true });
  t.after(() => mounted.cleanup());

  await act(async () => {
    mounted.input.dispatchEvent({
      type: "keydown",
      key: "Enter",
      bubbles: true,
      cancelBubble: false,
      defaultPrevented: false,
      preventDefault() {},
      stopPropagation() {},
    });
  });

  assert.equal(mounted.installs, 0);
});

test("PluginSourceField normalizes a pasted omp install command", async (t) => {
  const mounted = await mountField();
  t.after(() => mounted.cleanup());

  await act(async () => {
    mounted.input.dispatchEvent({
      type: "paste",
      bubbles: true,
      cancelBubble: false,
      clipboardData: {
        getData() {
          return "omp plugin install github:owner/plugin";
        },
      },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
    });
  });

  assert.deepEqual(mounted.changes, ["github:owner/plugin"]);
});
