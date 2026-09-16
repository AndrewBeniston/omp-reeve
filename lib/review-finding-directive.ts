/**
 * The inline comment directive a review model writes, read out of its answer.
 *
 * The reference's local review route asks for ordinary Markdown and allows one
 * structured directive for feedback that belongs on a changed line, with a
 * required title, body and file and an optional start, end and priority. Reeve
 * asks for the same shape, under the same name, so a model that already knows
 * the form writes something Reeve can read.
 *
 * This is a plain text parser and not a Markdown renderer. The panel needs the
 * fields, not a node, and the answer is displayed as Markdown elsewhere.
 *
 * What it refuses matters as much as what it reads. A directive inside a fenced
 * block, inside an indented block, or inside a quotation is text about a
 * directive rather than one, and a model explaining the form to the human must
 * not thereby draw a card on the diff.
 */

/** One directive as it was written, before anything checks it against a review. */
export interface RawReviewFindingDirective {
  /**
   * Which directive this was in the message, counting from zero.
   *
   * Every line that opens the directive takes a number, including one this
   * parser then refuses. The number is half of a finding's identity, so it has
   * to mean the same thing on every read: counting only the accepted ones would
   * renumber the survivors whenever tolerance here changed.
   */
  index: number;
  title: string;
  body: string;
  /** As the model wrote it. Nothing here decides whether it names a real file. */
  file: string;
  start?: number;
  end?: number;
  /** As the model wrote it, free-form, displayed and never used to filter. */
  priority?: string;
}

/** The name the reference uses for this directive, kept rather than invented. */
const DIRECTIVE = "::code-comment{";

/** Up to three leading spaces is still a paragraph; the fourth makes it code. */
const INDENT = /^ {0,3}(?=\S)/;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

const QUOTE = /^ {0,3}>/;

/**
 * Every directive in one piece of assistant text, in the order it was written.
 *
 * Text with no directive gives an empty list, which is the ordinary answer: a
 * review that raises nothing on a line is still a review.
 */
export function parseReviewFindingDirectives(text: string): RawReviewFindingDirective[] {
  const directives: RawReviewFindingDirective[] = [];
  let index = 0;
  let fence: { marker: string; length: number } | null = null;
  for (const line of text.split("\n")) {
    const fenced = FENCE.exec(line);
    if (fenced) {
      const marker = fenced[1][0];
      const length = fenced[1].length;
      if (fence === null) fence = { marker, length };
      else if (fence.marker === marker && length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (QUOTE.test(line)) continue;
    if (!INDENT.test(line)) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith(DIRECTIVE)) continue;
    const sighting = index++;
    if (!trimmed.endsWith("}")) continue;
    const fields = parseFields(trimmed.slice(DIRECTIVE.length, -1));
    if (!fields) continue;
    const directive = buildDirective(sighting, fields);
    if (directive) directives.push(directive);
  }
  return directives;
}

/** The checked directive, or nothing when a required field is missing. */
function buildDirective(index: number, fields: Map<string, string>): RawReviewFindingDirective | null {
  const title = fields.get("title")?.trim() ?? "";
  const body = fields.get("body")?.trim() ?? "";
  const file = fields.get("file")?.trim() ?? "";
  if (!title || !body || !file) return null;
  const directive: RawReviewFindingDirective = { index, title, body, file };
  const start = lineNumber(fields.get("start"));
  if (start !== null) directive.start = start;
  const end = lineNumber(fields.get("end"));
  // An end below the start describes no range, so the start stands alone
  // rather than the pair being believed in the order it arrived.
  if (start !== null && end !== null && end >= start) directive.end = end;
  const priority = fields.get("priority")?.trim();
  if (priority) directive.priority = priority;
  return directive;
}

function lineNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * The attributes between the braces, or nothing when the text is malformed.
 *
 * A half-read directive is refused whole. Taking the fields that happened to
 * parse from a line with an unterminated quotation would report a body that
 * stops mid-sentence as the model's finding.
 */
function parseFields(source: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const space = /^\s+/.exec(rest);
    if (space) {
      position += space[0].length;
      continue;
    }
    const key = /^([A-Za-z_][A-Za-z0-9_-]*)=/.exec(rest);
    if (!key) return null;
    position += key[0].length;
    const value = source[position] === '"'
      ? quotedValue(source, position)
      : bareValue(source, position);
    if (!value) return null;
    position = value.end;
    // A repeated key is one directive saying two things. The first is kept,
    // because a later one cannot be told from an accident of the writing.
    if (!fields.has(key[1])) fields.set(key[1], value.text);
  }
  return fields;
}

/** A quoted value, with the two escapes the reference's own form needs. */
function quotedValue(source: string, from: number): { text: string; end: number } | null {
  let text = "";
  for (let position = from + 1; position < source.length; position++) {
    const character = source[position];
    if (character === "\\") {
      const escaped = source[position + 1];
      if (escaped === undefined) return null;
      text += escaped === "n" ? "\n" : escaped;
      position++;
      continue;
    }
    if (character === '"') return { text, end: position + 1 };
    text += character;
  }
  return null;
}

/** An unquoted value, which is how a number or a bare word arrives. */
function bareValue(source: string, from: number): { text: string; end: number } | null {
  const match = /^[^\s"]+/.exec(source.slice(from));
  if (!match) return null;
  return { text: match[0], end: from + match[0].length };
}
