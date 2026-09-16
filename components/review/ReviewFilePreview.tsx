"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/Button";
import type { ReviewRequestContext } from "@/lib/review-owner";
import type { ReviewPreviewKind } from "@/lib/review-preview";
import { fetchReviewPreview, reviewPreviewRequestKey, reviewPreviewSideUrl, REVIEW_PREVIEW_REFUSALS } from "@/lib/review-preview-client";
import type { ReviewPreviewSide } from "@/lib/review-preview-source";
import type { ReviewPreviewScope } from "@/lib/review-scope-request";
import styles from "./review-noise.module.css";

export type ReviewPreviewState =
  | { status: "loading" }
  | { status: "ready"; old: ReviewPreviewSide | null; new: ReviewPreviewSide | null }
  | { status: "refused"; message: string };

/** Bytes a viewer can be handed directly, rather than a URL to fetch again. */
function dataUrl(side: ReviewPreviewSide): string | null {
  return side.base64 === null ? null : `data:${side.mediaType};base64,${side.base64}`;
}

/** Base64 bytes as the UTF-8 text they hold. `atob` alone would read them as latin-1. */
function decodeText(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** What each side is, given whether the other one is there. */
function sideLabel(which: "old" | "new", both: boolean): string {
  if (both) return which === "old" ? "Before" : "After";
  return which === "old" ? "Removed" : "Added";
}

function PreviewPane({ kind, path, side, which, both, onOpenFile, source }: {
  kind: ReviewPreviewKind;
  path: string;
  side: ReviewPreviewSide;
  which: "old" | "new";
  both: boolean;
  onOpenFile?: () => void;
  /** Where this side's bytes come from: its own URL, or the bytes in hand. */
  source: string | null;
}) {
  /*
   * Which bytes failed, rather than that something once did. A boolean here
   * stays true after the file changes underneath the pane, so a version that
   * draws perfectly well would keep reporting the last one's failure.
   */
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = failedSource === source;
  const label = sideLabel(which, both);
  return <div className={styles.pane}>
    <span className={styles.paneLabel}>{label}</span>
    <div className={styles.frame} data-side={which === "old" ? "deletions" : "additions"}>
      {source === null || failed ? <span>This version could not be drawn.</span>
        : kind === "pdf"
          /*
           * Drawn by the browser's own viewer in a subframe, from a URL on
           * Reeve's origin. The desktop shell lets a subframe navigate only
           * to a trusted application URL, so a PDF handed over as a `data:`
           * URL is refused before it loads and leaves an empty frame. These
           * children show only where the viewer itself cannot draw.
           */
          ? <object className={styles.document} data={source} type={side.mediaType} aria-label={`${label} version of ${path}`}>
              <span className={styles.notice}>
                <span>This PDF could not be drawn.</span>
                {onOpenFile && <Button size="sm" tone="ghost" onClick={onOpenFile}>Open file</Button>}
              </span>
            </object>
          /*
           * An image, including an SVG, is drawn in an `img` from bytes
           * already in hand, so nothing in a reviewed file runs and no image
           * loader has anything left to fetch or optimise.
           */
          // eslint-disable-next-line @next/next/no-img-element
          : <img className={styles.image} src={source} alt={`${label} version of ${path}`} onError={() => setFailedSource(source)} />}
    </div>
  </div>;
}

/**
 * One file previewed rather than diffed, in whatever state its bytes are in.
 *
 * Separate from the fetching below so the states it can be in are renderable
 * without a server.
 */
export function ReviewFilePreviewView({ kind, path, state, onOpenFile, sideUrl }: {
  kind: ReviewPreviewKind;
  path: string;
  state: ReviewPreviewState;
  /** Offered wherever the preview cannot draw the file itself. */
  onOpenFile?: () => void;
  /** Where a side is fetched from when it is not carried in the answer. */
  sideUrl?: (which: "old" | "new") => string;
}) {
  if (state.status === "loading") return <p className={styles.notice} role="status">Loading preview…</p>;
  if (state.status === "refused") return <p className={styles.notice}>
    <span>{state.message}</span>
    {onOpenFile && <span><Button size="sm" tone="ghost" onClick={onOpenFile}>Open file</Button></span>}
  </p>;
  const sides = ([["old", state.old], ["new", state.new]] as const)
    .flatMap(([which, side]) => side ? [{ which, side }] : []);
  if (!sides.length) return <p className={styles.notice}>{REVIEW_PREVIEW_REFUSALS.unavailable}</p>;
  if (kind === "markdown") {
    // Markdown previews the file as it now reads. R6 records that it never
    // previews a deletion, so the newer side is the one to render.
    const body = state.new?.base64;
    if (!body) return <p className={styles.notice}>{REVIEW_PREVIEW_REFUSALS.unavailable}</p>;
    return <div className={styles.preview} data-sides="1" data-preview="markdown">
      <MarkdownBody className={styles.markdown}>{decodeText(body)}</MarkdownBody>
    </div>;
  }
  return <div className={styles.preview} data-sides={sides.length} data-preview={kind}>
    {sides.map(({ which, side }) => <PreviewPane key={which} kind={kind} path={path} side={side}
      which={which} both={sides.length === 2} onOpenFile={onOpenFile}
      source={sideUrl ? sideUrl(which) : dataUrl(side)} />)}
  </div>;
}

/**
 * The preview, and the read behind it.
 *
 * Read once per owner, scope, file and revision, so an edit picked up by a
 * refresh replaces the preview rather than leaving the first bytes on screen.
 * A refusal is shown as itself rather than as an empty pane, which is the
 * whole point of previewing these files.
 */
export function ReviewFilePreview({ context, scope, kind, path, revision, onOpenFile }: {
  context: ReviewRequestContext;
  /** A Project scope, or the pull request the panel is pinned to. */
  scope: ReviewPreviewScope;
  kind: ReviewPreviewKind;
  path: string;
  /** The digest the panel is showing, which is what moves when the file does. */
  revision?: string;
  onOpenFile?: () => void;
}) {
  const [state, setState] = useState<ReviewPreviewState>({ status: "loading" });
  const requestKey = reviewPreviewRequestKey(context, scope, path, revision);
  const latest = useRef({ context, scope });
  latest.current = { context, scope };
  /*
   * A PDF is drawn by the browser from its own URL, so its bytes are never
   * carried here: the answer is asked for as the shape of its sides alone,
   * and the file is read once, by the request the viewer makes.
   */
  const framed = kind === "pdf";
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchReviewPreview(latest.current.context, latest.current.scope, path, controller.signal, { includeBytes: !framed })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState(result.status === "ready"
          ? { status: "ready", old: result.old, new: result.new }
          : { status: "refused", message: REVIEW_PREVIEW_REFUSALS[result.status] ?? REVIEW_PREVIEW_REFUSALS.unavailable });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [requestKey, path, framed]);
  return <ReviewFilePreviewView kind={kind} path={path} state={state} onOpenFile={onOpenFile}
    sideUrl={framed ? (which) => reviewPreviewSideUrl(context, scope, path, which, revision) : undefined} />;
}

/**
 * A file that cannot be previewed, said plainly.
 *
 * R6: a binary the reference cannot preview states that it is binary and is
 * not shown. Anything else that reaches here is a file Review holds but
 * cannot draw, which is a different sentence.
 */
export function ReviewUnpreviewableNotice({ binary }: { binary: boolean }) {
  return <p className={styles.notice}>
    {binary ? "Binary file changed. It is not shown." : "This file cannot be previewed here."}
  </p>;
}
