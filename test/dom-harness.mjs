import React from "react";

const SELECTOR_TOKEN =
  /^(?:([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=(?:'([^']*)'|"([^"]*)"|([^\]]*)))?\]|:not\(([^()]*)\)|:(disabled|enabled))/;

function matchesCompound(element, selector) {
  let rest = selector.trim();
  let matched = true;
  while (rest.length > 0) {
    const token = SELECTOR_TOKEN.exec(rest);
    if (!token) throw new Error("Unsupported selector: " + selector);
    const [whole, tag, className, id, attribute, singleQuoted, doubleQuoted, unquoted, negated, pseudo] = token;
    if (tag !== undefined) matched = matched && element.tagName === tag.toUpperCase();
    else if (className !== undefined) matched = matched && element.classList.contains(className);
    else if (id !== undefined) matched = matched && element.getAttribute("id") === id;
    else if (attribute !== undefined) {
      const value = singleQuoted ?? doubleQuoted ?? unquoted;
      matched = matched && (value === undefined
        ? element.hasAttribute(attribute)
        : element.getAttribute(attribute) === value);
    } else if (negated !== undefined) matched = matched && !matchesCompound(element, negated);
    else if (pseudo === "disabled") matched = matched && element.hasAttribute("disabled");
    else if (pseudo === "enabled") matched = matched && !element.hasAttribute("disabled");
    rest = rest.slice(whole.length);
  }
  return matched;
}

function matchesSelector(element, selector) {
  return selector.split(",").some((part) => part.trim().length > 0 && matchesCompound(element, part));
}

class DomNode {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get firstChild() { return this.childNodes[0] ?? null; }

  appendChild(child) { return this.insertBefore(child, null); }

  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child, true);
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild(child, preserveFocus = false) {
    const removedFocusedSubtree = !preserveFocus && child.contains(this.ownerDocument.activeElement);
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    if (removedFocusedSubtree) this.ownerDocument.activeElement = this.ownerDocument.body;
    return child;
  }

  contains(other) {
    for (let node = other; node; node = node.parentNode) if (node === this) return true;
    return false;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (matchesSelector(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  addEventListener(type, handler, options) {
    const key = type + (options === true || (options && options.capture) === true ? ":capture" : ":bubble");
    this.listeners.set(key, [...(this.listeners.get(key) ?? []), handler]);
  }

  removeEventListener(type, handler, options) {
    const key = type + (options === true || (options && options.capture) === true ? ":capture" : ":bubble");
    this.listeners.set(key, (this.listeners.get(key) ?? []).filter((entry) => entry !== handler));
  }

  runListeners(event, capture) {
    const key = event.type + (capture ? ":capture" : ":bubble");
    for (const handler of [...(this.listeners.get(key) ?? [])]) {
      event.currentTarget = this;
      if (typeof handler === "function") handler.call(this, event);
      else handler.handleEvent(event);
      if (event.immediatePropagationStopped) return;
    }
  }

  dispatchEvent(event) {
    event.target = this;
    const path = [this];
    for (let node = path[path.length - 1].parentNode; node; node = node.parentNode) path.push(node);
    for (let index = path.length - 1; index > 0 && !event.propagationStopped; index -= 1) {
      path[index].runListeners(event, true);
    }
    if (!event.propagationStopped) {
      this.runListeners(event, true);
      this.runListeners(event, false);
    }
    if (event.bubbles) {
      for (let index = 1; index < path.length && !event.propagationStopped; index += 1) {
        path[index].runListeners(event, false);
      }
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }
}

class DomText extends DomNode {
  constructor(ownerDocument, data) {
    super(ownerDocument);
    this.nodeType = 3;
    this.nodeName = "#text";
    this.data = String(data);
  }

  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
  get nodeValue() { return this.data; }
  set nodeValue(value) { this.data = String(value); }
}

class DomComment extends DomNode {
  constructor(ownerDocument, data) {
    super(ownerDocument);
    this.nodeType = 8;
    this.nodeName = "#comment";
    this.data = String(data);
  }
}

class DomElement extends DomNode {
  constructor(ownerDocument, tagName, namespaceURI) {
    super(ownerDocument);
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespaceURI ?? "http://www.w3.org/1999/xhtml";
    this.attributes = new Map();
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    let currentValue = "";
    Object.defineProperty(this, "value", {
      configurable: true,
      enumerable: false,
      get: () => currentValue,
      set: (next) => { currentValue = next == null ? "" : String(next); },
    });
  }

  get classList() {
    const names = () => (this.getAttribute("class") ?? "").split(" ").filter(Boolean);
    return {
      contains: (name) => names().includes(name),
      add: (name) => { if (!names().includes(name)) this.setAttribute("class", [...names(), name].join(" ")); },
      remove: (name) => this.setAttribute("class", names().filter((entry) => entry !== name).join(" ")),
      toggle: (name, force) => {
        const present = names().includes(name);
        const next = force === undefined ? !present : force;
        if (next) this.classList.add(name);
        else this.classList.remove(name);
        return next;
      },
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }

  get className() { return this.getAttribute("class") ?? ""; }
  set className(value) { this.setAttribute("class", value); }
  get id() { return this.getAttribute("id") ?? ""; }
  set id(value) { this.setAttribute("id", value); }

  get textContent() { return this.childNodes.map((node) => node.textContent ?? "").join(""); }
  set textContent(value) {
    this.childNodes = [];
    if (value !== "" && value != null) this.appendChild(new DomText(this.ownerDocument, value));
  }

  focus() {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new DomEvent("focusin", { bubbles: true }));
  }

  blur() {
    if (this.ownerDocument.activeElement !== this) return;
    this.ownerDocument.activeElement = this.ownerDocument.body;
    this.dispatchEvent(new DomEvent("focusout", { bubbles: true }));
  }

  click() {
    this.dispatchEvent(new DomEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  }

  matches(selector) { return matchesSelector(this, selector); }

  closest(selector) {
    if (matchesSelector(this, selector)) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }

  attachEvent() {}
  detachEvent() {}
}

class DomInputElement extends DomElement {}
class DomTextAreaElement extends DomElement {}
class DomSelectElement extends DomElement {}
class DomButtonElement extends DomElement {}

const ELEMENT_CLASSES = {
  input: DomInputElement,
  textarea: DomTextAreaElement,
  select: DomSelectElement,
  button: DomButtonElement,
};

class DomDocument extends DomNode {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.nodeName = "#document";
    this.documentElement = new DomElement(this, "html");
    this.head = new DomElement(this, "head");
    this.body = new DomElement(this, "body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    const Constructor = ELEMENT_CLASSES[tagName.toLowerCase()] ?? DomElement;
    return new Constructor(this, tagName);
  }
  createElementNS(namespaceURI, tagName) { return new DomElement(this, tagName, namespaceURI); }
  createTextNode(data) { return new DomText(this, data); }
  createComment(data) { return new DomComment(this, data); }
}

class DomWindow extends DomNode {
  constructor(ownerDocument) {
    super(ownerDocument);
    this.nodeType = 9;
    this.nodeName = "#window";
  }
}

class DomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.immediatePropagationStopped = false;
    this.target = null;
    this.currentTarget = null;
    Object.assign(this, init);
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() {
    this.propagationStopped = true;
    this.immediatePropagationStopped = true;
  }
  getModifierState() { return false; }
}

class MemoryStorage {
  constructor() { this.entries = new Map(); }
  getItem(key) { return this.entries.has(key) ? this.entries.get(key) : null; }
  setItem(key, value) { this.entries.set(key, String(value)); }
  removeItem(key) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
}

export const domDocument = new DomDocument();
export const domWindow = new DomWindow(domDocument);

domDocument.parentNode = domWindow;

let reducedMotion = false;

Object.assign(domWindow, {
  document: domDocument,
  navigator: { userAgent: "node", language: "en", languages: ["en"] },
  localStorage: new MemoryStorage(),
  sessionStorage: new MemoryStorage(),
  matchMedia: (query) => ({
    matches: query.includes("prefers-reduced-motion: reduce") ? reducedMotion : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
  requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle) => clearTimeout(handle),
  scrollTo() {},
  Event: DomEvent,
  KeyboardEvent: DomEvent,
  MouseEvent: DomEvent,
  PointerEvent: DomEvent,
  Node: DomNode,
  Element: DomElement,
  HTMLElement: DomElement,
  HTMLIFrameElement: class DomIframeElement extends DomElement {},
  HTMLInputElement: DomInputElement,
  HTMLTextAreaElement: DomTextAreaElement,
  HTMLSelectElement: DomSelectElement,
  HTMLButtonElement: DomButtonElement,
});
domDocument.defaultView = domWindow;

export function installHarnessGlobals() {
  Object.assign(globalThis, {
    window: domWindow,
    document: domDocument,
    navigator: domWindow.navigator,
    localStorage: domWindow.localStorage,
    sessionStorage: domWindow.sessionStorage,
    matchMedia: domWindow.matchMedia,
    requestAnimationFrame: domWindow.requestAnimationFrame,
    cancelAnimationFrame: domWindow.cancelAnimationFrame,
    Event: DomEvent,
    KeyboardEvent: DomEvent,
    MouseEvent: DomEvent,
    PointerEvent: DomEvent,
    Node: DomNode,
    Element: DomElement,
    HTMLElement: DomElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

installHarnessGlobals();

const { createRoot } = await import("react-dom/client");

export { DomEvent };

export async function mount(element) {
  installHarnessGlobals();
  const container = domDocument.createElement("div");
  domDocument.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(element); });
  return {
    container,
    async render(next) { await React.act(async () => { root.render(next); }); },
    async unmount() {
      await React.act(async () => { root.unmount(); });
      domDocument.body.removeChild(container);
      domDocument.activeElement = domDocument.body;
    },
  };
}

export async function press(target, key, init = {}) {
  installHarnessGlobals();
  const event = new DomEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await React.act(async () => { target.dispatchEvent(event); });
  return event;
}

export async function click(target) {
  installHarnessGlobals();
  const event = new DomEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 });
  await React.act(async () => { target.dispatchEvent(event); });
  return event;
}

export async function settle(cycles = 3) {
  installHarnessGlobals();
  for (let index = 0; index < cycles; index += 1) {
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

export function tabbable(root) {
  const candidates = root.querySelectorAll(
    "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[href],[tabindex]",
  );
  return candidates.filter((element) => {
    if (element.getAttribute("tabindex") === "-1") return false;
    for (let node = element; node && node !== root; node = node.parentElement) {
      if (node.hasAttribute("inert") || node.hasAttribute("hidden")) return false;
    }
    return true;
  });
}

export function focused() {
  return domDocument.activeElement;
}

export function setReducedMotion(value) {
  reducedMotion = value;
}

export function textOf(element) {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export async function typeInto(field, text) {
  const propsKey = Object.keys(field).find((key) => key.startsWith("__reactProps$"));
  const onChange = propsKey ? field[propsKey].onChange : undefined;
  if (!onChange) throw new Error("The field carries no React change handler.");
  await React.act(async () => {
    field.value = text;
    onChange({ target: field, currentTarget: field, preventDefault() {}, stopPropagation() {} });
  });
}

export { React };
