/** The composer entry for a requested review (R18): a submenu, not a command. */

export const REVIEW_SLASH_COMMAND = "review";

export type ReviewSlashEntryId = "uncommitted" | "branch";

export interface ReviewSlashEntry {
  id: ReviewSlashEntryId;
  label: string;
  description: string;
  /** Whether choosing it opens the branch list rather than starting a turn. */
  needsBranch: boolean;
}

export const REVIEW_SLASH_ENTRIES: readonly ReviewSlashEntry[] = [
  {
    id: "uncommitted",
    label: "Review uncommitted changes",
    description: "Staged, unstaged and untracked files as they stand.",
    needsBranch: false,
  },
  {
    id: "branch",
    label: "Review against a base branch",
    description: "Everything this branch has that the base does not.",
    needsBranch: true,
  },
];

/** What the human typed resolved to an entry, and the branch they named. */
export interface ReviewSlashInvocation {
  entry: ReviewSlashEntry;
  /** The base branch, when one was typed after the branch entry. */
  base: string | null;
  /** Whatever else they wrote, which travels into the request as a message. */
  message: string;
}

/** Read `/review …` into an entry. A bare `/review` is the first entry. */
export function parseReviewSlashCommand(text: string): ReviewSlashInvocation | null {
  const match = /^\/review(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  if (!rest) return { entry: REVIEW_SLASH_ENTRIES[0], base: null, message: "" };
  const [first, ...remainder] = rest.split(/\s+/);
  const entry = REVIEW_SLASH_ENTRIES.find((candidate) => candidate.id === first);
  if (!entry) return { entry: REVIEW_SLASH_ENTRIES[0], base: null, message: rest };
  if (!entry.needsBranch) return { entry, base: null, message: remainder.join(" ") };
  const [base, ...message] = remainder;
  return { entry, base: base ?? null, message: message.join(" ") };
}

/** Git answers with a full ref; the short name resolves to the same commit. */
export function reviewBranchDisplayName(ref: string | null | undefined): string | null {
  const name = ref?.trim().replace(/^refs\/(heads|remotes)\//, "");
  return name || null;
}

export interface ReviewBaseBranchSource {
  /** The branch the repository points new work at, which seeds the list. */
  defaultBranch: string | null;
  currentBranch: string | null;
  /** Branches by recency, as Git reports them. */
  recentBranches: readonly string[];
}

/** What the composer asks for when the human runs the command. */
export interface ReviewSlashRequest {
  mode: "uncommitted" | "branch";
  base: string | null;
  message: string;
  /**
   * Who asked, which decides the severity floor the prompt carries.
   * Defaults to a review the human asked for.
   */
  origin?: "automatic" | "requested";
  /** Whether the security pass is included. Defaults to off. */
  security?: boolean;
}

/**
 * `prompt` is for this conversation and the composer sends it. `delivered`
 * already went to its own Session and needs no send.
 */
export type ReviewSlashOutcome =
  | { kind: "prompt"; prompt: string }
  | { kind: "delivered"; message: string }
  | {
    kind: "error";
    error: string;
    /**
     * The composer refused a turn that is running, and nothing was written
     * anywhere. An automatic caller may ask again in a moment. Absent means
     * the request failed and asking again would fail the same way.
     */
    deferred?: boolean;
  };

/** Seeded with the default target, and de-duplicated: it is usually recent too. */
/** How many branches the submenu offers before it stops being a menu. */
const BASE_BRANCH_LIMIT = 20;

export function reviewBaseBranchChoices(source: ReviewBaseBranchSource): string[] {
  const ordered = [source.defaultBranch, source.currentBranch, ...source.recentBranches];
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const branch of ordered) {
    const name = branch?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    choices.push(name);
    if (choices.length >= BASE_BRANCH_LIMIT) break;
  }
  return choices;
}

/**
 * An unaccepted Xcode licence is named with the command that clears it, since
 * Git's own words do not diagnose it. Everything else keeps Git's message.
 */
export function describeGitUnusable(stderr: string): string {
  if (/Xcode(?:\/iOS)? license/i.test(stderr) || /xcodebuild -license/i.test(stderr)) {
    return "Git cannot run until the Xcode licence is accepted. Run `sudo xcodebuild -license` in a terminal, then try again.";
  }
  const message = stderr.trim().split("\n").find((line) => line.trim()) ?? "";
  return message ? `Git could not list the branches: ${message}` : "Git could not list the branches.";
}
