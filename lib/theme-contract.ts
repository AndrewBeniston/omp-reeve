export const WEB_THEME_VARIABLE_NAMES = [
  "--bg",
  "--bg-panel",
  "--bg-hover",
  "--bg-selected",
  "--border",
  "--text",
  "--text-muted",
  "--text-dim",
  "--accent",
  "--accent-hover",
  "--user-bg",
  "--assistant-bg",
  "--tool-bg",
  "--bg-subtle",
  "--success",
  "--danger",
  "--warning",
  "--syntax-text",
  "--syntax-text-muted",
  "--syntax-accent",
  "--syntax-success",
  "--syntax-danger",
  "--syntax-warning",
  "--omp-md-heading",
  "--omp-md-link",
  "--omp-md-code",
] as const;

export function hasCompleteWebThemeVariables(variables: unknown): variables is Record<string, string> {
  if (!variables || typeof variables !== "object") return false;
  const values = variables as Record<string, unknown>;
  return WEB_THEME_VARIABLE_NAMES.every((name) => typeof values[name] === "string");
}
