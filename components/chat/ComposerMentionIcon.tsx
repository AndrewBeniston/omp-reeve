"use client";

import { Box, File, Folder, Monitor, Puzzle, UserRound } from "lucide-react";
import type { ComposerMentionKind } from "@/lib/composer-mention-types";
import { SlashCommandIcon } from "./SlashCommandIcon";

export function ComposerMentionIcon({ kind, name }: { kind: ComposerMentionKind; name?: string }) {
  if (kind === "command") return <SlashCommandIcon name={name} />;

  const Icon = kind === "skill" ? Box
    : kind === "file" ? (name === "folder" ? Folder : File)
      : kind === "computer-use" ? Monitor
        : kind === "plugin" ? Puzzle
          : UserRound;

  return <Icon size={16} strokeWidth={1.5} aria-hidden="true" />;
}
