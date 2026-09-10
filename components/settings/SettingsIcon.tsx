import type { ReactNode } from "react";

const ICON_PATHS: Record<string, ReactNode> = {
  model: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9zM9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m16 0h3M1 15h3m16 0h3"/></>,
  theme: <><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z"/></>,
  skill: <><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/></>,
  plugin: <><path d="M8 3v5m8-5v5M6 8h12v5a6 6 0 0 1-12 0V8Zm6 11v3"/></>,
  mcp: <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 7.5 11 16m5-8.5L13 16M8 6h8"/></>,
  access: <><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></>,
  archive: <><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M3 4h18v4H3zM9 12h6"/></>,
  about: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  appearance: <><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></>,
  interaction: <><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8m-8 3h5"/></>,
  context: <><path d="M5 3h11l3 3v15H5z"/><path d="M15 3v4h4M8 11h8m-8 4h8"/></>,
  memory: <><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5v1a3 3 0 0 0 3 3h1m6-13a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5v1a3 3 0 0 1-3 3h-1M9 4v16m6-16v16"/></>,
  files: <><path d="M3 6h7l2 2h9v11H3z"/></>,
  shell: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></>,
  tools: <><path d="m14 6 4-4 4 4-4 4M3 18l8-8m-6 4 5 5-3 3-5-5 3-3Z"/></>,
  tasks: <><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/></>,
  providers: <><path d="M7 4h10v5H7zM4 15h6v5H4zm10 0h6v5h-6zM12 9v3m-5 0h10M7 12v3m10-3v3"/></>,
};

export function SettingsIcon({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[kind] ?? ICON_PATHS.tools}
    </svg>
  );
}
