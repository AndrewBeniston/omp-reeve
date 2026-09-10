"use client";

import { useId, useRef } from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { cx, ui } from "@/lib/ui";
import styles from "./primitives.module.css";

export interface TabGroupMetadata {
  id: string;
  label: ReactNode;
}

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
  group?: TabGroupMetadata;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "style" | "onChange"> {
  label: string;
  value: string;
  items: TabItem[];
  orientation?: "horizontal" | "vertical";
  mountInactivePanels?: boolean;
  onValueChange: (value: string) => void;
}

export function Tabs({
  label,
  value,
  items,
  orientation = "horizontal",
  mountInactivePanels = false,
  onValueChange,
  className,
  ...props
}: TabsProps) {
  const generatedId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const selectedIndex = items.findIndex((item) => item.id === value);
  const sections = items.reduce<Array<{
    key: string;
    group?: TabGroupMetadata;
    tabs: Array<{ item: TabItem; index: number }>;
  }>>((result, item, index) => {
    if (!item.group) {
      result.push({ key: `tab-${index}`, tabs: [{ item, index }] });
      return result;
    }

    const existing = result.find((section) => section.group?.id === item.group?.id);
    if (existing) existing.tabs.push({ item, index });
    else result.push({ key: `group-${item.group.id}`, group: item.group, tabs: [{ item, index }] });
    return result;
  }, []);

  const focusTab = (index: number) => {
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)") ?? []);
    tabs[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)") ?? []);
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";

    if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(tabs.length - 1);
    else if (event.key === previousKey) focusTab(current > 0 ? current - 1 : tabs.length - 1);
    else if (event.key === nextKey) focusTab(current < tabs.length - 1 ? current + 1 : 0);
    else return;
    event.preventDefault();
  };

  const renderTab = (item: TabItem, index: number) => {
    const selected = index === selectedIndex;
    const suffix = safeId(item.id);
    const tabId = `${generatedId}-tab-${suffix}`;
    const panelId = `${generatedId}-panel-${suffix}`;
    return (
      <button
        key={item.id}
        id={tabId}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        disabled={item.disabled}
        className={ui("tab", { selected })}
        onClick={() => onValueChange(item.id)}
      >
        {item.label}
      </button>
    );
  };

  return (
    <div {...props} className={cx(ui("tabs", { orientation }), className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        aria-orientation={orientation}
        className={ui("tabList", { orientation })}
        onKeyDown={handleKeyDown}
      >
        {sections.map((section) => {
          if (!section.group) return section.tabs.map(({ item, index }) => renderTab(item, index));
          const groupId = `${generatedId}-group-${safeId(section.group.id)}`;
          return (
            <div
              key={section.key}
              role="group"
              aria-labelledby={groupId}
              className={cx(styles.tabGroup, styles[orientation])}
            >
              <div id={groupId} className={styles.tabGroupLabel}>{section.group.label}</div>
              {section.tabs.map(({ item, index }) => renderTab(item, index))}
            </div>
          );
        })}
      </div>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        if (!selected && !mountInactivePanels) return null;
        const suffix = safeId(item.id);
        return (
          <div
            key={item.id}
            id={`${generatedId}-panel-${suffix}`}
            role="tabpanel"
            aria-labelledby={`${generatedId}-tab-${suffix}`}
            tabIndex={0}
            hidden={!selected}
            className={ui("tabPanel")}
          >
            {item.panel}
          </div>
        );
      })}
    </div>
  );
}
