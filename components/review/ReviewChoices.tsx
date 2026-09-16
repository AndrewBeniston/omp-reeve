"use client";

import { useEffect, useState } from "react";
import { MenuItem } from "@/components/ui/Menu";
import type { ReviewBranch, ReviewCommit } from "@/lib/review-git";
import { reviewOwnerSearchParams, type ReviewRequestContext } from "@/lib/review-owner";
import styles from "./review.module.css";

interface Choice { value: string; label: string; detail?: string; tooltip?: string }

export function ReviewChoices({ context, kind, base, selected, onSelect }: {
  context: ReviewRequestContext;
  kind: "branch" | "commit";
  base?: string;
  selected: string;
  onSelect: (value: string, label: string) => void;
}) {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    const params = reviewOwnerSearchParams(context, { kind });
    if (base) params.set("base", base);
    void fetch(`/api/git/review/choices?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Review choices could not be loaded.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const next: Choice[] = kind === "branch"
          ? (data.branches as ReviewBranch[]).filter((branch) => !branch.current).map((branch) => ({ value: branch.ref, label: branch.name }))
          : (data.commits as ReviewCommit[]).map((commit) => ({ value: commit.sha, label: commit.subject, detail: commit.sha.slice(0, 7), tooltip: commit.message }));
        setChoices(next);
        setStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [context, kind, base, retry]);

  const visible = choices.filter((choice) => choice.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    {kind === "branch" && <input className={styles.search} aria-label="Search branches" placeholder="Search branches" value={query}
      onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) event.stopPropagation();
      }} />}
    <div className={styles.choices}>
      {visible.map((choice) => <MenuItem key={choice.value} role="menuitemradio" checked={choice.value === selected}
        title={choice.tooltip ?? choice.label} onClick={() => onSelect(choice.value, choice.label)}>
        <span className={styles.choiceLabel}>{choice.label}</span>
        {choice.detail && <span className={styles.choiceDetail}>{choice.detail}</span>}
      </MenuItem>)}
      {status === "loading" && <p className={styles.message} role="status">Loading {kind === "branch" ? "branches" : "commits"}…</p>}
      {status === "error" && <><p className={styles.message} role="alert">Unable to load {kind === "branch" ? "branches" : "commits"}</p>
        <MenuItem onClick={() => setRetry((value) => value + 1)}>Retry</MenuItem></>}
      {status === "ready" && !visible.length && <p className={styles.message}>{kind === "branch" ? "No matching branches" : "No commits on branch"}</p>}
    </div>
  </>;
}
