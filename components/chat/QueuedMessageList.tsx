"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { QueuedMessageItem } from "@/lib/queued-message-types";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import { Menu, MenuItem } from "../ui/Menu";
import { Tooltip } from "../ui/Tooltip";
import cssModule from "./queued-message-list.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

export interface QueuedMessageListProps {
  items: QueuedMessageItem[];
  paused: boolean;
  queueingEnabled: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onSendNow: (id: string) => void;
  onQueueingChange: (enabled: boolean) => void;
  onResume: () => void;
  labels?: Partial<QueuedMessageLabels>;
}

export interface QueuedMessageLabels {
  queuePaused: string;
  resume: string;
  steer: string;
  steerAria: string;
  steerTooltip: string;
  delete: string;
  actions: string;
  edit: string;
  queueOff: string;
  queueOn: string;
  reorder: string;
  image: string;
}

const DEFAULT_LABELS: QueuedMessageLabels = {
  queuePaused: "Queue paused because you interrupted",
  resume: "Resume",
  steer: "Steer",
  steerAria: "Steer queued message",
  steerTooltip: "Submit without interrupting the model",
  delete: "Delete queued message",
  actions: "Queued message actions",
  edit: "Edit message",
  queueOff: "Turn off queueing",
  queueOn: "Turn on queueing",
  reorder: "Reorder queued message",
  image: "Image attachment",
};

const QUEUE_DROP_ANIMATION = {
  duration: 180,
  easing: "cubic-bezier(0.19, 1, 0.22, 1)",
};

export function reorderQueuedMessageIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  const [active] = next.splice(from, 1);
  if (!active) return ids;
  next.splice(to, 0, active);
  return next;
}

function QueueArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.7 11V3.3M2.7 11c0 2.9 1.4 4 4.6 4H16m-2.5-2.5L16 15l-2.5 2.5M7.5 9.6h4.2M7.5 5h6.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragIcon() {
  return (
    <svg width="6" height="10" viewBox="0 0 6 10" fill="none" aria-hidden="true">
      <circle cx="1.5" cy="1.5" r="0.75" fill="currentColor" />
      <circle cx="4.5" cy="1.5" r="0.75" fill="currentColor" />
      <circle cx="1.5" cy="5" r="0.75" fill="currentColor" />
      <circle cx="4.5" cy="5" r="0.75" fill="currentColor" />
      <circle cx="1.5" cy="8.5" r="0.75" fill="currentColor" />
      <circle cx="4.5" cy="8.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg data-queue-status-icon="pause" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 4v6M9 4v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg data-queue-status-icon="play" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="m4 3 6 4-6 4V3Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 6h12M8 3.5h4M6 6l.6 10h6.8L14 6M8.3 9v4.5M11.7 9v4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="10" r="1.2" />
      <circle cx="10" cy="10" r="1.2" />
      <circle cx="16" cy="10" r="1.2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4 14.5-.5 2 2-.5L15 6.5 13.5 5 4 14.5Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  );
}

function QueuedMessageDragOverlay({ item, labels }: { item: QueuedMessageItem; labels: QueuedMessageLabels }) {
  return (
    <div className={`${styles.row} ${styles.dragOverlay}`} aria-hidden="true">
      <span className={styles.dragHandle}>
        <span className={styles.dragDots}><DragIcon /></span>
        <QueueArrowIcon />
      </span>
      {item.imagePreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imagePreview} alt="" className={styles.imagePreview} draggable={false} />
      )}
      <span className={styles.message}>{item.text}</span>
      <div className={styles.actions}>
        <span className={styles.steerAction}><span>↪</span>{labels.steer}</span>
        <span className={styles.iconAction}><TrashIcon /></span>
        <span className={styles.iconAction}><MoreIcon /></span>
      </div>
    </div>
  );
}

function QueuedMessageRow({
  item,
  isReorderable,
  queueingEnabled,
  menuOpen,
  onMenuOpenChange,
  onDelete,
  onEdit,
  onSendNow,
  onQueueingChange,
  labels,
}: {
  item: QueuedMessageItem;
  isReorderable: boolean;
  queueingEnabled: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onDelete: QueuedMessageListProps["onDelete"];
  onEdit: QueuedMessageListProps["onEdit"];
  onSendNow: QueuedMessageListProps["onSendNow"];
  onQueueingChange: QueuedMessageListProps["onQueueingChange"];
  labels: QueuedMessageLabels;
}) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const [portalReady, setPortalReady] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isReorderable });

  useEffect(() => setPortalReady(true), []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const update = () => {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (rect) setMenuPosition({ left: rect.right - 190, top: rect.bottom + 4 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen]);

  const actionsMenu = (
    <Menu
      open={menuOpen}
      label={labels.actions}
      onClose={() => onMenuOpenChange(false)}
      triggerRef={moreButtonRef}
      className={styles.actionsMenu}
      data-queue-menu="true"
    >
      <MenuItem icon={<EditIcon />} onClick={() => { onMenuOpenChange(false); onEdit(item.id); }}>
        {labels.edit}
      </MenuItem>
      <MenuItem icon={<QueueArrowIcon />} onClick={() => { onMenuOpenChange(false); onQueueingChange(!queueingEnabled); }}>
        {queueingEnabled ? labels.queueOff : labels.queueOn}
      </MenuItem>
    </Menu>
  );

  return (
    <DynamicStyleVars
      elementRef={setNodeRef}
      role="listitem"
      className={styles.row}
      data-dragging={isDragging || undefined}
      variables={{
        "--ui-queue-translate-x": `${transform?.x ?? 0}px`,
        "--ui-queue-translate-y": `${transform?.y ?? 0}px`,
        "--ui-queue-transition": transition ?? "none",
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={styles.dragHandle}
        aria-label={labels.reorder}
        {...attributes}
        {...listeners}
      >
        {isReorderable && <span className={styles.dragDots}><DragIcon /></span>}
        <QueueArrowIcon />
      </button>
      {item.imagePreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imagePreview} alt={labels.image} className={styles.imagePreview} draggable={false} />
      )}
      <span className={styles.message} title={item.text}>{item.text}</span>
      <div className={styles.actions}>
        <Tooltip content={labels.steerTooltip}>
          <button type="button" className={styles.steerAction} aria-label={labels.steerAria} onClick={() => onSendNow(item.id)}>
            <span aria-hidden="true">↪</span>
            {labels.steer}
          </button>
        </Tooltip>
        <Tooltip content={labels.delete}>
          <button type="button" className={styles.iconAction} aria-label={labels.delete} onClick={() => onDelete(item.id)}>
            <TrashIcon />
          </button>
        </Tooltip>
        <div className={styles.menuWrap}>
          <button
            ref={moreButtonRef}
            type="button"
            className={styles.iconAction}
            aria-label={labels.actions}
            aria-expanded={menuOpen}
            onClick={() => onMenuOpenChange(!menuOpen)}
          >
            <MoreIcon />
          </button>
          {!portalReady
            ? actionsMenu
            : createPortal(
                <DynamicStyleVars
                  className={styles.actionsMenuPortal}
                  variables={{
                    "--ui-hover-card-left": `${menuPosition.left}px`,
                    "--ui-hover-card-top": `${menuPosition.top}px`,
                  }}
                >
                  {actionsMenu}
                </DynamicStyleVars>,
                document.body,
              )}
        </div>
      </div>
    </DynamicStyleVars>
  );
}

export function QueuedMessageList({
  items,
  paused,
  queueingEnabled,
  onDelete,
  onEdit,
  onReorder,
  onSendNow,
  onQueueingChange,
  onResume,
  labels: suppliedLabels,
}: QueuedMessageListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!openMenuId) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!listRef.current?.contains(target) && !target.closest("[data-queue-menu='true']")) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openMenuId]);

  if (items.length === 0) return null;
  const labels = { ...DEFAULT_LABELS, ...suppliedLabels };
  const label = `${items.length} queued ${items.length === 1 ? "message" : "messages"}`;
  const ids = items.map(({ id }) => id);
  const activeItem = activeId ? items.find(({ id }) => id === activeId) : undefined;
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const next = reorderQueuedMessageIds(ids, String(active.id), String(over.id));
    if (next !== ids) onReorder(next);
  };

  return (
    <div ref={listRef} className={styles.tray}>
      {paused && (
        <div className={styles.pausedHeader}>
          <span className={styles.pausedTitle}><PauseIcon />{labels.queuePaused}</span>
          <button type="button" className={styles.resumeAction} onClick={onResume}><PlayIcon />{labels.resume}</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div role="list" aria-label={label} className={styles.list}>
            {items.map((item) => (
              <QueuedMessageRow
                key={item.id}
                item={item}
                isReorderable={items.length > 1}
                queueingEnabled={queueingEnabled}
                menuOpen={openMenuId === item.id}
                onMenuOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                onDelete={onDelete}
                onEdit={onEdit}
                onSendNow={onSendNow}
                onQueueingChange={onQueueingChange}
                labels={labels}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={QUEUE_DROP_ANIMATION} zIndex={4}>
          {activeItem ? <QueuedMessageDragOverlay item={activeItem} labels={labels} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
