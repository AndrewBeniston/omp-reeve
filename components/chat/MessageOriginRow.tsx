import type { ReactNode } from "react";
import styles from "./message-origin-row.module.css";

export function MessageOriginRow({ children }: { children: ReactNode }) {
  return (
    <div className={styles.originRow} data-message-origin="true" role="note">
      {children}
    </div>
  );
}
