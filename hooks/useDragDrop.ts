"use client";

import { useState, useCallback, useRef } from "react";

export const CHAT_DRAG_TYPE = "application/x-reeve-chat";
export type DragDropKind = "file" | "text" | "chat";

export function dragDropKind(dataTransfer: DataTransfer): DragDropKind | null {
  const items = Array.from(dataTransfer.items) as DataTransferItem[];
  if (items.some((item) => item.type === CHAT_DRAG_TYPE)) return "chat";
  if (items.some((item) => item.kind === "file")) return "file";
  if (Array.from(dataTransfer.types).includes("text/plain")) return "text";
  return null;
}

export function useDragDrop(
  onDrop: (files: File[], text?: string, kind?: DragDropKind) => void,
  allowAnyFile = false,
) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropKind, setDropKind] = useState<DragDropKind | null>(null);
  const counterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const kind = dragDropKind(e.dataTransfer);
    const hasAcceptedFile = kind === "chat" || kind === "text" || Array.from(e.dataTransfer.items).some((item) =>
      item.kind === "file" && (allowAnyFile || item.type.startsWith("image/")));
    if (!hasAcceptedFile) return;
    e.preventDefault();
    counterRef.current += 1;
    setDropKind(kind);
    setIsDragOver(true);
  }, [allowAnyFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const kind = dragDropKind(e.dataTransfer);
    const hasAcceptedFile = kind === "chat" || kind === "text" || Array.from(e.dataTransfer.items).some((item) =>
      item.kind === "file" && (allowAnyFile || item.type.startsWith("image/")));
    if (!hasAcceptedFile) return;
    e.preventDefault();
  }, [allowAnyFile]);

  const handleDragLeave = useCallback(() => {
    counterRef.current -= 1;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsDragOver(false);
      setDropKind(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const kind = dragDropKind(e.dataTransfer);
    const text = kind === "text" ? e.dataTransfer.getData("text/plain") : "";
    onDrop(files, text, kind ?? undefined);
  }, [onDrop]);

  return { isDragOver, dropKind, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
