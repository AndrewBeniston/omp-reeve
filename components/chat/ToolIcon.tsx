import type { ToolKind } from "./tool-presentation";
import styles from "./message-view.module.css";

export type ToolStatus = "running" | "success" | "error";

export function ToolIcon({ kind, status }: { kind: ToolKind; status: ToolStatus }) {
  return (
    <span
      aria-hidden="true"
      data-tool-icon={kind}
      data-tool-status={status}
      data-error={status === "error"}
      className={styles.toolIcon}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
        <ToolIconGlyph kind={kind} />
      </svg>
    </span>
  );
}

function ToolIconGlyph({ kind }: { kind: ToolKind }) {
  switch (kind) {
    case "read":
      return <><path d="M2.75 1.75h5.5l3 3v7.5h-8.5V1.75Z" /><path d="M8.25 1.75v3h3" /><path d="M4.2 9.1c1.1-1.4 3.6-1.4 4.7 0-1.1 1.4-3.6 1.4-4.7 0Z" /><circle cx="6.55" cy="9.1" r="0.7" fill="currentColor" stroke="none" /></>;
    case "write":
      return <><path d="M2.75 1.75h5.5l3 3v7.5h-8.5V1.75Z" /><path d="M8.25 1.75v3h3" /><path d="M6.55 6.25v4.15m-1.7-1.55 1.7 1.7 1.7-1.7" /></>;
    case "glob":
      return <><path d="M1.75 4.5A1.25 1.25 0 0 1 3 3.25h2.25l1.35 1.35h4.4A1.25 1.25 0 0 1 12.25 5.85v5.1A1.25 1.25 0 0 1 11 12.2H3a1.25 1.25 0 0 1-1.25-1.25V4.5Z" /><path d="M9 7.1v3.8M7.1 9h3.8M7.65 7.65l2.7 2.7m0-2.7-2.7 2.7" /></>;
    case "grep":
      return <><circle cx="5.9" cy="5.9" r="3.25" /><path d="m8.35 8.35 3.25 3.25" /><path d="M4.6 5.2h2.5M4.6 6.8h1.7" /></>;
    case "edit":
      return <><path d="M2.75 1.75h5.5l3 3v7.5h-8.5V1.75Z" /><path d="M8.25 1.75v3h3" /><path d="m4.45 10.55 4.75-4.75 1.45 1.45-4.75 4.75-1.95.5.5-1.95Z" /><path d="m8.45 6.55 1.45 1.45" /></>;
    case "bash":
      return <><rect x="1.5" y="2.1" width="11" height="9.8" rx="1.3" /><path d="m4 5.2 1.8 1.8L4 8.8M7.2 8.8h2.3" /></>;
    case "todo":
      return <><path d="M5.5 3.25h7M5.5 7h7M5.5 10.75h7" /><path d="m1.5 3.1 1 1 1.7-1.9M1.5 6.85l1 1 1.7-1.9M1.5 10.6l1 1 1.7-1.9" /></>;
    case "eval":
      return <><path d="m5 2.5-3 4.5 3 4.5M9 2.5l3 4.5-3 4.5M7.8 2 6.2 12" /></>;
    case "task":
      return <><circle cx="3.1" cy="3.2" r="1.25" /><circle cx="10.9" cy="3.2" r="1.25" /><circle cx="10.9" cy="10.8" r="1.25" /><path d="M4.35 3.2h2.1a2.9 2.9 0 0 1 2.9 2.9v3.45" /><path d="M9.35 3.2h-1.1" /></>;
    case "browser":
      return <><circle cx="7" cy="7" r="5.2" /><path d="M1.9 7h10.2M7 1.8c1.45 1.4 2.2 3.15 2.2 5.2S8.45 10.8 7 12.2C5.55 10.8 4.8 9.05 4.8 7S5.55 3.2 7 1.8Z" /></>;
    case "image":
      return <><rect x="1.75" y="2.25" width="10.5" height="9.5" rx="1.15" /><circle cx="4.8" cy="5.1" r="1" /><path d="m2.6 10 2.6-2.7 1.8 1.8 1.45-1.45 2.95 2.95" /></>;
    case "generic":
      return <><rect x="1.75" y="2" width="10.5" height="10" rx="1.3" /><path d="M4.35 5h5.3M4.35 7.35h3.8M4.35 9.7h4.6" /></>;
  }
}
