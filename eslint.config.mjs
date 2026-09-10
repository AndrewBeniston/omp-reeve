import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * DESIGN.md section 12.2 rules 1 to 4.
 * Every rule below ships with eslint or eslint-config-next. No new dependency.
 * The waived files match scripts/ui-style-exceptions.mjs exactly.
 * scripts/check-ui-style-boundaries.mjs caps their counts with
 * config/inline-style-baseline.json, so a waiver cannot grow.
 */

/** Rule 1. Files that may keep an intrinsic style attribute. */
const INLINE_STYLE_WAIVERS = [
  "components/ui/DynamicStyleVars.tsx",
  "components/ui/AnsiSegment.tsx",
];

/** Rule 4. Files that may write to element.style. */
const STYLE_MUTATION_WAIVERS = [
  "hooks/useTheme.ts",
  "hooks/useViewportHeight.ts",
  "lib/clipboard.ts",
  "app/layout.tsx",
];

/** Rule 3. Files that may hold a color literal. */
const COLOR_LITERAL_WAIVERS = ["app/layout.tsx"];

const STYLE_PROP_MESSAGE =
  "DESIGN.md 12.2: a module interface must not accept a style prop. Use Omit<..., \"style\"> and a Tier 2 class.";

const COLOR_LITERAL_MESSAGE =
  "DESIGN.md 12.2: use a Tier 2 token instead of a color literal. Examples: var(--ui-danger), var(--ui-accent), var(--ui-text-muted), var(--ui-border).";

const STYLE_MUTATION_MESSAGE =
  "DESIGN.md 12.2: do not mutate element.style. Use a class, a data attribute, an ARIA state, or DynamicStyleVars.";

const NO_STYLE_PROP_ON_INTERFACE = [
  { selector: 'TSInterfaceBody > TSPropertySignature[key.name="style"]', message: STYLE_PROP_MESSAGE },
  { selector: 'TSTypeLiteral > TSPropertySignature[key.name="style"]', message: STYLE_PROP_MESSAGE },
];

const NO_COLOR_LITERAL = [
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: COLOR_LITERAL_MESSAGE,
  },
  {
    selector: 'Literal[value=/(?:^|[\\s:(,])(?:rgb|rgba|hsl|hsla)\\s*\\(/]',
    message: COLOR_LITERAL_MESSAGE,
  },
  {
    selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
    message: COLOR_LITERAL_MESSAGE,
  },
];

const NO_DOM_STYLE_MUTATION = [
  {
    selector: 'AssignmentExpression[left.object.property.name="style"]',
    message: STYLE_MUTATION_MESSAGE,
  },
  {
    selector: 'AssignmentExpression[left.property.name="style"]',
    message: STYLE_MUTATION_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.object.property.name="style"][callee.property.name=/^(?:setProperty|removeProperty)$/]',
    message: STYLE_MUTATION_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.property.name="setAttribute"][arguments.0.value="style"]',
    message: STYLE_MUTATION_MESSAGE,
  },
];

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // Generated packaging output. server.staging belongs here too: a build
    // leaves it in place, and eslint then reports tens of thousands of
    // problems from the copied dependency tree.
    ignores: ["**/desktop/server", "**/desktop/server.staging", "**/desktop/dist"],
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Rule 1. Reject the style attribute on an intrinsic element.
    files: ["app/**/*.tsx", "components/**/*.tsx", "lib/**/*.tsx", "hooks/**/*.tsx"],
    rules: {
      "react/forbid-dom-props": ["error", {
        forbid: [{
          propName: "style",
          message: "DESIGN.md 12.2: use a class or DynamicStyleVars instead of an inline style attribute.",
        }],
      }],
    },
  },
  {
    files: INLINE_STYLE_WAIVERS,
    rules: { "react/forbid-dom-props": "off" },
  },
  {
    // Rules 2 and 4 cover TypeScript and TSX.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/ui/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_STYLE_PROP_ON_INTERFACE, ...NO_DOM_STYLE_MUTATION],
    },
  },
  {
    // Rule 3 covers TSX only, as DESIGN.md 12.2 rule 3 states.
    files: ["app/**/*.tsx", "components/**/*.tsx", "lib/ui/**/*.tsx", "hooks/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_STYLE_PROP_ON_INTERFACE, ...NO_DOM_STYLE_MUTATION, ...NO_COLOR_LITERAL],
    },
  },
  {
    // The three TypeScript files that write measured geometry or theme values.
    files: STYLE_MUTATION_WAIVERS.filter((file) => file.endsWith(".ts")),
    rules: {
      "no-restricted-syntax": ["error", ...NO_STYLE_PROP_ON_INTERFACE],
    },
  },
  {
    // The boot script writes the stored theme, and the metadata ships literals.
    files: COLOR_LITERAL_WAIVERS,
    rules: {
      "no-restricted-syntax": ["error", ...NO_STYLE_PROP_ON_INTERFACE],
    },
  },
];

export default eslintConfig;
