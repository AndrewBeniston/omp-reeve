import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  RULES,
  BASELINE_PATH,
  BASELINE_RULE,
  compareBaseline,
  loadBaseline,
  scanRepository,
  scanSource,
  validateBaseline,
  validateExceptions,
} from "./check-ui-style-boundaries.mjs";
import { UI_STYLE_EXCEPTIONS } from "./ui-style-exceptions.mjs";

const execFileAsync = promisify(execFile);
const checkerPath = fileURLToPath(new URL("./check-ui-style-boundaries.mjs", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function baselineOf(file, rule, limit) {
  return { limits: { [file]: { [rule]: limit } } };
}

function propBaselineOf(file, rule, prop, limit) {
  return { limits: { [file]: { [rule]: { [prop]: limit } } } };
}

function scan(path, content, exceptions = []) {
  return scanSource({ path, content, exceptions });
}

function assertRuleViolation(violations, rule) {
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, rule);
}

function assertKnownRule(rule) {
  if (RULES instanceof Set) {
    assert.ok(RULES.has(rule));
    return;
  }

  const ruleIds = Array.isArray(RULES) ? RULES : Object.keys(RULES);
  assert.ok(ruleIds.includes(rule));
}

async function createRepository(t, files) {
  const root = await mkdtemp(join(tmpdir(), "omp-web-ui-style-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await Promise.all(Object.entries(files).map(async ([path, content]) => {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }));

  return root;
}

test("rejects a static style prop on an intrinsic element", () => {
  const violations = scan(
    "components/StaticStyle.tsx",
    "export const StaticStyle = () => <div style={{ color: themeColor }} />;",
  );

  assertRuleViolation(violations, "no-inline-style-attribute");
});

test("rejects a state-variable style prop on an intrinsic element", () => {
  const violations = scan(
    "components/StateStyle.tsx",
    "export const StateStyle = ({ style }) => <section style={style} />;",
  );

  assertRuleViolation(violations, "no-inline-style-attribute");
});

test("permits a style prop on DynamicStyleVars", () => {
  const violations = scan(
    "components/DynamicPanel.tsx",
    "export const DynamicPanel = ({ style }) => <DynamicStyleVars style={style} />;",
  );

  assert.deepEqual(violations, []);
});

test("permits a style prop on a custom component", () => {
  const violations = scan(
    "components/CustomPanel.tsx",
    "export const CustomPanel = ({ style }) => <Panel style={style} />;",
  );

  assert.deepEqual(violations, []);
});

test("rejects a style map on an imported react-syntax-highlighter component", () => {
  const violations = scan(
    "components/CodeBlock.tsx",
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <SyntaxHighlighter style={vendorStyle}>code</SyntaxHighlighter>;`,
  );

  assertRuleViolation(violations, "no-react-syntax-highlighter-style-map");
});

test("rejects every react-syntax-highlighter styling prop", async (t) => {
  const cases = [
    ["style", 'style="vendor-style"'],
    ["lineNumberStyle", "lineNumberStyle={lineNumberStyle}"],
    ["customStyle", "customStyle={{ margin: 0 }}"],
    ["codeTagProps", "codeTagProps={codeTagProps}"],
  ];

  for (const [prop, attribute] of cases) {
    await t.test(prop, () => {
      const violations = scan(
        `components/${prop}.tsx`,
        `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <SyntaxHighlighter ${attribute}>code</SyntaxHighlighter>;`,
      );

      assertRuleViolation(violations, "no-react-syntax-highlighter-style-map");
      assert.match(violations[0].message, new RegExp(`\\b${prop}\\b`));
    });
  }
});

test("rejects statically known react-syntax-highlighter spread props", async (t) => {
  const cases = [
    [
      "direct object",
      '<SyntaxHighlighter {...{ lineNumberStyle: vendorStyle }}>code</SyntaxHighlighter>',
      "lineNumberStyle",
    ],
    [
      "computed property",
      '<SyntaxHighlighter {...{ ["customStyle"]: vendorStyle }}>code</SyntaxHighlighter>',
      "customStyle",
    ],
    [
      "shorthand property",
      '<SyntaxHighlighter {...{ codeTagProps }}>code</SyntaxHighlighter>',
      "codeTagProps",
    ],
    [
      "constant object",
      'const syntaxProps = { style: vendorStyle };\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "style",
    ],
    [
      "prohibited alias chain",
      'const baseProps = { style: vendorStyle };\nconst syntaxProps = baseProps;\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "style",
    ],
    [
      "nested object spread",
      'const syntaxProps = { customStyle: vendorStyle };\nexport const CodeBlock = () => <SyntaxHighlighter {...{ ...syntaxProps }}>code</SyntaxHighlighter>',
      "customStyle",
    ],
    [
      "typed constant object",
      'const syntaxProps = { codeTagProps: vendorStyle } satisfies Record<string, unknown>;\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "codeTagProps",
    ],
    [
      "Object.assign",
      'const syntaxProps = Object.assign({}, { lineNumberStyle: vendorStyle });\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "lineNumberStyle",
    ],
    [
      "conditional object",
      'const syntaxProps = dark ? { style: darkStyle } : { customStyle: lightStyle };\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "style",
    ],
    [
      "logical object",
      'const syntaxProps = enabled && { codeTagProps };\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>',
      "codeTagProps",
    ],
    [
      "object member",
      'const options = { syntax: { customStyle } };\nexport const CodeBlock = () => <SyntaxHighlighter {...options.syntax}>code</SyntaxHighlighter>',
      "customStyle",
    ],
    [
      "shadowed constant",
      'export function CodeBlock() {\n  const syntaxProps = { lineNumberStyle };\n  return <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>;\n}\nconst syntaxProps = { language: "typescript" }',
      "lineNumberStyle",
    ],
  ];

  for (const [name, body, prop] of cases) {
    await t.test(name, () => {
      const violations = scan(
        `components/Spread-${name}.tsx`,
        `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
${body};`,
      );

      assert.ok(
        violations.some((violation) => (
          violation.rule === "no-react-syntax-highlighter-style-map"
          && violation.message.includes(`\"${prop}\"`)
        )),
      );
    });
  }
});

test("reports each styling prop inside one react-syntax-highlighter spread", () => {
  const violations = scan(
    "components/MultipleSpreadProps.tsx",
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <SyntaxHighlighter {...{ style, customStyle }}>code</SyntaxHighlighter>;`,
  );

  assert.equal(violations.length, 2);
  assert.match(violations[0].message, /"(?:customStyle|style)"/);
  assert.match(violations[1].message, /"(?:customStyle|style)"/);
  assert.notEqual(violations[0].message, violations[1].message);
});

test("counts each react-syntax-highlighter spread usage against its prop cap", async (t) => {
  const path = "components/RepeatedSpread.tsx";
  const root = await createRepository(t, {
    [path]: `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
const syntaxProps = { style: vendorStyle };
export const CodeBlock = () => <>
  <SyntaxHighlighter {...syntaxProps}>one</SyntaxHighlighter>
  <SyntaxHighlighter {...syntaxProps}>two</SyntaxHighlighter>
</>;`,
  });
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "The vendor component requires one approved style prop.",
  }];

  const violations = await scanRepository(root, {
    exceptions,
    baseline: propBaselineOf(path, "no-react-syntax-highlighter-style-map", "style", 1),
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.match(violations[0].message, /1 to 2/);
});

test("rejects a runtime react-syntax-highlighter spread with a precise diagnostic", () => {
  const violations = scan(
    "components/CompliantCodeBlock.tsx",
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = ({ runtimeProps }) => (
  <SyntaxHighlighter {...runtimeProps} language="typescript" useInlineStyles={false}>code</SyntaxHighlighter>
);`,
  );

  assertRuleViolation(violations, "no-react-syntax-highlighter-style-map");
  assert.equal(violations[0].line, 3);
  assert.match(violations[0].message, /runtimeProps/);
  assert.match(violations[0].message, /cannot prove/i);
});

test("rejects a runtime spread that shadows a prohibited outer constant", () => {
  const violations = scan(
    "components/ShadowedRuntimeProps.tsx",
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
const runtimeProps = { style: vendorStyle };
export const CodeBlock = ({ runtimeProps }) => <SyntaxHighlighter {...runtimeProps}>code</SyntaxHighlighter>;`,
  );

  assertRuleViolation(violations, "no-react-syntax-highlighter-style-map");
  assert.match(violations[0].message, /runtimeProps/);
});

test("permits statically resolved safe react-syntax-highlighter spreads", async (t) => {
  const cases = [
    ["direct object", "<SyntaxHighlighter {...{ language: 'typescript', useInlineStyles: false }}>code</SyntaxHighlighter>"],
    [
      "alias chain",
      "const baseProps = { language: 'typescript' };\nconst syntaxProps = baseProps;\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>",
    ],
    [
      "safe member",
      "const options = { syntax: { language: 'typescript', wrapLongLines: true } };\nexport const CodeBlock = () => <SyntaxHighlighter {...options.syntax}>code</SyntaxHighlighter>",
    ],
    [
      "safe conditional",
      "const syntaxProps = dark ? { language: 'typescript' } : { language: 'text' };\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>",
    ],
    [
      "safe logical guard",
      "const syntaxProps = enabled && { language: 'typescript' };\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>",
    ],
  ];

  for (const [name, body] of cases) {
    await t.test(name, () => {
      const violations = scan(
        `components/Safe-${name}.tsx`,
        `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";\n${body};`,
      );

      assert.deepEqual(violations, []);
    });
  }
});

test("rejects unresolved react-syntax-highlighter spread forms", async (t) => {
  const cases = [
    ["function result", "const syntaxProps = getSyntaxProps();"],
    ["runtime nested spread", "const syntaxProps = { language: 'typescript', ...runtimeProps };"],
    ["runtime member", "const syntaxProps = options.syntax;"],
    ["dynamic property", "const syntaxProps = { [propertyName]: propertyValue };"],
    ["mutable binding", "let syntaxProps = { language: 'typescript' };"],
    [
      "unresolved alias chain",
      "const runtimeAlias = runtimeProps;\nconst syntaxProps = runtimeAlias;",
    ],
  ];

  for (const [name, declaration] of cases) {
    await t.test(name, () => {
      const violations = scan(
        `components/Unresolved-${name}.tsx`,
        `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";\n${declaration}\nexport const CodeBlock = () => <SyntaxHighlighter {...syntaxProps}>code</SyntaxHighlighter>;`,
      );

      assertRuleViolation(violations, "no-react-syntax-highlighter-style-map");
      assert.match(violations[0].message, /syntaxProps/);
      assert.match(violations[0].message, /cannot prove/i);
    });
  }
});

test("an exact unresolved-spread exception remains capped by its baseline", async (t) => {
  const path = "components/RuntimeCodeBlock.tsx";
  const root = await createRepository(t, {
    [path]: `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = ({ first, second }) => <>
  <SyntaxHighlighter {...first}>one</SyntaxHighlighter>
  <SyntaxHighlighter {...second}>two</SyntaxHighlighter>
</>;`,
  });
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "unresolvedSpread",
    reason: "The vendor wrapper supplies runtime properties at this exact boundary.",
  }];

  const violations = await scanRepository(root, {
    exceptions,
    baseline: propBaselineOf(path, "no-react-syntax-highlighter-style-map", "unresolvedSpread", 1),
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.match(violations[0].message, /1 to 2/);
});

test("permits a react-syntax-highlighter style map with an exact documented exception", () => {
  const path = "components/CodeBlock.tsx";
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "The vendor component requires its syntax token style map through the style prop.",
  }];
  const violations = scan(
    path,
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <SyntaxHighlighter style={vendorStyle}>code</SyntaxHighlighter>;`,
    exceptions,
  );

  assert.deepEqual(violations, []);
});

test("rejects react-syntax-highlighter style map growth above the baseline", async (t) => {
  const path = "components/CodeBlock.tsx";
  const root = await createRepository(t, {
    [path]: `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <>
  <SyntaxHighlighter style={lightStyle}>light</SyntaxHighlighter>
  <SyntaxHighlighter style={darkStyle}>dark</SyntaxHighlighter>
</>;`,
  });
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "The vendor component requires its syntax token style map through the style prop.",
  }];

  const violations = await scanRepository(root, {
    exceptions,
    baseline: propBaselineOf(path, "no-react-syntax-highlighter-style-map", "style", 1),
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.equal(violations[0].path, path);
  assert.match(violations[0].message, /1 to 2/);
  assert.match(violations[0].message, /"style"/);
});

test("a react-syntax-highlighter exception permits only its named prop", () => {
  const path = "components/CodeBlock.tsx";
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "The vendor component requires its syntax token style map through the style prop.",
  }];
  const violations = scan(
    path,
    `import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
export const CodeBlock = () => <SyntaxHighlighter style={vendorStyle} customStyle={customStyle}>code</SyntaxHighlighter>;`,
    exceptions,
  );

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /"customStyle"/);
});

test("permits a style prop on an unrelated imported custom component", () => {
  const violations = scan(
    "components/CustomCode.tsx",
    `import { CodePanel } from "./CodePanel";
export const CustomCode = () => <CodePanel style={panelStyle} />;`,
  );

  assert.deepEqual(violations, []);
});

test("rejects a direct DOM style assignment", () => {
  const violations = scan(
    "hooks/usePanelWidth.ts",
    "element.style.width = `${width}px`;",
  );

  assertRuleViolation(violations, "no-dom-style-mutation");
});

test("permits a direct DOM style assignment with an exact exception", () => {
  const path = "hooks/usePanelWidth.ts";
  const exceptions = [{
    file: path,
    rule: "no-dom-style-mutation",
    reason: "The hook writes a measured panel width.",
  }];

  const violations = scan(path, "element.style.width = `${width}px`;", exceptions);

  assert.deepEqual(violations, []);
});

test("rejects raw hex, rgb, and hsl colors", async (t) => {
  const cases = [
    ["hex", "#123456"],
    ["rgb", "rgb(12 34 56)"],
    ["hsl", "hsl(210 40% 50%)"],
  ];

  for (const [name, color] of cases) {
    await t.test(name, () => {
      const violations = scan(
        `components/${name}.module.css`,
        `.sample { color: ${color}; }`,
      );

      assertRuleViolation(violations, "no-color-literal");
    });
  }
});

test("ignores a #123 issue number in a line comment without weakening color detection", () => {
  const violations = scan(
    "components/LineCommentColor.tsx",
    '// Tracks issue #123.\nexport const swatch = "#123456";',
  );

  assertRuleViolation(violations, "no-color-literal");
  assert.equal(violations[0].line, 2);
});

test("ignores a #123 issue number in a block comment without weakening color detection", () => {
  const violations = scan(
    "components/BlockCommentColor.tsx",
    '/* Tracks issue #123. */\nexport const swatch = "rgb(12 34 56)";',
  );

  assertRuleViolation(violations, "no-color-literal");
  assert.equal(violations[0].line, 2);
});

test("permits a raw color with an exact exception", () => {
  const path = "components/LegacyColor.module.css";
  const exceptions = [{
    file: path,
    rule: "no-color-literal",
    reason: "The browser metadata requires a literal color.",
  }];

  const violations = scan(path, ".sample { color: #123456; }", exceptions);

  assert.deepEqual(violations, []);
});

test("rejects a Tier 1 token in component CSS", () => {
  const violations = scan(
    "components/TierOne.module.css",
    ".sample { color: var(--text); }",
  );

  assert.equal(violations.length, 1);
  assertKnownRule(violations[0].rule);
});

test("rejects a Tier 1 token in an application CSS module", () => {
  const violations = scan(
    "app/account/Profile.module.css",
    ".sample { color: var(--text); }",
  );

  assertRuleViolation(violations, "no-tier-1-component-token");
});

test("permits Tier 1 tokens in the designated theme source files", () => {
  assert.deepEqual(scan("app/globals.css", ":root { --ui-text: var(--text); }"), []);
  assert.deepEqual(scan("app/tokens.css", ":root { --ui-text: var(--text); }"), []);
});

test("permits a Tier 2 token in component CSS", () => {
  const violations = scan(
    "components/TierTwo.module.css",
    ".sample { color: var(--ui-text); }",
  );

  assert.deepEqual(violations, []);
});

test("rejects Inter in a font-family declaration", () => {
  const violations = scan(
    "components/Inter.module.css",
    '.sample { font-family: "Inter", sans-serif; }',
  );

  assert.equal(violations.length, 1);
  assertKnownRule(violations[0].rule);
});

test("rejects Inter in a CSS font shorthand declaration", () => {
  const violations = scan(
    "components/InterShorthand.module.css",
    '.sample { font: italic 600 1rem/1.5 "Inter", sans-serif; }',
  );

  assertRuleViolation(violations, "no-inter-font-family");
  assert.match(violations[0].message, /font/i);
});

test("rejects Inter in a multiline CSS font shorthand declaration", () => {
  const violations = scan(
    "components/InterMultiline.module.css",
    '.sample {\n  font:\n    italic 600 1rem/1.5 "Inter",\n    sans-serif;\n}',
  );

  assertRuleViolation(violations, "no-inter-font-family");
  assert.equal(violations[0].line, 2);
});

test("rejects Inter after comments and newlines in a CSS font shorthand", () => {
  const violations = scan(
    "components/InterCommented.module.css",
    `.sample {
  font /* the value starts below */ :
    italic 600 1rem/1.5
    /* the preferred family */ "Inter",
    sans-serif
}`,
  );

  assertRuleViolation(violations, "no-inter-font-family");
  assert.equal(violations[0].line, 2);
});

test("permits a compliant multiline CSS font shorthand with comments", () => {
  const violations = scan(
    "components/CompliantFont.module.css",
    `.sample {
  font:
    italic 600 1rem/1.5
    /* shipped family */ "Autospawn Sans",
    sans-serif;
}`,
  );

  assert.deepEqual(violations, []);
});

test("ignores Inter inside a CSS font comment", () => {
  const violations = scan(
    "components/CommentedFont.module.css",
    '.sample { font: 600 1rem/1.5 /* Inter is prohibited. */ "Autospawn Sans", sans-serif; }',
  );

  assert.deepEqual(violations, []);
});

test("rejects Inter in TypeScript and JavaScript font properties", async (t) => {
  const cases = [
    ["font.ts", 'export const style = { font: `600 14px Inter` };'],
    ["fontFamily.js", 'export const style = { fontFamily: "Inter, sans-serif" };'],
    ["font-family.ts", 'export const style = { "font-family": "Inter, sans-serif" };'],
    ["JSX-font.jsx", 'export const Glyph = () => <Glyph font="14px Inter" />;'],
  ];

  for (const [file, content] of cases) {
    await t.test(file, () => {
      const violations = scan(`components/${file}`, content);
      assertRuleViolation(violations, "no-inter-font-family");
    });
  }
});

test("permits Inter outside font properties", () => {
  const violations = scan(
    "components/InterMetadata.ts",
    'export const metadata = { fontSize: "Inter", description: "Inter appears in prose." };',
  );

  assert.deepEqual(violations, []);
});

test("permits an Inter comment inside a compliant TypeScript font property", () => {
  const violations = scan(
    "components/FontComment.ts",
    'export const style = { font: /* Inter is prohibited. */ systemFont };',
  );

  assert.deepEqual(violations, []);
});

test("does not treat ordinary prose containing Inter as a font declaration", () => {
  const violations = scan(
    "components/Prose.tsx",
    'export const copy = "Inter appears in this ordinary prose.";',
  );

  assert.deepEqual(violations, []);
});

test("rejects an exception with a wildcard path", () => {
  assert.throws(
    () => validateExceptions([{
      file: "components/*.tsx",
      rule: "no-inline-style-attribute",
      reason: "A wildcard must not bypass the exact path contract.",
    }]),
    /wildcard|exact|file|path/i,
  );
});

test("rejects an exception with an empty reason", () => {
  assert.throws(
    () => validateExceptions([{
      file: "components/Panel.tsx",
      rule: "no-inline-style-attribute",
      reason: "   ",
    }]),
    /reason/i,
  );
});

test("rejects an exception with an unknown rule", () => {
  assert.throws(
    () => validateExceptions([{
      file: "components/Panel.tsx",
      rule: "not-a-style-rule",
      reason: "This rule does not exist.",
    }]),
    /rule/i,
  );
});

test("rejects a blanket react-syntax-highlighter exception", () => {
  assert.throws(
    () => validateExceptions([{
      file: "components/CodeBlock.tsx",
      rule: "no-react-syntax-highlighter-style-map",
      reason: "A blanket exception must not permit every vendor styling prop.",
    }]),
    /prop/i,
  );
});

test("rejects an unknown react-syntax-highlighter exception prop", () => {
  assert.throws(
    () => validateExceptions([{
      file: "components/CodeBlock.tsx",
      rule: "no-react-syntax-highlighter-style-map",
      prop: "renderer",
      reason: "Only vendor styling props can receive this exception.",
    }]),
    /prop/i,
  );
});

test("reports the path, rule, and positive line number", () => {
  const path = "components/Metadata.tsx";
  const violations = scan(path, "\n\nexport const Metadata = () => <main style={style} />;");

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, path);
  assert.equal(violations[0].rule, "no-inline-style-attribute");
  assert.ok(Number.isInteger(violations[0].line));
  assert.ok(violations[0].line > 0);
  assert.equal(typeof violations[0].message, "string");
  assert.ok(violations[0].message.length > 0);
});

test("scanRepository returns violations from repository source files", async (t) => {
  const root = await createRepository(t, {
    "components/RepositoryStyle.tsx": "export const RepositoryStyle = () => <div style={style} />;",
  });

  const violations = await scanRepository(root, { exceptions: [] });

  assertRuleViolation(violations, "no-inline-style-attribute");
  assert.equal(violations[0].path, "components/RepositoryStyle.tsx");
});

test("the CLI prints violations and exits with a nonzero status", async (t) => {
  const root = await createRepository(t, {
    "components/CliStyle.tsx": "export const CliStyle = () => <div style={style} />;",
  });

  await assert.rejects(
    execFileAsync(process.execPath, [checkerPath], { cwd: root }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(`${error.stdout}\n${error.stderr}`, /components\/CliStyle\.tsx/);
      assert.match(`${error.stdout}\n${error.stderr}`, /no-inline-style-attribute/);
      return true;
    },
  );
});

test("scanSource counts a suppressed violation instead of hiding it", () => {
  const path = "hooks/usePanelWidth.ts";
  const exceptions = [{
    file: path,
    rule: "no-dom-style-mutation",
    reason: "The hook writes a measured panel width.",
  }];
  const suppressed = new Map();

  const violations = scanSource({
    path,
    content: "element.style.width = `${width}px`;\nelement.style.height = `${height}px`;",
    exceptions,
    suppressed,
  });

  assert.deepEqual(violations, []);
  assert.equal(suppressed.get(`${path}|no-dom-style-mutation`), 2);
});

test("compareBaseline fails when an approved inline style count grows", () => {
  const path = "components/ChatWindow.tsx";
  const counts = new Map([[`${path}|no-inline-style-attribute`, 2]]);

  const violations = compareBaseline(counts, baselineOf(path, "no-inline-style-attribute", 1));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.equal(violations[0].path, path);
  assert.match(violations[0].message, /1 to 2/);
});

test("compareBaseline fails when an approved mutation count grows", () => {
  const path = "hooks/useTheme.ts";
  const counts = new Map([[`${path}|no-dom-style-mutation`, 5]]);

  const violations = compareBaseline(counts, baselineOf(path, "no-dom-style-mutation", 2));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
});

test("compareBaseline permits a count at or below the approved limit", () => {
  const path = "hooks/useTheme.ts";
  const key = `${path}|no-dom-style-mutation`;

  assert.deepEqual(compareBaseline(new Map([[key, 2]]), baselineOf(path, "no-dom-style-mutation", 2)), []);
  assert.deepEqual(compareBaseline(new Map([[key, 1]]), baselineOf(path, "no-dom-style-mutation", 2)), []);
});

test("an unlisted file receives a zero limit", () => {
  const counts = new Map([["components/NewPanel.tsx|no-inline-style-attribute", 1]]);

  const violations = compareBaseline(counts, { limits: {} });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
});

test("the baseline rule id stays outside the exception rule list", () => {
  const ruleIds = Array.isArray(RULES) ? RULES : Object.keys(RULES);
  assert.ok(!ruleIds.includes(BASELINE_RULE));

  assert.throws(
    () => validateExceptions([{
      file: "components/Panel.tsx",
      rule: BASELINE_RULE,
      reason: "A baseline count must never be waived by an exception.",
    }]),
    /rule/i,
  );
});

test("validateBaseline rejects a limit that has no exception", () => {
  assert.throws(
    () => validateBaseline(baselineOf("components/Panel.tsx", "no-inline-style-attribute", 3), []),
    /exception/i,
  );
});

test("validateBaseline rejects a wildcard path, an unknown rule, and a bad count", () => {
  const exceptions = [{
    file: "components/Panel.tsx",
    rule: "no-inline-style-attribute",
    reason: "The panel keeps one approved inline style.",
  }];

  assert.throws(
    () => validateBaseline(baselineOf("components/*.tsx", "no-inline-style-attribute", 1), exceptions),
    /wildcard|exact|path/i,
  );
  assert.throws(
    () => validateBaseline(baselineOf("components/Panel.tsx", "not-a-style-rule", 1), exceptions),
    /rule/i,
  );
  assert.throws(
    () => validateBaseline(baselineOf("components/Panel.tsx", "no-inline-style-attribute", -1), exceptions),
    /count/i,
  );
  assert.throws(
    () => validateBaseline(baselineOf("components/Panel.tsx", "no-inline-style-attribute", 1.5), exceptions),
    /count/i,
  );
});

test("validateBaseline requires per-prop react-syntax-highlighter caps", () => {
  const path = "components/CodeBlock.tsx";
  const exceptions = [{
    file: path,
    rule: "no-react-syntax-highlighter-style-map",
    prop: "style",
    reason: "The vendor component requires one style map.",
  }];

  assert.throws(
    () => validateBaseline(baselineOf(path, "no-react-syntax-highlighter-style-map", 1), exceptions),
    /prop|map/i,
  );
  assert.throws(
    () => validateBaseline(
      propBaselineOf(path, "no-react-syntax-highlighter-style-map", "customStyle", 1),
      exceptions,
    ),
    /exception/i,
  );
  assert.equal(
    validateBaseline(
      propBaselineOf(path, "no-react-syntax-highlighter-style-map", "style", 1),
      exceptions,
    ).limits[path]["no-react-syntax-highlighter-style-map"].style,
    1,
  );
});

test("scanRepository reports growth above the approved baseline count", async (t) => {
  const path = "components/ApprovedStyle.tsx";
  const root = await createRepository(t, {
    [path]: "export const ApprovedStyle = () => <div style={a} data-x={<span style={b} />} />;",
  });
  const exceptions = [{
    file: path,
    rule: "no-inline-style-attribute",
    reason: "The component keeps one approved inline style.",
  }];

  const violations = await scanRepository(root, {
    exceptions,
    baseline: baselineOf(path, "no-inline-style-attribute", 1),
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, BASELINE_RULE);
  assert.equal(violations[0].path, path);
});

test("the repository baseline exists and matches every exception", async () => {
  const baseline = await loadBaseline(repositoryRoot);

  assert.ok(Object.keys(baseline.limits).length > 0, `${BASELINE_PATH} must list the approved counts.`);
  assert.equal(validateBaseline(baseline, UI_STYLE_EXCEPTIONS), baseline);

  for (const exception of UI_STYLE_EXCEPTIONS) {
    const ruleLimit = baseline.limits[exception.file]?.[exception.rule];
    const limit = exception.prop ? ruleLimit?.[exception.prop] : ruleLimit;
    assert.ok(
      Number.isInteger(limit),
      `${BASELINE_PATH} must cap ${exception.file} for ${exception.rule}${exception.prop ? ` prop ${exception.prop}` : ""}.`,
    );
  }
});

test("every repository baseline cap equals its current finding count", async () => {
  const baseline = await loadBaseline(repositoryRoot);

  for (const [path, ruleLimits] of Object.entries(baseline.limits)) {
    const content = await readFile(join(repositoryRoot, path), "utf8");
    const suppressed = new Map();
    scanSource({ path, content, exceptions: UI_STYLE_EXCEPTIONS, suppressed });

    for (const [rule, limit] of Object.entries(ruleLimits)) {
      if (typeof limit === "number") {
        assert.equal(
          limit,
          suppressed.get(`${path}|${rule}`) ?? 0,
          `${BASELINE_PATH} must equal the current ${rule} count for ${path}`,
        );
        continue;
      }

      for (const [prop, propLimit] of Object.entries(limit)) {
        assert.equal(
          propLimit,
          suppressed.get(`${path}|${rule}|${prop}`) ?? 0,
          `${BASELINE_PATH} must equal the current ${rule} ${prop} count for ${path}`,
        );
      }
    }
  }
});

test("FileViewer keeps zero react-syntax-highlighter style-map debt", async () => {
  const path = "components/FileViewer.tsx";
  const rule = "no-react-syntax-highlighter-style-map";
  const baseline = await loadBaseline(repositoryRoot);
  const source = await readFile(join(repositoryRoot, path), "utf8");
  const violations = scan(path, source, UI_STYLE_EXCEPTIONS)
    .filter((violation) => violation.rule === rule);

  assert.equal(
    UI_STYLE_EXCEPTIONS.some((exception) => exception.file === path && exception.rule === rule),
    false,
  );
  assert.equal(baseline.limits[path]?.[rule], undefined);
  assert.deepEqual(violations, []);
});

test("the repository passes its own baseline", async () => {
  const violations = await scanRepository(repositoryRoot);

  assert.deepEqual(violations, []);
});
