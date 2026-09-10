"use client";

import { forwardRef, useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";
import { cx, ui } from "@/lib/ui";

export type MenuItemRole = "menuitem" | "menuitemcheckbox" | "menuitemradio";

export type MenuSurface = "default" | "plain";

const ITEM_SELECTOR = "[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio']";

function isEnabled(item: HTMLElement): boolean {
  return !item.matches(":disabled, [aria-disabled='true']");
}

function enabledItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []).filter(isEnabled);
}

function initialItem(items: HTMLElement[]): HTMLElement | undefined {
  return items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0];
}

export interface MenuProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  open: boolean;
  label: string;
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  surface?: MenuSurface;
}

export function Menu({
  open,
  label,
  onClose,
  triggerRef,
  surface = "default",
  className,
  children,
  onClickCapture,
  onKeyDown,
  ...props
}: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) initialItem(enabledItems(menuRef.current))?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    const roving = open ? (items.find((item) => item === document.activeElement && isEnabled(item))
      ?? initialItem(items.filter(isEnabled))) : undefined;
    for (const item of items) item.setAttribute("tabindex", item === roving ? "0" : "-1");
  });

  const restoreTrigger = () => triggerRef?.current?.focus();

  const restoreTriggerAfterClose = () => {
    requestAnimationFrame(() => {
      const focusedDialog = document.activeElement?.closest("[role='dialog']");
      const triggerDialog = triggerRef?.current?.closest("[role='dialog']");
      if (focusedDialog && focusedDialog !== triggerDialog) return;
      const menu = menuRef.current;
      if (!menu || menu.getAttribute("aria-hidden") === "true") restoreTrigger();
    });
  };

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    onClickCapture?.(event);
    const target = event.target instanceof Element ? event.target : null;
    const item = target?.closest(ITEM_SELECTOR);
    if (item && item.getAttribute("aria-haspopup") !== "menu" && menuRef.current?.contains(item)) restoreTriggerAfterClose();
  };

  const moveTo = (item: HTMLElement | undefined) => {
    if (!item) return;
    item.focus();
    const menu = menuRef.current;
    if (!menu) return;
    for (const other of menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
      other.setAttribute("tabindex", other === item ? "0" : "-1");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "Tab") {
      restoreTrigger();
      onClose();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreTrigger();
      onClose();
      return;
    }

    const items = enabledItems(menuRef.current);
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const activeItem = items[current]
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      activeItem?.click();
      return;
    }

    let next: number;
    switch (event.key) {
      case "ArrowDown": next = current < items.length - 1 ? current + 1 : 0; break;
      case "ArrowUp": next = current > 0 ? current - 1 : items.length - 1; break;
      case "Home": next = 0; break;
      case "End": next = items.length - 1; break;
      default: return;
    }

    event.preventDefault();
    moveTo(items[next]);
  };

  return (
    <div
      {...props}
      ref={menuRef}
      role="menu"
      aria-label={label}
      aria-hidden={!open}
      className={cx(ui("menu", { open }), surface === "default" && ui("menuSurface"), className)}
      onClickCapture={handleClickCapture}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style" | "role"> {
  role?: MenuItemRole;
  checked?: boolean;
  icon?: ReactNode;
  tone?: "neutral" | "danger";
  surface?: MenuSurface;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem({
  role = "menuitem",
  checked,
  icon,
  tone = "neutral",
  surface = "default",
  className,
  disabled,
  type = "button",
  children,
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      role={role}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-checked={role === "menuitemradio" || role === "menuitemcheckbox" ? Boolean(checked) : undefined}
      className={cx(
        ui("menuItem", { tone }),
        surface === "default" && ui("menuItemSurface"),
        className,
      )}
    >
      {icon === undefined ? null : <span aria-hidden="true" className={ui("menuItemIcon")}>{icon}</span>}
      {children}
    </button>
  );
});
