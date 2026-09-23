"use client";

import { useState, useCallback, useRef } from "react";

export function useDragDrop(onDrop: (files: File[]) => void, allowAnyFile = false) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const hasAcceptedFile = Array.from(e.dataTransfer.items).some((item) =>
      item.kind === "file" && (allowAnyFile || item.type.startsWith("image/")));
    if (!hasAcceptedFile) return;
    e.preventDefault();
    counterRef.current += 1;
    setIsDragOver(true);
  }, [allowAnyFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasAcceptedFile = Array.from(e.dataTransfer.items).some((item) =>
      item.kind === "file" && (allowAnyFile || item.type.startsWith("image/")));
    if (!hasAcceptedFile) return;
    e.preventDefault();
  }, [allowAnyFile]);

  const handleDragLeave = useCallback(() => {
    counterRef.current -= 1;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    onDrop(files);
  }, [onDrop]);

  return { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}
