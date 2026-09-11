/**
 * ui-style-exceptions.mjs — the documented exception list for
 * scripts/check-ui-style-boundaries.mjs.
 *
 * Every entry names one exact repository-relative file and one exact rule id.
 * A wildcard, a directory prefix, or a missing reason fails the checker.
 * Add an entry only when DESIGN.md justifies the case.
 *
 * An entry waives one rule, one named vendor prop, or an unresolvedSpread case for the file.
 * It does not waive the count.
 * config/inline-style-baseline.json caps the approved count for every entry,
 * so an approved file cannot collect further violations.
 */

/**
 * @typedef {object} UiStyleException
 * @property {string} file Exact repository-relative path.
 * @property {string} rule Exact rule id from RULES.
 * @property {string} [prop] Exact vendor prop or unresolvedSpread for a prop-scoped rule.
 * @property {string} reason Why the file may break the rule.
 */

/** @type {UiStyleException[]} */
export const UI_STYLE_EXCEPTIONS = [
  {
    file: "components/ui/DynamicStyleVars.tsx",
    rule: "no-inline-style-attribute",
    reason: "DynamicStyleVars writes measured geometry into allow-listed CSS variables.",
  },
  {
    file: "components/ui/AnsiSegment.tsx",
    rule: "no-inline-style-attribute",
    reason: "AnsiSegment validates and applies colors that only ANSI runtime data can supply.",
  },
  {
    file: "components/MermaidBlock.tsx",
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "MermaidBlock passes the selected Prism token style map to react-syntax-highlighter.",
  },
  {
    file: "components/MermaidBlock.tsx",
    rule: "no-react-syntax-highlighter-style-map",
    prop: "lineNumberStyle",
    reason: "MermaidBlock passes the existing line-number layout object to react-syntax-highlighter.",
  },
  {
    file: "components/MermaidBlock.tsx",
    rule: "no-react-syntax-highlighter-style-map",
    prop: "customStyle",
    reason: "MermaidBlock passes the existing block layout object to react-syntax-highlighter.",
  },
  {
    file: "components/MermaidBlock.tsx",
    rule: "no-react-syntax-highlighter-style-map",
    prop: "codeTagProps",
    reason: "MermaidBlock passes the existing code tag style object to react-syntax-highlighter.",
  },
  {
    file: "hooks/useTheme.ts",
    rule: "no-dom-style-mutation",
    reason: "The theme hook applies the OMP Tier 1 palette to the document root.",
  },
  {
    file: "app/layout.tsx",
    rule: "no-dom-style-mutation",
    reason: "The layout boot script applies the stored theme before the first paint.",
  },
  {
    file: "hooks/useViewportHeight.ts",
    rule: "no-dom-style-mutation",
    reason: "The viewport hook writes the measured viewport height variable.",
  },
  {
    file: "hooks/useCaptionInsets.ts",
    rule: "no-dom-style-mutation",
    reason: "The caption hook writes the measured width the system reserves for its window buttons. ADR-0008 requires a measured value, because a fixed one is wrong at a different window zoom.",
  },
  {
    file: "lib/clipboard.ts",
    rule: "no-dom-style-mutation",
    reason: "The clipboard fallback hides the temporary textarea element.",
  },
  {
    file: "app/layout.tsx",
    rule: "no-color-literal",
    reason: "The theme color metadata must ship literal colors to the browser chrome.",
  },
  {
    file: "app/globals.css",
    rule: "no-color-literal",
    reason: "globals.css is the Tier 1 source layer. It declares the light and dark bootstrap palette, the OMP brand aliases, and the fixed scrim colors that the theme must not change.",
  },
  {
    file: "app/tokens.css",
    rule: "no-color-literal",
    reason: "Tier 2 keeps two literal cases only: the --ui-backdrop black mix from DESIGN.md section 4.2 and the --shadow-composer elevation recipe from DESIGN.md section 4.4.",
  },
  {
    file: "lib/omp-theme.ts",
    rule: "no-color-literal",
    reason: "The Tier 1 adapter is the single source of OMP palette color values.",
  },
];

export default UI_STYLE_EXCEPTIONS;
