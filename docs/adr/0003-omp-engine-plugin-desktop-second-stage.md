# Keep the OMP engine and plan a plugin-based desktop as a second stage

Andrew asked on 2026-09-01 whether omp-web is a good foundation, whether
DeepSeek Harness is a better one, and whether a fresh build on the Codex desktop
look would run better in the end. This record holds the answer and the plan.

## Decision

1. The OMP SDK stays the engine. No other harness replaces it.
2. This branch, `codex/codex-interface-redesign`, finishes and releases as is.
   It is the working desktop until the second stage ships.
3. A second-stage desktop starts in a new repository after that release. It is
   built as a set of feature plugins on a slot system, styled to the Codex
   desktop app, and driven by the OMP engine.
4. After the release, this repository stops merging upstream `omp-web`. Runtime
   fixes may still be cherry-picked. The name and version diverge.

## Evidence gathered on 2026-09-01

omp-web at `8dba814`: 30,851 lines of UI, 15,578 lines of runtime, 46 API
routes, 135 test files, 938 passing tests, zero `any` casts, zero TODO markers.
The four largest files are `components/ChatInput.tsx` (2,331 lines),
`hooks/useAgentSession.ts` (2,243), `components/SessionSidebar.tsx` (1,875), and
`components/AppShell.tsx` (1,276, with 11 state hooks and 10 effects). Every
interface change on this branch touched one of those four files.

DeepSeek Harness at `4e84901`, version `0.1.2-alpha.4`, MIT: 3,116 TypeScript
files, 46 packages with one job each, 821 test files, 12 `any` casts in client
and core. The web client is 40 feature plugins that fill declared slots. The slot
core is four packages, about 5,500 lines: `ui-slots` (1,466, no dependencies),
`ui-renderer` (1,920), `store` (394), `modules` (1,760), on the vendored Cordis
plugin runtime. Its default font stack is the system stack. Its browser talks to
its host over its own RPC protocol.

## Considered options

**Continue omp-web only.** Rejected as the long-term base. The runtime is sound
and tested. The UI shape taxes every change and gives extensions no place to
plug in.

**Adopt DeepSeek Harness.** Rejected. Its architecture is better on every design
axis. But it is a complete harness with its own engine, and adopting it means
dropping OMP. It is also alpha and moves weekly.

**Fresh UI on the Codex look with a rewritten runtime.** Rejected. It repeats
15,000 lines of runtime where the defects live.

**Fresh plugin-based UI, OMP engine, omp-web runtime as a library, DeepSeek slot
core vendored.** Accepted. See below.

## The second-stage design

- Engine: the OMP SDK, wrapped by the omp-web runtime moved across as a library.
  `lib/`, `app/api/`, and `hooks/useAgentSession.ts` are the seed.
- Framework: the DeepSeek slot core and Cordis, taken as MIT code with the notice
  kept, pinned to one commit, treated as vendored. Updated on purpose, rarely.
- Look: Codex desktop geometry, tokens, shadows, and Autospawn Sans from day one,
  measured from the app and recorded in `DESIGN.md`, never remembered.
- Method: one plugin per feature, built in DeepSeek's own order. Layout, theme,
  sidebar, workspace, conversation, chat, composer, approvals, tools, subagents,
  settings. Each plugin is one ticket with one write set and its own tests.
- OMP tracking: the OMP CLI gains features through its open-source community.
  Each new OMP capability lands in the desktop as a new plugin or a new slot
  entry, not as an edit to a shared shell. OMP extensions, custom panels, and
  widgets map onto slots.
- Audience: other people. That means a public licence, a stable plugin contract,
  release notes, and no private path or session in any evidence.

## Consequences

The plugin framework costs more up front than one app. The win arrives with
growth, not with the first feature. The first rendering plugin, the layout, is
expected to take two to three weeks. That estimate is a guess.

The DeepSeek slot core is alpha. Vendoring it at one commit removes the churn
and accepts the maintenance.

This record does not start the second stage. The release of this branch does.
