"use client";

import styles from "./launcher.module.css";

/**
 * What a launcher entry can open.
 *
 * The ids, their order and their accelerators all come from the reference
 * application's own command registry, read from its shipped bundle:
 *
 *   review     Ctrl+Shift+G    toggleReviewTab
 *   terminal   Control+`       toggleTerminal
 *   browser    CmdOrCtrl+T     openBrowserTab
 *   files      CmdOrCtrl+P     searchFiles
 *   side-chat  CmdOrCtrl+Alt+S openSideChat
 *
 * Its order map puts review first for a git-backed project, which every Reeve
 * Project is, so review leads here too.
 */
export type LauncherActionId = "review" | "terminal" | "browser" | "files" | "side-chat";

export interface LauncherAction {
  id: LauncherActionId;
  label: string;
  /** The accelerator, already written for this platform. */
  keys: string;
  /** Why this entry cannot be chosen yet. Absent when it can. */
  unavailableReason?: string;
  run: () => void;
}

interface Props {
  actions: LauncherAction[];
  /** Announced as the list's name; the panel and the plus control differ. */
  label: string;
}

/**
 * The panel's own empty state, and the surface the plus control opens.
 *
 * Every entry is listed even when its feature is not built yet, because this
 * is how a human learns what the panel can hold. Before this existed the empty
 * panel said "No file open", which taught nobody anything.
 */
export function Launcher({ actions, label }: Props) {
  return (
    <div className={styles.launcherPage}>
      <div className={styles.launcherList} role="list" aria-label={label}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="listitem"
            className={styles.launcherRow}
            disabled={Boolean(action.unavailableReason)}
            title={action.unavailableReason}
            onClick={action.run}
          >
            <span className={styles.launcherIcon}>
              <LauncherIcon id={action.id} />
            </span>
            <span className={styles.launcherLabel}>{action.label}</span>
            {action.unavailableReason
              ? <span className={styles.launcherReason}>{action.unavailableReason}</span>
              : <span className={styles.launcherKeys}>{action.keys}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 12px glyphs, matching the reference's own row icons. */
function LauncherIcon({ id }: { id: LauncherActionId }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "review":
      return (
        <svg {...common}>
          <rect x="1.6" y="1.6" width="10.8" height="10.8" rx="2.4" />
          <path d="M4.4 7h5.2M7 4.4v5.2" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <rect x="1.2" y="2.2" width="11.6" height="9.6" rx="2" />
          <path d="m4 6 1.6 1.6L4 9.2M7.4 9.6h2.6" />
        </svg>
      );
    case "browser":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.4" />
          <path d="M1.6 7h10.8" />
          <path d="M7 1.6a8.2 8.2 0 0 1 0 10.8a8.2 8.2 0 0 1 0-10.8" />
        </svg>
      );
    case "files":
      return (
        <svg {...common}>
          <path d="M2 4.4a1.8 1.8 0 0 1 1.8-1.8h1.9l1.2 1.5h3.3A1.8 1.8 0 0 1 12 5.9v4.3a1.8 1.8 0 0 1-1.8 1.8H3.8A1.8 1.8 0 0 1 2 10.2Z" />
        </svg>
      );
    case "side-chat":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.4" />
          <path d="M4.6 7h4.8M7 4.6v4.8" />
        </svg>
      );
  }
}

