import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

import { UI_STYLE_EXCEPTIONS } from "./ui-style-exceptions.mjs";

export const RULES = Object.freeze([
  "no-inline-style-attribute",
  "no-react-syntax-highlighter-style-map",
  "no-dom-style-mutation",
  "no-color-literal",
  "no-tier-1-component-token",
  "no-inter-font-family",
]);

/**
 * The baseline rule id stays outside RULES on purpose.
 * validateExceptions rejects an unknown rule, so no exception can silence a
 * count that grows. DESIGN.md section 12.2 rule 6.
 */
export const BASELINE_RULE = "baseline-count-growth";

export const BASELINE_PATH = "config/inline-style-baseline.json";

const RULE_SET = new Set(RULES);
const SOURCE_ROOTS = ["components", "app", "hooks", "lib"];
const SOURCE_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const EXCLUDED_DIRECTORIES = new Set([".next", "__tests__", "docs", "node_modules"]);
const TIER_ONE_TOKENS = new Set([
  "bg",
  "bg-panel",
  "bg-hover",
  "bg-selected",
  "border",
  "text",
  "text-muted",
  "text-dim",
  "accent",
  "accent-hover",
  "user-bg",
  "assistant-bg",
  "tool-bg",
  "bg-subtle",
  "success",
  "danger",
  "warning",
  "syntax-text",
  "syntax-text-muted",
  "syntax-accent",
  "syntax-success",
  "syntax-danger",
  "syntax-warning",
  "omp-md-heading",
  "omp-md-link",
  "omp-md-code",
]);

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/gi;
const CSS_VARIABLE = /var\(\s*--([a-z0-9-]+)\b[^)]*\)/gi;
const WILDCARD = /[*?[\]{}]/;
const REACT_SYNTAX_HIGHLIGHTER_RULE = "no-react-syntax-highlighter-style-map";
const REACT_SYNTAX_HIGHLIGHTER_UNRESOLVED_SPREAD = "unresolvedSpread";
const REACT_SYNTAX_HIGHLIGHTER_COMPONENTS = new Set([
  "Light",
  "LightAsync",
  "Prism",
  "PrismAsync",
  "PrismAsyncLight",
  "PrismLight",
]);
const REACT_SYNTAX_HIGHLIGHTER_STYLE_PROPS = new Set([
  "style",
  "lineNumberStyle",
  "customStyle",
  "codeTagProps",
]);
const REACT_SYNTAX_HIGHLIGHTER_EXCEPTION_PROPS = new Set([
  ...REACT_SYNTAX_HIGHLIGHTER_STYLE_PROPS,
  REACT_SYNTAX_HIGHLIGHTER_UNRESOLVED_SPREAD,
]);
const THEME_SOURCE_FILES = new Set(["app/globals.css", "app/tokens.css"]);

export function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) {
    throw new TypeError("UI style exceptions must be an array.");
  }

  for (const [index, exception] of exceptions.entries()) {
    if (!exception || typeof exception !== "object") {
      throw new TypeError(`UI style exception ${index + 1} must be an object.`);
    }

    const { file, rule, prop, reason } = exception;
    if (typeof file !== "string" || file.trim() === "") {
      throw new TypeError(`UI style exception ${index + 1} needs an exact file path.`);
    }
    if (WILDCARD.test(file)) {
      throw new Error(`UI style exception ${index + 1} uses a wildcard file path.`);
    }
    if (file.startsWith("/") || file.startsWith("./") || file.includes("\\") || file.split("/").includes("..")) {
      throw new Error(`UI style exception ${index + 1} needs an exact repository path.`);
    }
    if (!RULE_SET.has(rule)) {
      throw new Error(`UI style exception ${index + 1} uses an unknown rule.`);
    }
    if (rule === REACT_SYNTAX_HIGHLIGHTER_RULE) {
      if (!REACT_SYNTAX_HIGHLIGHTER_EXCEPTION_PROPS.has(prop)) {
        throw new Error(`UI style exception ${index + 1} needs an exact react-syntax-highlighter prop.`);
      }
    } else if (prop !== undefined) {
      throw new Error(`UI style exception ${index + 1} cannot name a prop for "${rule}".`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(`UI style exception ${index + 1} needs a reason.`);
    }
  }

  const keys = exceptions.map(({ file, rule, prop = "" }) => `${file}|${rule}|${prop}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("UI style exceptions must not contain duplicate file, rule, and prop entries.");
  }

  return exceptions;
}

/**
 * Check the shape of config/inline-style-baseline.json.
 * Every limit must name an exact path, a known rule, and a whole count.
 * Every limit must also match an exact exception, so the baseline can never
 * grant permission on its own.
 */
export function validateBaseline(baseline, exceptions = []) {
  validateExceptions(exceptions);

  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new TypeError("The inline style baseline must be an object.");
  }

  const { limits } = baseline;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new TypeError("The inline style baseline needs a limits object.");
  }

  for (const [file, fileLimits] of Object.entries(limits)) {
    if (WILDCARD.test(file)) {
      throw new Error(`Baseline entry "${file}" uses a wildcard file path.`);
    }
    if (file.startsWith("/") || file.startsWith("./") || file.includes("\\") || file.split("/").includes("..")) {
      throw new Error(`Baseline entry "${file}" needs an exact repository path.`);
    }
    if (!fileLimits || typeof fileLimits !== "object" || Array.isArray(fileLimits)) {
      throw new TypeError(`Baseline entry "${file}" needs a rule to count map.`);
    }

    for (const [rule, limit] of Object.entries(fileLimits)) {
      if (!RULE_SET.has(rule)) {
        throw new Error(`Baseline entry "${file}" uses an unknown rule "${rule}".`);
      }
      if (rule === REACT_SYNTAX_HIGHLIGHTER_RULE) {
        if (!limit || typeof limit !== "object" || Array.isArray(limit)) {
          throw new TypeError(`Baseline entry "${file}" needs a per-prop count map for "${rule}".`);
        }
        const entries = Object.entries(limit);
        if (entries.length === 0) {
          throw new Error(`Baseline entry "${file}" needs at least one prop cap for "${rule}".`);
        }
        for (const [prop, propLimit] of entries) {
          if (!REACT_SYNTAX_HIGHLIGHTER_EXCEPTION_PROPS.has(prop)) {
            throw new Error(`Baseline entry "${file}" uses an unknown react-syntax-highlighter prop "${prop}".`);
          }
          if (!Number.isInteger(propLimit) || propLimit < 0) {
            throw new Error(`Baseline entry "${file}" needs a whole count for "${rule}" prop "${prop}".`);
          }
          if (!hasException(exceptions, file, rule, prop)) {
            throw new Error(`Baseline entry "${file}" has no "${rule}" exception for prop "${prop}".`);
          }
        }
        continue;
      }
      if (!Number.isInteger(limit) || limit < 0) {
        throw new Error(`Baseline entry "${file}" needs a whole count for "${rule}".`);
      }
      if (!hasException(exceptions, file, rule)) {
        throw new Error(`Baseline entry "${file}" has no "${rule}" exception with a reason.`);
      }
    }
  }

  return baseline;
}

function baselineLimit(baseline, path, rule, prop) {
  const limit = baseline?.limits?.[path]?.[rule];
  if (rule === REACT_SYNTAX_HIGHLIGHTER_RULE) return limit?.[prop] ?? 0;
  return limit ?? 0;
}

/**
 * Report every approved count that grew above its baseline limit.
 * counts maps "path|rule" to the number of suppressed violations.
 */
export function compareBaseline(counts, baseline) {
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts ?? {});
  const violations = [];

  for (const [key, count] of entries) {
    const parts = key.split("|");
    const prop = parts.length > 2 ? parts.pop() : undefined;
    const rule = parts.pop();
    const path = parts.join("|");
    const limit = baselineLimit(baseline, path, rule, prop);
    if (count <= limit) continue;

    const propLabel = prop ? ` prop "${prop}"` : "";

    violations.push({
      rule: BASELINE_RULE,
      path,
      line: 1,
      message: `Approved "${rule}"${propLabel} count grew from ${limit} to ${count}. Migrate the file or lower the count.`,
    });
  }

  return violations.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Read config/inline-style-baseline.json.
 * A missing file yields empty limits, which gives every file a zero limit.
 * scripts/check-ui-style-boundaries.test.mjs proves the real file exists.
 */
export async function loadBaseline(root) {
  const file = join(resolve(root), ...BASELINE_PATH.split("/"));
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { limits: {} };
    throw error;
  }
}

function hasException(exceptions, path, rule, prop) {
  return exceptions.some((exception) => (
    exception.file === path
    && exception.rule === rule
    && exception.prop === prop
  ));
}

function lineAt(content, position) {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function maskCommentRanges(content, ranges) {
  const characters = content.split("");

  for (const range of ranges) {
    for (let index = range.pos; index < range.end; index += 1) {
      if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
    }
  }

  return characters.join("");
}

function maskScannerComments(content) {
  const ranges = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    content,
  );

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    ranges.push({ pos: scanner.getTokenPos(), end: scanner.getTextPos() });
  }

  return maskCommentRanges(content, ranges);
}

function maskTypeScriptComments(content, sourceFile) {
  const ranges = new Map();

  function collect(commentRanges) {
    for (const range of commentRanges ?? []) ranges.set(`${range.pos}:${range.end}`, range);
  }

  function visit(node) {
    collect(ts.getLeadingCommentRanges(content, node.pos));
    collect(ts.getTrailingCommentRanges(content, node.end));
    for (const child of node.getChildren(sourceFile)) visit(child);
  }

  visit(sourceFile);
  return maskCommentRanges(content, ranges.values());
}

function propertyName(node, sourceFile) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (!ts.isElementAccessExpression(node) || !node.argumentExpression) return undefined;
  if (ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return node.argumentExpression.getText(sourceFile);
}

function containsStyleAccess(node, sourceFile) {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (propertyName(current, sourceFile) === "style") return true;
    current = current.expression;
  }
  return false;
}

function isIntrinsicStyleAttribute(node, sourceFile) {
  if (!ts.isJsxAttribute(node) || node.name.getText(sourceFile) !== "style") return false;
  const opening = node.parent?.parent;
  if (!opening || (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening))) return false;
  const tagName = opening.tagName.getText(sourceFile);
  return /^[a-z]/.test(tagName);
}

function reactSyntaxHighlighterImports(sourceFile) {
  const components = new Set();
  const namespaces = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "react-syntax-highlighter") {
      continue;
    }

    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;
    if (importClause.name) components.add(importClause.name.text);

    const bindings = importClause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    if (!ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = element.propertyName?.text ?? element.name.text;
      if (REACT_SYNTAX_HIGHLIGHTER_COMPONENTS.has(importedName)) {
        components.add(element.name.text);
      }
    }
  }

  return { components, namespaces };
}

function isReactSyntaxHighlighterOpening(opening, sourceFile, imports) {
  if (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening)) return false;
  const tagName = opening.tagName.getText(sourceFile);
  if (imports.components.has(tagName)) return true;

  const [namespace, component, ...rest] = tagName.split(".");
  return rest.length === 0
    && imports.namespaces.has(namespace)
    && REACT_SYNTAX_HIGHLIGHTER_COMPONENTS.has(component);
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticObjectPropertyName(node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (!ts.isComputedPropertyName(node)) return undefined;
  const expression = unwrapExpression(node.expression);
  return ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function nearestFunctionOrSource(node, sourceFile) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current)) {
    current = current.parent;
  }
  return current ?? sourceFile;
}

function variableBindingScope(node, sourceFile) {
  if (ts.isCatchClause(node.parent)) return node.parent;
  if (!ts.isVariableDeclarationList(node.parent)) return nearestFunctionOrSource(node, sourceFile);
  if ((node.parent.flags & ts.NodeFlags.BlockScoped) === 0) {
    return nearestFunctionOrSource(node, sourceFile);
  }

  const owner = node.parent.parent;
  return ts.isVariableStatement(owner) ? owner.parent : owner;
}

function addBindingNames(bindings, name, binding) {
  if (ts.isIdentifier(name)) {
    const entries = bindings.get(name.text) ?? [];
    entries.push(binding);
    bindings.set(name.text, entries);
    return;
  }

  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) addBindingNames(bindings, element.name, binding);
  }
}

function collectStaticBindings(sourceFile) {
  const bindings = new Map();

  function visit(node) {
    if (ts.isVariableDeclaration(node)) {
      const isConst = ts.isVariableDeclarationList(node.parent)
        && (node.parent.flags & ts.NodeFlags.Const) !== 0;
      addBindingNames(bindings, node.name, {
        scope: variableBindingScope(node, sourceFile),
        initializer: isConst && ts.isIdentifier(node.name) ? node.initializer : undefined,
      });
    } else if (ts.isParameter(node)) {
      addBindingNames(bindings, node.name, { scope: node.parent, initializer: undefined });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function resolveStaticBinding(identifier, bindings) {
  const candidates = (bindings.get(identifier.text) ?? [])
    .filter(({ scope }) => scope.pos <= identifier.pos && identifier.end <= scope.end)
    .sort((left, right) => (
      (left.scope.end - left.scope.pos) - (right.scope.end - right.scope.pos)
    ));
  return candidates[0];
}

function staticMemberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (!ts.isElementAccessExpression(node) || !node.argumentExpression) return undefined;
  const argument = unwrapExpression(node.argumentExpression);
  return ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function resolveStaticObjectMember(expression, member, bindings, seen) {
  const node = unwrapExpression(expression);
  if (ts.isIdentifier(node)) {
    const binding = resolveStaticBinding(node, bindings);
    if (!binding?.initializer || seen.has(binding)) return undefined;
    const nextSeen = new Set([...seen, binding]);
    return resolveStaticObjectMember(binding.initializer, member, bindings, nextSeen);
  }
  if (!ts.isObjectLiteralExpression(node)) return undefined;

  if (node.properties.some((property) => (
    ts.isSpreadAssignment(property) || staticObjectPropertyName(property.name) === undefined
  ))) {
    return undefined;
  }

  for (let index = node.properties.length - 1; index >= 0; index -= 1) {
    const property = node.properties[index];
    if (staticObjectPropertyName(property.name) !== member) continue;
    if (ts.isPropertyAssignment(property)) return [property.initializer];
    if (ts.isShorthandPropertyAssignment(property)) return [property.name];
    return undefined;
  }

  return [];
}

function mergeSpreadAnalyses(analyses) {
  return {
    props: analyses.flatMap(({ props }) => props),
    resolved: analyses.every(({ resolved }) => resolved),
  };
}

function syntaxHighlighterSpreadAnalysis(expression, sourceFile, bindings, seen = new Set()) {
  const node = unwrapExpression(expression);

  if (ts.isIdentifier(node)) {
    const binding = resolveStaticBinding(node, bindings);
    if (!binding?.initializer || seen.has(binding)) {
      if (node.text === "undefined" && !binding) return { props: [], resolved: true };
      return { props: [], resolved: false };
    }
    return syntaxHighlighterSpreadAnalysis(
      binding.initializer,
      sourceFile,
      bindings,
      new Set([...seen, binding]),
    );
  }

  if (ts.isObjectLiteralExpression(node)) {
    const props = [];
    let resolved = true;
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = syntaxHighlighterSpreadAnalysis(property.expression, sourceFile, bindings, seen);
        props.push(...spread.props);
        resolved = resolved && spread.resolved;
        continue;
      }
      const prop = staticObjectPropertyName(property.name);
      if (prop === undefined) {
        resolved = false;
        continue;
      }
      if (REACT_SYNTAX_HIGHLIGHTER_STYLE_PROPS.has(prop)) {
        props.push({ prop, position: property.getStart(sourceFile) });
      }
    }
    return { props, resolved };
  }

  if (ts.isConditionalExpression(node)) {
    return mergeSpreadAnalyses([
      syntaxHighlighterSpreadAnalysis(node.whenTrue, sourceFile, bindings, seen),
      syntaxHighlighterSpreadAnalysis(node.whenFalse, sourceFile, bindings, seen),
    ]);
  }

  if (
    ts.isBinaryExpression(node)
    && [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
  ) {
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return syntaxHighlighterSpreadAnalysis(node.right, sourceFile, bindings, seen);
    }
    return mergeSpreadAnalyses([
      syntaxHighlighterSpreadAnalysis(node.left, sourceFile, bindings, seen),
      syntaxHighlighterSpreadAnalysis(node.right, sourceFile, bindings, seen),
    ]);
  }

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const member = staticMemberName(node);
    if (!member) return { props: [], resolved: false };
    const initializers = resolveStaticObjectMember(node.expression, member, bindings, seen);
    if (!initializers) return { props: [], resolved: false };
    return mergeSpreadAnalyses(initializers.map((initializer) => (
      syntaxHighlighterSpreadAnalysis(initializer, sourceFile, bindings, seen)
    )));
  }

  if (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(sourceFile) === "Object"
    && node.expression.name.text === "assign"
  ) {
    const objectBinding = resolveStaticBinding(node.expression.expression, bindings);
    if (objectBinding) return { props: [], resolved: false };
    return mergeSpreadAnalyses(node.arguments.map((argument) => (
      syntaxHighlighterSpreadAnalysis(argument, sourceFile, bindings, seen)
    )));
  }

  if (
    ts.isStringLiteralLike(node)
    || ts.isNumericLiteral(node)
    || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)
  ) {
    return { props: [], resolved: true };
  }

  return { props: [], resolved: false };
}

function syntaxHighlighterStyleProps(opening, sourceFile, bindings) {
  const props = [];

  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxAttribute(attribute)) {
      const prop = attribute.name.getText(sourceFile);
      if (REACT_SYNTAX_HIGHLIGHTER_STYLE_PROPS.has(prop)) {
        props.push({ prop, position: attribute.getStart(sourceFile) });
      }
      continue;
    }
    if (ts.isJsxSpreadAttribute(attribute)) {
      const spread = syntaxHighlighterSpreadAnalysis(
        attribute.expression,
        sourceFile,
        bindings,
      );
      props.push(...spread.props.map(({ prop }) => ({
        prop,
        position: attribute.getStart(sourceFile),
      })));
      if (!spread.resolved) {
        props.push({
          prop: REACT_SYNTAX_HIGHLIGHTER_UNRESOLVED_SPREAD,
          position: attribute.getStart(sourceFile),
          expression: attribute.expression.getText(sourceFile).replace(/\s+/g, " ").slice(0, 120),
        });
      }
    }
  }

  return props;
}

function isDomStyleMutation(node, sourceFile) {
  if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
    return containsStyleAccess(node.left, sourceFile);
  }

  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return containsStyleAccess(node.operand, sourceFile);
  }

  if (!ts.isCallExpression(node)) return false;

  if (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) {
    const method = propertyName(node.expression, sourceFile);
    if (["removeProperty", "setProperty"].includes(method) && containsStyleAccess(node.expression.expression, sourceFile)) {
      return true;
    }
    if (method === "setAttribute" && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === "style") {
      return true;
    }
  }

  const callee = node.expression.getText(sourceFile);
  if (!["Object.assign", "Object.defineProperty", "Reflect.set"].includes(callee)) return false;
  return Boolean(node.arguments[0] && containsStyleAccess(node.arguments[0], sourceFile));
}

function fontPropertyUsesInter(node, sourceFile) {
  if (!ts.isPropertyAssignment(node) && !ts.isJsxAttribute(node)) return undefined;
  const name = staticObjectPropertyName(node.name) ?? node.name?.getText(sourceFile);
  if (!["font", "fontFamily", "font-family"].includes(name)) return undefined;
  const initializer = node.initializer?.getText(sourceFile) ?? "";
  return /\bInter\b/i.test(initializer) ? name : undefined;
}

function cssFontDeclarations(content) {
  const declarations = [];

  for (let boundary = -1; boundary < content.length;) {
    const start = boundary + 1;
    let propertyStart = start;
    while (/\s/.test(content[propertyStart] ?? "")) propertyStart += 1;

    let propertyEnd = propertyStart;
    while (/[a-z-]/i.test(content[propertyEnd] ?? "")) propertyEnd += 1;
    const property = content.slice(propertyStart, propertyEnd).toLowerCase();
    let colon = propertyEnd;
    while (/\s/.test(content[colon] ?? "")) colon += 1;

    if ((property === "font" || property === "font-family") && content[colon] === ":") {
      let index = colon + 1;
      let quote;
      let parentheses = 0;
      for (; index < content.length; index += 1) {
        const character = content[index];
        if (quote) {
          if (character === "\\") index += 1;
          else if (character === quote) quote = undefined;
          continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === "(") parentheses += 1;
        else if (character === ")" && parentheses > 0) parentheses -= 1;
        else if (parentheses === 0 && (character === ";" || character === "}")) break;
      }
      declarations.push({ property, position: propertyStart, value: content.slice(colon + 1, index) });
      boundary = index;
      continue;
    }

    let index = start;
    while (index < content.length && content[index] !== ";" && content[index] !== "{") index += 1;
    boundary = index;
  }

  return declarations;
}

export function scanSource({ path, content, exceptions = [], suppressed }) {
  validateExceptions(exceptions);
  if (typeof path !== "string" || typeof content !== "string") {
    throw new TypeError("scanSource needs a path and string content.");
  }

  const repositoryPath = path.split(sep).join("/");
  const extension = extname(repositoryPath).toLowerCase();
  const violations = [];
  const positions = new Set();

  function add(rule, position, message, prop) {
    const key = `${rule}:${position}:${prop ?? ""}`;
    if (positions.has(key)) return;
    positions.add(key);

    if (hasException(exceptions, repositoryPath, rule, prop)) {
      if (suppressed instanceof Map) {
        const propKey = prop ? `|${prop}` : "";
        const countKey = `${repositoryPath}|${rule}${propKey}`;
        suppressed.set(countKey, (suppressed.get(countKey) ?? 0) + 1);
      }
      return;
    }

    violations.push({ rule, path: repositoryPath, line: lineAt(content, position), message });
  }

  const isCss = extension === ".css";
  const isJavaScript = extension === ".js" || extension === ".jsx";
  const isTypeScript = extension === ".ts" || extension === ".tsx";
  if (!isCss && !isJavaScript && !isTypeScript) return violations;

  let sourceFile;
  if (!isCss) {
    const scriptKinds = {
      ".js": ts.ScriptKind.JS,
      ".jsx": ts.ScriptKind.JSX,
      ".ts": ts.ScriptKind.TS,
      ".tsx": ts.ScriptKind.TSX,
    };
    const scriptKind = scriptKinds[extension];
    sourceFile = ts.createSourceFile(repositoryPath, content, ts.ScriptTarget.Latest, true, scriptKind);
  }

  const maskedContent = sourceFile
    ? maskTypeScriptComments(content, sourceFile)
    : maskScannerComments(content);

  if (sourceFile) {
    const syntaxHighlighterImports = reactSyntaxHighlighterImports(sourceFile);
    const syntaxHighlighterBindings = collectStaticBindings(sourceFile);
    const supportsJsx = extension === ".jsx" || extension === ".tsx";

    function visit(node) {
      if (supportsJsx && isIntrinsicStyleAttribute(node, sourceFile)) {
        add("no-inline-style-attribute", node.getStart(sourceFile), "Use a class or DynamicStyleVars instead of an intrinsic style attribute.");
      }
      if (supportsJsx && isReactSyntaxHighlighterOpening(node, sourceFile, syntaxHighlighterImports)) {
        for (const { prop, position, expression } of syntaxHighlighterStyleProps(
          node,
          sourceFile,
          syntaxHighlighterBindings,
        )) {
          const message = prop === REACT_SYNTAX_HIGHLIGHTER_UNRESOLVED_SPREAD
            ? `Cannot prove that the react-syntax-highlighter spread "${expression}" excludes style maps. Use explicit safe props or add an exact file exception with a baseline cap.`
            : `Move the react-syntax-highlighter "${prop}" styling into CSS, or add an exact file and prop exception with a baseline cap.`;
          add(
            REACT_SYNTAX_HIGHLIGHTER_RULE,
            position,
            message,
            prop,
          );
        }
      }
      if (isDomStyleMutation(node, sourceFile)) {
        add("no-dom-style-mutation", node.getStart(sourceFile), "Use state attributes and CSS instead of direct DOM style mutation.");
      }
      const interFontProperty = fontPropertyUsesInter(node, sourceFile);
      if (interFontProperty) {
        add(
          "no-inter-font-family",
          node.getStart(sourceFile),
          `Use the shipped font family instead of Inter in the "${interFontProperty}" property.`,
        );
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  if (extension === ".tsx" || extension === ".jsx" || isCss) {
    for (const match of maskedContent.matchAll(COLOR_LITERAL)) {
      add("no-color-literal", match.index, "Use a Tier 2 color token instead of a color literal.");
    }
  }

  const isApplicationCssModule = repositoryPath.startsWith("app/") && repositoryPath.endsWith(".module.css");
  if (isCss && (repositoryPath.startsWith("components/") || isApplicationCssModule) && !THEME_SOURCE_FILES.has(repositoryPath)) {
    for (const match of maskedContent.matchAll(CSS_VARIABLE)) {
      if (!TIER_ONE_TOKENS.has(match[1].toLowerCase())) continue;
      add("no-tier-1-component-token", match.index, "Use a Tier 2 token instead of a Tier 1 token in application CSS.");
    }
  }

  if (isCss) {
    for (const declaration of cssFontDeclarations(maskedContent)) {
      if (!/\bInter\b/i.test(declaration.value)) continue;
      add(
        "no-inter-font-family",
        declaration.position,
        `Use the shipped font family instead of Inter in the "${declaration.property}" declaration.`,
      );
    }
  }

  return violations.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

function isExcludedFile(path) {
  const parts = path.split("/");
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) return true;
  return /\.(?:test|spec)\.(?:css|ts|tsx)$/i.test(path);
}

async function sourceFiles(root) {
  const files = [];

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const repositoryPath = relative(root, absolutePath).split(sep).join("/");
      if (isExcludedFile(repositoryPath)) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push({ absolutePath, repositoryPath });
      }
    }
  }

  for (const sourceRoot of SOURCE_ROOTS) await visit(resolve(root, sourceRoot));
  return files;
}

export async function scanRepository(root, { exceptions = UI_STYLE_EXCEPTIONS, baseline } = {}) {
  validateExceptions(exceptions);
  const repositoryRoot = resolve(root);
  const violations = [];
  const suppressed = new Map();

  for (const file of await sourceFiles(repositoryRoot)) {
    const content = await readFile(file.absolutePath, "utf8");
    violations.push(...scanSource({ path: file.repositoryPath, content, exceptions, suppressed }));
  }

  if (suppressed.size === 0 && baseline === undefined) return violations;

  const resolvedBaseline = baseline ?? await loadBaseline(repositoryRoot);
  validateBaseline(resolvedBaseline, exceptions);
  violations.push(...compareBaseline(suppressed, resolvedBaseline));

  return violations;
}

async function runCli() {
  try {
    const baseline = await loadBaseline(process.cwd());
    const violations = await scanRepository(process.cwd(), { baseline });
    for (const violation of violations) {
      console.error(`${violation.path}:${violation.line} [${violation.rule}] ${violation.message}`);
    }
    if (violations.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
