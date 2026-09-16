import { canonicalReviewCwd } from "./review-comments";
import type { ReviewPrIdentity, ReviewPrPublication } from "./review-pr-ui";

const PREFIX = "omp-review-pr-drafts:v2:";
/** Keyed by head, so every draft written before a push became unreachable. */
const LEGACY_PREFIX = "omp-review-pr-drafts:v1:";

/**
 * The revision a draft was written against.
 *
 * Carried on the draft rather than in the key it is stored under. A revision
 * in the key means a moved head hides the drafts rather than dating them, and
 * work a person cannot see is work they have lost. An empty string is a
 * revision that was never recorded, which is not the same as one that matches.
 */
export interface ReviewPrPin {
  headSha: string;
  baseSha: string;
}

export interface ReviewPrDraft {
  id: string;
  publication: ReviewPrPublication;
  updatedAt: string;
  /** The base and commit this draft was written against. */
  pinned?: ReviewPrPin;
  uncertain?: boolean;
  saved?: boolean;
}

/**
 * Who a draft belongs to: a Project directory, a Session, an account, and one
 * pull request on one remote. Deliberately not a revision.
 *
 * Ownership answers "may this person see this draft here", and that answer
 * does not change when somebody pushes. Which revision the draft describes is
 * a separate question, answered by the pin the draft carries, and the two are
 * kept apart so that dating a draft never amounts to discarding it.
 */
export function reviewPrDraftOwner(cwd: string, sessionId: string | null, identity: ReviewPrIdentity): string {
  return JSON.stringify([canonicalReviewCwd(cwd), sessionId, identity.remoteId,
    identity.hostname.toLowerCase(), identity.owner.toLowerCase(), identity.repository.toLowerCase(),
    identity.account, identity.number]);
}

/** The pair a draft written while reading this snapshot is pinned to. */
export function reviewPrDraftPin(identity: ReviewPrIdentity): ReviewPrPin {
  return { headSha: identity.headSha, baseSha: identity.baseSha };
}

function isPin(value: unknown): value is ReviewPrPin {
  if (!value || typeof value !== "object") return false;
  const pin = value as Record<string, unknown>;
  return typeof pin.headSha === "string" && typeof pin.baseSha === "string";
}

export function readPrDrafts(storage: Pick<Storage, "getItem">, owner: string): ReviewPrDraft[] {
  return readDraftsAt(storage, PREFIX + owner);
}

function readDraftsAt(storage: Pick<Storage, "getItem">, key: string): ReviewPrDraft[] {
  const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
  if (!Array.isArray(value)) throw new Error("The saved PR drafts could not be read.");
  return value.filter((item): item is ReviewPrDraft => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.updatedAt !== "string") return false;
    if (item.pinned !== undefined && !isPin(item.pinned)) return false;
    const p = item.publication;
    if (!p || typeof p !== "object") return false;
    if (p.action === "delete") return typeof p.commentId === "string";
    if (p.action === "resolve" || p.action === "unresolve") return typeof p.threadId === "string";
    if (typeof p.body !== "string") return false;
    if (p.action === "reply") return typeof p.threadId === "string";
    if (p.action === "edit") return typeof p.commentId === "string";
    if (p.action === "review") return ["comment", "approve", "request_changes"].includes(p.event);
    return p.action === "inline" && typeof p.path === "string"
      && ["additions", "deletions"].includes(p.side)
      && Number.isSafeInteger(p.startLine) && p.startLine > 0
      && Number.isSafeInteger(p.endLine) && p.endLine >= p.startLine;
  });
}

/** Read at mutation time so an old rendered array cannot overwrite newer drafts. */
export function mutatePrDrafts(storage: Pick<Storage, "getItem" | "setItem">, owner: string,
  update: (current: ReviewPrDraft[]) => ReviewPrDraft[]): ReviewPrDraft[] {
  const next = update(readPrDrafts(storage, owner));
  storage.setItem(PREFIX + owner, JSON.stringify(next));
  return next;
}

/** A confirmed write clears only the version actually sent, never a later edit. */
export function acknowledgePrDraft(current: ReviewPrDraft[], submitted: ReviewPrDraft): ReviewPrDraft[] {
  return current.filter((draft) => draft.id !== submitted.id
    || draft.updatedAt !== submitted.updatedAt
    || JSON.stringify(draft.publication) !== JSON.stringify(submitted.publication));
}

type MigratableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * A v1 key read back: the owner it belongs to, and the revision it was
 * written under. The old key is the only surviving record of that revision.
 */
function parseLegacyKey(key: string): { owner: string; headSha: string } | null {
  let parts: unknown;
  try {
    parts = JSON.parse(key.slice(LEGACY_PREFIX.length));
  } catch {
    return null;
  }
  if (!Array.isArray(parts) || parts.length < 2) return null;
  const headSha = parts[parts.length - 1];
  return { owner: JSON.stringify(parts.slice(0, -1)), headSha: typeof headSha === "string" ? headSha : "" };
}

/**
 * Bring drafts written under the revision-keyed store forward, once.
 *
 * Every v1 key for this owner is a revision somebody reviewed at, so each one
 * is a separate pile of work that the current key cannot reach. They are
 * folded into the one durable key and stamped with the revision their key
 * named, which is the only record of what they were written against — a v1
 * draft never carried a base, so its base is recorded as unknown rather than
 * guessed at from whatever the pull request compares against today.
 *
 * A draft already present under the durable key wins: it is the later object,
 * and a migration is not a reason to reinstate something the person edited
 * afterwards. Nothing is removed until the merged write has succeeded, so a
 * storage failure halfway leaves the old piles exactly where they were.
 */
export function migratePrDrafts(storage: MigratableStorage, owner: string): ReviewPrDraft[] {
  const legacy = new Map<string, string>();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
    const parsed = parseLegacyKey(key);
    if (parsed?.owner === owner) legacy.set(key, parsed.headSha);
  }
  // Reading the current drafts first means an unreadable durable key throws
  // here, before anything old has been touched.
  const current = readPrDrafts(storage, owner);
  if (legacy.size === 0) return current;

  const merged = [...current];
  const seen = new Set(merged.map((draft) => draft.id));
  const migrated: string[] = [];
  for (const key of [...legacy.keys()].sort()) {
    let drafts: ReviewPrDraft[];
    try {
      drafts = readDraftsAt(storage, key);
    } catch {
      // Unreadable, so it is left alone rather than deleted. Nothing can be
      // recovered from it here, and removing it would end any later chance.
      continue;
    }
    const headSha = legacy.get(key) ?? "";
    for (const draft of drafts) {
      if (seen.has(draft.id)) continue;
      seen.add(draft.id);
      merged.push({ ...draft, pinned: draft.pinned ?? { headSha, baseSha: "" } });
    }
    migrated.push(key);
  }

  storage.setItem(PREFIX + owner, JSON.stringify(merged));
  for (const key of migrated) storage.removeItem(key);
  return merged;
}
