"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import {
  serializeHeaderRows,
  updateHeaderRow,
  type HeaderRow,
} from "../models-config-helpers";
import styles from "./header-list-editor.module.css";

/**
 * Editable key/value request-header list for a provider or a model.
 * Rows stay local so a blank draft is never persisted as an invalid HTTP
 * header name.
 */
export function HeaderListEditor({ headers, onChange }: {
  headers: Record<string, string> | undefined;
  onChange: (h: Record<string, string> | undefined) => void;
}) {
  const [rows, setRows] = useState<HeaderRow[]>(() => Object.entries(headers ?? {}).map(
    ([name, value], id) => ({ id, name, value }),
  ));
  const nextRowIdRef = useRef(rows.length);

  const applyRows = (next: HeaderRow[]): void => {
    setRows(next);
    onChange(serializeHeaderRows(next));
  };
  const setEntry = (id: number, changes: Partial<Pick<HeaderRow, "name" | "value">>): void => {
    applyRows(updateHeaderRow(rows, id, changes));
  };
  const removeEntry = (id: number): void => {
    applyRows(rows.filter((row) => row.id !== id));
  };

  return (
    <div className={styles.headerList}>
      {rows.map((row) => (
        <div key={row.id} className={styles.headerRow}>
          <input
            value={row.name}
            onChange={(e) => setEntry(row.id, { name: e.target.value })}
            placeholder="Header-Name"
            aria-label="Header name"
            className={styles.headerInput}
          />
          <input
            value={row.value}
            onChange={(e) => setEntry(row.id, { value: e.target.value })}
            placeholder="value"
            aria-label="Header value"
            className={styles.headerInput}
          />
          <IconButton
            label="Remove header"
            tone="danger"
            size="sm"
            onClick={() => removeEntry(row.id)}
          >
            ✕
          </IconButton>
        </div>
      ))}
      <Button
        tone="ghost"
        size="sm"
        onClick={() => setRows((current) => [
          ...current,
          { id: nextRowIdRef.current++, name: "", value: "" },
        ])}
        className={styles.addHeaderButton}
      >
        + Add header
      </Button>
    </div>
  );
}
