"use client";

import React, { useEffect, useRef } from "react";
import type {
  ComposerSuggestion,
  ComposerSuggestionGroup,
  ComposerSuggestionSection,
} from "@/lib/composer-intelligence";
import { SlashCommandIcon } from "./SlashCommandIcon";
import cssModule from "./composer-autocomplete.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

const SOURCE_ORDER: ComposerSuggestionGroup[] = [
  "commands",
  "mcp",
  "plugins",
  "agents",
  "liveAgents",
  "tabs",
  "skills",
  "sessions",
  "files",
];

function SuggestionIcon({ item }: { item: ComposerSuggestion }) {
  if (item.kind === "agent") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="6" r="2.75" />
        <path d="M3.25 13.5c.45-2.35 2.05-3.5 4.75-3.5s4.3 1.15 4.75 3.5" />
      </svg>
    );
  }
  if (item.kind === "file") {
    return item.isDirectory ? (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.75 4.25A1.5 1.5 0 0 1 3.25 2.75h3l1.25 1.5h5.25a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-6.5Z" />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 1.75h6l4 4v8.5H3V1.75Z" />
        <path d="M9 1.75v4h4" />
      </svg>
    );
  }
  if (item.kind === "computer-use" || item.kind === "plugin") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.25" width="12" height="8.5" rx="1.5" />
        <path d="M5.5 13.75h5M8 10.75v3" />
      </svg>
    );
  }
  if (item.kind === "session") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 2.5h10v8H7l-3.5 3v-3H3v-8Z" />
        <path d="M5.5 5h5M5.5 7.5h3" />
      </svg>
    );
  }
  if (item.kind === "tab") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <path d="M2 5.75h12M5 5.75h.01" />
      </svg>
    );
  }
  if (item.kind === "mcp") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
        <path d="M5 6.5h.01M8 6.5h.01M11 6.5h.01M5 9.5h.01M8 9.5h.01M11 9.5h.01" />
      </svg>
    );
  }
  if (item.kind === "skill") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m8 1.75 1.35 3.4 3.65.2-2.8 2.35.95 3.55L8 9.25l-3.15 2 .95-3.55L3 5.35l3.65-.2L8 1.75Z" />
      </svg>
    );
  }
  return <SlashCommandIcon name={item.icon} />;
}

function LoadingRow({ text }: { text: string }) {
  return (
    <div className={styles.loadingRow} data-menu-loading="true" role="status">
      <span className={styles.srOnly}>{text}</span>
      <span className={styles.loadingIcon} aria-hidden="true" />
      <span className={styles.loadingLine} aria-hidden="true" />
    </div>
  );
}

export function ComposerSourceMenu({
  variant,
  sections,
  activeIndex,
  loadingGroups,
  label,
  description,
  searchQuery,
  searchPlaceholder,
  emptyText,
  groupLabels,
  loadingText,
  onActiveIndexChange,
  onSelect,
  onSearchQueryChange,
  onSearchKeyDown,
}: {
  variant: "mentions" | "slash";
  sections: ComposerSuggestionSection[];
  activeIndex: number;
  loadingGroups: ComposerSuggestionGroup[];
  label: string;
  description?: string;
  searchQuery?: string;
  searchPlaceholder?: string;
  emptyText: string;
  groupLabels: Record<ComposerSuggestionGroup, string>;
  loadingText: string;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: ComposerSuggestion) => void;
  onSearchQueryChange?: (query: string) => void;
  onSearchKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const items = sections.flatMap((section) => section.items);
  const loading = loadingGroups.length > 0;
  const sectionIds = new Set(sections.map((section) => section.id));
  const loadingSections = SOURCE_ORDER.filter((id) => loadingGroups.includes(id) && !sectionIds.has(id));

  useEffect(() => {
    itemRefs.current.length = items.length;
  }, [items.length]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let index = 0;
  return (
    <div className={styles.menu} data-composer-autocomplete data-menu-variant={variant} role="listbox" aria-label={label}>
      {variant === "slash" ? (
        <div className={styles.slashHeader}>
          <div className={styles.slashTitle}>{label}</div>
          {description ? <div className={styles.slashDescription}>{description}</div> : null}
          {searchPlaceholder ? (
            <input
              className={styles.slashSearch}
              data-menu-search="true"
              value={searchQuery ?? ""}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchQueryChange?.(event.target.value)}
              onKeyDown={onSearchKeyDown}
              autoFocus
              aria-label={searchPlaceholder}
            />
          ) : null}
        </div>
      ) : null}
      <div className={styles.scroller}>
        {sections.map((section) => {
          const sectionLoading = loadingGroups.includes(section.id);
          return (
            <section key={`${section.id}:${section.title ?? ""}`} className={styles.section} aria-label={section.title ?? groupLabels[section.id]}>
              {section.showTitle === false ? null : (
                <div className={styles.sectionTitle}>{section.title ?? groupLabels[section.id]}</div>
              )}
              {sectionLoading ? <LoadingRow text={loadingText} /> : null}
              {section.items.map((item) => {
                const itemIndex = index;
                index += 1;
                const active = itemIndex === activeIndex;
                return (
                  <button
                    key={item.id}
                    ref={(node) => {
                      itemRefs.current[itemIndex] = node;
                    }}
                    type="button"
                    className={styles.item}
                    data-active={active ? "true" : "false"}
                    data-disabled={item.disabled ? "true" : undefined}
                    role="option"
                    aria-selected={active}
                    aria-disabled={item.disabled ? true : undefined}
                    title={item.detail}
                    onMouseEnter={() => { if (!item.disabled) onActiveIndexChange(itemIndex); }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (!item.disabled) onSelect(item);
                    }}
                  >
                    <span className={styles.icon} data-kind={item.kind}>
                      <SuggestionIcon item={item} />
                    </span>
                    <span className={styles.content}>
                      <span className={styles.label}>{item.label}</span>
                      {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
                    </span>
                    {item.rightLabel ? <span className={styles.rightLabel}>{item.rightLabel}</span> : null}
                  </button>
                );
              })}
            </section>
          );
        })}
        {loadingSections.map((id) => (
          <section key={`loading:${id}`} className={styles.section} aria-label={groupLabels[id]}>
            <div className={styles.sectionTitle}>{groupLabels[id]}</div>
            <LoadingRow text={loadingText} />
          </section>
        ))}
        {!loading && items.length === 0 ? <div className={styles.empty} data-menu-empty="true">{emptyText}</div> : null}
      </div>
    </div>
  );
}
