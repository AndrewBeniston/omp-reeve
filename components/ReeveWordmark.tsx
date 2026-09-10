import { useId, type ReactNode } from "react";
import styles from "./navigation/navigation.module.css";

export interface ReeveWordmarkProps {
  label?: ReactNode;
  monospace?: boolean;
}

export function ReeveWordmark({ label = "Reeve", monospace = false }: ReeveWordmarkProps) {
  const gradientId = `reeve-pi-gradient-${useId().replaceAll(":", "")}`;
  return (
    <span className={styles.wordmark} data-reeve-wordmark="true" data-gap="10" data-monospace={monospace}>
      <svg className={styles.wordmarkMark} viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop className={styles.wordmarkGradientStart} offset="0" />
            <stop className={styles.wordmarkGradientMiddle} offset=".5" />
            <stop className={styles.wordmarkGradientEnd} offset="1" />
          </linearGradient>
        </defs>
        <path fill={`url(#${gradientId})`} d="M10 14h44v9H43v33h-9V23h-9v22h-9V23H10z" />
      </svg>
      <span className={styles.wordmarkLabel} data-reeve-wordmark-label="true">{label}</span>
    </span>
  );
}
