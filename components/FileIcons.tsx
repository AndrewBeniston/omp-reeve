import styles from "./navigation/navigation.module.css";

interface IconProps { size?: number }

type CatppuccinIconName =
  | "_file" | "_folder" | "_folder_open" | "bash" | "config" | "css" | "database"
  | "docker" | "env" | "git" | "graphql" | "html" | "javascript" | "javascript-react"
  | "json" | "lock" | "npm-lock" | "bun-lock" | "next" | "eslint" | "markdown"
  | "ms-word" | "pdf" | "python" | "rust" | "sass" | "terraform" | "toml"
  | "typescript" | "typescript-react" | "yaml" | "go";

function CatppuccinIcon({ name, size = 14 }: IconProps & { name: CatppuccinIconName }) {
  // A generic icon is tinted to the interface text colour; a typed one keeps
  // the colours its asset was drawn with. The stylesheet needs to tell them
  // apart, and the leading underscore is how the set itself names the three
  // generic ones.
  const typed = name.startsWith("_") ? undefined : "";
  return <span aria-hidden="true" className={styles.fileIcon} data-icon={name} data-size={size} data-typed={typed} />;
}

export function FolderIcon({ size = 14, open = false }: IconProps & { open?: boolean }) {
  return <CatppuccinIcon name={open ? "_folder_open" : "_folder"} size={size} />;
}

export function GenericFileIcon({ size = 14 }: IconProps) {
  return <CatppuccinIcon name="_file" size={size} />;
}

const EXTENSION_ICONS: Record<string, CatppuccinIconName> = {
  ts: "typescript", tsx: "typescript-react", js: "javascript", mjs: "javascript", cjs: "javascript",
  jsx: "javascript-react", py: "python", json: "json", jsonl: "json", css: "css", less: "css",
  scss: "sass", html: "html", htm: "html", md: "markdown", mdx: "markdown", yaml: "yaml",
  yml: "yaml", toml: "toml", sh: "bash", bash: "bash", zsh: "bash", fish: "bash", rs: "rust",
  go: "go", sql: "database", graphql: "graphql", gql: "graphql", tf: "terraform", hcl: "terraform",
  docx: "ms-word", pdf: "pdf", lock: "lock",
};

function getSpecialFileIcon(name: string): CatppuccinIconName | undefined {
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "docker";
  if (name === ".env" || name.startsWith(".env.")) return "env";
  if ([".gitignore", ".gitattributes", ".gitmodules"].includes(name)) return "git";
  if (name === "package-lock.json") return "npm-lock";
  if (name === "bun.lock") return "bun-lock";
  if (["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts"].includes(name)) return "next";
  if ([".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.mjs", "eslint.config.js"].includes(name)) return "eslint";
  if (["yarn.lock", "pnpm-lock.yaml", "cargo.lock"].includes(name)) return "lock";
  if (/\.config\.(?:ts|js|mjs|cjs)$/.test(name)) return "config";
  return undefined;
}

/**
 * The icon for a file, named by anything that ends in its name.
 *
 * A path is as common here as a bare name - a Review heading names a file by
 * where it is, a tree row by itself - so the name is read from the end of it.
 * Matched against a whole path, "package-lock.json" and every extension miss,
 * and the file falls back to the generic icon while the same file one row
 * above shows its own. Both separators are cut, because a Windows host names
 * its paths with the other one.
 */
export function getFileIcon(name: string, size = 14): React.ReactNode {
  const segments = name.toLowerCase().split(/[/\\]/);
  const lower = segments[segments.length - 1] ?? "";
  const icon = getSpecialFileIcon(lower) ?? EXTENSION_ICONS[lower.split(".").pop() ?? ""] ?? "_file";
  return <CatppuccinIcon name={icon} size={size} />;
}
