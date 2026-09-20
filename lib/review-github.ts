import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { readRemotes, repositoryRoot, runGit } from "./review-commit-git";

const runFile = promisify(execFile);

/**
 * Reeve's side of a Project's GitHub remotes.
 *
 * Every call runs the `gh` command the human has already signed in with. No
 * credential is read, copied, stored or forwarded here: `gh` keeps its own,
 * and this module never asks it for one. Nothing a browser sends names a
 * repository either — a request names a slot this server issued, and the slot
 * is resolved again, against the remotes the guarded Project actually has,
 * every time it is used.
 */
export type ReviewGitHubUnavailable =
  /** The command is not installed on this computer. */
  | "gh-missing"
  /** Installed, but not signed in to the host this remote belongs to. */
  | "auth-required"
  /** Signed in, but the host could not be reached or refused the request. */
  | "remote-unavailable"
  /** The Project has no remote that names a repository. */
  | "not-a-github-remote"
  /** The host answered, but left out something a pinned read depends on. */
  | "incomplete-data";

export class ReviewGitHubError extends Error {
  readonly reason: ReviewGitHubUnavailable;

  constructor(reason: ReviewGitHubUnavailable) {
    super(reason);
    this.name = "ReviewGitHubError";
    this.reason = reason;
  }
}

export interface ReviewGitHubRemote {
  /** Issued here. A browser names this, never an owner, a host, or a URL. */
  id: string;
  remoteName: string;
  host: string;
  owner: string;
  name: string;
}

export interface ReviewGitHubIdentity {
  login: string;
  /** Whether this account may write to the selected repository. */
  canPush: boolean;
  /**
   * Whether the host said what this account may do.
   *
   * False is not the same as "may not": it is the host declining to say, which
   * a reader is told about rather than shown as a refusal.
   */
  permissionsKnown: boolean;
}

/**
 * What reading this remote can offer right now.
 *
 * Three answers, never folded into one: an account that is ready, a stated
 * reason why reading cannot happen, and — separately, at the call site — a
 * read that found nothing. An empty list is a fact about a repository; a
 * missing sign-in is not, and it must never be shown as one.
 */
export type ReviewRemoteAccess =
  | { status: "ready"; identity: ReviewGitHubIdentity }
  | { status: "unavailable"; reason: ReviewGitHubUnavailable };

export type PullRequestFilter = "all" | "reviewing" | "authored";
export type PullRequestState = "open" | "closed" | "merged" | "all";

/** The choices a browser may offer, so the two ends cannot drift apart. */
export const PULL_REQUEST_FILTERS: readonly PullRequestFilter[] = ["all", "reviewing", "authored"];
export const PULL_REQUEST_STATES: readonly PullRequestState[] = ["open", "closed", "merged", "all"];

export interface PullRequestSummary {
  number: number;
  title: string;
  author: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  /** The revision this answer saw. Files and threads are read against it. */
  headSha: string;
  /** The other end of the comparison, pinned with the head and never apart from it. */
  baseSha: string;
  updatedAt: string;
  url: string;
}

/** An answer that says whether it is the whole answer. */
export interface Page<T> {
  items: T[];
  complete: boolean;
}

export interface ReviewThreadComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
}

export interface ReviewThread {
  id: string;
  path: string;
  /** Null where the thread's lines are not in the revision being shown. */
  line: number | null;
  side: "LEFT" | "RIGHT";
  resolved: boolean;
  outdated: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  viewerCanReply: boolean;
  comments: ReviewThreadComment[];
}

/**
 * How `gh` is run.
 *
 * Non-interactive and with its input closed, like the Git runner beside it: a
 * command that stops to ask a question would hang a request. Replaced in tests,
 * which must never reach a host.
 */
export interface GhRun {
  code: number;
  stdout: string;
  stderr: string;
  /** True when the command was cut off, so whether it acted is not known. */
  timedOut?: boolean;
}

export type GhRunner = (args: string[], input?: string) => Promise<GhRun>;

const GH_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 32 * 1024 * 1024;

export const runGh: GhRunner = async (args, input) => {
  const pending = runFile("gh", args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: GH_TIMEOUT_MS,
    env: { ...process.env, LC_ALL: "C", GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", CLICOLOR: "0" },
  });
  if (input === undefined) pending.child.stdin?.end();
  else pending.child.stdin?.end(input);
  try {
    const { stdout, stderr } = await pending;
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    // ENOENT is the command being absent rather than a refusal from a host.
    if (failure.code === "ENOENT") throw new ReviewGitHubError("gh-missing");
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      ...(failure.killed === true || failure.signal ? { timedOut: true } : {}),
    };
  }
};

/**
 * Why a command failed, in this module's own words.
 *
 * The command's own output never leaves here. It can carry a URL, an account,
 * or a host's own message, and a browser has no use for any of it.
 */
function classify(run: GhRun): ReviewGitHubError {
  const text = `${run.stderr} ${run.stdout}`.toLowerCase();
  if (text.includes("gh auth login") || text.includes("authentication") || text.includes("not logged")) {
    return new ReviewGitHubError("auth-required");
  }
  return new ReviewGitHubError("remote-unavailable");
}

function requireSuccess(run: GhRun): string {
  if (run.code !== 0) throw classify(run);
  return run.stdout;
}

/**
 * The repository a remote URL names, if it names one.
 *
 * Both shapes a Project can carry are read: the SSH form and the URL form.
 * Whether the host is really GitHub is not decided here — that is the host's
 * answer to give, and asking it is what the first read does.
 */
export function parseRemoteUrl(url: string): { host: string; owner: string; name: string } | null {
  const trimmed = url.trim().replace(/\.git$/, "");
  const ssh = /^(?:ssh:\/\/)?(?:[^@]+@)([^:/]+)[:/]([^/]+)\/([^/]+)$/.exec(trimmed);
  if (ssh) return { host: ssh[1], owner: ssh[2], name: ssh[3] };
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { host: parsed.host, owner: parts[parts.length - 2], name: parts[parts.length - 1] };
  } catch {
    return null;
  }
}

/**
 * A slot's identity, which is the repository it points at as well as the
 * remote it came from.
 *
 * Binding the repository into the identifier is what stops a slot outliving
 * its meaning: repoint a remote at a fork and the identifier changes, so a
 * request carrying the old one resolves to nothing rather than quietly writing
 * somewhere else.
 */
function slotId(repository: string, remoteName: string, target: { host: string; owner: string; name: string }): string {
  const identity = [repository, remoteName, target.host.toLowerCase(), target.owner.toLowerCase(), target.name.toLowerCase()];
  return createHash("sha256").update(identity.join("\u0000")).digest("hex").slice(0, 16);
}

/**
 * The repository a directory belongs to, canonically.
 *
 * Git finds this by walking upwards, so it can land outside the directory a
 * request was allowed to name. Callers guard what comes back before using it:
 * permission to read one directory is not permission to read whatever
 * repository happens to contain it.
 */
export async function resolveRepositoryRoot(cwd: string): Promise<string | null> {
  try {
    const root = await repositoryRoot(cwd);
    if (!root) return null;
    return await realpath(root).catch(() => root);
  } catch {
    return null;
  }
}

/** A revision as the host writes one, which is what may reach a command. */
export function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

/** Every remote of the guarded Project that names a repository. */
export async function readGitHubRemotes(cwd: string): Promise<ReviewGitHubRemote[]> {
  const root = await repositoryRoot(cwd);
  const names = await readRemotes(root).catch(() => [] as string[]);
  const remotes: ReviewGitHubRemote[] = [];
  for (const remoteName of names) {
    const url = await runGit(root, ["remote", "get-url", remoteName]);
    if (url.code !== 0) continue;
    const parsed = parseRemoteUrl(url.stdout);
    if (!parsed) continue;
    remotes.push({ id: slotId(root, remoteName, parsed), remoteName, ...parsed });
  }
  return remotes;
}

/**
 * The remote a slot names, or nothing.
 *
 * Resolved against the Project's remotes as they are now, so a slot from
 * another Project, another moment, or a browser's imagination matches nothing.
 */
export async function resolveRemote(cwd: string, remoteId: string): Promise<ReviewGitHubRemote | null> {
  return (await readGitHubRemotes(cwd)).find((remote) => remote.id === remoteId) ?? null;
}

function repositoryArgument(remote: ReviewGitHubRemote): string {
  return `${remote.host}/${remote.owner}/${remote.name}`;
}

/** Whether this computer is signed in to a remote's host. Its output is discarded. */
export async function isAuthenticated(remote: ReviewGitHubRemote, gh: GhRunner = runGh): Promise<boolean> {
  return (await gh(["auth", "status", "--hostname", remote.host])).code === 0;
}

export async function readIdentity(remote: ReviewGitHubRemote, gh: GhRunner = runGh): Promise<ReviewGitHubIdentity> {
  if (!(await isAuthenticated(remote, gh))) throw new ReviewGitHubError("auth-required");
  const viewer = requireSuccess(await gh(["api", "--hostname", remote.host, "user", "--jq", ".login"])).trim();
  // An account without a name is not an account this can reason about, and
  // guessing one would put every later permission answer on sand.
  if (!viewer) throw new ReviewGitHubError("incomplete-data");
  const permission = await gh([
    "api", "--hostname", remote.host,
    `repos/${remote.owner}/${remote.name}`, "--jq", ".permissions.push",
  ]);
  // The host answers this for an account it recognises. Silence is the host
  // declining to say, which is carried as such rather than read as a refusal.
  const stated = permission.code === 0 && ["true", "false"].includes(permission.stdout.trim());
  return { login: viewer, canPush: stated && permission.stdout.trim() === "true", permissionsKnown: stated };
}

/**
 * Whether this remote can be read, and by whom.
 *
 * The reason a read cannot happen is the answer, not an absence. Callers show
 * it in place of a list, so a missing command, a missing sign-in, an
 * unreachable host and a half-answer stay four different things a human can
 * act on.
 */
export async function readRemoteAccess(remote: ReviewGitHubRemote, gh: GhRunner = runGh): Promise<ReviewRemoteAccess> {
  try {
    return { status: "ready", identity: await readIdentity(remote, gh) };
  } catch (error) {
    // Only this module's own refusals become a state. Anything else is a fault
    // in Reeve, and dressing it as an unreachable host would hide it.
    if (error instanceof ReviewGitHubError) return { status: "unavailable", reason: error.reason };
    throw error;
  }
}

const PULL_FIELDS = [
  "number", "title", "author", "state", "isDraft", "headRefName", "baseRefName",
  "headRefOid", "baseRefOid", "updatedAt", "url",
].join(",");

/**
 * One search expression, however the filters were chosen.
 *
 * The command takes the last `--search` it is given and its own filter flags
 * do not survive beside one, so a typed search and a chosen view are folded
 * into a single query. Two flags would have let the view fall away silently,
 * which reads as a search that quietly ignored half of what was asked.
 */
export function pullRequestSearch(filter: PullRequestFilter, query: string): string {
  const scope = filter === "reviewing" ? "review-requested:@me" : filter === "authored" ? "author:@me" : "";
  return [scope, query.trim()].filter(Boolean).join(" ");
}

/**
 * The pull requests a human can choose between.
 *
 * The answer says whether it is complete: a host that had more to give than
 * the limit asked for must not be shown as though it had nothing more.
 */
export async function readPullRequests(
  remote: ReviewGitHubRemote,
  options: { filter?: PullRequestFilter; state?: PullRequestState; query?: string; limit?: number } = {},
  gh: GhRunner = runGh,
): Promise<Page<PullRequestSummary>> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const args = [
    "pr", "list", "--repo", repositoryArgument(remote), "--json", PULL_FIELDS,
    "--limit", String(limit + 1), "--state", options.state ?? "open",
  ];
  const search = pullRequestSearch(options.filter ?? "all", options.query ?? "");
  if (search) args.push("--search", search);
  const raw = requireSuccess(await gh(args));
  const parsed = JSON.parse(raw || "[]") as Array<Record<string, unknown>>;
  const shown = parsed.slice(0, limit);
  const items: PullRequestSummary[] = [];
  let whole = parsed.length <= limit;
  for (const entry of shown) {
    const headSha = String(entry.headRefOid ?? "").toLowerCase();
    const baseSha = String(entry.baseRefOid ?? "").toLowerCase();
    // An entry missing either end of its comparison cannot be opened against a
    // pinned pair, so it is left out and the list says it is not the whole one.
    if (!isRevision(headSha) || !isRevision(baseSha)) {
      whole = false;
      continue;
    }
    items.push({
      number: Number(entry.number),
      title: String(entry.title ?? ""),
      author: String((entry.author as { login?: string })?.login ?? ""),
      state: String(entry.state ?? ""),
      isDraft: entry.isDraft === true,
      headRefName: String(entry.headRefName ?? ""),
      baseRefName: String(entry.baseRefName ?? ""),
      headSha,
      baseSha,
      updatedAt: String(entry.updatedAt ?? ""),
      url: String(entry.url ?? ""),
    });
  }
  return { items, complete: whole };
}

/**
 * One pull request's changes, read from the host.
 *
 * The whole pull request compared against its base, which is what a reviewer
 * reads. Asking for patch format instead returns one patch per commit: on a
 * fifteen-commit pull request that is 188 file headers for 42 changed files,
 * the same file appearing once per commit that touched it, with intermediate
 * states a reviewer never asked to see.
 *
 * Nothing is fetched into the Project and nothing is checked out: its working
 * tree, index and branches are not this view's business. Terminal escape
 * sequences stay neutralised, which is the command's own default.
 */
export async function readPullRequestPatch(
  remote: ReviewGitHubRemote,
  number: number,
  gh: GhRunner = runGh,
): Promise<string> {
  return requireSuccess(await gh(["pr", "diff", String(number), "--repo", repositoryArgument(remote)]));
}

/** The revision a pull request's head is on right now. */
export async function readHeadSha(remote: ReviewGitHubRemote, number: number, gh: GhRunner = runGh): Promise<string> {
  const raw = requireSuccess(await gh([
    "pr", "view", String(number), "--repo", repositoryArgument(remote), "--json", "headRefOid", "--jq", ".headRefOid",
  ]));
  return raw.trim();
}

/**
 * Both ends of the comparison a pull request is being read against.
 *
 * A diff is a statement about two revisions. Carrying only the head describes
 * half of it: the same head against a base that has moved is a different set
 * of changes, and a line number from one is not a line in the other.
 */
export interface PullRequestRevisions {
  headSha: string;
  baseSha: string;
}

export function sameRevisions(left: PullRequestRevisions, right: PullRequestRevisions): boolean {
  return left.headSha.toLowerCase() === right.headSha.toLowerCase()
    && left.baseSha.toLowerCase() === right.baseSha.toLowerCase();
}

/** The pair a pull request is on right now, as the host writes revisions. */
export async function readRevisions(
  remote: ReviewGitHubRemote,
  number: number,
  gh: GhRunner = runGh,
): Promise<PullRequestRevisions> {
  const raw = requireSuccess(await gh([
    "pr", "view", String(number), "--repo", repositoryArgument(remote), "--json", "headRefOid,baseRefOid",
  ]));
  const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  const headSha = String(parsed.headRefOid ?? "").trim().toLowerCase();
  const baseSha = String(parsed.baseRefOid ?? "").trim().toLowerCase();
  // Half a pair pins nothing. Reading on would stamp an answer with a revision
  // that was never checked, which is the one thing this whole path exists to
  // prevent.
  if (!isRevision(headSha) || !isRevision(baseSha)) throw new ReviewGitHubError("incomplete-data");
  return { headSha, baseSha };
}

/**
 * A read that belongs to one revision, or the refusal that it could not.
 *
 * The revision travels with the answer because everything built on top of it
 * — a line a comment is anchored to, a thread's position, a file's contents —
 * means nothing without it.
 */
export type RevisionPinnedRead<T> =
  | { status: "read"; revision: PullRequestRevisions; value: T }
  /**
   * The pull request is not on the pair that was asked for. It carries the
   * pair found, so a caller can say what it is now without reading again.
   */
  | { status: "revision-moved"; revision: PullRequestRevisions };

/**
 * Read something about a pull request, pinned to the revision the human is on.
 *
 * The host has no way to ask for a pull request's aggregate diff at a named
 * revision, so the revision is checked on both sides of the read instead. A
 * head that has moved before the read is refused without fetching anything; a
 * head that moves during it makes the answer one nobody asked for, and that is
 * refused too. Either way the refusal is the answer — nothing is merged,
 * retried, or stamped with a revision it did not come from.
 *
 * Reading only. No revision is fetched into the Project and nothing is checked
 * out: this asks the host three questions and leaves the working tree alone.
 */
export async function readPinnedToRevision<T>(
  remote: ReviewGitHubRemote,
  number: number,
  expected: PullRequestRevisions,
  read: () => Promise<T>,
  gh: GhRunner = runGh,
): Promise<RevisionPinnedRead<T>> {
  const before = await readRevisions(remote, number, gh);
  if (!sameRevisions(before, expected)) return { status: "revision-moved", revision: before };
  const value = await read();
  const after = await readRevisions(remote, number, gh);
  if (!sameRevisions(after, expected)) return { status: "revision-moved", revision: after };
  return { status: "read", revision: before, value };
}

/** One pull request's changes, as they are at the revision being reviewed. */
export function readPullRequestPatchAtRevision(
  remote: ReviewGitHubRemote,
  number: number,
  expected: PullRequestRevisions,
  gh: GhRunner = runGh,
): Promise<RevisionPinnedRead<string>> {
  return readPinnedToRevision(remote, number, expected, () => readPullRequestPatch(remote, number, gh), gh);
}

/**
 * The published threads, as they stand at the revision being reviewed.
 *
 * A thread's line is the host's answer about one revision. Read against a
 * newer head it points into code the human is not looking at, so the same
 * guard applies here as to the changes themselves.
 */
export function readReviewThreadsAtRevision(
  remote: ReviewGitHubRemote,
  number: number,
  expected: PullRequestRevisions,
  gh: GhRunner = runGh,
): Promise<RevisionPinnedRead<Page<ReviewThread>>> {
  return readPinnedToRevision(remote, number, expected, () => readReviewThreads(remote, number, gh), gh);
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id path line diffSide isResolved isOutdated
          viewerCanResolve viewerCanUnresolve viewerCanReply
          comments(first: 50) {
            pageInfo { hasNextPage }
            nodes { id body createdAt url viewerCanUpdate viewerCanDelete author { login } }
          }
        }
      }
    }
  }
}`;

/**
 * The threads already published on a pull request.
 *
 * These are the host's, and they are never mixed with the comments a human is
 * still drafting here. A draft becomes one of these only when a human asks for
 * it, which is not something reading can do.
 */
export async function readReviewThreads(
  remote: ReviewGitHubRemote,
  number: number,
  gh: GhRunner = runGh,
): Promise<Page<ReviewThread>> {
  const threads: ReviewThread[] = [];
  let cursor: string | undefined;
  let complete = true;
  for (let page = 0; page < 10; page += 1) {
    const args = [
      "api", "graphql", "--hostname", remote.host,
      "-f", `query=${THREADS_QUERY}`,
      "-F", `owner=${remote.owner}`, "-F", `name=${remote.name}`, "-F", `number=${number}`,
    ];
    if (cursor) args.push("-F", `cursor=${cursor}`);
    const answer = JSON.parse(requireSuccess(await gh(args))) as {
      data?: { repository?: { pullRequest?: { reviewThreads?: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<Record<string, unknown>>;
      } } } };
    };
    const block = answer.data?.repository?.pullRequest?.reviewThreads;
    if (!block) throw new ReviewGitHubError("remote-unavailable");
    for (const node of block.nodes) {
      const comments = node.comments as { pageInfo: { hasNextPage: boolean }; nodes: Array<Record<string, unknown>> };
      if (comments.pageInfo.hasNextPage) complete = false;
      threads.push({
        id: String(node.id),
        path: String(node.path ?? ""),
        line: typeof node.line === "number" ? node.line : null,
        side: node.diffSide === "LEFT" ? "LEFT" : "RIGHT",
        resolved: node.isResolved === true,
        outdated: node.isOutdated === true,
        viewerCanResolve: node.viewerCanResolve === true,
        viewerCanUnresolve: node.viewerCanUnresolve === true,
        viewerCanReply: node.viewerCanReply === true,
        comments: comments.nodes.map((comment) => ({
          id: String(comment.id),
          author: String((comment.author as { login?: string })?.login ?? ""),
          body: String(comment.body ?? ""),
          createdAt: String(comment.createdAt ?? ""),
          url: String(comment.url ?? ""),
          viewerCanEdit: comment.viewerCanUpdate === true,
          viewerCanDelete: comment.viewerCanDelete === true,
        })),
      });
    }
    if (!block.pageInfo.hasNextPage) return { items: threads, complete };
    cursor = block.pageInfo.endCursor ?? undefined;
  }
  // More pages than this view will walk in one request.
  return { items: threads, complete: false };
}

/**
 * What a human can ask to publish.
 *
 * One endpoint, one discriminator. A draft saved here is never any of these:
 * publishing is an action a person takes, and saving is not that action.
 */
/** One comment a human has written, on a line or across a range of them. */
export interface ReviewCommentDraft {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  /** Present when the comment covers a range rather than a single line. */
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  body: string;
}

export type ReviewPublication =
  | {
      action: "submitReview";
      event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
      body: string;
      comments: ReviewCommentDraft[];
    }
  | { action: "replyToThread"; threadId: string; body: string }
  | { action: "editComment"; commentId: string; body: string }
  | { action: "deleteComment"; commentId: string }
  | { action: "resolveThread"; threadId: string }
  | { action: "unresolveThread"; threadId: string };

export interface ReviewPublishRequest {
  cwd: string;
  /** The Review Tab this publication is being made from, and its owner. */
  tabId: string;
  projectRoot: string;
  sessionId?: string;
  remoteId: string;
  number: number;
  /** The revision the human was reading. A moved head is refused, never merged. */
  expectedHeadSha: string;
  /**
   * The other end of the comparison, where the publication was written against
   * one. Sent by a caller whose words describe a diff rather than a thread.
   */
  expectedBaseSha?: string;
  publication: ReviewPublication;
}

export type ReviewPublishRefusal =
  | "head-moved"
  | "base-moved"
  | "not-permitted"
  | "thread-not-in-pull-request"
  | "comment-not-in-pull-request"
  | "path-not-in-pull-request"
  | "line-not-in-revision"
  | "empty-body";

export type ReviewPublishOutcome =
  | { status: "published"; headSha: string; threadId?: string; commentId?: string }
  | { status: "refused"; reason: ReviewPublishRefusal }
  | { status: "unavailable"; reason: ReviewGitHubUnavailable }
  /**
   * The request went out and no answer came back, so whether it landed is not
   * known. Never retried here: a second attempt could publish twice.
   */
  | { status: "uncertain"; reason: "no-confirmation" };

/**
 * Whether a publication may proceed, judged against the pull request itself.
 *
 * Every identifier a browser sends is checked against what the selected pull
 * request actually holds, so a thread, a comment or a path belonging to
 * somewhere else is refused rather than acted on. Permission is the host's to
 * grant: what it says the viewer may do is what decides, not what the browser
 * chose to display.
 *
 * Reviewing is not gated on write access. Anyone who can read a repository may
 * comment on a pull request, and may approve or request changes on one that is
 * not their own; the host enforces the cases it reserves, and its refusal is
 * reported rather than guessed at here.
 */
export function refusePublication(
  publication: ReviewPublication,
  context: {
    headSha: string;
    expectedHeadSha: string;
    /** Both present together, and only where the publication pinned the base. */
    baseSha?: string;
    expectedBaseSha?: string;
    threads: ReviewThread[];
    lines: Map<string, CommentableLines>;
  },
): ReviewPublishRefusal | null {
  if (context.headSha !== context.expectedHeadSha) return "head-moved";
  // Only a publication that pinned the base is judged against it. A thread
  // action describes a conversation rather than a comparison, and refusing one
  // because the base branch moved would refuse something that never depended
  // on it.
  if (context.expectedBaseSha !== undefined && context.baseSha !== context.expectedBaseSha) return "base-moved";
  const thread = (id: string) => context.threads.find((entry) => entry.id === id);
  switch (publication.action) {
    case "submitReview": {
      if (publication.event === "COMMENT" && !publication.body.trim() && publication.comments.length === 0) {
        return "empty-body";
      }
      for (const comment of publication.comments) {
        if (!comment.body.trim()) return "empty-body";
        const file = context.lines.get(comment.path);
        if (!file) return "path-not-in-pull-request";
        const side = (which: "LEFT" | "RIGHT") => (which === "LEFT" ? file.left : file.right);
        // The line has to be one the patch shows, on the side it is claimed on.
        if (!side(comment.side).has(comment.line)) return "line-not-in-revision";
        if (comment.startLine !== undefined) {
          const startSide = comment.startSide ?? comment.side;
          if (startSide !== comment.side) return "line-not-in-revision";
          if (!side(startSide).has(comment.startLine)) return "line-not-in-revision";
          // A range ends where the comment is anchored and cannot start after it.
          if (comment.startLine > comment.line) return "line-not-in-revision";
        }
      }
      return null;
    }
    case "replyToThread": {
      const target = thread(publication.threadId);
      if (!target) return "thread-not-in-pull-request";
      if (!publication.body.trim()) return "empty-body";
      return target.viewerCanReply ? null : "not-permitted";
    }
    case "editComment":
    case "deleteComment": {
      const owner = context.threads.find((entry) =>
        entry.comments.some((comment) => comment.id === publication.commentId));
      const comment = owner?.comments.find((entry) => entry.id === publication.commentId);
      if (!comment) return "comment-not-in-pull-request";
      if (publication.action === "editComment") {
        if (!publication.body.trim()) return "empty-body";
        return comment.viewerCanEdit ? null : "not-permitted";
      }
      return comment.viewerCanDelete ? null : "not-permitted";
    }
    case "resolveThread":
    case "unresolveThread": {
      const target = thread(publication.threadId);
      if (!target) return "thread-not-in-pull-request";
      const permitted = publication.action === "resolveThread" ? target.viewerCanResolve : target.viewerCanUnresolve;
      return permitted ? null : "not-permitted";
    }
  }
}

/** The lines of one file a comment may be anchored to, by the side they sit on. */
export interface CommentableLines {
  left: Set<number>;
  right: Set<number>;
}

/**
 * Where a comment may be placed, read from the patch a reviewer is shown.
 *
 * A line number alone means nothing: the same number exists on both sides of a
 * file and usually means different lines. What can carry a comment is a line
 * the patch actually shows — removed and context lines on the left, added and
 * context lines on the right — so the patch itself is what decides.
 */
export function commentableLines(patch: string): Map<string, CommentableLines> {
  const files = new Map<string, CommentableLines>();
  let current: CommentableLines | undefined;
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const header = /^\+\+\+ b\/(.*)$/.exec(line);
    if (header) {
      current = { left: new Set<number>(), right: new Set<number>() };
      files.set(header[1], current);
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("-")) current.left.add(oldLine++);
    else if (line.startsWith("+")) current.right.add(newLine++);
    else if (line.startsWith(" ")) {
      current.left.add(oldLine++);
      current.right.add(newLine++);
    }
  }
  return files;
}

/**
 * What a write actually did, as far as can be told.
 *
 * An exit code is not an answer from the host: the command exits non-zero for
 * a refusal it was told about and for a connection that died halfway, and
 * those are not the same thing. Only a reply that can be read as having
 * happened counts as published, only a status the host itself reported counts
 * as refused, and everything else is unknown — because a second attempt at a
 * write that may already have landed would publish it twice.
 */
type WriteVerdict =
  | { kind: "published"; id?: string }
  | { kind: "refused"; reason: ReviewPublishRefusal }
  | { kind: "unavailable"; reason: ReviewGitHubUnavailable }
  | { kind: "uncertain" };

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function graphqlErrorVerdict(errors: unknown[]): WriteVerdict {
  const text = JSON.stringify(errors).toLowerCase();
  // The host answered, so nothing was written whatever the reason.
  if (text.includes("forbidden") || text.includes("not have permission") || text.includes("unauthorized")) {
    return { kind: "refused", reason: "not-permitted" };
  }
  if (text.includes("could not resolve") || text.includes("not found")) {
    return { kind: "refused", reason: "comment-not-in-pull-request" };
  }
  return { kind: "unavailable", reason: "remote-unavailable" };
}

export function classifyWrite(run: GhRun): WriteVerdict {
  if (run.timedOut) return { kind: "uncertain" };
  const answer = parseJson(run.stdout);

  if (run.code === 0) {
    if (!answer) return { kind: "uncertain" };
    const errors = answer.errors;
    if (Array.isArray(errors) && errors.length > 0) return graphqlErrorVerdict(errors);
    // A reply that carries an identifier, or a mutation's own data, is the
    // host saying it did the thing.
    if (typeof answer.id === "number" || typeof answer.id === "string") return { kind: "published", id: String(answer.id) };
    if (answer.data && typeof answer.data === "object") return { kind: "published" };
    // Exit zero with a reply that says nothing recognisable is not a promise.
    return { kind: "uncertain" };
  }

  const reported = `${run.stderr}\n${run.stdout}`;
  if (/gh auth login|not logged in/i.test(reported)) return { kind: "unavailable", reason: "auth-required" };
  const status = /HTTP (\d{3})/.exec(reported);
  if (!status) {
    // No status means no answer from the host: a reset connection, a broken
    // pipe, a name that would not resolve. The write may still have landed.
    return { kind: "uncertain" };
  }
  const code = Number(status[1]);
  if (code === 401 || code === 403) return { kind: "refused", reason: "not-permitted" };
  if (code === 404) return { kind: "refused", reason: "comment-not-in-pull-request" };
  if (code === 422) return { kind: "refused", reason: "line-not-in-revision" };
  if (code >= 500) return { kind: "uncertain" };
  return { kind: "unavailable", reason: "remote-unavailable" };
}

const MUTATIONS = {
  replyToThread: `mutation($thread: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) {
      comment { id }
    }
  }`,
  editComment: `mutation($comment: ID!, $body: String!) {
    updatePullRequestReviewComment(input: { pullRequestReviewCommentId: $comment, body: $body }) {
      pullRequestReviewComment { id }
    }
  }`,
  deleteComment: `mutation($comment: ID!) {
    deletePullRequestReviewComment(input: { id: $comment }) { clientMutationId }
  }`,
  resolveThread: `mutation($thread: ID!) { resolveReviewThread(input: { threadId: $thread }) { thread { id } } }`,
  unresolveThread: `mutation($thread: ID!) { unresolveReviewThread(input: { threadId: $thread }) { thread { id } } }`,
} as const;

/**
 * The revision, or the pair, a publication was written against.
 *
 * A review comment anchors to a commit, so the head is always pinned. The base
 * is pinned only by a caller whose words describe a comparison: a thread action
 * does not depend on the base, and demanding one would refuse a reply because
 * the host declined to report a base the reply never used.
 */
export interface PublicationRevisions {
  headSha: string;
  baseSha?: string;
}

/**
 * Carry out one publication, having decided it may happen.
 *
 * Nothing is attempted twice. A command that was cut off may already have been
 * acted on by the host, so the answer says it is not known rather than trying
 * again and risking the same comment twice.
 */
export async function publishReview(
  remote: ReviewGitHubRemote,
  number: number,
  expected: PublicationRevisions,
  publication: ReviewPublication,
  gh: GhRunner = runGh,
): Promise<ReviewPublishOutcome> {
  try {
    const [current, threads, paths] = await Promise.all([
      // The pair is read only where the publication pinned both ends, because
      // reading it is what makes a missing base fatal.
      expected.baseSha === undefined
        ? readHeadSha(remote, number, gh).then((headSha): PublicationRevisions => ({ headSha }))
        : readRevisions(remote, number, gh),
      readReviewThreads(remote, number, gh),
      publication.action === "submitReview"
        ? readPullRequestPatch(remote, number, gh)
        : Promise.resolve(""),
    ]);
    const refusal = refusePublication(publication, {
      headSha: current.headSha,
      expectedHeadSha: expected.headSha,
      ...(expected.baseSha === undefined
        ? {}
        : { baseSha: current.baseSha, expectedBaseSha: expected.baseSha }),
      threads: threads.items,
      lines: commentableLines(paths),
    });
    if (refusal) return { status: "refused", reason: refusal };

    const run = await dispatch(remote, number, expected.headSha, publication, gh);
    const verdict = classifyWrite(run);
    switch (verdict.kind) {
      case "published":
        return { status: "published", headSha: current.headSha, ...(verdict.id ? { commentId: verdict.id } : {}) };
      case "refused":
        return { status: "refused", reason: verdict.reason };
      case "unavailable":
        return { status: "unavailable", reason: verdict.reason };
      default:
        return { status: "uncertain", reason: "no-confirmation" };
    }
  } catch (error) {
    if (error instanceof ReviewGitHubError) return { status: "unavailable", reason: error.reason };
    return { status: "unavailable", reason: "remote-unavailable" };
  }
}

function dispatch(
  remote: ReviewGitHubRemote,
  number: number,
  commitId: string,
  publication: ReviewPublication,
  gh: GhRunner,
): Promise<GhRun> {
  const graphql = (query: string, fields: string[]) =>
    gh(["api", "graphql", "--hostname", remote.host, "-f", `query=${query}`, ...fields]);
  switch (publication.action) {
    case "submitReview": {
      const body = JSON.stringify({
        // The revision the human read. Without it the host anchors the review
        // to whatever the head is when this arrives, which may be code nobody
        // has looked at.
        commit_id: commitId,
        event: publication.event,
        body: publication.body,
        comments: publication.comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          side: comment.side,
          ...(comment.startLine === undefined ? {} : { start_line: comment.startLine }),
          ...(comment.startSide === undefined ? {} : { start_side: comment.startSide }),
          body: comment.body,
        })),
      });
      return gh([
        "api", "--hostname", remote.host, "--method", "POST",
        `repos/${remote.owner}/${remote.name}/pulls/${number}/reviews`, "--input", "-",
      ], body);
    }
    case "replyToThread":
      return graphql(MUTATIONS.replyToThread, ["-f", `thread=${publication.threadId}`, "-f", `body=${publication.body}`]);
    case "editComment":
      return graphql(MUTATIONS.editComment, ["-f", `comment=${publication.commentId}`, "-f", `body=${publication.body}`]);
    case "deleteComment":
      return graphql(MUTATIONS.deleteComment, ["-f", `comment=${publication.commentId}`]);
    case "resolveThread":
      return graphql(MUTATIONS.resolveThread, ["-f", `thread=${publication.threadId}`]);
    case "unresolveThread":
      return graphql(MUTATIONS.unresolveThread, ["-f", `thread=${publication.threadId}`]);
  }
}
