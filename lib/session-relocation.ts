import { realpathSync, statSync } from "fs";
import { resolve } from "path";
import type { ProjectTrustStatus } from "./api-types";
import type { AgentSessionWrapper } from "./rpc-manager";
import type { SessionManager } from "@oh-my-pi/pi-coding-agent";
import { getPresetFromTools, getToolNamesForPreset, PRESET_FULL, type ToolEntry } from "./tool-presets";

export class SessionRelocationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "SessionRelocationError";
  }
}

export interface SessionRelocationResult {
  sessionId: string;
  sessionFile: string;
  cwd: string;
  projectRoot: string;
  trust: ProjectTrustStatus;
}

interface RelocationDependencies {
  agentDir: string;
  allowFileRoot: (path: string) => void;
  cacheSessionPath: (sessionId: string, path: string) => void;
  canonicalizePath: (path: string) => string;
  getAllowedRoots: () => Promise<Set<string>>;
  getTrustStatus: (cwd: string, agentDir: string) => ProjectTrustStatus;
  getWrapper: (sessionId: string) => AgentSessionWrapper | undefined;
  invalidateSessionList: () => void;
  isAllowedPath: (path: string, roots: Set<string>) => boolean;
  isExistingAllowedPath: (path: string, roots: Set<string>) => boolean;
  resolveProject: (cwd: string) => Promise<{ projectRoot: string }>;
  resolveSessionPath: (sessionId: string) => Promise<string | null>;
  startSession: (
    sessionId: string,
    sessionFile: string,
    options?: { toolNames?: string[] },
  ) => Promise<{ session: AgentSessionWrapper; realSessionId: string }>;
}

interface ActiveRelocation {
  targetCwd: string;
  promise: Promise<SessionRelocationResult>;
}

declare global {
  var __ompSessionRelocations: Map<string, ActiveRelocation> | undefined;
}

let productionDependencies: Promise<RelocationDependencies> | undefined;

function getProductionDependencies(): Promise<RelocationDependencies> {
  productionDependencies ??= Promise.all([
    import("./file-access"),
    import("./project-trust"),
    import("./rpc-manager"),
    import("./session-reader"),
    import("./worktree"),
  ]).then(([fileAccess, projectTrust, rpcManager, sessionReader, worktree]) => ({
    allowFileRoot: fileAccess.allowFileRoot,
    cacheSessionPath: sessionReader.cacheSessionPath,
    canonicalizePath: (path) => {
      const resolved = resolve(path);
      if (!statSync(resolved).isDirectory()) throw new SessionRelocationError("Workspace is not a directory", 400);
      return realpathSync(resolved);
    },
    getAllowedRoots: fileAccess.getAllowedFileRoots,
    getTrustStatus: projectTrust.getProjectTrustStatus,
    getWrapper: rpcManager.getRpcSession,
    invalidateSessionList: sessionReader.invalidateSessionListCache,
    isAllowedPath: fileAccess.isFilePathAllowed,
    isExistingAllowedPath: fileAccess.isExistingFilePathAllowed,
    resolveProject: async (cwd) => {
      const project = await worktree.resolveProject(cwd);
      return { projectRoot: project.projectRoot };
    },
    resolveSessionPath: sessionReader.resolveSessionPath,
    startSession: (sessionId, sessionFile, options) => rpcManager.startRpcSession(sessionId, sessionFile, undefined, options),
    agentDir: sessionReader.getAgentDir(),
  }));
  return productionDependencies;
}

function relocationLocks(): Map<string, ActiveRelocation> {
  globalThis.__ompSessionRelocations ??= new Map();
  return globalThis.__ompSessionRelocations;
}

const BUILTIN_TOOL_NAMES = new Set(PRESET_FULL);

async function activeToolPreset(wrapper: AgentSessionWrapper | undefined): Promise<string[] | undefined> {
  if (!wrapper?.isAlive()) return Promise.resolve(undefined);
  const tools = await wrapper.send({ type: "get_tools" }) as ToolEntry[];
  const activeBuiltins = tools.filter((tool) => tool.active && BUILTIN_TOOL_NAMES.has(tool.name));
  return getToolNamesForPreset(getPresetFromTools(activeBuiltins));
}

async function assertTargetAllowed(targetCwd: string, dependencies: RelocationDependencies): Promise<void> {
  const roots = await dependencies.getAllowedRoots();
  if (!dependencies.isAllowedPath(targetCwd, roots) || !dependencies.isExistingAllowedPath(targetCwd, roots)) {
    throw new SessionRelocationError("Workspace access denied", 403);
  }
}

async function performRelocation(
  sessionId: string,
  targetCwd: string,
  dependencies: RelocationDependencies,
): Promise<SessionRelocationResult> {
  const existingWrapper = dependencies.getWrapper(sessionId);
  if (existingWrapper?.isRunning()) {
    throw new SessionRelocationError("Stop the Session before changing its workspace", 409);
  }

  const sourcePath = existingWrapper?.sessionFile || await dependencies.resolveSessionPath(sessionId);
  if (!sourcePath) throw new SessionRelocationError("Session not found", 404);

  let manager: SessionManager;
  if (existingWrapper) {
    manager = existingWrapper.inner.sessionManager;
  } else {
    const { SessionManager } = await import("@oh-my-pi/pi-coding-agent");
    manager = await SessionManager.open(sourcePath);
  }
  const realSessionId = manager.getSessionId();
  await manager.ensureOnDisk();
  const snapshot = manager.captureState();
  const toolNames = await activeToolPreset(existingWrapper);
  dependencies.allowFileRoot(targetCwd);

  let movedPath: string | null = null;
  try {
    await manager.moveTo(targetCwd);
    await manager.flush();
    movedPath = manager.getSessionFile() ?? null;
    if (!movedPath) throw new Error("OMP moved the Session but did not report its file path");
  } catch (error) {
    try {
      await manager.rollbackMove(snapshot);
    } catch (rollbackError) {
      const actualPath = manager.getSessionFile() ?? sourcePath;
      await existingWrapper?.shutdown();
      await dependencies.startSession(realSessionId, actualPath, { toolNames });
      throw new SessionRelocationError(
        `Workspace move failed and rollback could not restore the source. The active Session is at ${actualPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        500,
      );
    }
    throw error;
  }

  dependencies.cacheSessionPath(realSessionId, movedPath);
  dependencies.invalidateSessionList();
  await existingWrapper?.shutdown();

  let replacement;
  try {
    replacement = await dependencies.startSession(realSessionId, movedPath, { toolNames });
  } catch (firstError) {
    try {
      replacement = await dependencies.startSession(realSessionId, movedPath, { toolNames });
    } catch (retryError) {
      try {
        await manager.rollbackMove(snapshot);
        dependencies.cacheSessionPath(realSessionId, sourcePath);
        replacement = await dependencies.startSession(realSessionId, sourcePath, { toolNames });
        dependencies.invalidateSessionList();
        throw new SessionRelocationError(
          `Reeve could not reload the moved Session, so it restored the source workspace: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          500,
        );
      } catch (rollbackError) {
        if (rollbackError instanceof SessionRelocationError) throw rollbackError;
        const actualPath = manager.getSessionFile() ?? movedPath;
        await dependencies.startSession(realSessionId, actualPath, { toolNames });
        throw new SessionRelocationError(
          `The Session remains readable at ${actualPath}, but Reeve could not restore the source workspace: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          500,
        );
      }
    }
    void firstError;
  }

  const project = await dependencies.resolveProject(targetCwd);
  dependencies.allowFileRoot(project.projectRoot);
  dependencies.cacheSessionPath(replacement.realSessionId, movedPath);
  dependencies.invalidateSessionList();

  return {
    sessionId: replacement.realSessionId,
    sessionFile: movedPath,
    cwd: targetCwd,
    projectRoot: project.projectRoot,
    trust: dependencies.getTrustStatus(targetCwd, dependencies.agentDir),
  };
}

export async function relocateSession(
  request: { sessionId: string; targetCwd: string },
  overrides: Partial<RelocationDependencies> = {},
): Promise<SessionRelocationResult> {
  const dependencies = Object.keys(overrides).length > 0
    ? overrides as RelocationDependencies
    : await getProductionDependencies();
  const sessionId = request.sessionId.trim();
  if (!sessionId) throw new SessionRelocationError("Session id is required", 400);

  const targetCwd = dependencies.canonicalizePath(request.targetCwd.trim());
  await assertTargetAllowed(targetCwd, dependencies);

  const locks = relocationLocks();
  const active = locks.get(sessionId);
  if (active) {
    if (active.targetCwd !== targetCwd) {
      throw new SessionRelocationError("Another workspace move is already in progress for this Session", 409);
    }
    return active.promise;
  }

  const entry: ActiveRelocation = {
    targetCwd,
    promise: performRelocation(sessionId, targetCwd, dependencies),
  };
  locks.set(sessionId, entry);
  try {
    return await entry.promise;
  } finally {
    if (locks.get(sessionId) === entry) locks.delete(sessionId);
  }
}
