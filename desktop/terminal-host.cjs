/* eslint-disable @typescript-eslint/no-require-imports */
const { homedir } = require("node:os");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { join, resolve } = require("node:path");

/**
 * The Terminal tab's half that lives in the desktop process.
 *
 * A pty is a real shell on the human's machine, so every decision about
 * whether to open one, where, and with which environment is made here rather
 * than in the renderer. The renderer asks; it is never believed. It names a
 * Project directory and this module decides, reading omp's own trust store
 * from disk, because a renderer that had been taken over could otherwise claim
 * any directory was trusted.
 *
 * The planning half is pure and separately testable: `planTerminalSpawn`
 * turns facts into a decision and never touches the process table.
 */

/**
 * Environment variables Reeve sets for its own launch, which a human's shell
 * must never inherit.
 *
 * `OMP_WEB_DESKTOP_TOKEN` is the secret the Electron shell and the Bun server
 * prove themselves to each other with. A shell that inherited it would print it
 * to anyone who typed `env`, and any program the human ran would receive it.
 * The rest describe a packaged layout that is wrong for an ordinary command.
 *
 * The prefix rule matters more than the list: a launch variable added later is
 * scrubbed without anyone remembering to come back here.
 */
const REEVE_ENV_PREFIXES = ["OMP_WEB_"];

/**
 * Variables Electron and its launcher set for the shell process itself.
 *
 * `ELECTRON_RUN_AS_NODE` is the dangerous one: inherited, it changes what the
 * Electron binary does, and a child that re-executed it would get a bare Node
 * instead of the application. `NODE_OPTIONS` can carry a `--require`, which
 * would inject a module into every Node process the human started.
 */
const ELECTRON_ENV_VARIABLES = [
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ELECTRON_NO_ASAR",
  "ELECTRON_FORCE_IS_PACKAGED",
  "ELECTRON_IS_DEV",
  "NODE_OPTIONS",
  "GDK_BACKEND",
];

/**
 * The environment a human's shell should start with.
 *
 * Everything Reeve added for its own launch is removed, and the two variables
 * that tell a program it is talking to a terminal are set, because a pty with
 * no `TERM` makes editors and pagers fall back to their dumbest mode.
 */
function scrubTerminalEnvironment(env) {
  const scrubbed = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (ELECTRON_ENV_VARIABLES.includes(name)) continue;
    if (REEVE_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    scrubbed[name] = value;
  }
  scrubbed.TERM = "xterm-256color";
  scrubbed.COLORTERM = "truecolor";
  return scrubbed;
}

/**
 * The shell the human already uses, and the arguments that make it a login
 * shell.
 *
 * A login shell reads the human's own profile, so the terminal in the panel has
 * the same aliases, path and prompt as the one in their dock. Windows has no
 * `SHELL`, and `COMSPEC` is what every Windows program reads instead.
 */
function resolveLoginShell(platform, env) {
  if (platform === "win32") {
    return { shell: env.COMSPEC || "cmd.exe", args: [] };
  }
  const shell = env.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  return { shell, args: ["-l"] };
}

/** Where omp keeps its agent state, mirroring `bin/web-auth-store.js`. */
function resolveAgentDir(env) {
  if (env.PI_CODING_AGENT_DIR) return resolve(env.PI_CODING_AGENT_DIR);
  const configRoot = join(homedir(), env.PI_CONFIG_DIR || ".omp");
  const raw = env.OMP_PROFILE !== undefined ? env.OMP_PROFILE : env.PI_PROFILE;
  const profile = typeof raw === "string" ? raw.trim() : "";
  return profile && profile !== "default"
    ? join(configRoot, "profiles", profile, "agent")
    : join(configRoot, "agent");
}

/**
 * Project-relative paths whose presence means the Project ships code omp would
 * run. Kept in step with `lib/project-trust.ts`, which is the definition; this
 * is the desktop process reaching the same verdict without importing the server.
 */
const CODE_BEARING_PROJECT_PATHS = [
  ".omp/extensions", ".omp/hooks", ".omp/tools",
  ".pi/extensions", ".pi/hooks", ".pi/tools",
  ".claude/extensions", ".claude/hooks", ".claude/tools",
  ".agents/extensions", ".agents/hooks", ".agents/tools",
  ".mcp.json",
  ".omp/.mcp.json", ".omp/mcp.json",
  ".claude/.mcp.json", ".claude/mcp.json",
  ".cursor/mcp.json",
];

/**
 * Read the Project's trust state from disk.
 *
 * The renderer knows this answer too and shows it, but the renderer's copy is a
 * display, not a permission. This is the copy the shell is opened against.
 */
function readProjectTrust(cwd, env = process.env) {
  if (!cwd) return { requiresTrust: false, trusted: true };

  const requiresTrust = CODE_BEARING_PROJECT_PATHS.some((entry) => existsSync(join(cwd, entry)));
  if (!requiresTrust) return { requiresTrust: false, trusted: true };

  let key = resolve(cwd);
  try {
    key = realpathSync(key);
  } catch {
    // A directory that cannot be resolved cannot match a trusted key either,
    // so the unresolved path is used and the Project reads as untrusted.
  }

  try {
    const file = join(resolveAgentDir(env), "omp-web-trusted-projects.json");
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { requiresTrust: true, trusted: parsed?.[key] === true };
  } catch {
    // No store, or one that cannot be read. Neither is a grant of trust.
    return { requiresTrust: true, trusted: false };
  }
}

/**
 * Decide whether a Terminal may open, and with what.
 *
 * Pure: every fact arrives as an argument. Returns the whole spawn description
 * on success, or a refusal naming the reason, which the renderer shows.
 */
function planTerminalSpawn({ cwd, trust, platform, env }) {
  if (!cwd) return { ok: false, reason: "no-project" };
  if (trust.requiresTrust && !trust.trusted) return { ok: false, reason: "untrusted-project" };

  const { shell, args } = resolveLoginShell(platform, env);
  return { ok: true, shell, args, cwd, env: scrubTerminalEnvironment(env) };
}

/**
 * The pty binding, or the reason it could not be loaded.
 *
 * It is native, and it is loaded on first use rather than at startup on
 * purpose: a binding built against the wrong ABI throws on require, and that
 * must cost the human a Terminal, not the whole application. The answer is
 * cached either way, so a broken build is not re-thrown on every keystroke.
 */
let ptyModule;
function loadPty(require_ = require) {
  if (ptyModule === undefined) {
    try {
      ptyModule = { ok: true, pty: require_("node-pty") };
    } catch (error) {
      ptyModule = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return ptyModule;
}

/**
 * Every live pty, and the rules about who may speak to one.
 *
 * A Terminal belongs to the renderer that opened it. The id is minted here and
 * never by the renderer, and every later call is checked against the opener, so
 * one window cannot read or type into another window's shell.
 *
 * `spawn` is injected so the registry can be exercised without a real pty.
 */
function createTerminalRegistry({ spawn, mintId }) {
  /** id -> { pty, ownerId, cwd } */
  const sessions = new Map();

  function get(id, ownerId) {
    const session = sessions.get(id);
    if (!session || session.ownerId !== ownerId) return undefined;
    return session;
  }

  /**
   * Forget a shell and end it.
   *
   * The kill can throw when the shell has already exited on its own, which is a
   * race nobody can avoid: the human types exit at the same moment the Tab
   * closes. It is forgotten either way.
   */
  function end(id, session) {
    sessions.delete(id);
    try {
      session.pty.kill();
    } catch {
      // Already gone.
    }
  }

  return {
    /**
     * Start a shell for a Project, or return the reason there will not be one.
     *
     * `onData` and `onExit` are called with this Terminal's id. The caller
     * sends them to the owning renderer; the registry does not know what a
     * window is.
     */
    open({ cwd, ownerId, platform, env, cols, rows, onData, onExit }) {
      const plan = planTerminalSpawn({ cwd, trust: readProjectTrust(cwd, env), platform, env });
      if (!plan.ok) return plan;

      let pty;
      try {
        pty = spawn(plan.shell, plan.args, {
          name: "xterm-256color",
          cwd: plan.cwd,
          env: plan.env,
          // A shell asked for no size draws its prompt at 80x24 and rewraps the
          // moment the real size arrives. The renderer measures first and sends
          // the size it already has.
          cols: cols && cols > 0 ? cols : 80,
          rows: rows && rows > 0 ? rows : 24,
        });
      } catch (error) {
        return { ok: false, reason: "spawn-failed", detail: error instanceof Error ? error.message : String(error) };
      }

      const id = mintId();
      sessions.set(id, { pty, ownerId, cwd: plan.cwd });

      pty.onData((data) => onData(id, data));
      pty.onExit(({ exitCode }) => {
        sessions.delete(id);
        onExit(id, exitCode);
      });

      return { ok: true, id, shell: plan.shell, cwd: plan.cwd };
    },

    /** The human typed. Control characters included: this is a shell. */
    write(id, ownerId, data) {
      const session = get(id, ownerId);
      if (!session || typeof data !== "string") return false;
      session.pty.write(data);
      return true;
    },

    /**
     * The panel changed size, so the shell must be told.
     *
     * A shell that is not told keeps wrapping to the old width, which is what
     * makes a resized terminal look corrupted.
     */
    resize(id, ownerId, cols, rows) {
      const session = get(id, ownerId);
      if (!session) return false;
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return false;
      try {
        session.pty.resize(cols, rows);
      } catch {
        // The shell exited between the measurement and this call. Its exit
        // event has already removed it; there is nothing to correct.
        return false;
      }
      return true;
    },

    /** The Tab closed, so the shell ends with it. */
    close(id, ownerId) {
      const session = get(id, ownerId);
      if (!session) return false;
      end(id, session);
      return true;
    },

    /**
     * End every shell a renderer owns.
     *
     * Called when its window closes and when the application quits: a pty
     * outlives the process that spawned it unless it is killed, and an orphaned
     * login shell would sit there holding the Project directory open.
     */
    closeAllFor(ownerId) {
      for (const [id, session] of sessions) {
        if (session.ownerId === ownerId) end(id, session);
      }
    },

    /** How many shells are live. For the tests and for shutdown checks. */
    get size() {
      return sessions.size;
    },
  };
}

module.exports = {
  ELECTRON_ENV_VARIABLES,
  REEVE_ENV_PREFIXES,
  createTerminalRegistry,
  loadPty,
  planTerminalSpawn,
  readProjectTrust,
  resolveAgentDir,
  resolveLoginShell,
  scrubTerminalEnvironment,
};
