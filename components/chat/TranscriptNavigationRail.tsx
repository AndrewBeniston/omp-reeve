"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import type { AgentMessage } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./transcript-navigation-rail.module.css";

export interface TranscriptNavigationItem {
  id: string;
  label: string;
  response: string;
}

export type TranscriptPreviewIntent = "keep" | "retarget" | "schedule" | "show";

export function visibleTranscriptTurnIds(
  turns: Array<{ id: string; top: number }>,
  viewport: { top: number; bottom: number },
  contentBottom: number,
): string[] {
  return turns.filter((turn, index) => {
    const bottom = turns[index + 1]?.top ?? contentBottom;
    return turn.top < viewport.bottom && bottom > viewport.top;
  }).map((turn) => turn.id);
}

export function resolveTranscriptPreviewIntent(
  previewId: string | null,
  timerPending: boolean,
  targetId: string,
): TranscriptPreviewIntent {
  if (previewId === targetId) return "keep";
  if (previewId !== null) return "show";
  return timerPending ? "retarget" : "schedule";
}

function messageText(message: AgentMessage): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => (
      block && typeof block === "object"
        && (block as { type?: unknown }).type === "text"
        && typeof (block as { text?: unknown }).text === "string"
        ? [(block as { text: string }).text]
        : []
    ))
    .join("\n")
    .trim();
}

export function buildTranscriptNavigationItems(
  messages: AgentMessage[],
  entryIds: Array<string | undefined>,
): TranscriptNavigationItem[] {
  const items: TranscriptNavigationItem[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const id = entryIds[index];
    if (message.role !== "user" || !id) continue;
    const label = messageText(message);
    if (!label) continue;

    let response = "";
    for (let next = index + 1; next < messages.length; next += 1) {
      const candidate = messages[next];
      if (candidate.role === "user") break;
      if (candidate.role !== "assistant") continue;
      const candidateText = messageText(candidate);
      if (candidateText) response = candidateText;
    }
    items.push({ id, label, response });
  }
  return items;
}

function escapedSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function messageElement(container: HTMLDivElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-transcript-navigation-id="${escapedSelectorValue(id)}"]`,
  );
}

export function TranscriptNavigationRail({
  items,
  scrollContainerRef,
  onReveal,
}: {
  items: TranscriptNavigationItem[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onReveal: (item: TranscriptNavigationItem, behavior: ScrollBehavior) => void;
}) {
  const { t } = useI18n();
  const railRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverTargetRef = useRef<{
    button: HTMLButtonElement;
    item: TranscriptNavigationItem;
  } | null>(null);
  const previewIdRef = useRef<string | null>(null);
  const scrubRef = useRef<{
    itemId: string;
    moved: boolean;
    pointerCaptureTarget: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [currentIds, setCurrentIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ item: TranscriptNavigationItem; offset: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const clearHoverTimer = () => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };

  const showPreview = (item: TranscriptNavigationItem, button: HTMLButtonElement) => {
    const list = listRef.current;
    const offset = button.offsetTop + button.offsetHeight / 2 - (list?.scrollTop ?? 0);
    previewIdRef.current = item.id;
    setPreview({ item, offset });
  };

  const hidePreview = () => {
    previewIdRef.current = null;
    setPreview(null);
  };

  const targetPreview = (item: TranscriptNavigationItem, button: HTMLButtonElement) => {
    const intent = resolveTranscriptPreviewIntent(
      previewIdRef.current,
      hoverTimerRef.current !== null,
      item.id,
    );
    hoverTargetRef.current = { button, item };
    if (intent === "keep" || intent === "retarget") return;
    if (intent === "show") {
      clearHoverTimer();
      showPreview(item, button);
      return;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      const target = hoverTargetRef.current;
      if (target) showPreview(target.item, target.button);
    }, 150);
  };

  useEffect(() => () => clearHoverTimer(), []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const content = container?.querySelector<HTMLElement>("[data-transcript-navigation-content]");
    if (!container || !content) return;
    const update = () => {
      const gap = content.getBoundingClientRect().left - container.getBoundingClientRect().left;
      setVisible(gap >= 48);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);
    observer?.observe(content);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let frame: number | null = null;
    const updateCurrent = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const bounds = container.getBoundingClientRect();
        const turns = items.flatMap((item) => {
          const element = messageElement(container, item.id);
          return element ? [{ id: item.id, top: element.getBoundingClientRect().top }] : [];
        });
        const content = container.querySelector<HTMLElement>("[data-transcript-navigation-content]");
        const nextIds = visibleTranscriptTurnIds(turns, {
          top: bounds.top + container.clientTop,
          bottom: bounds.top + container.clientTop + container.clientHeight,
        }, content?.getBoundingClientRect().bottom ?? bounds.bottom);
        setCurrentIds((previous) => previous.length === nextIds.length
          && previous.every((id, index) => id === nextIds[index]) ? previous : nextIds);
      });
    };
    updateCurrent();
    container.addEventListener("scroll", updateCurrent, { passive: true });
    const observer = new MutationObserver(updateCurrent);
    observer.observe(container, { childList: true, subtree: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateCurrent);
    resizeObserver?.observe(container);
    const content = container.querySelector<HTMLElement>("[data-transcript-navigation-content]");
    if (content) resizeObserver?.observe(content);
    container.addEventListener("load", updateCurrent, true);
    return () => {
      container.removeEventListener("scroll", updateCurrent);
      observer.disconnect();
      resizeObserver?.disconnect();
      container.removeEventListener("load", updateCurrent, true);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [items, scrollContainerRef]);

  const itemFromTarget = (target: Element | null): TranscriptNavigationItem | null => {
    const button = target?.closest<HTMLButtonElement>("[data-transcript-navigation-item-id]");
    if (!button || !listRef.current?.contains(button)) return null;
    return items.find((item) => item.id === button.dataset.transcriptNavigationItemId) ?? null;
  };

  const finishScrub = (event: PointerEvent<HTMLDivElement>) => {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== event.pointerId) return;
    scrubRef.current = null;
    setScrubbing(false);
    if (scrub.pointerCaptureTarget.hasPointerCapture?.(event.pointerId)) {
      scrub.pointerCaptureTarget.releasePointerCapture(event.pointerId);
    }
    if (scrub.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  if (items.length < 4 || !visible) return null;

  return (
    <nav ref={railRef} className={styles.rail} aria-label={t("chat.messageNavigation")}>
      <div
        ref={listRef}
        className={styles.list}
        data-scrubbing={scrubbing || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target instanceof Element ? event.target : null;
          const button = target?.closest<HTMLButtonElement>("[data-transcript-navigation-item-id]");
          const item = itemFromTarget(target);
          if (!item || !button) return;
          clearHoverTimer();
          scrubRef.current = {
            itemId: item.id,
            moved: false,
            pointerCaptureTarget: button,
            pointerId: event.pointerId,
          };
          setScrubbing(true);
          button.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const scrub = scrubRef.current;
          if (!scrub) {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest<HTMLButtonElement>("[data-transcript-navigation-item-id]");
            const item = itemFromTarget(target);
            if (item && button) targetPreview(item, button);
            return;
          }
          if (scrub.pointerId !== event.pointerId) return;
          const target = document.elementFromPoint(event.clientX, event.clientY);
          const item = itemFromTarget(target);
          if (!item || item.id === scrub.itemId) return;
          scrubRef.current = { ...scrub, itemId: item.id, moved: true };
          previewIdRef.current = item.id;
          setPreview({ item, offset: event.clientY - (railRef.current?.getBoundingClientRect().top ?? 0) });
          onReveal(item, "instant");
        }}
        onPointerUp={finishScrub}
        onPointerCancel={finishScrub}
        onLostPointerCapture={finishScrub}
        onPointerLeave={() => {
          clearHoverTimer();
          hoverTargetRef.current = null;
          if (!scrubbing) hidePreview();
        }}
        onScroll={() => {
          if (!preview) return;
          const button = listRef.current?.querySelector<HTMLButtonElement>(
            `[data-transcript-navigation-item-id="${escapedSelectorValue(preview.item.id)}"]`,
          );
          if (button) showPreview(preview.item, button);
        }}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={styles.item}
            data-current={currentIds.includes(item.id) || undefined}
            data-scrub-target={preview?.item.id === item.id || undefined}
            data-transcript-navigation-item-id={item.id}
            aria-current={currentIds[0] === item.id ? "true" : undefined}
            aria-label={t("chat.jumpToMessage", { position: index + 1 })}
            onClick={() => {
              if (suppressClickRef.current) return;
              onReveal(item, "smooth");
            }}
            onFocus={(event) => {
              clearHoverTimer();
              showPreview(item, event.currentTarget);
            }}
            onBlur={hidePreview}
            onPointerEnter={(event) => targetPreview(item, event.currentTarget)}
          >
            <span className={styles.marker} aria-hidden="true">
              <span className={styles.markerLine} />
            </span>
          </button>
        ))}
      </div>
      {preview && (
        <DynamicStyleVars
          className={styles.tooltipPosition}
          variables={{ "--ui-minimap-offset": `${preview.offset}px` }}
        >
          <div className={styles.tooltip} role="tooltip">
            <div className={styles.tooltipTitle}>{preview.item.label}</div>
            {preview.item.response && <div className={styles.tooltipResponse}>{preview.item.response}</div>}
          </div>
        </DynamicStyleVars>
      )}
    </nav>
  );
}
