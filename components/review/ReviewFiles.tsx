"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFileIcon } from "@/components/FileIcons";
import { Button } from "@/components/ui/Button";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useReviewFileFacts } from "@/hooks/useReviewFileFacts";
import { Virtualizer } from "@pierre/diffs/react";
import { reviewFilesFromPatch, reviewReferencePath, type ReviewFile } from "@/lib/review-files";
import { buildReviewTree, flattenReviewTree, reviewTreeKeyAction, type ReviewTreeNode } from "@/lib/review-file-tree";
import { isReviewFileViewed } from "@/lib/review-viewed";
import { getFileName, joinFilePath } from "@/lib/file-paths";
import { resolveReviewMenuTargets, showReviewMenu } from "@/lib/desktop-review-menu";
import type { FileReviewOrigin } from "@/lib/file-review-origin";
import { openInExternalEditor } from "@/lib/file-source-client";
import { requestExternalEditors } from "@/lib/external-editor-listing-cache";
import { copyTextOrFail } from "@/lib/clipboard";
import { REVIEW_OPERATION_LABELS, type ReviewOperation, type ReviewOperationRequest } from "@/lib/review-operations";
import { placedCommentsForFile, reviewFileClaimsComments } from "@/lib/review-comments";
import type { PlacedReviewComment } from "@/lib/review-comment-anchor";
import { reviewPrThreadPlacement, type ReviewPrThread } from "@/lib/review-pr-ui";
import { placedFindingsForFile, type ReviewFindingsHandling } from "@/lib/review-findings";
import type { ReviewFileView } from "@/lib/review-selection";
import type { ReviewRequestContext } from "@/lib/review-owner";
import { requiresSingleFileReview } from "@/lib/review-limits";
import { partitionGeneratedReviewFiles } from "@/lib/review-generated";
import { reviewNoisePreferences, type ReviewNoisePreferences } from "@/lib/review-noise-preferences";
import { reviewPreviewKind } from "@/lib/review-preview";
import { REVIEW_VIRTUALIZER_CONFIG } from "@/lib/review-virtualiser";
import { ReviewFileDiff } from "./ReviewFileDiff";
import { ReviewOrphanComments } from "./ReviewOrphanComments";
import { ReviewOrphanFindings } from "./ReviewOrphanFindings";
import { ReviewScrollAnchorKeeper } from "./ReviewScrollAnchorKeeper";
import { ReviewFileChangeNote } from "./ReviewFileChangeNote";
import { ReviewConflictNotice } from "./ReviewConflictNotice";
import { ReviewFilePreview, ReviewUnpreviewableNotice } from "./ReviewFilePreview";
import { ReviewGeneratedFilterItem, ReviewGeneratedNotice } from "./ReviewNoisePreferences";
import { ReviewEmptyState } from "./ReviewEmptyState";
import type { ReviewDisplayPreferences } from "@/lib/review-display-preferences";
import styles from "./review.module.css";
import noiseStyles from "./review-noise.module.css";

export function ReviewFiles({ onCommentEditingChange, commentSaveLabel, displayPreferences, noisePreferences, onNoisePreferencesChange, context, ownerKey = "", scope, patch, repositoryRoot, reviewCwd, onOpenFile, onAtMention, untrackedFiles, wrapLines, diffMode, onToggleWrap, fileRevisions, viewedRevisions, onViewedChange, conflictedFiles, fileView, onFileViewChange, fileOperations, hunkOperations, operationBusy, onOperate, comments, threads, findings, canAddToChat, onSaveComment, onRemoveComment, onAddCommentToChat, reserveBottomPadding }: {
  /** The Tab and owner these files belong to, carried on every read. */
  context: ReviewRequestContext;
  /**
   * The Session and directory, as one string, built once by the panel.
   *
   * The panel already passes it as this list's React key. It arrives a second
   * time as a value because a key cannot be read from inside a component, and
   * the scroll anchor has to carry the owner it was taken under.
   *
   * Absent in the pull-request reading, which holds its own file view in local
   * state rather than in the Tab's selection. Nothing there would survive a
   * remount to return to, so that reading keeps no anchor.
   */
  ownerKey?: string;
  scope: import("@/lib/review-git").ReviewScope;
  onCommentEditingChange?: (id: string, editing: boolean) => void;
  commentSaveLabel?: string;
  displayPreferences?: ReviewDisplayPreferences;
  /** Rich preview, and whether generated files are held back. */
  noisePreferences?: ReviewNoisePreferences;
  onNoisePreferencesChange?: (preferences: ReviewNoisePreferences) => void;
  patch: string;
  repositoryRoot: string;
  /** The directory Review was opened for, which every name given to the Session is relative to. */
  reviewCwd: string;
  onOpenFile: (filePath: string, fileName: string, origin?: FileReviewOrigin) => void;
  onAtMention?: (relativePath: string) => void;
  untrackedFiles?: string[];
  wrapLines: boolean;
  diffMode: "unified" | "split";
  onToggleWrap: () => void;
  fileRevisions: Record<string, string>;
  viewedRevisions?: Record<string, string>;
  onViewedChange?: (path: string, revision: string | null) => void;
  conflictedFiles?: string[];
  fileView: ReviewFileView;
  onFileViewChange: (value: ReviewFileView) => void;
  /** What this scope can do to a whole file, and to one hunk of it. */
  fileOperations: ReviewOperation[];
  hunkOperations: ReviewOperation[];
  operationBusy: boolean;
  onOperate: (request: ReviewOperationRequest) => void;
  /** Every comment the owning Session holds for this review, already placed. */
  comments: readonly PlacedReviewComment[];
  /** Threads already published on the pull request being read, if this is one. */
  threads?: ReviewPrThread[];
  /**
   * The findings of the owning Session's latest review, already placed.
   *
   * Absent in the pull-request reading, which draws the host's own threads and
   * has no Session review of its own to show.
   */
  findings?: ReviewFindingsHandling;
  canAddToChat: boolean;
  onSaveComment: (path: string, draft: { id?: string; side: "additions" | "deletions"; startLine: number; endLine: number; body: string }) => void;
  onRemoveComment: (id: string) => void;
  onAddCommentToChat: (entry: PlacedReviewComment) => void;
  /** The section actions float over the list, so it keeps its foot clear. */
  reserveBottomPadding?: boolean;
}) {
  const files = useMemo(() => reviewFilesFromPatch(patch, conflictedFiles), [patch, conflictedFiles]);
  const { filter, showFiles, selectedPath } = fileView;
  const [menuError, setMenuError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  /*
   * A refused copy used to resolve, so the menu closed, nothing was said, and
   * the next paste produced whatever was there before. A native menu has
   * nowhere of its own to report, so the panel says it instead.
   */
  const copyFromMenu = useCallback(async (value: string) => {
    try {
      await copyTextOrFail(value);
    } catch {
      if (mounted.current) setMenuError("The clipboard refused this copy.");
    }
  }, []);
  /*
   * Opening a reviewed file in a Tab, named by where it came from: this Tab,
   * the path the patch uses, the revision on screen, and the line being read.
   * Two Review Tabs opening one file are two owners, so the Review Tab's id is
   * part of the file Tab's identity rather than the path standing alone.
   */
  const openFileTab = useCallback((file: ReviewFile, line?: number) => {
    const absolutePath = joinFilePath(repositoryRoot, file.path);
    onOpenFile(absolutePath, getFileName(file.path), {
      tabId: context.tabId,
      relativePath: file.path,
      revision: fileRevisions[file.path],
      line,
    });
  }, [context.tabId, fileRevisions, onOpenFile, repositoryRoot]);
  const sections = useRef(new Map<string, HTMLElement>());
  const layout = useRef<HTMLDivElement>(null);
  const fileTreeWidth = useRef(250);
  const getMaxWidth = useCallback(() => (layout.current?.clientWidth ?? 800) * 0.6, []);
  const resizer = useResizablePanel({
    ariaLabel: "Resize changed files",
    defaultWidth: 250,
    getMaxWidth,
    growthDirection: "left",
    maxWidth: Number.POSITIVE_INFINITY,
    minWidth: 200,
    // The reference closes this list when a drag takes it under its floor,
    // rather than holding it at a width too narrow to read.
    onBelowMinimum: () => onFileViewChange({ ...fileView, showFiles: false }),
    storageKey: "omp-review-file-tree-width",
    widthRef: fileTreeWidth,
  });
  const reclampWidth = resizer.reclampWidth;
  useEffect(() => {
    const element = layout.current;
    if (!element) return;
    const observer = new ResizeObserver(reclampWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [reclampWidth]);
  const noise = reviewNoisePreferences(noisePreferences);
  const facts = useReviewFileFacts(context, files.map((file) => file.path));
  /*
   * The typed filter first, then the generated one, so the count reported is
   * of files this list would otherwise be showing. Memoised because the tree
   * below is memoised on the result.
   */
  const { visible: visibleFiles, hidden: hiddenGenerated } = useMemo(
    () => partitionGeneratedReviewFiles(files, facts.generated, noise.hideGenerated),
    [files, facts.generated, noise.hideGenerated],
  );
  /*
   * The typed filter is a way of finding a row, the way the reference's own
   * file tree hides the rows that do not match, so it stops at the tree. The
   * diffs are not re-cut by it: typing leaves the open file and the scroll
   * position exactly where they were. The generated filter is a different
   * thing - it decides what this review is of - so it shapes both.
   */
  const matchedFiles = useMemo(
    () => visibleFiles.filter((file) => file.path.toLocaleLowerCase().includes(filter.toLocaleLowerCase())),
    [visibleFiles, filter],
  );
  const revealGenerated = () => onNoisePreferencesChange?.({ ...noise, hideGenerated: false });
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuTrigger = useRef<HTMLButtonElement>(null);
  const selectedIndex = Math.max(0, visibleFiles.findIndex((file) => file.path === selectedPath));
  const singleFile = useMemo(() => requiresSingleFileReview({
    fileCount: files.length,
    changedLines: files.reduce((total, file) => total + (file.additions ?? 0) + (file.deletions ?? 0), 0),
    diffBytes: new TextEncoder().encode(patch).byteLength,
  }), [files, patch]);
  const displayedFiles = singleFile ? visibleFiles.slice(selectedIndex, selectedIndex + 1) : visibleFiles;
  const selectFile = (filePath: string) => {
    onFileViewChange({ ...fileView, selectedPath: filePath });
    sections.current.get(filePath)?.scrollIntoView({ block: "start" });
  };
  const untracked = useMemo(() => new Set(untrackedFiles ?? []), [untrackedFiles]);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => buildReviewTree(matchedFiles, untracked), [matchedFiles, untracked]);
  const treeRows = useMemo(() => flattenReviewTree(tree, collapsedGroups), [tree, collapsedGroups]);
  const toggleGroup = (group: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });
  const rowElements = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  /*
   * One Tab stop for the whole tree, the roving-tabindex habit: the row a walk
   * left off on, or the selected file, or the first row. Forty files are forty
   * arrow presses and one Tab, not forty Tab stops, and Tab still leaves the
   * tree in both directions - nothing here is a trap.
   */
  const walked = focusedPath && treeRows.some((row) => row.path === focusedPath) ? focusedPath : null;
  const activeRowPath = walked
    ?? (selectedPath && treeRows.some((row) => row.path === selectedPath) ? selectedPath : null)
    ?? treeRows[0]?.path ?? null;
  /*
   * Focus follows a walk only when the walk asked for it. A row an expansion
   * has just revealed is focused after the render that draws it, which is why
   * this runs on every render and clears the request it has honoured.
   */
  useEffect(() => {
    const path = pendingFocus.current;
    if (!path) return;
    pendingFocus.current = null;
    rowElements.current.get(path)?.focus();
  });
  const viewedAt = (filePath: string) => isReviewFileViewed(viewedRevisions, filePath, fileRevisions[filePath]);
  /*
   * Which files draw a diff, and so which comments have a line to sit on.
   *
   * Asked here because a viewed file draws nothing below its heading, and the
   * mark cannot be read before this point. The rest is the order fileContent
   * uses, and the two have to stay in step: a file this misses would draw its
   * comments twice, and one it wrongly claims would draw them nowhere.
   */
  const drawsDiff = (file: ReviewFile) => reviewFileClaimsComments({
    viewed: Boolean(onViewedChange && viewedAt(file.path)),
    conflicted: file.conflicted,
    previewable: Boolean(reviewPreviewKind({ path: file.path, deleted: /^deleted file mode /m.test(file.patch), richPreview: noise.richPreview })),
    binary: file.binary,
    additions: file.additions,
    deletions: file.deletions,
  });
  const drawnPaths = new Set(displayedFiles.filter(drawsDiff).map((file) => file.path));
  const orphanedComments = comments.filter((entry) => !drawnPaths.has(entry.comment.path));
  /*
   * The findings whose file draws no diff here. A finding on a drawn file goes
   * to that file instead, on its line or in the file's own group above the
   * diff, so nothing is drawn twice and nothing is dropped.
   */
  const orphanedFindings = (findings?.findings ?? []).filter((entry) => !drawnPaths.has(entry.finding.path));
  const toggleViewed = (filePath: string) => {
    const revision = fileRevisions[filePath];
    if (!onViewedChange || !revision) return;
    onViewedChange(filePath, viewedAt(filePath) ? null : revision);
  };
  const onTreeKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // A chord belongs to the application, not to the tree.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = reviewTreeKeyAction(treeRows, activeRowPath, event.key);
    if (!action) return;
    // Where a scope has no viewed mark to give, "v" is just a letter, and it
    // is left to the browser rather than swallowed by a tree that cannot act.
    if (action.kind === "toggle-viewed" && !(onViewedChange && fileRevisions[action.path])) return;
    event.preventDefault();
    setFocusedPath(action.path);
    switch (action.kind) {
      case "focus": pendingFocus.current = action.path; return;
      case "expand": case "collapse": toggleGroup(action.path); return;
      case "select": selectFile(action.path); return;
      case "toggle-viewed": toggleViewed(action.path); return;
    }
  };
  const rowProps = (rowPath: string) => ({
    ref: (element: HTMLElement | null) => {
      if (element) rowElements.current.set(rowPath, element); else rowElements.current.delete(rowPath);
    },
    tabIndex: rowPath === activeRowPath ? 0 : -1,
    onFocus: () => setFocusedPath(rowPath),
  });

  /**
   * What is drawn under one file's heading.
   *
   * The order decides the answer. A conflicted file is three versions at
   * once; a previewable one is tested before the binary branch, because an
   * image is binary and would otherwise be refused rather than shown; and a
   * diff is what is left.
   */
  const fileContent = (file: ReviewFile) => {
    if (file.conflicted) {
      return <ReviewConflictNotice stages={facts.conflicts[file.path]} onOpenFile={() => openFileTab(file)} />;
    }
    const preview = reviewPreviewKind({
      path: file.path,
      deleted: /^deleted file mode /m.test(file.patch),
      richPreview: noise.richPreview,
    });
    if (preview) {
      return <ReviewFilePreview context={context} scope={scope} kind={preview} path={file.path}
        // The digest the panel is showing: what moves when the file does, and
        // what makes a refresh fetch the preview again instead of keeping it.
        revision={fileRevisions[file.path]} onOpenFile={() => openFileTab(file)} />;
    }
    if (file.binary) return <ReviewUnpreviewableNotice binary />;
    if (!file.additions && !file.deletions) return null;
    return <ReviewFileDiff onCommentEditingChange={onCommentEditingChange} commentSaveLabel={commentSaveLabel} displayPreferences={displayPreferences} context={context} scope={scope} file={file} revision={fileRevisions[file.path]}
      operations={hunkOperations} busy={operationBusy} onOperate={onOperate}
      /*
       * A diff too large to draw is the one case where a human most needs the
       * file itself, so the button opens the source view rather than the
       * preview that would refuse it too.
       */
      onOpenFile={() => openFileTab(file)}
      comments={placedCommentsForFile(comments, file.path)}
      threads={reviewPrThreadPlacement(threads ?? [], file.path).anchored}
      findings={findings && { ...findings, findings: placedFindingsForFile(findings.findings, file.path) }}
      canAddToChat={canAddToChat}
      onSaveComment={(draft) => onSaveComment(file.path, draft)}
      onRemoveComment={onRemoveComment}
      onAddCommentToChat={onAddCommentToChat}
      wrapLines={wrapLines} diffMode={diffMode} />;
  };

  /*
   * The file steppers, in one place because two surfaces carry them: the
   * large-diff banner, which is already showing one file at a time, and the
   * walk bar, which stands in for the file list when it is hidden. Both step
   * through every file in the review, never the typed filter's subset, so a
   * walk cannot skip a file a filter happens to be hiding.
   */
  const stepToFile = (offset: number) => {
    const target = visibleFiles[selectedIndex + offset];
    if (target) selectFile(target.path);
  };
  const fileSteppers = <span className={styles.diffBannerNav}>
    <IconButton label="Previous file" disabled={selectedIndex === 0} onClick={() => stepToFile(-1)}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6.8 2.4-3.4 3.6 3.4 3.6" /></svg>
    </IconButton>
    <IconButton label="Next file" disabled={selectedIndex >= visibleFiles.length - 1} onClick={() => stepToFile(1)}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5.2 2.4 3.4 3.6-3.4 3.6" /></svg>
    </IconButton>
  </span>;

  const fileRow = (node: ReviewTreeNode, level: number) => {
    const file = node.file;
    if (!file) return null;
    const selected = file.path === selectedPath;
    const viewed = viewedAt(file.path);
    const referencePath = reviewReferencePath(repositoryRoot, reviewCwd, file.path);
    return <li key={node.path} role="none">
      <Button tone="ghost" size="sm" className={styles.fileChoice} role="treeitem" aria-level={level}
        aria-selected={selected} aria-current={selected ? "true" : undefined} data-viewed={viewed || undefined}
        title={file.path} onClick={() => selectFile(file.path)} {...rowProps(node.path)}>
        {getFileIcon(file.path)}<span className={styles.choiceLabel}>{node.name}</span>
        {/* The mark is read here as well as on the heading, so a walk down the
            tree shows what has been read without opening anything. */}
        {viewed && <span className={styles.viewedMark} title="Viewed" aria-label="Viewed">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
        </span>}
        {selected && onAtMention
          ? <span className={styles.addRef} role="button" tabIndex={0}
              title="Add to chat" aria-label={`Add ${referencePath} to chat`}
              onClick={(event) => { event.stopPropagation(); onAtMention(referencePath); }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault(); event.stopPropagation(); onAtMention(referencePath);
              }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="1.8" x2="5" y2="8.2" /><line x1="1.8" y1="5" x2="8.2" y2="5" />
              </svg>
            </span>
          : file.additions !== null
            ? <><span className={styles.additions}>+{file.additions.toLocaleString("en-GB")}</span><span className={styles.deletions}>−{file.deletions?.toLocaleString("en-GB")}</span></>
            : node.untracked ? <span className={styles.untrackedMark}>U</span> : null}
      </Button>
    </li>;
  };
  const renderNodes = (nodes: readonly ReviewTreeNode[], level = 1): React.ReactNode => nodes.map((node) => {
    if (node.file) return fileRow(node, level);
    const open = !collapsedGroups.has(node.path);
    const folderRow = <li key={node.path} role="none">
      {/* A folder is walked and disclosed, never selected: only a file has a
          diff to open, so its selected state is stated and stays false. */}
      <button type="button" className={styles.treeFolder} role="treeitem" aria-level={level} aria-expanded={open}
        aria-selected={false} onClick={() => toggleGroup(node.path)} {...rowProps(node.path)}>
        <span className={styles.treeChevron} data-open={open} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 2 3 3-3 3" /></svg>
        </span>
        <span className={styles.choiceLabel}>{node.name}</span>
        <span className={styles.fileGroupMark} aria-hidden="true" />
      </button>
      {open && <ul className={styles.treeChildren} role="group">{renderNodes(node.children, level + 1)}</ul>}
    </li>;
    return folderRow;
  });

  return <div className={styles.fileReview}>
    <div className={styles.fileLayout} ref={layout}>
      {menuError && <p role="alert" className={styles.message}>{menuError}</p>}
      {/*
        * The scroll container for the diffs, and the renderer's virtualisation
        * root. Every FileDiff below reads this through context and renders
        * only the rows near the viewport, which is what lets a review of
        * thousands of lines scroll. The banner and the file headings are
        * ordinary children and are always drawn.
        */}
      <Virtualizer className={styles.fileDiffs} config={REVIEW_VIRTUALIZER_CONFIG}>
        {/*
          * The reading position, kept across a scope change.
          *
          * A scope change replaces this whole list with the panel's loading
          * message, so the scroll container above is destroyed and its
          * scrollTop with it. The selected file survives that because it lives
          * in the Tab's selection, and this puts the place there too. It is a
          * child rather than a sibling because it reads the Virtualizer from
          * the context provided here.
          */}
        <ReviewScrollAnchorKeeper
          owner={ownerKey}
          anchor={fileView.scrollAnchor ?? null}
          getSections={() => sections.current.entries()}
          onAnchorChange={(scrollAnchor) => onFileViewChange({ ...fileView, scrollAnchor })}
          /* A single-file review opens on the file it was told to open. */
          restore={!singleFile} />
        {/*
          * The large-diff notice is the reference's top banner: an info glyph,
          * the sentence, and the file steppers at the trailing edge.
          */}
        {singleFile && visibleFiles.length > 0 && <div className={styles.diffBanner} role="status">
          <span className={styles.diffBannerIcon} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.2" />
              <line x1="8" y1="7.2" x2="8" y2="11" />
              <circle cx="8" cy="4.9" r="0.7" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className={styles.diffBannerText}>This diff is large, showing one file at a time</span>
          {fileSteppers}
        </div>}
        {/*
          * The other way a change is walked without the tree: the file list is
          * hidden, so the same two steps are put where the diffs are, with the
          * file being read and where it sits in the change. A large diff
          * already carries the pair in its banner, so it is not repeated.
          */}
        {!singleFile && !showFiles && visibleFiles.length > 1 && <div className={styles.fileWalk}>
          <span className={styles.fileWalkPosition}>
            {getFileIcon(visibleFiles[selectedIndex].path)}
            <span className={styles.fileWalkName} title={visibleFiles[selectedIndex].path}>{getFileName(visibleFiles[selectedIndex].path)}</span>
            <span className={styles.fileWalkCount}>{selectedIndex + 1} of {visibleFiles.length}</span>
          </span>
          {fileSteppers}
        </div>}
        <ReviewGeneratedNotice hiddenCount={hiddenGenerated.length} onReveal={revealGenerated} />
        {/* The typed filter no longer reaches the diffs, so an empty column
            here is an empty review or a held-back one, never a filtered one.
            The notice above already says when files are being held back. */}
        {!displayedFiles.length && (hiddenGenerated.length
          ? null
          : <p className={styles.message}>No changes to show</p>)}
        {orphanedComments.length > 0 && <ReviewOrphanComments entries={orphanedComments}
          commentSaveLabel={commentSaveLabel} canAddToChat={canAddToChat}
          onSaveComment={onSaveComment} onRemoveComment={onRemoveComment} onAddCommentToChat={onAddCommentToChat} />}
        {findings && orphanedFindings.length > 0 && <ReviewOrphanFindings entries={orphanedFindings} handling={findings} />}
        {displayedFiles.map((file) => <section key={file.path} aria-label={file.path}
          onContextMenu={(event) => {
            event.preventDefault();
            const selectedText = window.getSelection()?.toString() ?? "";
            const absolutePath = joinFilePath(repositoryRoot, file.path);
            /*
             * The applications this file can be opened in are asked for as
             * the menu is asked for. A native menu is drawn once, so they get
             * a short window to arrive. Past that the menu opens and says it
             * is still looking, rather than holding the pointer.
             *
             * The request runs to its end either way, and its answer is kept,
             * so the next menu for this file opens with the applications on
             * it. A slow machine costs one extra right click, not every one.
             */
            const listing = requestExternalEditors(absolutePath);
            void resolveReviewMenuTargets(listing).then((resolved) => showReviewMenu({
              hasSelection: Boolean(selectedText.trim()),
              targets: resolved?.listing?.targets.map((entry) => ({ id: entry.id, label: entry.label, available: entry.available })),
              preferredTargetId: resolved?.listing?.preferredTargetId ?? null,
              loadingTargets: resolved === null,
            })).then(async (action) => {
              if (!mounted.current || !action) return;
              setMenuError(null);
              if (action.startsWith("open-in:")) {
                const failure = await openInExternalEditor(absolutePath, action.slice("open-in:".length));
                if (failure && mounted.current) setMenuError(failure);
                return;
              }
              switch (action) {
                case "open-file": openFileTab(file); break;
                case "copy-selection": await copyFromMenu(selectedText); break;
                case "copy-path": await copyFromMenu(absolutePath); break;
                // Repository-relative on purpose: it copies the path this
                // panel shows, which is the one the patch itself names. Only
                // a path handed to the Session is rebased onto its directory.
                case "copy-relative-path": await copyFromMenu(file.path); break;
                case "copy-diff": await copyFromMenu(file.patch); break;
                case "toggle-wrap": onToggleWrap(); break;
              }
            }).catch(() => { if (mounted.current) setMenuError("The Review menu action could not be completed."); });
          }}
          ref={(element) => { if (element) sections.current.set(file.path, element); else sections.current.delete(file.path); }}>
          <div className={styles.fileHeading}>
            <h3>{getFileIcon(file.path)}
              {/* One line that truncates from the start of the path, so a narrow
                  panel shortens the directory and keeps the file name. */}
              <span className={styles.fileHeadingPath} title={file.path}>
                {file.path.includes("/") && <span className={styles.mutedPath}>{file.path.slice(0, file.path.lastIndexOf("/") + 1)}</span>}
                <span className={styles.brightName}>{file.path.slice(file.path.lastIndexOf("/") + 1)}</span>
              </span>
              {file.additions !== null && <span className={styles.fileHeadingStat}>
                <span className={styles.additions}>+{file.additions.toLocaleString("en-GB")}</span>
                <span className={styles.deletions}>−{file.deletions?.toLocaleString("en-GB")}</span>
              </span>}</h3>
            {!file.conflicted && fileRevisions[file.path] && fileOperations.map((operation) => <IconButton key={operation} size="sm" label={REVIEW_OPERATION_LABELS[operation].file}
              className={styles.fileAction} disabled={operationBusy}
              onClick={() => onOperate({
                operation,
                targetKind: "file",
                targets: [{ path: file.path, revision: fileRevisions[file.path] }],
                path: file.path,
              })}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {operation === "revert" ? <path d="M3 6h6a4 4 0 0 1 0 8M3 6l3-3M3 6l3 3" />
                  : <><path d="M3 8h10" />{operation === "stage" && <path d="M8 3v10" />}</>}
              </svg>
            </IconButton>)}
            {onViewedChange && fileRevisions[file.path] && <IconButton size="sm"
              className={styles.viewedButton} pressed={viewedAt(file.path)}
              label={viewedAt(file.path) ? "Mark as unviewed" : "Mark as viewed"}
              onClick={() => toggleViewed(file.path)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 8 3 3 7-7" />
              </svg>
            </IconButton>}
            <IconButton label="Open file in a tab" title="Open file in a tab"
              onClick={() => openFileTab(file)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2.2" y="4.2" width="9.2" height="9.2" rx="2" />
                <path d="M6.6 4.2V3.9a1.7 1.7 0 0 1 1.7-1.7h3.9a1.7 1.7 0 0 1 1.7 1.7v3.9a1.7 1.7 0 0 1-1.7 1.7h-.3" />
                <path d="M5.6 8.8h2.8M7 7.4v2.8" />
              </svg>
            </IconButton>
          </div>
          {!(onViewedChange && viewedAt(file.path)) && <>
          {/* Silent when no diff is drawn below: the note is then all there is. */}
          <ReviewFileChangeNote file={file} silent={!file.conflicted && !file.binary && !file.additions && !file.deletions} />
          {fileContent(file)}
          </>}
        </section>)}
      </Virtualizer>
      {showFiles && <DynamicStyleVars className={styles.fileNavigationContainer} variables={{ "--ui-panel-width": `${resizer.width}px` }}>
        <div {...resizer.separatorProps} className={styles.fileResizeHandle} data-resizing={resizer.isResizing} />
        <nav className={styles.fileNavigation} aria-label="Changed files" data-reserve-bottom={reserveBottomPadding === true}>
        <div className={styles.fileFilter}>
          <span className={styles.fileFilterIcon} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="4.4" /><path d="m10.4 10.4 3 3" /></svg>
          </span>
          <input aria-label="Filter files" placeholder="Filter files…" value={filter} onChange={(event) => onFileViewChange({ ...fileView, filter: event.target.value })} />
          {filter && <Button size="sm" tone="ghost" aria-label="Clear file filter" onClick={() => onFileViewChange({ ...fileView, filter: "" })}>×</Button>}
          {onNoisePreferencesChange && <span className={noiseStyles.filterMenuAnchor}>
            <IconButton ref={filterMenuTrigger} size="sm" label="Filter options" aria-haspopup="menu"
              aria-expanded={filterMenuOpen} onClick={() => setFilterMenuOpen(!filterMenuOpen)}>
              {/* A funnel, the icon the reference's own filter trigger uses. */}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 3.5h11l-4.2 4.9v4l-2.6 1.4v-5.4z" />
              </svg>
            </IconButton>
            <Menu open={filterMenuOpen} label="Filter options" triggerRef={filterMenuTrigger}
              className={noiseStyles.filterMenu} onClose={() => setFilterMenuOpen(false)}>
              <ReviewGeneratedFilterItem preferences={noise} onChange={onNoisePreferencesChange} />
            </Menu>
          </span>}
        </div>
        <ul className={styles.fileList} role="tree" aria-label="Changed files"
          onKeyDown={onTreeKeyDown}>{renderNodes(tree)}</ul>
        {/* The filter is said where the filter itself is, which is now the
            only place it narrows anything. */}
        {!matchedFiles.length && (filter
          ? <ReviewEmptyState density="inline" situation={{ kind: "filtered", filter }}
              onClearFilter={() => onFileViewChange({ ...fileView, filter: "" })} />
          : hiddenGenerated.length ? null
          : <p className={styles.message}>No matching files</p>)}
        </nav>
      </DynamicStyleVars>}
    </div>
  </div>;
}
