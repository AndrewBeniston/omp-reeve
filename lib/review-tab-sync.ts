import { reviewOwnerSearchParams, type ReviewOwner } from "./review-owner";
import type { ReviewSelection } from "./review-selection";
import type { StoredReviewTab } from "./review-tab-store";

/**
 * Keeping the Review Tabs on screen and the Tabs Reeve remembers in step.
 *
 * Held apart from the shell because the difficult part is not the requests but
 * what happens around them: a Project switched while a restore is in flight, a
 * save that failed, a Tab closed while its selection was being written. Each
 * of those is a state transition with a wrong answer available, and none of
 * them is reachable from a test that can only see a rendered panel.
 *
 * Nothing here throws. Every call reports what happened, and a caller that
 * ignores a failure is choosing to.
 */
export type ReviewSyncResult<T> =
  | { status: "ok"; value: T }
  /** The Project moved on while this was in flight; its answer is not current. */
  | { status: "superseded" }
  | { status: "failed"; message: string; reason?: string };

export interface ReviewTabToSave {
  tabId: string;
  owner: ReviewOwner;
  selection?: ReviewSelection;
  /** In front, in an open panel. What the Tab comes back as after a restart. */
  active: boolean;
}

const FAILURES = {
  open: "This Review Tab could not be opened.",
  restore: "The Review Tabs for this Project could not be read.",
  persist: "What Review is showing could not be saved.",
  close: "This Review Tab was closed, but Reeve may still remember it.",
};

/** The server's own words and reason when it has them, and ours when it does not. */
async function failure(response: Response | null, fallback: string): Promise<{ message: string; reason?: string }> {
  if (!response) return { message: fallback };
  const value = await response.json().catch(() => null) as { error?: unknown; reason?: unknown } | null;
  return {
    message: typeof value?.error === "string" && value.error ? value.error : fallback,
    ...(typeof value?.reason === "string" ? { reason: value.reason } : {}),
  };
}

/** Just enough of `fetch` to make these requests, so a test can supply one. */
export type ReviewSyncRequest = (input: string, init?: RequestInit) => Promise<Response>;

export class ReviewTabSync {
  private generation = 0;
  private readonly request: ReviewSyncRequest;

  constructor(request: ReviewSyncRequest = (input, init) => fetch(input, init)) {
    this.request = request;
  }

  /**
   * Start a new generation of work, which every answer still in flight is
   * measured against. Called when the Project changes.
   */
  changeProject(): void {
    this.generation += 1;
  }

  private settle<T>(generation: number, result: ReviewSyncResult<T>): ReviewSyncResult<T> {
    return generation === this.generation ? result : { status: "superseded" };
  }

  /** A Project's remembered Tabs, or why they could not be read. */
  async restore(projectRoot: string, signal?: AbortSignal): Promise<ReviewSyncResult<StoredReviewTab[]>> {
    const generation = this.generation;
    try {
      const response = await this.request(`/api/review-tabs?projectRoot=${encodeURIComponent(projectRoot)}`, { signal });
      if (!response.ok) return this.settle(generation, { status: "failed", ...await failure(response, FAILURES.restore) });
      const value = await response.json() as { tabs?: StoredReviewTab[] };
      return this.settle(generation, { status: "ok", value: value.tabs ?? [] });
    } catch {
      // An abort is this generation ending, which the caller already knows.
      if (signal?.aborted) return { status: "superseded" };
      return this.settle(generation, { status: "failed", message: FAILURES.restore });
    }
  }

  /**
   * Register a Tab for a Worktree and Session, and get back the binding the
   * server resolved. Opening one that is already open leaves what it was
   * reviewing alone.
   */
  async open(cwd: string, sessionId: string | null): Promise<ReviewSyncResult<StoredReviewTab>> {
    const generation = this.generation;
    try {
      const response = await this.request("/api/review-tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, sessionId }),
      });
      if (!response.ok) return this.settle(generation, { status: "failed", ...await failure(response, FAILURES.open) });
      const value = await response.json() as { tab?: StoredReviewTab };
      if (!value.tab) return this.settle(generation, { status: "failed", message: FAILURES.open });
      return this.settle(generation, { status: "ok", value: value.tab });
    } catch {
      return this.settle(generation, { status: "failed", message: FAILURES.open });
    }
  }

  /**
   * Remember what each Tab is reviewing. Reported as failed unless every one
   * was saved, so a caller can try again rather than record a save that did
   * not happen.
   */
  async persist(tabs: readonly ReviewTabToSave[]): Promise<ReviewSyncResult<null>> {
    const generation = this.generation;
    for (const tab of tabs) {
      try {
        const response = await this.request("/api/review-tabs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...Object.fromEntries(reviewOwnerSearchParams({ tabId: tab.tabId, owner: tab.owner })),
            selection: tab.selection ?? null,
            active: tab.active,
          }),
        });
        if (!response.ok) {
          /*
           * A Tab closed while this was in flight is not a failure to report:
           * the server refuses to bring it back, which is what was wanted.
           * Every other refusal is a save that did not happen, including the
           * ones that share its status — a denied directory, a Project or
           * Session that no longer matches — so only this reason is passed
           * over.
           */
          const value = await response.json().catch(() => null) as { error?: unknown; reason?: unknown } | null;
          if (response.status === 403 && value?.reason === "unregistered-tab") continue;
          const message = typeof value?.error === "string" && value.error ? value.error : FAILURES.persist;
          return this.settle(generation, {
            status: "failed",
            message,
            ...(typeof value?.reason === "string" ? { reason: value.reason } : {}),
          });
        }
      } catch {
        return this.settle(generation, { status: "failed", message: FAILURES.persist });
      }
    }
    return this.settle(generation, { status: "ok", value: null });
  }

  /** Forget a Tab. Works after its Worktree or Session has gone. */
  async close(tab: { tabId: string; owner: ReviewOwner }): Promise<ReviewSyncResult<null>> {
    const generation = this.generation;
    try {
      const params = reviewOwnerSearchParams({ tabId: tab.tabId, owner: tab.owner });
      const response = await this.request(`/api/review-tabs?${params}`, { method: "DELETE" });
      if (!response.ok) return this.settle(generation, { status: "failed", ...await failure(response, FAILURES.close) });
      return this.settle(generation, { status: "ok", value: null });
    } catch {
      return this.settle(generation, { status: "failed", message: FAILURES.close });
    }
  }
}
