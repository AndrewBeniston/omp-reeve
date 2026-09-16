/**
 * The runnable command that reproduces a whole review as a working-tree change.
 *
 * R20's reading of the reference: the row copies an invocable shell command,
 * not patch text. The command changes to the repository top level and pipes
 * the review's unified diff into `git apply --3way` through a heredoc. The
 * patch is carried inside the command, so one paste reproduces the review.
 *
 * Nothing here runs the command. It only builds the text that goes on the
 * clipboard, so every quoting decision below has to hold for a patch the user
 * did not write and a path the user did not choose.
 */

/** The heredoc delimiter, before it is made unique against a patch. */
const BASE_DELIMITER = "REEVE_REVIEW_PATCH";

/**
 * A POSIX single-quoted string.
 *
 * Single quotes suppress every expansion, so the only character that needs
 * work is the single quote itself: close the string, add an escaped quote,
 * reopen. A repository path is the only value this is used on.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * A heredoc delimiter that cannot appear as a line of this patch.
 *
 * A patch line equal to the delimiter would end the heredoc early and hand
 * the rest of the patch to the shell as commands. Git never writes such a
 * line, but a diff of a file that contains one would, so the delimiter grows
 * until no line matches it.
 */
export function uniqueHeredocDelimiter(patch: string): string {
  const lines = new Set(patch.split("\n"));
  let delimiter = BASE_DELIMITER;
  let suffix = 0;
  while (lines.has(delimiter)) {
    suffix += 1;
    delimiter = `${BASE_DELIMITER}_${suffix}`;
  }
  return delimiter;
}

export interface ReviewApplyCommandInput {
  /** The repository top level the patch paths are relative to. */
  repositoryRoot: string;
  /** The whole review's unified diff, as Git wrote it. */
  patch: string;
}

/**
 * The command, or null when there is nothing to apply.
 *
 * Null rather than an empty command: a copied `git apply` over an empty patch
 * fails at the terminal, and reporting nothing to copy is the honest result.
 */
export function reviewApplyCommand({ repositoryRoot, patch }: ReviewApplyCommandInput): string | null {
  const root = repositoryRoot.trim();
  if (!root || !patch.trim()) return null;
  const delimiter = uniqueHeredocDelimiter(patch);
  // Git accepts a patch on stdin only when its last line is terminated.
  const body = patch.endsWith("\n") ? patch : `${patch}\n`;
  /*
   * The quoted delimiter is what makes this safe: with `<<'WORD'` the shell
   * performs no substitution inside the body, so a patch carrying `$(...)`, a
   * backtick, or a backslash reaches Git byte for byte and runs nothing. The
   * subshell keeps the directory change local to the paste.
   */
  return `(cd ${shellSingleQuote(root)} && git apply --3way <<'${delimiter}'\n${body}${delimiter}\n)`;
}
