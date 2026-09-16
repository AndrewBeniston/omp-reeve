"use client";

import styles from "./file-source.module.css";

/**
 * Where this file sits, as a path a human reads left to right.
 *
 * The last segment is the file and is the only one emphasised; a long path
 * scrolls rather than wrapping, so the file name stays where the eye expects
 * it however deep the directory is.
 */
export function FileSourceBreadcrumb({ filePath, root }: { filePath: string; root?: string }) {
  const relative = root && filePath.startsWith(`${root}/`) ? filePath.slice(root.length + 1) : filePath;
  const segments = relative.split("/").filter(Boolean);
  const name = segments.pop() ?? relative;
  return <nav className={styles.breadcrumb} aria-label="File path" title={filePath}>
    {segments.map((segment, index) => <span key={`${segment}-${index}`} className={styles.crumb}>
      <span className={styles.crumbText}>{segment}</span>
      <span className={styles.crumbSeparator} aria-hidden="true">/</span>
    </span>)}
    <span className={styles.crumbFile}>{name}</span>
  </nav>;
}
