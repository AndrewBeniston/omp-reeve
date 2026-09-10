"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, Schema, Slice, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createRoot } from "react-dom/client";
import type { ComposerMentionToken } from "@/lib/composer-mention-types";
import { ComposerMentionIcon } from "./ComposerMentionIcon";
import cssModule from "./composer-editor.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

export interface ComposerEditorHandle {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly scrollHeight: number;
  contains(node: Node): boolean;
  focus(): void;
  setSelectionRange(start: number, end: number): void;
  replaceRange(start: number, end: number, text: string): void;
  replaceRangeWithMention(start: number, end: number, mention: ComposerMentionToken, trailingSpace?: boolean): void;
}

interface ComposerEditorProps {
  value: string;
  mentions: ComposerMentionToken[];
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onSelectionChange: (value: string, cursor: number) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
  onCompositionStart: () => void;
  onCompositionEnd: (value: string, cursor: number) => void;
  onPasteImages: (files: File[]) => boolean;
  onHeightChange: (scrollHeight: number) => void;
}

const composerSchema = new Schema({
  nodes: {
    doc: { content: "paragraph" },
    paragraph: {
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM() {
        return ["p", 0];
      },
    },
    text: { group: "inline" },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM() {
        return ["br"];
      },
    },
    mention: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      attrs: {
        kind: { default: "file" },
        label: { default: "" },
        raw: { default: "" },
        detail: { default: "" },
        icon: { default: "action" },
      },
      parseDOM: [{
        tag: "span[data-composer-mention]",
        getAttrs(element) {
          if (!(element instanceof HTMLElement)) return false;
          return {
            kind: element.dataset.mentionKind ?? "file",
            label: element.dataset.mentionLabel ?? element.textContent ?? "",
            raw: element.dataset.mentionRaw ?? "",
            detail: element.dataset.mentionDetail ?? "",
            icon: element.dataset.mentionIcon ?? "action",
          };
        },
      }],
      toDOM(node) {
        return ["span", {
          class: styles.mentionChip,
          "data-composer-mention": "true",
          "data-mention-kind": node.attrs.kind,
          "data-mention-label": node.attrs.label,
          "data-mention-raw": node.attrs.raw,
          "data-mention-detail": node.attrs.detail,
          "data-mention-icon": node.attrs.icon,
          contenteditable: "false",
        }, node.attrs.label];
      },
    },
  },
});

function mentionRaw(node: ProseMirrorNode): string {
  return node.type.name === "mention" ? String(node.attrs.raw ?? "") : "";
}

export function serializeComposerDocument(doc: ProseMirrorNode): string {
  const paragraph = doc.firstChild;
  if (!paragraph) return "";
  let value = "";
  paragraph.forEach((node) => {
    if (node.isText) value += node.text ?? "";
    else if (node.type.name === "hard_break") value += "\n";
    else value += mentionRaw(node);
  });
  return value;
}

function serializeComposerFragment(fragment: Fragment): string {
  let value = "";
  fragment.forEach((node) => {
    if (node.isText) value += node.text ?? "";
    else if (node.type.name === "hard_break") value += "\n";
    else if (node.type.name === "mention") value += mentionRaw(node);
    else value += serializeComposerFragment(node.content);
  });
  return value;
}

function tokenMatchesAt(value: string, offset: number, token: ComposerMentionToken): boolean {
  if (!value.startsWith(token.raw, offset)) return false;
  const before = offset === 0 ? "" : value[offset - 1] ?? "";
  const after = value[offset + token.raw.length] ?? "";
  return (!before || /\s/.test(before)) && (!after || /\s|[.,!?;:)}\]]/.test(after));
}

export function parseComposerValue(value: string, mentions: ComposerMentionToken[]): ProseMirrorNode {
  const tokens = [...mentions]
    .filter((mention) => mention.raw.length > 0)
    .sort((left, right) => right.raw.length - left.raw.length);
  const children: ProseMirrorNode[] = [];
  let text = "";
  const flushText = () => {
    if (!text) return;
    children.push(composerSchema.text(text));
    text = "";
  };

  for (let offset = 0; offset < value.length;) {
    if (value[offset] === "\n") {
      flushText();
      children.push(composerSchema.nodes.hard_break.create());
      offset += 1;
      continue;
    }
    const token = tokens.find((candidate) => tokenMatchesAt(value, offset, candidate));
    if (!token) {
      text += value[offset];
      offset += 1;
      continue;
    }
    flushText();
    children.push(composerSchema.nodes.mention.create({
      kind: token.kind,
      label: token.label,
      raw: token.raw,
      detail: token.detail ?? "",
      icon: token.icon ?? "action",
    }));
    offset += token.raw.length;
  }
  flushText();
  return composerSchema.nodes.doc.create(null, composerSchema.nodes.paragraph.create(null, children));
}

function composerTextOffset(doc: ProseMirrorNode, position: number): number {
  const paragraph = doc.firstChild;
  if (!paragraph) return 0;
  const target = Math.max(1, position);
  let nodePosition = 1;
  let offset = 0;
  paragraph.forEach((node) => {
    if (nodePosition >= target) return;
    if (node.isText) {
      const available = Math.min(node.nodeSize, target - nodePosition);
      offset += Math.max(0, available);
    } else if (target > nodePosition) {
      offset += node.type.name === "hard_break" ? 1 : mentionRaw(node).length;
    }
    nodePosition += node.nodeSize;
  });
  return offset;
}

function composerDocumentPosition(doc: ProseMirrorNode, textOffset: number): number {
  const paragraph = doc.firstChild;
  if (!paragraph) return 1;
  const target = Math.max(0, textOffset);
  let nodePosition = 1;
  let offset = 0;
  let result = 1;
  let found = false;
  paragraph.forEach((node) => {
    if (found) return;
    const textLength = node.isText
      ? node.nodeSize
      : node.type.name === "hard_break" ? 1 : mentionRaw(node).length;
    if (target <= offset + textLength) {
      if (node.isText) result = nodePosition + Math.min(node.nodeSize, target - offset);
      else result = target <= offset ? nodePosition : nodePosition + node.nodeSize;
      found = true;
      return;
    }
    offset += textLength;
    nodePosition += node.nodeSize;
    result = nodePosition;
  });
  return Math.min(result, doc.content.size);
}

function plainTextFragment(text: string): Fragment {
  const nodes: ProseMirrorNode[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (line) nodes.push(composerSchema.text(line));
    if (index < lines.length - 1) nodes.push(composerSchema.nodes.hard_break.create());
  });
  return Fragment.fromArray(nodes);
}

function mentionCatalogKey(mentions: ComposerMentionToken[]): string {
  return mentions.map((mention) => `${mention.kind}:${mention.raw}:${mention.label}:${mention.icon ?? ""}`).sort().join("\n");
}

function createMentionView(node: ProseMirrorNode) {
  const dom = document.createElement("span");
  dom.className = styles.mentionChip;
  dom.dataset.composerMention = "true";
  dom.dataset.mentionKind = String(node.attrs.kind);
  dom.dataset.mentionRaw = String(node.attrs.raw);
  dom.dataset.mentionIcon = String(node.attrs.icon);
  dom.contentEditable = "false";
  if (node.attrs.detail) dom.title = String(node.attrs.detail);

  const icon = document.createElement("span");
  icon.className = styles.mentionIcon;
  icon.setAttribute("aria-hidden", "true");
  const iconRoot = createRoot(icon);
  iconRoot.render(<ComposerMentionIcon kind={node.attrs.kind} name={node.attrs.icon} />);

  const label = document.createElement("span");
  label.className = styles.mentionLabel;
  label.textContent = String(node.attrs.label);
  dom.append(icon, label);
  return {
    dom,
    destroy() {
      iconRoot.unmount();
    },
  };
}

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(function ComposerEditor({
  value,
  mentions,
  placeholder,
  ariaLabel,
  onChange,
  onSelectionChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onPasteImages,
  onHeightChange,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const fallbackSelectionRef = useRef({ start: value.length, end: value.length });
  const mentionsRef = useRef(mentions);
  const appliedMentionsKeyRef = useRef(mentionCatalogKey(mentions));
  const callbacksRef = useRef({
    onChange,
    onSelectionChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    onPasteImages,
    onHeightChange,
  });
  valueRef.current = value;
  mentionsRef.current = mentions;
  callbacksRef.current = {
    onChange,
    onSelectionChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    onPasteImages,
    onHeightChange,
  };

  const reportState = (view: EditorView, docChanged: boolean) => {
    const nextValue = serializeComposerDocument(view.state.doc);
    const cursor = composerTextOffset(view.state.doc, view.state.selection.from);
    valueRef.current = nextValue;
    view.dom.dataset.empty = nextValue.length === 0 ? "true" : "false";
    if (docChanged) callbacksRef.current.onChange(nextValue);
    callbacksRef.current.onSelectionChange(nextValue, cursor);
    requestAnimationFrame(() => callbacksRef.current.onHeightChange(view.dom.scrollHeight));
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof document.createRange !== "function" || typeof window.getSelection !== "function") {
      host.dataset.empty = valueRef.current.length === 0 ? "true" : "false";
      return;
    }
    const state = EditorState.create({
      schema: composerSchema,
      doc: parseComposerValue(valueRef.current, mentionsRef.current),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Shift-Mod-z": redo,
          "Mod-y": redo,
          "Shift-Enter": (editorState, dispatch) => {
            dispatch?.(editorState.tr.replaceSelectionWith(composerSchema.nodes.hard_break.create()).scrollIntoView());
            return true;
          },
        }),
        keymap(baseKeymap),
      ],
    });
    const view = new EditorView(host, {
      state,
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        class: styles.editor,
        role: "textbox",
        spellcheck: "true",
        "data-empty": valueRef.current.length === 0 ? "true" : "false",
        "data-placeholder": placeholder,
      },
      nodeViews: {
        mention: createMentionView,
      },
      clipboardTextSerializer(slice) {
        return serializeComposerFragment(slice.content);
      },
      handleKeyDown(_view, event) {
        return callbacksRef.current.onKeyDown(event) || event.defaultPrevented;
      },
      handlePaste(editorView, event) {
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (files.length > 0 && callbacksRef.current.onPasteImages(files)) {
          event.preventDefault();
          return true;
        }
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return false;
        event.preventDefault();
        editorView.dispatch(editorView.state.tr.replaceSelection(new Slice(plainTextFragment(text), 0, 0)).scrollIntoView());
        return true;
      },
      handleDOMEvents: {
        compositionstart() {
          callbacksRef.current.onCompositionStart();
          return false;
        },
        compositionend(editorView) {
          queueMicrotask(() => {
            const nextValue = serializeComposerDocument(editorView.state.doc);
            const cursor = composerTextOffset(editorView.state.doc, editorView.state.selection.from);
            callbacksRef.current.onCompositionEnd(nextValue, cursor);
          });
          return false;
        },
      },
      dispatchTransaction(transaction) {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        reportState(view, transaction.docChanged);
      },
    });
    viewRef.current = view;
    reportState(view, false);
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, placeholder]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = serializeComposerDocument(view.state.doc);
    const nextMentionsKey = mentionCatalogKey(mentions);
    if (current === value && appliedMentionsKeyRef.current === nextMentionsKey) return;
    const currentStart = composerTextOffset(view.state.doc, view.state.selection.from);
    const currentEnd = composerTextOffset(view.state.doc, view.state.selection.to);
    const doc = parseComposerValue(value, mentions);
    const nextState = EditorState.create({
      schema: composerSchema,
      doc,
      plugins: view.state.plugins,
    });
    const from = composerDocumentPosition(doc, Math.min(currentStart, value.length));
    const to = composerDocumentPosition(doc, Math.min(currentEnd, value.length));
    view.updateState(nextState.apply(nextState.tr.setSelection(TextSelection.create(nextState.doc, from, to))));
    appliedMentionsKeyRef.current = nextMentionsKey;
    reportState(view, false);
  }, [mentions, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.setProps({
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        class: styles.editor,
        role: "textbox",
        spellcheck: "true",
        "data-empty": valueRef.current.length === 0 ? "true" : "false",
        "data-placeholder": placeholder,
      },
    });
  }, [ariaLabel, placeholder]);

  useImperativeHandle(ref, () => ({
    get value() {
      return valueRef.current;
    },
    get selectionStart() {
      const view = viewRef.current;
      return view ? composerTextOffset(view.state.doc, view.state.selection.from) : fallbackSelectionRef.current.start;
    },
    get selectionEnd() {
      const view = viewRef.current;
      return view ? composerTextOffset(view.state.doc, view.state.selection.to) : fallbackSelectionRef.current.end;
    },
    get scrollHeight() {
      return viewRef.current?.dom.scrollHeight ?? hostRef.current?.scrollHeight ?? 0;
    },
    contains(node) {
      return Boolean(viewRef.current?.dom.contains(node) || hostRef.current?.contains(node));
    },
    focus() {
      if (viewRef.current) viewRef.current.focus();
      else hostRef.current?.focus();
    },
    setSelectionRange(start, end) {
      const view = viewRef.current;
      fallbackSelectionRef.current = { start, end };
      if (!view) return;
      const from = composerDocumentPosition(view.state.doc, start);
      const to = composerDocumentPosition(view.state.doc, end);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    },
    replaceRange(start, end, text) {
      const view = viewRef.current;
      if (!view) {
        const nextValue = valueRef.current.slice(0, start) + text + valueRef.current.slice(end);
        const cursor = start + text.length;
        valueRef.current = nextValue;
        fallbackSelectionRef.current = { start: cursor, end: cursor };
        callbacksRef.current.onChange(nextValue);
        callbacksRef.current.onSelectionChange(nextValue, cursor);
        return;
      }
      const from = composerDocumentPosition(view.state.doc, start);
      const to = composerDocumentPosition(view.state.doc, end);
      view.dispatch(view.state.tr.replaceRange(from, to, new Slice(plainTextFragment(text), 0, 0)).scrollIntoView());
    },
    replaceRangeWithMention(start, end, mention, trailingSpace = true) {
      const view = viewRef.current;
      if (!view) {
        const inserted = `${mention.raw}${trailingSpace ? " " : ""}`;
        const nextValue = valueRef.current.slice(0, start) + inserted + valueRef.current.slice(end);
        const cursor = start + inserted.length;
        valueRef.current = nextValue;
        fallbackSelectionRef.current = { start: cursor, end: cursor };
        callbacksRef.current.onChange(nextValue);
        callbacksRef.current.onSelectionChange(nextValue, cursor);
        return;
      }
      const from = composerDocumentPosition(view.state.doc, start);
      const to = composerDocumentPosition(view.state.doc, end);
      const nodes = [composerSchema.nodes.mention.create({
        kind: mention.kind,
        label: mention.label,
        raw: mention.raw,
        detail: mention.detail ?? "",
        icon: mention.icon ?? "action",
      })];
      if (trailingSpace) nodes.push(composerSchema.text(" "));
      view.dispatch(view.state.tr.replaceRange(from, to, new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView());
      view.focus();
    },
  }), []);

  return (
    <div
      ref={hostRef}
      className={styles.host}
      data-composer-editor
      data-empty={value.length === 0 ? "true" : "false"}
      data-placeholder={placeholder}
      suppressHydrationWarning
    />
  );
});
