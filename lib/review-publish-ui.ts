/**
 * What the publish surface is made of, with nothing a server owns.
 *
 * The forge vocabulary, the repository a remote names, and the shape of a
 * request URL are read by the form as well as by the command runner, and a
 * browser bundle must never reach the OMP SDK that the runner's trust and
 * Session lookups pull in. Everything here is pure for that reason.
 */

export type ReviewForge = "github" | "gitlab";

export interface ForgeRun {
  code: number;
  stdout: string;
  stderr: string;
  /** True when the command was cut off, so whether it acted is not known. */
  timedOut?: boolean;
}

export type ForgeRunner = (command: string, args: string[], cwd: string) => Promise<ForgeRun>;

/** What the surface calls things, which is all GitLab changes. */
export interface ReviewPublishVocabulary {
  noun: string;
  capitalised: string;
  draft: string;
  create: string;
  view: string;
}

export function publishVocabulary(forge: ReviewForge): ReviewPublishVocabulary {
  return forge === "gitlab"
    ? { noun: "merge request", capitalised: "Merge request", draft: "Create as a draft merge request", create: "Create merge request", view: "View merge request" }
    : { noun: "pull request", capitalised: "Pull request", draft: "Create as a draft pull request", create: "Create pull request", view: "View pull request" };
}

/**
 * Which forge a remote belongs to, from its host name.
 *
 * Only the two the reference handles. A self-hosted GitLab that says so in its
 * host name is recognised; anything else is not guessed at, because running
 * the wrong tool against a host is worse than saying the host is unsupported.
 */
export function forgeForRemoteUrl(url: string): ReviewForge | null {
  const host = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
    ? (() => { try { return new URL(url).hostname; } catch { return ""; } })()
    : /^(?:[^@]+@)?([^:/]+)[:/]/.exec(url.trim())?.[1] ?? "";
  const name = host.toLowerCase();
  if (!name) return null;
  if (name === "github.com" || name.endsWith(".github.com") || name.includes("github")) return "github";
  if (name.includes("gitlab")) return "gitlab";
  return null;
}

/** The repository a remote URL names, which every command is bound to. */
export interface ReviewForgeRepository {
  host: string;
  /** The remote's own port, empty for the default. Kept so a self-hosted
   * host on a port is still recognised, and only on that port. */
  port: string;
  owner: string;
  name: string;
}

export function parseRemoteRepository(url: string): ReviewForgeRepository | null {
  const trimmed = url.trim().replace(/\.git$/, "");
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let host = "";
  let pathname = "";
  let port = "";
  if (scheme) {
    try {
      const parsed = new URL(trimmed);
      host = parsed.hostname;
      pathname = parsed.pathname;
      port = parsed.port;
    } catch {
      return null;
    }
  } else {
    const ssh = /^(?:[^@]+@)?([^:/]+)[:/](.+)$/.exec(trimmed);
    if (!ssh) return null;
    host = ssh[1];
    pathname = ssh[2];
  }
  const segments = pathname.split("/").filter(Boolean);
  if (!host || segments.length < 2) return null;
  // A GitLab project can sit in a group, so everything before the last
  // segment is the owner rather than only the first.
  return { host: host.toLowerCase(), port, owner: segments.slice(0, -1).join("/"), name: segments[segments.length - 1] };
}

/**
 * How each tool is told which repository to act on.
 *
 * A checkout with more than one remote is the case this exists for: both
 * tools pick a default of their own, and it need not be the remote the panel
 * resolved. Every command carries this, so listing and creating cannot end up
 * on two different repositories.
 */
export function forgeRepositoryArgs(forge: ReviewForge, repository: ReviewForgeRepository): string[] {
  return forge === "github"
    ? ["--repo", `${repository.host}/${repository.owner}/${repository.name}`]
    : ["--repo", `https://${repository.host}/${repository.owner}/${repository.name}`];
}

/**
 * A URL that is this repository's own request, and nothing else.
 *
 * Used for every URL that leaves this module: the one a creation printed, the
 * one a listing reported, and therefore the one the view action opens. Same
 * host, same port, same repository, the forge's own request path, and a
 * number at the end of it. Anything else - a plain link, another path in the
 * same repository, a URL carrying credentials, a different port, or plain
 * HTTP - is not a request this can vouch for.
 */
export function parseForgeRequestUrl(
  forge: ReviewForge,
  repository: ReviewForgeRepository,
  value: string,
): { number: number; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port !== repository.port) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.hostname.toLowerCase() !== repository.host) return null;
  const prefix = (forge === "github"
    ? `/${repository.owner}/${repository.name}/pull/`
    : `/${repository.owner}/${repository.name}/-/merge_requests/`).toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (!path.startsWith(prefix)) return null;
  const tail = path.slice(prefix.length).replace(/\/$/, "");
  if (!/^\d+$/.test(tail)) return null;
  const number = Number(tail);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { number, url: `https://${parsed.host}${parsed.pathname.replace(/\/$/, "")}` };
}

export type ReviewPublishBlocked =
  | "no-branch"
  | "no-remote"
  | "unsupported-remote"
  | "cli-missing"
  | "auth-required"
  | "base-missing"
  | "untrusted-project"
  | "unavailable";

export interface ReviewPublishExisting {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
}

export interface ReviewPublishState {
  forge: ReviewForge | null;
  remote: string | null;
  /** The repository that remote names. Every command is bound to it. */
  repository: ReviewForgeRepository | null;
  /** The branch the change is on. Null on a detached HEAD. */
  head: string | null;
  /** Where it would merge. Null when the repository names no default. */
  base: string | null;
  /**
   * True once the remote has this branch, false when it demonstrably does
   * not, and null when it was never established - a read that stopped at a
   * blocked state measured nothing, and saying the remote lacks the branch
   * would be inventing an answer.
   */
  headPublished: boolean | null;
  /** Commits the remote does not have yet, or null when that was not read. */
  unpushed: number | null;
  /**
   * Changed paths that no commit holds yet, or null when that was not read.
   * The form offers to commit them, and offers it only when there are some.
   */
  uncommitted: number | null;
  /**
   * A digest of those local changes when they were read.
   *
   * The form sends it back, and the server refuses to commit when the digest
   * no longer matches. A human commits what the form showed them, or nothing.
   */
  snapshot: string | null;
  /** The open one this branch already has, which is offered instead. */
  existing: ReviewPublishExisting | null;
  blocked: ReviewPublishBlocked | null;
}

export type ReviewPublishRefusal =
  | "title-empty"
  | "already-exists"
  | "no-commits"
  | "not-permitted"
  | "head-not-published"
  | "auth-required";

export interface ReviewPublishRequest {
  cwd: string;
  title: string;
  /** Empty means the description is written for the human before this runs. */
  body: string;
  base: string;
  draft: boolean;
}

/**
 * The opt-in that commits local changes before the request is published.
 *
 * Absent means nothing is committed, which is the default. The snapshot is
 * the one the form displayed, so a working tree that moved since then stops
 * the commit rather than carrying work nobody looked at.
 */
export interface ReviewPublishCommitFirst {
  message: string;
  snapshot: string;
}

/** What a commit result is called in the modal, from what the commit reported. */
export function commitFirstProblem(result: {
  status: string;
  refusal?: string;
  failure?: string;
}): string {
  if (result.status === "refused") {
    switch (result.refusal) {
      case "no-changes": return "There are no local changes to commit. Nothing was published.";
      case "message-empty":
      case "message-invalid": return "Write a commit message for the local changes. Nothing was published.";
      case "hidden-staged-paths":
      case "index-changed-while-staging":
      case "stale-index": return "The local changes moved while they were committed. Refresh and try again. Nothing was published.";
      case "untrusted-project": return "Trust this Project before committing from it. Nothing was published.";
      default: return "The local changes could not be committed. Nothing was published.";
    }
  }
  switch (result.failure) {
    case "identity-missing": return "Git has no name and email to commit with. Set them, then try again. Nothing was published.";
    case "hook-rejected": return "A commit hook refused the local changes. Nothing was published.";
    case "nothing-to-commit": return "There are no local changes to commit. Nothing was published.";
    case "checkout-failed": return "The branch could not be changed, so nothing was committed or published.";
    default: return "The local changes could not be committed. Nothing was published.";
  }
}

export type ReviewPublishResult =
  | { status: "published"; forge: ReviewForge; number: number; url: string; draft: boolean }
  | { status: "exists"; forge: ReviewForge; existing: ReviewPublishExisting }
  | { status: "refused"; forge: ReviewForge | null; refusal: ReviewPublishRefusal }
  | { status: "blocked"; forge: ReviewForge | null; blocked: ReviewPublishBlocked }
  | { status: "failed"; forge: ReviewForge | null }
  /** The tool was cut off, so the host may have created it. Never retried. */
  | { status: "uncertain"; forge: ReviewForge | null };

/** Why creation was refused, from what the tool said rather than from a guess. */
export function classifyPublishFailure(run: ForgeRun): ReviewPublishRefusal | null {
  const reported = `${run.stderr}\n${run.stdout}`;
  if (/already exists|existing (pull request|merge request)/i.test(reported)) return "already-exists";
  if (/no commits between|no commits in common|nothing to compare/i.test(reported)) return "no-commits";
  if (/auth login|not logged in|authentication/i.test(reported)) return "auth-required";
  if (/permission|forbidden|403|not authorized|insufficient/i.test(reported)) return "not-permitted";
  return null;
}
