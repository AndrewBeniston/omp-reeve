"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyTextOrFail } from "@/lib/clipboard";
import { FILE_SOURCE_EDITABLE_LIMIT } from "@/lib/file-source-limits";
import { FileSourceAutosave, type AutosaveState } from "@/lib/file-source-autosave";
import { fetchFileSource, saveFileSourceContent, type FileSourceLoad } from "@/lib/file-source-client";
import { readReviewSourceDiff, type ReviewSourceDiff } from "@/lib/review-source-diff";
import { alignLines } from "@/lib/line-diff";
import type { FileReviewOrigin } from "@/lib/file-review-origin";
import type { ReviewRequestContext } from "@/lib/review-owner";
import type { ReviewScope } from "@/lib/review-git";
import { isDesktopShell } from "@/lib/desktop-shell";
import { FileSourceBreadcrumb } from "./FileSourceBreadcrumb";
import { OpenWithMenu } from "./OpenWithMenu";
import styles from "./file-source.module.css";

/**
 * One file's source, opened from a review.
 *
 * This is the view behind "open this file": the whole text of the working
 * file, at the line the human was reading, with the lines the review changed
 * marked beside it. It reads through its own route rather than the preview
 * one, so a 400 KiB source file opens instead of being refused.
 *
 * What is shown is always the working file, and it says so. The marks and the
 * patch come from asking the review again rather than from anything carried in
 * when the tab opened, so they follow the comparison as it changes and a
 * review that has moved on is reported rather than drawn from memory.
 *
 * Editing is offered in the desktop shell alone, and only under the editable
 * ceiling. That split is the reference's: its editable file-source view is an
 * Electron-only module. Saving goes through the file allow-list on its own
 * path and never through a review's ownership - reading a review does not
 * authorise writing anything.
 */

/** The Review a source view is following, as its own routes need it named. */
export interface ReviewSourceContext {
  context: ReviewRequestContext;
  scope: ReviewScope;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SAVE_STATUS_LABELS: Record<AutosaveState["status"], string> = {
  clean: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  conflict: "Changed on disk",
  failed: "Not saved",
};

export function FileSourceView({ filePath, root, origin, review }: {
  filePath: string;
  root?: string;
  origin?: FileReviewOrigin | null;
  review?: ReviewSourceContext | null;
}) {
  const [load, setLoad] = useState<FileSourceLoad | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [save, setSave] = useState<AutosaveState | null>(null);
  const [conflict, setConflict] = useState<{ content: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ReviewSourceDiff | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  /*
   * Asking the review again without re-reading the file. A save of your own
   * changes what an unstaged review is comparing, so its changed lines are
   * stale the moment one lands — but re-reading the file here would throw away
   * whatever is being typed.
   */
  const [reviewRefreshes, setReviewRefreshes] = useState(0);
  const savedMtime = useRef(0);
  const autosave = useRef<FileSourceAutosave | null>(null);
  const lines = useRef<HTMLDivElement | null>(null);
  const desktop = isDesktopShell();
  /*
   * The review's changed lines, placed on the text actually being read.
   *
   * Those numbers belong to the comparison's new side, which for a staged,
   * committed or branch review is a version the working copy may have moved
   * on from — ten lines inserted above would put every one of them on the
   * wrong row. So the two are lined up, and a changed line the working copy no
   * longer holds is dropped rather than placed approximately. This is a memo
   * over the text as well as the review, which is also what brings the marks
   * back into place after a save of your own.
   */
  const marks = useMemo((): { lines: ReadonlySet<number>; aligned: boolean } => {
    if (diff?.status !== "ready" || diff.tooDifferent) return { lines: new Set<number>(), aligned: true };
    if (diff.newText === text) return { lines: new Set(diff.changed), aligned: true };
    const alignment = alignLines(diff.newText.split("\n"), text.split("\n"));
    if (!alignment) return { lines: new Set<number>(), aligned: false };
    const lines = new Set<number>();
    for (const line of diff.changed) {
      const at = alignment.get(line - 1);
      if (at !== undefined) lines.add(at + 1);
    }
    return { lines, aligned: true };
  }, [diff, text]);
  /*
   * Named in pieces the panel cannot change by re-rendering. The context and
   * the scope are rebuilt on every render of the Tab strip above, so an effect
   * depending on those objects would refetch the review forever.
   */
  const reviewTabId = review?.context.tabId;
  const owner = review?.context.owner;
  const scopeKey = review ? JSON.stringify(review.scope) : "";
  const scope = useMemo(() => (scopeKey ? JSON.parse(scopeKey) as ReviewScope : null), [scopeKey]);
  const relativePath = origin?.relativePath;

  useEffect(() => {
    const controller = new AbortController();
    setLoad(null);
    setEditing(false);
    setConflict(null);
    void fetchFileSource(filePath, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setLoad(next);
      if (next.status === "ready") setText(next.content);
    // Only an abort reaches here; every failure the read itself can have comes
    // back as a status above.
    }).catch(() => {});
    return () => controller.abort();
  }, [filePath, refreshes]);

  /*
   * The review's own reading of this file, asked for again whenever the panel
   * says the file has moved. Nothing here is carried from the open: a revision
   * recorded then is only a signal that the comparison changed.
   */
  useEffect(() => {
    if (!reviewTabId || !owner || !scope || !relativePath) {
      setDiff(null);
      return;
    }
    const controller = new AbortController();
    setDiff(null);
    void readReviewSourceDiff({ tabId: reviewTabId, owner }, scope, relativePath, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setDiff(next); })
      // As above: an abort, and nothing else.
      .catch(() => {});
    return () => controller.abort();
  }, [reviewTabId, owner, scope, relativePath, origin?.revision, refreshes, reviewRefreshes]);

  // Move to the line, on the first open and on every later one: the property
  // changes, the tab does not.
  useEffect(() => {
    if (!origin?.line || load?.status !== "ready" || editing) return;
    lines.current?.querySelector(`[data-line="${origin.line}"]`)?.scrollIntoView({ block: "center" });
  }, [origin?.line, load, editing]);

  useEffect(() => {
    if (!load || load.status !== "ready" || !editing) {
      autosave.current?.dispose();
      autosave.current = null;
      return;
    }
    const machine = new FileSourceAutosave({
      content: load.content,
      mtimeMs: load.mtimeMs,
      readOnly: load.readOnly,
      write: (content, expectedMtimeMs) => saveFileSourceContent(filePath, content, expectedMtimeMs),
      onState: (state) => {
        setSave(state);
        // A merge that succeeded produces text neither writer typed. Showing
        // it is the only honest thing to do: it is what is about to be saved.
        if (state.status === "dirty") setText(machine.text());
        /*
         * The file's modification time moving is the one honest signal that
         * something landed on disk — a save of ours, or an external change
         * this editor adopted. Either way the review is now describing an
         * older file, so it is asked again.
         */
        if (state.mtimeMs !== savedMtime.current) {
          savedMtime.current = state.mtimeMs;
          setReviewRefreshes((count) => count + 1);
        }
      },
      onExternalConflict: (disk) => setConflict({ content: disk }),
    });
    autosave.current = machine;
    savedMtime.current = load.mtimeMs;
    setSave({ status: "clean", saved: load.content, mtimeMs: load.mtimeMs, message: null });
    return () => { machine.dispose(); };
  }, [load, editing, filePath]);

  /*
   * A control that says "Copied" has to mean it. A browser can refuse the
   * clipboard — a page without focus, a permission denied — and reporting that
   * as success leaves somebody pasting whatever they copied an hour ago.
   */
  const copy = useCallback(async (label: string, value: string) => {
    try {
      await copyTextOrFail(value);
      setCopyError(null);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
      setCopyError("Reeve could not put this on the clipboard.");
    }
  }, []);

  /*
   * Either way the disk's version becomes what the editor measures against.
   * Keeping your own text means writing it over theirs deliberately, which is
   * an ordinary save from there.
   */
  const resolveConflict = (keepMine: boolean) => {
    const machine = autosave.current;
    if (!machine || !conflict || !save) return;
    machine.resolve(conflict.content, save.mtimeMs);
    if (keepMine) {
      machine.edit(text);
      void machine.save();
    } else {
      setText(conflict.content);
    }
    setConflict(null);
  };

  const refresh = () => setRefreshes((count) => count + 1);

  if (!load) return <p className={styles.status} role="status">Loading file…</p>;
  if (load.status === "error") return <p className={styles.status} role="alert">{load.message}</p>;
  // The route answers an unreadable file with a message, so this is the case
  // where the file went away between the listing and the reading.
  if (load.status === "unavailable") return <p className={styles.status} role="alert">This file could not be read.</p>;
  if (load.status === "too-large") {
    return <div className={styles.status} role="status">
      <p>This file is {formatBytes(load.sizeBytes)}, past the {formatBytes(load.limitBytes)} Reeve will read.</p>
      <OpenWithMenu filePath={filePath} line={origin?.line} />
    </div>;
  }
  if (load.status === "binary") {
    return <div className={styles.status} role="status">
      <p>This file is not text ({formatBytes(load.sizeBytes)}).</p>
      <OpenWithMenu filePath={filePath} line={origin?.line} />
    </div>;
  }

  const rows = text.split("\n");
  const patch = diff?.status === "ready" ? diff.patch : null;
  return <div className={styles.shell}>
    <div className={styles.toolbar}>
      <FileSourceBreadcrumb filePath={filePath} root={root} />
      <span className={styles.meta}>{rows.length.toLocaleString("en-GB")} lines · {formatBytes(load.sizeBytes)}</span>
      <div className={styles.actions}>
        <Button size="sm" tone="ghost" onClick={() => void copy("path", filePath)}>
          {copied === "path" ? "Copied" : "Copy path"}
        </Button>
        {patch !== null && <Button size="sm" tone="ghost" onClick={() => void copy("diff", patch)}>
          {copied === "diff" ? "Copied" : "Copy diff"}
        </Button>}
        <OpenWithMenu filePath={filePath} line={origin?.line} />
        {desktop && !load.readOnly && <Button size="sm" tone={editing ? "primary" : "ghost"}
          onClick={() => {
            if (editing) void autosave.current?.save();
            setEditing((current) => !current);
          }}>{editing ? "Done" : "Edit"}</Button>}
        {editing && save && <span className={styles.saveStatus} data-status={save.status} role="status">
          {SAVE_STATUS_LABELS[save.status]}
        </span>}
      </div>
    </div>
    {/*
      * Said plainly, because it is the one thing a reader could get wrong:
      * this is the file as it is on disk now, not either side of the
      * comparison the review is making.
      */}
    <p className={styles.notice} role="status">
      Working copy{origin ? " · the marked lines are this review's changes" : ""}
    </p>
    {origin && !review && <p className={styles.notice} role="status">
      The Review this file was opened from is no longer open, so its changes cannot be marked here.
    </p>}
    {diff?.status === "unavailable" && <p className={styles.notice} role="status">
      {diff.message} <button type="button" className={styles.inlineAction} onClick={refresh}>Refresh</button>
    </p>}
    {diff?.status === "ready" && diff.tooDifferent && <p className={styles.notice} role="status">
      This file changed too much to mark line by line.
    </p>}
    {!marks.aligned && <p className={styles.notice} role="status">
      This file has moved on too far from the version the review read to mark its changed lines here.
    </p>}
    {load.readOnly && <p className={styles.notice} role="status">
      This file is over {formatBytes(FILE_SOURCE_EDITABLE_LIMIT)} and opens read-only.
    </p>}
    {!desktop && !load.readOnly && origin && <p className={styles.notice} role="status">
      Editing a file here is available in the desktop application.
    </p>}
    {conflict && <div className={styles.conflict} role="alert">
      <p>This file changed on disk while you were editing it, and the two changes overlap.</p>
      <div className={styles.conflictActions}>
        <Button size="sm" onClick={() => resolveConflict(false)}>Use the version on disk</Button>
        <Button size="sm" tone="primary" onClick={() => resolveConflict(true)}>Keep my version</Button>
      </div>
    </div>}
    {save?.message && save.status === "failed" && <p className={styles.notice} role="alert">{save.message}</p>}
    {copyError && <p className={styles.notice} role="alert">{copyError}</p>}
    {editing
      ? <textarea className={styles.editor} value={text} spellCheck={false} aria-label={`Edit ${filePath}`}
          onChange={(event) => { setText(event.target.value); autosave.current?.edit(event.target.value); }} />
      : <div className={styles.lines} ref={lines}>
          {rows.map((line, index) => {
            const number = index + 1;
            return <div key={number} data-line={number} className={styles.line}
              data-changed={marks.lines.has(number) ? "true" : undefined}
              data-target={origin?.line === number ? "true" : undefined}>
              <span className={styles.lineNumber} aria-hidden="true">{number}</span>
              <code className={styles.lineText}>{line === "" ? "\u00a0" : line}</code>
            </div>;
          })}
        </div>}
  </div>;
}
