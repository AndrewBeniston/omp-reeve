import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { normalizeProjectOrder } from "./project-order";

const UI_STATE_FILE = "reeve-ui-state.json";

interface ReeveUiState {
  version: 1;
  projectOrder: string[];
}

function statePath(agentDir: string): string {
  return join(agentDir, UI_STATE_FILE);
}

function readUiState(agentDir: string): ReeveUiState {
  try {
    const path = statePath(agentDir);
    if (!existsSync(path)) return { version: 1, projectOrder: [] };
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { projectOrder?: unknown };
    return { version: 1, projectOrder: normalizeProjectOrder(parsed.projectOrder) };
  } catch {
    return { version: 1, projectOrder: [] };
  }
}

export function readProjectOrder(agentDir = getAgentDir()): string[] {
  return readUiState(agentDir).projectOrder;
}

export function writeProjectOrder(projectOrder: string[], agentDir = getAgentDir()): void {
  const state: ReeveUiState = {
    version: 1,
    projectOrder: normalizeProjectOrder(projectOrder),
  };
  mkdirSync(agentDir, { recursive: true });
  writePrivateFileAtomicSync(statePath(agentDir), `${JSON.stringify(state, null, 2)}\n`);
}
