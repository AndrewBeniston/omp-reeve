import styles from "./navigation/navigation.module.css";

interface IconProps { size?: number }

type CatppuccinIconName =
  | "_file" | "_folder" | "_folder_open" | "bash" | "config" | "css" | "database"
  | "docker" | "env" | "git" | "graphql" | "html" | "javascript" | "javascript-react"
  | "json" | "lock" | "npm-lock" | "bun-lock" | "next" | "eslint" | "markdown"
  | "ms-word" | "pdf" | "python" | "rust" | "sass" | "terraform" | "toml"
  | "typescript" | "typescript-react" | "yaml" | "go";

function CatppuccinIcon({ name, size = 14 }: IconProps & { name: CatppuccinIconName }) {
  return <span aria-hidden="true" className={styles.fileIcon} data-icon={name} data-size={size} />;
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

export function getFileIcon(name: string, size = 14): React.ReactNode {
  const lower = name.toLowerCase();
  const icon = getSpecialFileIcon(lower) ?? EXTENSION_ICONS[lower.split(".").pop() ?? ""] ?? "_file";
  return <CatppuccinIcon name={icon} size={size} />;
}
