"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { cx, ui } from "@/lib/ui";
import primitiveStyles from "./primitives.module.css";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const SCROLL_LOCK_ATTRIBUTE = "data-dialog-scroll-locked";
const MODAL_HOST_ATTRIBUTE = "data-dialog-host";
const MODAL_LAYER_ATTRIBUTE = "data-dialog-layer";

interface ModalLayer {
  element: HTMLElement;
  trigger: HTMLElement | null;
}

const modalLayers: ModalLayer[] = [];
let bodyScrollLock: string | null | undefined;
let modalHost: HTMLElement | null = null;

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function restoreLayer(layer: ModalLayer) {
  layer.element.removeAttribute("inert");
  layer.element.removeAttribute("aria-hidden");
}

function syncModalLayers() {
  const topLayer = modalLayers.at(-1);
  for (const layer of modalLayers) {
    const isLowerLayer = layer !== topLayer;
    if (isLowerLayer) {
      layer.element.setAttribute("inert", "");
      layer.element.setAttribute("aria-hidden", "true");
    } else {
      restoreLayer(layer);
    }
  }
}

function ensureModalHost() {
  if (modalHost?.parentElement === document.body) return modalHost;
  modalHost = document.createElement("div");
  modalHost.setAttribute(MODAL_HOST_ATTRIBUTE, "");
  document.body.appendChild(modalHost);
  return modalHost;
}

function registerModalLayer(trigger: HTMLElement | null) {
  const element = document.createElement("div");
  element.setAttribute(MODAL_LAYER_ATTRIBUTE, "");
  ensureModalHost().appendChild(element);

  const layer: ModalLayer = { element, trigger };

  if (modalLayers.length === 0) {
    bodyScrollLock = document.body.getAttribute(SCROLL_LOCK_ATTRIBUTE);
    document.body.setAttribute(SCROLL_LOCK_ATTRIBUTE, "true");
  }
  modalLayers.push(layer);
  return layer;
}

function unregisterModalLayer(layer: ModalLayer) {
  const index = modalLayers.indexOf(layer);
  if (index === -1) return;
  const wasTopLayer = modalLayers.at(-1) === layer;
  restoreLayer(layer);
  modalLayers.splice(index, 1);
  layer.element.parentElement?.removeChild(layer.element);
  syncModalLayers();

  if (modalLayers.length === 0) {
    restoreAttribute(document.body, SCROLL_LOCK_ATTRIBUTE, bodyScrollLock ?? null);
    bodyScrollLock = undefined;
    modalHost?.parentElement?.removeChild(modalHost);
    modalHost = null;
  }

  if (wasTopLayer && layer.trigger && document.contains(layer.trigger)) layer.trigger.focus();
}

function isTopModalLayer(layer: ModalLayer | null) {
  return Boolean(layer && modalLayers.at(-1) === layer);
}

function ModalPortal({
  layerRef,
  dialogRef,
  initialFocus,
  trigger,
  children,
}: {
  layerRef: React.RefObject<ModalLayer | null>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  initialFocus?: RefObject<HTMLElement | null>;
  trigger: HTMLElement | null;
  children: ReactNode;
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const layer = registerModalLayer(trigger);
    layerRef.current = layer;
    setPortalTarget(layer.element);
    return () => {
      layerRef.current = null;
      unregisterModalLayer(layer);
    };
  }, [layerRef, trigger]);

  useLayoutEffect(() => {
    if (!portalTarget) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const target = initialFocus?.current
      ?? focusedElementInside(dialog)
      ?? focusableElements(dialog)[0]
      ?? dialog;
    target.focus();
    syncModalLayers();
  }, [dialogRef, initialFocus, portalTarget]);

  return portalTarget ? createPortal(children, portalTarget) : children;
}

/** A full-window dialog cannot have a centered-dialog size. */
export type DialogSurface =
  | { presentation?: "centered"; size?: "sm" | "md" | "lg" }
  | { presentation: "fullWindow"; size?: never };

export type DialogProps = Omit<HTMLAttributes<HTMLDivElement>, "style" | "title">
  & DialogSurface
  & {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    /** A false value keeps the dialog open during a busy operation. */
    dismissible?: boolean;
    /** The control that takes focus when the dialog opens. */
    initialFocus?: RefObject<HTMLElement | null>;
    onOpenChange: (open: boolean) => void;
  };

function isReachable(element: HTMLElement, root: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
    if (node.hasAttribute("inert") || node.hasAttribute("hidden")) return false;
  }
  return true;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => isReachable(element, root));
}

function focusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement as HTMLElement | null;
  if (!active || typeof active.focus !== "function") return null;
  return active === document.body ? null : active;
}

function focusedElementInside(root: HTMLElement | null): HTMLElement | null {
  const active = focusedElement();
  return active && root && root.contains(active) ? active : null;
}

export function Dialog({
  open,
  title,
  description,
  presentation = "centered",
  size = "md",
  dismissible = true,
  initialFocus,
  onOpenChange,
  className,
  children,
  ...props
}: DialogProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<ModalLayer>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // React applies autoFocus during commit, so an effect already reads a
  // control inside the dialog. Render runs before commit, so the trigger is
  // still the focused element at this point.
  if (open && !wasOpen.current) {
    wasOpen.current = true;
    triggerRef.current = focusedElement();
  }
  if (!open && wasOpen.current) wasOpen.current = false;

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isTopModalLayer(layerRef.current)) return;
    if (event.key === "Escape") {
      // The open dialog owns Escape, so a global shortcut cannot also react.
      event.stopPropagation();
      if (!dismissible) return;
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = focusedElementInside(dialog);
    if (!active) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (isTopModalLayer(layerRef.current)
      && dismissible
      && event.target === event.currentTarget) onOpenChange(false);
  };

  const layer = (
    <div
      className={ui("dialogBackdrop", { open, presentation })}
      data-state="open"
      onMouseDown={handleBackdrop}
    >
      <div
        {...props}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          presentation === "fullWindow"
            ? ui("dialog", { presentation })
            : ui("dialog", { presentation, size }),
          className,
        )}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className={primitiveStyles.dialogTitle}>{title}</h2>
        {description ? (
          <p id={descriptionId} className={primitiveStyles.dialogDescription}>{description}</p>
        ) : null}
        {children}
      </div>
    </div>
  );

  return (
    <ModalPortal
      layerRef={layerRef}
      dialogRef={dialogRef}
      initialFocus={initialFocus}
      trigger={triggerRef.current}
    >
      {layer}
    </ModalPortal>
  );
}
