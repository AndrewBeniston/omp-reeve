"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { reviewPrListMessage, type ReviewPrAccess, type ReviewPrClient, type ReviewPrPage, type ReviewPrRepository, type ReviewPrSummary } from "@/lib/review-pr-ui";
import type { ReviewRequestContext } from "@/lib/review-owner";
import styles from "./review-pr.module.css";

/**
 * Choosing a pull request to read.
 *
 * Three answers are kept apart throughout: still checking, cannot be read and
 * why, and read but empty. The middle one carries the host's stated reason and
 * a way to try again: an expired sign-in shown as an empty list sends a
 * reviewer looking for pull requests that were there all along.
 */
export function ReviewPullRequests({ context, client, onSelect }: {
  context: ReviewRequestContext;
  client: ReviewPrClient;
  onSelect: (repository: ReviewPrRepository, pull: ReviewPrSummary) => void;
}) {
  const [access, setAccess] = useState<ReviewPrAccess | null>(null);
  const [remote, setRemote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"all" | "open" | "closed" | "merged">("open");
  const [view, setView] = useState<"all" | "reviewing" | "authored">("all");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<ReviewPrPage<ReviewPrSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const repositories = access?.repositories ?? [];
  const repository = access?.status === "ready" ? access.selected : null;

  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    void client.access(context, remote, controller.signal).then((value) => {
      if (!controller.signal.aborted) setAccess(value);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setAccess({ status: "unavailable", repositories: [], selected: null, reason: "remote-unavailable",
        message: failure instanceof Error ? failure.message : "This Project's pull requests could not be read." });
    });
    return () => controller.abort();
  }, [client, context, remote, refresh]);

  useEffect(() => {
    if (!repository) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!cursor) setPage(null);
    const timer = setTimeout(() => {
      void client.pulls(context, repository, { search, state, view, cursor }, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setPage((previous) => ({ ...next, items: cursor && previous
          ? [...previous.items, ...next.items.filter((item) => !previous.items.some((old) => old.number === item.number))]
          : next.items }));
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Pull requests could not be loaded.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, context, repository, search, state, view, cursor, refresh]);

  const reset = () => { setCursor(null); setPage(null); };
  const retry = () => { reset(); setRefresh((value) => value + 1); };
  const say = reviewPrListMessage({ access, error, loading, items: page?.items ?? null, search });
  const checking = say.kind === "checking";

  return <div className={styles.picker}>
    <div className={styles.controls}>
      <label>Repository<select value={repository?.remoteId ?? repositories[0]?.remoteId ?? ""} disabled={checking || repositories.length === 0}
        onChange={(event) => { setRemote(event.target.value); reset(); }}>
        {repositories.map((item) => <option key={item.remoteId} value={item.remoteId}>{item.owner}/{item.repository} · {item.hostname}</option>)}
      </select></label>
      <Button size="sm" tone="ghost" disabled={loading || checking} onClick={retry}>Refresh</Button>
    </div>

    {(say.kind === "unavailable" || say.kind === "failed") && <div className={styles.card} role="alert">
      <p className={styles.body}>{say.message}</p>
      <div className={styles.actions}><Button size="sm" onClick={retry}>Try again</Button></div>
    </div>}
    {say.kind === "checking" && <p role="status">{say.message}</p>}

    {access?.status === "ready" && <>
      <p className={styles.muted}>GitHub account: {access.account}</p>
      {!access.permissionsKnown && <p className={styles.muted} role="status">
        GitHub did not say what this account may do in this repository. Pull requests are shown read-only.
      </p>}
      <div className={styles.controls}>
        <label>View<select value={view} onChange={(event) => { setView(event.target.value as typeof view); reset(); }}>
          <option value="all">All</option><option value="reviewing">Reviewing</option><option value="authored">Authored</option>
        </select></label>
        <label>Status<select value={state} onChange={(event) => { setState(event.target.value as typeof state); reset(); }}>
          <option value="all">All</option><option value="open">Open</option><option value="merged">Merged</option><option value="closed">Closed</option>
        </select></label>
      </div>
      <input className={styles.search} type="search" aria-label="Search pull requests" placeholder="Search pull requests" maxLength={256}
        value={search} onChange={(event) => { setSearch(event.target.value); reset(); }} />
      <div className={styles.pullList} aria-label="Pull requests">
        {page?.items.map((pull) => <button type="button" key={pull.number} className={styles.pullRow}
          onClick={() => onSelect(access.selected, pull)}>
          <strong>{pull.title}</strong>
          <span className={styles.muted}>#{pull.number} · {pull.author} · {pull.isDraft ? "Draft" : pull.state}</span>
          <span className={styles.muted}>{pull.headBranch} → {pull.baseBranch}</span>
        </button>)}
      </div>
      {say.kind === "loading" && <p role="status">{say.message}</p>}
      {say.kind === "empty" && <p>{say.message}</p>}
      {page && !page.complete && <p role="status">
        Some pull requests are missing from this list: GitHub returned more than this view reads, or left the revisions of an
        entry out. Narrow the search to find a specific request.
      </p>}
    </>}
  </div>;
}
