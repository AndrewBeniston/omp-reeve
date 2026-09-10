"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SettingsSearchResult } from "@/lib/settings-search";
import { SettingsIcon } from "./SettingsIcon";
import styles from "./settings-search-results.module.css";

export interface SettingsSearchResultsHandle {
  focusFirst: () => void;
}

export const SettingsSearchResults = forwardRef<SettingsSearchResultsHandle, {
  results: SettingsSearchResult[];
  onSelect: (result: SettingsSearchResult) => void;
}>(function SettingsSearchResults({ results, onSelect }, ref) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setActiveIndex(0);
    itemRefs.current = itemRefs.current.slice(0, results.length);
  }, [results]);

  useImperativeHandle(ref, () => ({
    focusFirst() {
      if (!results.length) return;
      setActiveIndex(0);
      itemRefs.current[0]?.focus();
    },
  }), [results.length]);

  if (!results.length) {
    return <div className={styles.empty}>No results found</div>;
  }

  const moveFocus = (index: number) => {
    const next = (index + results.length) % results.length;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  };

  return (
    <div className={styles.results} role="list" aria-label="Settings search results">
      {results.map((result, index) => (
        <button
          key={result.id}
          ref={(node) => { itemRefs.current[index] = node; }}
          type="button"
          className={styles.result}
          data-active={activeIndex === index}
          tabIndex={activeIndex === index ? 0 : -1}
          onFocus={() => setActiveIndex(index)}
          onPointerEnter={() => setActiveIndex(index)}
          onClick={() => onSelect(result)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(index + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(index - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveFocus(0);
            } else if (event.key === "End") {
              event.preventDefault();
              moveFocus(results.length - 1);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(result);
            }
          }}
        >
          <SettingsIcon kind={result.icon ?? "tools"} className={styles.icon} />
          <span className={styles.copy}>
            <span className={styles.label}>{result.label}</span>
            <span className={styles.context}>{result.context}</span>
          </span>
          <span className={styles.chevron} aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
});
