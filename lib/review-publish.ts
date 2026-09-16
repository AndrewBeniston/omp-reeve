import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { getAgentDir } from "./session-reader";
import { getProjectTrustStatus } from "./project-trust";
import { readIndexDigest, repositoryRoot, runGit } from "./review-commit-git";
import { REVIEW_AGGREGATE_BYTE_CAP, REVIEW_UNTRACKED_FILE_CEILING } from "./review-limits";
import {
  classifyPublishFailure,
  forgeForRemoteUrl,
  forgeRepositoryArgs,
  parseForgeRequestUrl,
  parseRemoteRepository,
  type ForgeRun,
  type ForgeRunner,
  type ReviewForge,
  type ReviewForgeRepository,
  type ReviewPublishBlocked,
  type ReviewPublishExisting,
  type ReviewPublishRequest,
  type ReviewPublishResult,
  type ReviewPublishState,
} from "./review-publish-ui";

/**
 * Opening a pull request from Review (R16).
 *
 * The reference reaches one modal from the Review toolbar, and GitLab is that
 * same modal relabelled to merge request rather than a second flow. This
 * follows it: one state, one creation, and a vocabulary that changes with the
 * forge. The host is reached through its own command line tool, run the way
 * the Git and gh runners beside it are run - non-interactive, with its input
 * closed, and with its output kept here rather than handed to a browser.
 */


/** The tool each forge is reached through. */
export const FORGE_COMMANDS: Record<ReviewForge, string> = { github: "gh", gitlab: "glab" };

const runFile = promisify(execFile);
const FORGE_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/** Raised when the forge tool is not installed, which is not a refusal. */
export class ForgeMissingError extends Error {
  constructor(readonly command: string) {
    super("forge-cli-missing");
    this.name = "ForgeMissingError";
  }
}

export const runForge: ForgeRunner = async (command, args, cwd) => {
  const pending = runFile(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: FORGE_TIMEOUT_MS,
    env: {
      ...process.env,
      LC_ALL: "C",
      NO_COLOR: "1",
      CLICOLOR: "0",
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  pending.child.stdin?.end();
  try {
    const { stdout, stderr } = await pending;
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    if (failure.code === "ENOENT") throw new ForgeMissingError(command);
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      ...(failure.killed === true || failure.signal ? { timedOut: true } : {}),
    };
  }
};


async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  const run = await runGit(cwd, args);
  return run.code === 0 ? run.stdout.trim() || null : null;
}

/** The local changes a commit would carry, and a digest of what they are now. */
export interface ReviewLocalChanges {
  /** Every changed path, with both ends of a rename, sorted. */
  paths: string[];
  /**
   * Empty when these changes could not be covered in full. An empty digest
   * offers no commit and matches no request, so nothing is committed on the
   * strength of a reading that missed something.
   */
  digest: string;
}

/**
 * What is local and not committed, read once and hashed.
 *
 * The digest covers every byte a commit of these paths would carry: the
 * change listing, the working tree against HEAD, the index, and the content
 * of each untracked file. A file edited after the form opened produces a
 * different digest, and the commit is then refused.
 *
 * Untracked content is read the way a review reads it, with `diff --no-index`.
 * A symbolic link records its own target path under mode 120000, so a link
 * that points outside the repository is never followed. `hash-object` would
 * read that target, which is why it is not used here.
 */
export async function readLocalChanges(cwd: string): Promise<ReviewLocalChanges> {
  const root = await repositoryRoot(cwd);
  const status = await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.code !== 0) return { paths: [], digest: "" };
  const records = status.stdout.split("\0");
  const paths: string[] = [];
  const untracked: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    // "XY path". Anything shorter is the empty tail of the last record.
    if (record.length < 4) continue;
    const path = record.slice(3);
    if (path) paths.push(path);
    if (path && record.slice(0, 2) === "??") untracked.push(path);
    // A rename or a copy names where it came from in the next record. Both
    // ends belong to the same change, so both are staged.
    if (record[0] === "R" || record[0] === "C" || record[1] === "R" || record[1] === "C") {
      const origin = records[index + 1];
      index += 1;
      if (origin) paths.push(origin);
    }
  }
  const listed = { paths: [...new Set(paths)].sort(), digest: "" };
  const digest = createHash("sha256").update(status.stdout).update("\0");
  // The working tree against HEAD, which is what staging these paths carries.
  const tracked = await runGit(root, ["diff", "--no-color", "--no-ext-diff", "HEAD"]);
  digest.update(tracked.code === 0 ? tracked.stdout : "").update("\0");
  /*
   * The index as well. A path can hold one content in the index and another
   * in the working tree, and `diff HEAD` shows only the second. The commit
   * stages the working tree over it, so both readings belong to the snapshot.
   */
  digest.update(await readIndexDigest(root).catch(() => "")).update("\0");
  // The same ceiling a review reads untracked files under. Above it the
  // snapshot cannot cover them, and an uncovered change offers no commit.
  if (untracked.length > REVIEW_UNTRACKED_FILE_CEILING) return listed;
  let bytes = 0;
  for (const relativePath of untracked) {
    const read = await runGit(root, ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", relativePath]);
    // A file that differs from nothing exits one, which is the ordinary
    // answer here. Anything else is a reading that did not happen.
    if (read.code !== 0 && read.code !== 1) return listed;
    bytes += Buffer.byteLength(read.stdout);
    if (bytes > REVIEW_AGGREGATE_BYTE_CAP) return listed;
    digest.update(read.stdout).update("\0");
  }
  return { paths: listed.paths, digest: digest.digest("hex") };
}

/** The remote this branch tracks, or the only one the repository has. */
async function resolveRemote(root: string): Promise<string | null> {
  const upstream = await gitOrNull(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (upstream?.includes("/")) return upstream.slice(0, upstream.indexOf("/"));
  const remotes = (await gitOrNull(root, ["remote"]))?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  return remotes[0] ?? null;
}

/**
 * The branch a pull request would merge into.
 *
 * Read from the remote head the clone already recorded, so no network call is
 * made to answer a question the repository can answer itself.
 */
export async function readDefaultBranch(root: string, remote: string): Promise<string | null> {
  const head = await gitOrNull(root, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  if (head?.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  for (const candidate of ["main", "master"]) {
    if (await gitOrNull(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${candidate}`])) return candidate;
  }
  return null;
}

/** The request URL a tool printed, validated against the bound repository. */
function readPrintedRequestUrl(
  forge: ReviewForge,
  repository: ReviewForgeRepository,
  output: string,
): { number: number; url: string } | null {
  for (const candidate of output.match(/https?:\/\/\S+/g) ?? []) {
    const request = parseForgeRequestUrl(forge, repository, candidate.replace(/[).,]+$/, ""));
    if (request) return request;
  }
  return null;
}

/**
 * The open request this branch already has.
 *
 * A shape the tool does not report the way this expects reads as none rather
 * than as an error: the answer only decides whether the human is offered a
 * view instead of a create, and being wrong in that direction is recoverable.
 */
export async function readExistingRequest(
  forge: ReviewForge,
  root: string,
  head: string,
  repository: ReviewForgeRepository,
  run: ForgeRunner,
): Promise<{ existing: ReviewPublishExisting | null; blocked: ReviewPublishBlocked | null }> {
  const binding = forgeRepositoryArgs(forge, repository);
  const args = forge === "github"
    ? ["pr", "list", ...binding, "--head", head, "--state", "open", "--limit", "1", "--json", "number,title,url,isDraft"]
    : ["mr", "list", ...binding, "--source-branch", head, "--output", "json"];
  let listed: ForgeRun;
  try {
    listed = await run(FORGE_COMMANDS[forge], args, root);
  } catch (error) {
    if (error instanceof ForgeMissingError) return { existing: null, blocked: "cli-missing" };
    return { existing: null, blocked: "unavailable" };
  }
  if (listed.code !== 0) {
    return { existing: null, blocked: /auth|not logged in|login/i.test(`${listed.stderr}${listed.stdout}`) ? "auth-required" : "unavailable" };
  }
  let parsed: unknown;
  // An empty answer is no answer. Reading it as an empty list would say this
  // branch has no request when nothing has said so.
  if (!listed.stdout.trim()) return { existing: null, blocked: "unavailable" };
  try {
    parsed = JSON.parse(listed.stdout.trim());
  } catch {
    // An answer that cannot be read is not an answer that there is none.
    return { existing: null, blocked: "unavailable" };
  }
  if (!Array.isArray(parsed)) return { existing: null, blocked: "unavailable" };
  // Only an array with nothing in it says there is no open request.
  if (parsed.length === 0) return { existing: null, blocked: null };
  const candidate: unknown = parsed[0];
  // A primitive would answer every property read with undefined, so it would
  // read as an unidentifiable request rather than as the nonsense it is.
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return { existing: null, blocked: "unavailable" };
  }
  const first = candidate as Record<string, unknown>;
  // GitHub and GitLab name the same four things differently.
  const number = Number(first.number ?? first.iid);
  const url = typeof first.url === "string" ? first.url : typeof first.web_url === "string" ? first.web_url : null;
  /*
   * A listed request this cannot identify, or one belonging to another
   * repository, leaves publishing unavailable rather than open. Reading an
   * incomplete answer as "there is none" would invite a second request
   * against a branch that already has one.
   */
  const request = url ? parseForgeRequestUrl(forge, repository, url) : null;
  if (!Number.isInteger(number) || number < 1 || !request || request.number !== number) {
    return { existing: null, blocked: "unavailable" };
  }
  return {
    existing: {
      number,
      title: typeof first.title === "string" ? first.title : "",
      url: request.url,
      isDraft: first.isDraft === true || first.draft === true || first.work_in_progress === true,
    },
    blocked: null,
  };
}

/** What publishing from here would do, and what stops it. */
export async function readPublishState(cwd: string, run: ForgeRunner = runForge): Promise<ReviewPublishState> {
  const root = await repositoryRoot(cwd);
  const branch = await gitOrNull(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = branch && branch !== "HEAD" ? branch : null;
  const remote = await resolveRemote(root);
  const empty: ReviewPublishState = {
    // Nothing about the remote has been read yet, so nothing about it is stated.
    forge: null, remote, repository: null, head, base: null, headPublished: null, unpushed: null,
    uncommitted: null, snapshot: null, existing: null, blocked: null,
  };
  if (!head) return { ...empty, blocked: "no-branch" };
  if (!remote) return { ...empty, blocked: "no-remote" };

  const url = await gitOrNull(root, ["remote", "get-url", remote]);
  const forge = url ? forgeForRemoteUrl(url) : null;
  const repository = url ? parseRemoteRepository(url) : null;
  // Without both, there is no repository to bind a command to, and an
  // unbound command answers for whichever repository the tool picks.
  if (!forge || !repository) return { ...empty, blocked: "unsupported-remote" };

  const trust = getProjectTrustStatus(root, getAgentDir());
  if (trust.requiresTrust && !trust.trusted) return { ...empty, forge, repository, blocked: "untrusted-project" };

  const base = await readDefaultBranch(root, remote);
  const remoteHead = `refs/remotes/${remote}/${head}`;
  const headPublished = Boolean(await gitOrNull(root, ["rev-parse", "--verify", "--quiet", remoteHead]));
  const unpushed = Number(await gitOrNull(root, headPublished
    ? ["rev-list", "--count", `${remote}/${head}..HEAD`]
    : ["rev-list", "--count", "HEAD"]) ?? "0") || 0;
  const { existing, blocked } = await readExistingRequest(forge, root, head, repository, run);
  const local = await readLocalChanges(root);
  return {
    forge, remote, repository, head, base, headPublished, unpushed,
    uncommitted: local.paths.length, snapshot: local.digest, existing,
    blocked: blocked ?? (base ? null : "base-missing"),
  };
}


/**
 * Create the pull request, once the human has asked for it.
 *
 * A branch the remote does not have yet is refused rather than pushed from
 * here: pushing is its own act with its own outcome, and the form offers it
 * as one. Nothing is attempted twice - a command that was cut off may already
 * have created the request on the host.
 */
export async function publishReviewBranch(
  request: ReviewPublishRequest,
  run: ForgeRunner = runForge,
): Promise<ReviewPublishResult> {
  const title = request.title.trim();
  const state = await readPublishState(request.cwd, run);
  if (state.blocked) return { status: "blocked", forge: state.forge, blocked: state.blocked };
  if (!state.forge || !state.head) return { status: "blocked", forge: state.forge, blocked: "no-branch" };
  if (!state.repository) return { status: "blocked", forge: state.forge, blocked: "unsupported-remote" };
  if (state.existing) return { status: "exists", forge: state.forge, existing: state.existing };
  if (!title) return { status: "refused", forge: state.forge, refusal: "title-empty" };
  // Unknown is not refused as absent: a state that measured nothing cannot
  // support either answer, so it is reported as unavailable.
  if (state.headPublished === null) return { status: "blocked", forge: state.forge, blocked: "unavailable" };
  if (!state.headPublished) return { status: "refused", forge: state.forge, refusal: "head-not-published" };

  const root = await repositoryRoot(request.cwd);
  const base = request.base.trim() || state.base || "";
  // The same binding the listing used, so the two cannot end up on different
  // repositories in a checkout with more than one remote.
  const binding = forgeRepositoryArgs(state.forge, state.repository);
  const args = state.forge === "github"
    ? ["pr", "create", ...binding, "--base", base, "--head", state.head, "--title", title, "--body", request.body,
      ...(request.draft ? ["--draft"] : [])]
    : ["mr", "create", ...binding, "--source-branch", state.head, "--target-branch", base, "--title", title,
      "--description", request.body, "--yes", ...(request.draft ? ["--draft"] : [])];

  let created: ForgeRun;
  try {
    created = await run(FORGE_COMMANDS[state.forge], args, root);
  } catch (error) {
    return error instanceof ForgeMissingError
      ? { status: "blocked", forge: state.forge, blocked: "cli-missing" }
      : { status: "failed", forge: state.forge };
  }
  if (created.timedOut) return { status: "uncertain", forge: state.forge };
  if (created.code !== 0) {
    const refusal = classifyPublishFailure(created);
    return refusal ? { status: "refused", forge: state.forge, refusal } : { status: "failed", forge: state.forge };
  }
  /*
   * Exit zero without a URL this repository owns is not a promise that a
   * request exists. The tool may have created something; what it created
   * cannot be attributed here, so this says so rather than reporting a
   * request the human cannot trust or opening a link it did not verify.
   */
  const published = readPrintedRequestUrl(state.forge, state.repository, `${created.stdout}\n${created.stderr}`);
  if (!published) return { status: "uncertain", forge: state.forge };
  return { status: "published", forge: state.forge, number: published.number, url: published.url, draft: request.draft };
}
