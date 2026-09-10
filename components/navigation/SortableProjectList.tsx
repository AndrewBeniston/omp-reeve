"use client";

import { useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import { reorderProjectIds } from "@/lib/project-order";
import cssModule from "./sortable-project-list.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

export interface ProjectDragHandle {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}

interface SortableProjectListProps<T> {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getIcon: (item: T) => ReactNode;
  onOrderChange: (projectIds: string[]) => void;
  onDragStateChange?: (projectId: string | null) => void;
  children: (item: T, dragHandle: ProjectDragHandle) => ReactNode;
}

function SortableProjectItem<T>({
  item,
  id,
  dropAfter,
  dropBefore,
  render,
}: {
  item: T;
  id: string;
  dropAfter: boolean;
  dropBefore: boolean;
  render: SortableProjectListProps<T>["children"];
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <DynamicStyleVars
      elementRef={setNodeRef}
      className={styles.item}
      data-dragging={isDragging || undefined}
      variables={{
        "--ui-project-translate-x": `${isDragging ? 0 : transform?.x ?? 0}px`,
        "--ui-project-translate-y": `${isDragging ? 0 : transform?.y ?? 0}px`,
        "--ui-project-transition": isDragging ? "none" : transition ?? "none",
      }}
    >
      {dropBefore && <span className={styles.dropIndicator} data-position="before" />}
      {render(item, { attributes, listeners, setActivatorNodeRef })}
      {dropAfter && <span className={styles.dropIndicator} data-position="after" />}
    </DynamicStyleVars>
  );
}

export function SortableProjectList<T>({
  items,
  getId,
  getLabel,
  getIcon,
  onOrderChange,
  onDragStateChange,
  children,
}: SortableProjectListProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const activeIndex = activeId ? ids.indexOf(activeId) : -1;
  const overIndex = overId ? ids.indexOf(overId) : -1;
  const activeItem = activeId ? items.find((item) => getId(item) === activeId) : undefined;

  const updateOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };

  const finishDrag = ({ active, over }: DragEndEvent) => {
    if (over) {
      const next = reorderProjectIds(ids, String(active.id), String(over.id));
      if (next !== ids) onOrderChange(next);
    }
    setActiveId(null);
    setOverId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={({ active }) => {
        const id = String(active.id);
        setActiveId(id);
        setOverId(id);
        onDragStateChange?.(id);
      }}
      onDragOver={updateOver}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
        onDragStateChange?.(null);
      }}
      onDragEnd={(event) => {
        finishDrag(event);
        onDragStateChange?.(null);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={styles.list} role="list" aria-label="Projects">
          {items.map((item) => {
            const id = getId(item);
            const showDropBefore = activeIndex >= 0 && overIndex >= 0 && overIndex < activeIndex && id === overId;
            const showDropAfter = activeIndex >= 0 && overIndex > activeIndex && id === overId;
            return (
              <SortableProjectItem
                key={id}
                item={item}
                id={id}
                dropBefore={showDropBefore}
                dropAfter={showDropAfter}
                render={children}
              />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay adjustScale={false} dropAnimation={null} zIndex={80}>
        {activeItem ? (
          <div className={styles.dragOverlay} aria-hidden="true">
            <span className={styles.dragOverlayIcon}>{getIcon(activeItem)}</span>
            <span className={styles.dragOverlayLabel}>{getLabel(activeItem)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
