# Reeve Development Notes

## Public repository

This repository is public. Every change is visible to anyone.

- Never commit a secret, a personal path, a private note, or an extract from another vendor's application bundle.
- Issues, pull requests, comments, and commit messages are public too. Write them for a stranger. Name no machine, host, IP address, user account, home path, Apple team, or private service. Say "a Windows machine", "the Linux build machine", "the maintainer's Mac". Private detail that an agent needs goes in `RELEASING.md` as a role, never as an identity, or stays in the chat.
- Before you file or edit an issue, read it once as an outsider. If it tells someone where a machine is or who owns it, rewrite it.
- Every user-visible change adds an entry under `## [Unreleased]` in `CHANGELOG.md` in the same pull request.
- Releases follow `RELEASING.md`. Only `bun run release` writes a version number or a tag.
- Packages are built on Andrew's own machines and uploaded with `gh release`. The GitHub workflow is a paid manual fallback. Never start it without Andrew's approval for that run.
- Work is tracked in GitHub issues. There is no local ticket folder.
- More than one agent works in this repository. Before you start a ticket, read the open pull requests and their changed files. Two agents fixed the same issue two different ways on 2026-09-11, and the merge kept both.
- Write user-facing text and docs in plain, short sentences.

## Agent skills

### Skill set

The repository carries Matt Pocock's 37 skills in `.agents/skills`. A clone gets
them. There is no install step. They are MIT licensed, and the notice is in
`.agents/skills/LICENSE`. `skills-lock.json` records the source of each one.
See `.agents/skills/README.md` to update them.

### Issue tracker

Issues live as GitHub issues in this repository. Use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context. `CONTEXT.md` holds the vocabulary. `docs/adr/` holds the decisions.
Read the ADRs that touch the area you are about to change, before you change it.
A decision you contradict costs a rewrite. See `docs/agents/domain.md`.

## Quick Start

```bash
bun install
bun run dev   # port 30141
```

Typecheck: `bun run typecheck`
Lint: `bun run lint`
Tests: `bun test`
**Never run `bun run build` during development**. It pollutes `.next/` and breaks `bun run dev`.
`bun run desktop:build` is safe. It builds into `desktop/server/.next` through `OMP_WEB_DIST_DIR`.

### Install Reeve globally

The global `reeve` command must run this private repository.
The public `omp-web` package remains the upstream author's build.

1. Build in a separate worktree with `OMP_WEB_DIST_DIR` set, never in the main worktree.
2. `bun pm pack` in that worktree writes `omp-reeve-<version>.tgz`.
3. `bun add --global ./omp-reeve-<version>.tgz`.
4. `reeve --version` must print the repository version.

Self-update is unavailable until Reeve owns a release feed.
The retired upstream updater and its indicator are removed.
See `DESIGN.md` 15.1.

### The agent server runs on Bun

`@oh-my-pi/pi-*` is published as **TypeScript sources** and imports `bun:sqlite`,
so Node cannot load it at all (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
The Reeve server runs only on Bun. `bin/omp-web.js` finds Bun and starts `next` through it.
Electron runs only the desktop shell. Never import the OMP SDK into the Electron process.

Two consequences worth remembering:

- `next.config.ts` externalizes **every** `@oh-my-pi/*` request as an ESM
  `import`, not `commonjs`. The SDK's `exports` map declares only an `import`
  condition, so a `require()` of it cannot resolve — that is what
  "Cannot find module '@oh-my-pi/pi-coding-agent'" during *Collecting page data*
  means. `serverExternalPackages` alone is not sufficient: it misses the SDK's
  own transitive entry points.
- `bun test`, not `node --test`. The test files are `node:test`-based and Bun
  runs them; Node cannot import the SDK the tests exercise.
- A test that needs a fresh copy of a module must pass `tryNative: false` to
  jiti as well as `moduleCache: false`. The native path hands the import to
  Bun's loader, which caches by file URL and returns the instance another test
  file already used. `hooks/useTheme.test.mjs` is the example.

---

## Architecture

```
Browser                Next.js Server (Bun)        AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.omp/agent/sessions/  │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running ───────▶ running id snapshot   │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files through SDK helpers and
`lib/session-reader.ts` — no AgentSession created.
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an
AgentSession in-process.

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/route.ts          GET currently-running session ids
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/omp-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  model-roles/route.ts            GET/PUT omp's modelRoles record
  models/route.ts                 GET { models, modelList, defaultModel, roles }
  models-config/route.ts          GET/PUT — read/write ~/.omp/agent/models.yml
  models-config/catalog/route.ts  GET models.dev pricing presets
  models-config/discover/route.ts POST fetch a configured provider's upstream model list
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST omp plugin management
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  web-access/route.ts             GET/PUT the password lock (settings -> Access)
  web-access/recovery/route.ts    POST recovery code request/redeem (unauthenticated)
  worktrees/route.ts              GET/POST/DELETE git worktrees

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  model-roles.ts       omp's model roles, read/written for the browser
  model-scope.ts       enabledModels resolution shared by UI and startup
  npx.ts               npx runner used by skill install
  omp-runtime.ts       shared Settings + AuthStorage + ModelRegistry
  omp-types.ts         structural view of omp's AgentSession
  project-trust.ts     gates a project's executable resources
  rpc-manager.ts       AgentSessionWrapper + registry + startRpcSession
  session-reader.ts    session listing + path cache + buildSessionContext adapter
  session-system-prompt.ts  SYSTEM.md / APPEND_SYSTEM.md resolution per session cwd
  session-title.ts     thin wrapper over omp's own title generator
  tool-presets.ts      PRESET_NONE/DEFAULT/FULL + getPresetFromTools()
  types.ts             shared TypeScript types
  normalize.ts         normalizeToolCalls() — field name mismatch between file format and our types
  worktree.ts          project/worktree resolution and git worktree operations

components/
  AccessConfig.tsx    password lock panel inside the settings modal
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/role/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for providers/auth (opened from sidebar bottom)
  ModelRolesPanel.tsx per-role model assignment inside that modal
  PluginsConfig.tsx   modal for installed omp plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  FileExplorer.tsx    file tree inside sidebar
  FileIcons.tsx       file icon helpers
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)

desktop/
  main.cjs             Electron window and packaged server lifecycle
  preload.cjs          external-link bridge exposed to the renderer
  desktop-runtime.cjs  packaged Bun command and URL validation

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts         completion sound + browser AudioContext unlock
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__ompSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__ompStartLocks`)
- Extensions are bound with omp's own `initializeExtensions()` from
  `@oh-my-pi/pi-coding-agent/modes/runtime-init` — the same wiring `omp --mode rpc`
  uses — with a browser-backed `ExtensionUIContext` layered on top. Do not
  reimplement the action set; a mismatch shows up as extensions silently doing
  nothing.

### One runtime, many requests (`lib/omp-runtime.ts`)
omp's CLI builds `Settings` + `AuthStorage` + `ModelRegistry` once per process.
Reeve does the same and caches them on `globalThis`; a second `AuthStorage`
would open a second SQLite handle on `~/.omp/agent/agent.db` and split
`credential_disabled` events. Per-project settings come from
`settings.cloneForCwd(cwd)`, never from a second `Settings.init()`.

Anything that mutates credentials or `models.yml` must call
`invalidateOmpRuntime()` as well as `invalidateModelsCache()`.

### Model roles are the model selector
omp assigns a model per scope of work (`default`, `smol`, `slow`, `vision`,
`plan`, `designer`, `commit`, `tiny`, `task`, `advisor`), stored in the
`modelRoles` record in `config.yml`. `lib/model-roles.ts` reads and writes that
record; `GET /api/models` ships the resolved table so `ChatInput` can list roles
above the flat model list, and `set_role_model` switches the session **and
records the role** so the transcript matches what `/model` writes in the TUI.

An explicit model pick in the browser is persisted as `modelRoles.default`
(`lib/startup-preferences.ts`), which is the same slot the TUI writes.

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (omp does this itself during migrations). Used when cascade-reparenting children on delete.

### `SessionManager.open()` is async
Every omp `SessionManager.open()` / `forkFrom()` / `continueRecent()` returns a
Promise, and `setSessionName()` / `newSession()` / `flush()` do too. Forgetting
an `await` yields `Property 'getEntries' does not exist on type 'Promise<…>'`.

### Transcript ordering follows omp, not the LLM context
`buildSessionContext()` in `lib/session-reader.ts` mirrors omp's live-chat
transcript (`{ transcript: true, collapseCompactedHistory: true }`): history
replaced by the latest compaction is elided, and the summary renders **at the
chronological compaction point** — after the kept messages, before the
post-compaction turns. It is not the LLM context, where the summary comes first.
`entryIds` is a parallel array to `messages` and is walked locally because omp's
`buildSessionContext` does not return entry ids.

### ToolCall field normalization
omp stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `ChatWindow.handleAgentEvent()` (streaming).

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes `toolNames: []` with `restrictToolNames: true` and forces `agent.state.systemPrompt = []` after startup and reloads.

### `enabledModels` scoping
The `enabledModels` setting uses omp's `--models` syntax: globs against
`provider/modelId` or a bare `modelId`, fuzzy matching for non-glob patterns, and
an optional `:thinkingLevel` suffix. Never compare those patterns as literal
strings — `lib/model-scope.ts` delegates to the SDK's `resolveModelScope()` so
Reeve and the TUI agree on the visible model list, and falls back to all
available models when patterns resolve to nothing. Diagnostics are produced by
re-resolving each pattern alone, because omp's resolver drops unmatched patterns
silently.

### Project trust is Reeve's own
omp has no trust store — it runs a repository's extensions because you ran it
there. A browser tab is not that decision, so `lib/project-trust.ts` keeps a
store in `~/.omp/agent/omp-web-trusted-projects.json` and, for an untrusted
project, filters project-local entries out of omp's discovered extension and
custom-tool paths and disables MCP. Skills and rules are data and always load.
See `docs/project-trust.md`.

### `SYSTEM.md` / `APPEND_SYSTEM.md` are resolved per session cwd
`omp` resolves both files before it creates a session and passes them as
`customSystemPrompt` / `appendSystemPrompt`. `startRpcSession()` builds its own
options, so `lib/session-system-prompt.ts` does the same for the browser: omp's
`findConfigFile` (never a hand-rolled lookup) project-first then user-level,
`resolvePromptInput` to read it, and omp's `applyResolvedSystemPromptInputs` to
set the fields — so the text goes through the same templates the CLI renders it
with. Every lookup is bound to the session's cwd, because the CLI's default
(`getProjectDir()`) is the server's own directory here, not the project's.
Project-local prompt files load for untrusted projects too: they are data, like
skills and rules (`docs/project-trust.md`).

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer omp emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state polling + reconciliation
- The sidebar polls `/api/agent/running` every 2.5 seconds while the tab is visible and pauses polling in background tabs. The session-list response remains the initial fallback.
- `useAgentSession` treats per-session SSE as primary for chat events and opens it before each prompt. `prompt_done` completes the current UI stage and notification immediately, but the idle SSE stays open for a 30-second grace window and is reused by the next prompt. `agent_start` cancels that close timer; `agent_settled` finishes extension-injected runs that have no wrapper-level `prompt_done` and starts a fresh grace window. Do not close on the first `agent_end`: retries, compaction, and extension-queued messages can continue the same logical prompt.
- While a run is active, `useAgentSession` periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed terminal events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/omp-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Plugins and skills
- `/api/plugins` drives omp's `PluginManager` (`~/.omp/plugins`): install, uninstall, enable/disable, plus `doctor()` output as diagnostics. omp has no in-place update, so "update" reinstalls the spec with `force`.
- `/api/skills` uses omp's own `loadSkills()`, so `.omp/skills`, `~/.omp/agent/skills`, `.claude/skills`, plugin skills and `.agents/skills` are listed exactly as a session sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent claude-code`. The `skills` CLI has no `omp` agent, and its `pi` agent writes `~/.pi/agent/skills`, which omp does **not** read; the Claude layout is discovered by default.

### Auth and model config
- Credentials live in OMP's SQLite `agent.db` through `AuthStorage`, not in `auth.json`.
  Writes use `AuthStorage` so OMP and Reeve share one store and lock.
- Provider listing is capability-driven: `lib/provider-listing-runtime.ts` folds the catalog (`@oh-my-pi/pi-catalog`), the OAuth registry (`@oh-my-pi/pi-ai/oauth`) and stored credential types into the flat shape `lib/provider-listing.ts` expects, so a dual-auth provider appears exactly once. An OAuth login whose `storeCredentialsAs` differs from its id is keyed by the id the catalog uses.
- OAuth flows are streamed by `GET /api/auth/login/[provider]` through `authStorage.login()`; `onAuth`/`onPrompt`/`onManualCodeInput` become browser input requests with short-lived tokens stored in `globalThis.__ompLoginCallbacks`.
- API-key status endpoints must never return the raw key.
- `models.yml` is YAML: `/api/models-config` parses whichever of `models.yml` / `models.yaml` / `models.json` exists and always writes back `models.yml`.
- A header value in `models.yml` that names an environment variable is written as the **bare name** (`X-Token: MY_VAR`), not `$MY_VAR`.

### Password access is verified in the proxy, stored hashed, and shared with `bin/`
`bin/web-auth-store.js` is the single source of truth for the password lock, and
it is CommonJS in `bin/` on purpose: the launcher needs it before Bun is even
resolved, and `bin/` is the only directory (besides `.next`) in the published
npm `files` list, so `lib/` cannot hold it. `bin/web-auth-store.d.ts` is what the
TypeScript half type-checks against — keep the two in sync.

- The password is stored **only** as a scrypt digest in
  `<agentDir>/omp-web-auth.json` (`0600`, atomic replace). Nothing can read it
  back, which is why `/recover` and `--reset-password` exist.
- `proxy.ts` runs on Next.js 16's Node.js runtime (proxy always does), so
  `node:fs` and `node:crypto` are available there. Do **not** import the omp SDK
  into it — `next.config.ts` only externalizes `@oh-my-pi/*` for the server
  build, and the SDK cannot be bundled. That is why the store re-derives the
  agent directory instead of calling `getAgentDir()`.
- `resolveWebAuthPolicy()` distinguishes a missing credential file (unlocked)
  from an unreadable one (`unavailable` -> 503). Never collapse those: the
  second one failing open would silently unlock the server.
- Successful verifications are cached for five minutes keyed by the digest that
  accepted them, because scrypt runs on every request otherwise. The key
  includes the digest, so a password change invalidates the cache across
  bundles.
- `/recover` and `POST /api/web-access/recovery` are the only unauthenticated
  paths. They still go through the host allow-list and cross-site checks, and
  the recovery code is printed on the server's stdout, never returned in the
  response.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `omp-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to omp's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

### HTTP proxying
Bun's `fetch` reads `HTTP_PROXY` / `HTTPS_PROXY` **once at process start** and
never proxies loopback — which is what local providers need. It ignores
`NO_PROXY`. `lib/http-dispatcher.ts` is therefore a no-op under Bun; its undici
`EnvHttpProxyAgent` path only exists for a dev server run on Node, because Bun
resolves `undici` to its own shim where `setGlobalDispatcher` does not affect
`fetch` and `install` does not exist.

### Desktop shell

Electron owns the application window. The packaged Bun runtime owns the Next.js server and every OMP SDK import.
Keep `contextIsolation`, renderer sandboxing, and disabled renderer Node access enabled.
Package output belongs under `desktop/dist`. The staged server belongs under `desktop/server`.
One Electron instance owns the stable `127.0.0.1:30142` production origin.
The launcher copies `.next` into versioned application data before startup.
Next writes runtime caches there. Never run Next against the signed application resources.
`desktop/targets.json` owns every supported desktop target.
Packaging accepts only a stage with a matching completion manifest.
Electron sends a fresh `X-OMP-Desktop-Challenge` before loading its stable origin.
The Bun server returns `HMAC-SHA256(OMP_WEB_DESKTOP_TOKEN, challenge)` through `X-OMP-Desktop-Proof`.
Never send `OMP_WEB_DESKTOP_TOKEN` in a request. A process occupying the port could echo it.
Release publication waits for every platform package and verification job.

### Disk space

Run `bun run clean` after a desktop build, and before you switch target or branch.
A build leaves about 2.6 GB under `desktop/dist` and `desktop/server`, and nothing removes the previous one.
A failed build leaves the same weight behind, so clean after a failure too.
`bun run clean --dry-run` reports the size and removes nothing.
`bun run clean --deps` also removes both `node_modules` trees. Reach for it only when an install is broken.
Never remove `~/.bun/install/cache` or the Electron cache. Every repository on the machine shares them.
See `docs/disk-space.md` for what each directory holds and what a release machine keeps.

## omp Session File Format

Location: `~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"model":"anthropic/claude-sonnet-5","role":"default","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`model_change` carries a `provider/modelId` string plus the **role** it came
from; `SessionContext.models` is a role → selector record, and `models.default`
is what the UI shows as the session's model.

---

## CSS Variables (`app/globals.css`)

Configured themes come from omp's theme files. `titanium` and `light` are the defaults.

Theme, token, or syntax-colour changes must preserve the 26-variable Tier 1
adapter contract in `DESIGN.md` section 4.1.

`--font-mono` is a system stack on purpose: a local-first tool must not fetch a
font from a CDN at build or at runtime.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **omp-reeve** (8350 symbols, 17241 relationships, 339 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/omp-reeve/context` | Codebase overview, check index freshness |
| `gitnexus://repo/omp-reeve/clusters` | All functional areas |
| `gitnexus://repo/omp-reeve/processes` | All execution flows |
| `gitnexus://repo/omp-reeve/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
