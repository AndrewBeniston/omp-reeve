# Spec: gate 2 defects and grill decisions

Tracker: local markdown under `.scratch/`. The repo has no `docs/agents/issue-tracker.md` yet. Run `setup-matt-pocock-skills` later and move these files.

Status: ready-for-agent

## Problem Statement

Andrew uses OMP-Web as his daily desktop for the omp agent. After the Codex-quality redesign, eight small things are still wrong or undecided. A file viewer button shows a missing translation key. The settings dialog chrome is in monospace. The page body still names the system font before Autospawn Sans loads. The light-mode `New` button is a dark pill on a light sidebar. The composer footer does not match the Codex groups and has no place for a future mic. The completion sound toggle hides in a menu that only exists after the first reply. The update button installs the upstream package over his fork. The chat gutter is a flat `16px` at every width, while Codex has two states.

## Solution

Fix each defect with a test first. Record each grill decision as code: the Codex footer groups with a hidden Dictate control, the completion sound row in the OMP Interaction tab, self-update off by default in the fork, and a two-state chat gutter driven by the transcript scrollbar gutter.

## User Stories

1. As a reader of a file in the viewer, I want the copy button to say "Copy", so that I know what it does.
2. As a settings user, I want the dialog nav, search, and Close in Autospawn Sans, so that the chrome matches the rest of the app.
3. As a settings user, I want paths and code values to stay monospace, so that I can read them exactly.
4. As any user, I want the page body to use Autospawn Sans with the system stack as fallback only, so that no surface shows the wrong face.
5. As a light-theme user, I want the sidebar `New` button to sit quietly on the sidebar surface, so that it does not read as a dark pill.
6. As a light-theme user, I want the `New` button to show a hover wash, so that I know it is a control.
7. As a composer user, I want the footer groups in the Codex order, so that the layout matches the app I compare against.
8. As a future dictation user, I want a Dictate control already in the DOM at the Codex position, hidden, so that a dictation path can turn it on without a layout change.
9. As a keyboard or screen reader user, I want the hidden Dictate control out of the tab order and the accessibility tree, so that it does not confuse me while it does nothing.
10. As a new-session user, I want the completion sound toggle reachable before the first reply, so that I can set it on a new session.
11. As an OMP user, I want the completion sound row beside OMP's own Completion Notification in the Interaction tab, so that all completion settings sit together.
12. As a composer user, I want the Session menu to hold only session facts and Compact, so that a preference does not sit in a chat control.
13. As the owner of a fork, I want self-update off by default, so that the update button never installs the upstream package over my build.
14. As the owner of a fork, I want the update indicator to still show the manual command, so that I can see the upstream version without a risk.
15. As an operator, I want to turn self-update on with one environment variable, so that the default is a default and not a lock.
16. As a wide-window reader, I want the chat text to share the composer's edges, so that the column reads as one.
17. As a narrow-window reader, I want the chat text to sit `15px` inside the composer on each side, so that the scrollbar gutter does not push text against the composer edge.
18. As a maintainer, I want one token to name the scrollbar gutter, so that both states come from one number.
19. As a maintainer, I want a test for each of the eight changes, so that a future refactor cannot undo a decision silently.
20. As a maintainer, I want the OMP settings API to carry web-only fields in a named tab and group, so that the browser can add rows beside OMP's own without a second settings store.

## Implementation Decisions

- FileViewer uses the existing `i18n.copy` key. The missing `i18n.copyContent` key is not added.
- The settings dialog module sets the sans face on the nav, the search field, and the Close control. Monospace stays on value cells, path cells, and code samples only.
- The page body font stack becomes `var(--font-sans)`, which already lists Autospawn Sans first and the system stack after it.
- The sidebar `New` button is a ghost control: no fill and no border at rest, `--ui-row-hover` on hover, `--ui-text-muted` text. This follows the header action rule in DESIGN.md 7.3.
- The composer footer keeps two groups. Left: Attach, Mode pill, gap `5px`. Right: a model area with the context donut and the model pill at gap `4px`, then a trailing cluster with Dictate and Send at gap `8px`. The right group justifies to the end. The mobile branch keeps its collapse and the `more` control.
- Dictate is a `28px` round ghost control with a `16px` microphone icon and `aria-label` from a new i18n key. It carries the `hidden` attribute unless a `dictationAvailable` prop is true. No caller passes that prop in this release.
- The completion sound leaves the Session menu. The settings API adds a web-only boolean field with tab `interaction`, group `Notifications`, and a path that does not collide with OMP's schema. The dialog renders it beside OMP's own Notifications rows. Its value is the existing browser preference under `omp-sound-enabled`, owned by the audio hook, so the API field is a view onto that preference, not a second store. The Settings dialog toggles it through the same hook the Session menu used.
- The launcher sets `OMP_WEB_DISABLE_SELF_UPDATE` to `1` in the server environment unless the caller sets it. The update plan then reports `canInstall: false` with reason `disabled` and the indicator shows the manual command only. The existing environment override stays.
- The chat gutter: `--thread-content-inset` becomes the transcript scrollbar gutter, `15px`, and applies only when the pane is narrower than the shared column maximum. In a wide pane the transcript column and the composer share edges. The transcript pane reserves the gutter on both edges. The composer sits outside the scroller. See DESIGN.md 6.1 for the measured Codex values.
- Version stays `0.3.0` in this spec. It becomes `0.4.1` after the merge in gate 8.

## Testing Decisions

- A good test asserts what a user or a reader of the CSS can observe: a rendered label, a DOM order, an attribute, a computed rule in the module file, an environment key in the spawned command. It does not assert internal state names.
- Modules under test: FileViewer, SettingsConfig, the global stylesheet, SessionSidebar navigation styles, ComposerFrame and ChatInput, the settings API route, the launcher, the update plan, the token sheet and the chat window styles.
- Prior art: `ComposerFrame.test.mjs` reads a module CSS file and asserts a rule. `ChatInput.menu.test.mjs` renders the menus. `MobilePwaLayout.test.mjs` and `composer-clearance.test.mjs` assert CSS rules by regex. `lib/omp-updates.test.mjs` asserts the install plan. `components/SettingsConfig.test.mjs` renders the dialog.
- Every ticket writes its failing test first, makes it pass, then runs `bun run typecheck` and the touched test files. The full `bun test` runs once per ticket at the end.

## Out of Scope

- The Codex Settings page layout: left nav in groups, search, cards. Second stage, see ADR-0003.
- A real dictation path.
- The fork's own update card and release feed. See DESIGN.md 15.1.
- The version bump to `0.4.1` and the upstream merge. Gate 8.
- Session archive from upstream `v0.4.0`.

## Further Notes

- Bun only. Never `bun run build` in the main worktree. Never Node.
- Autospawn Sans only. Inter is forbidden.
- No inline styles. Tier 2 tokens only. No colour literal in a module.
- No `Co-Authored-By` line. Agents do not commit. The orchestrator commits per ticket after review.
- The orchestrator runs `code-review` at gate 4 and both Thermos reviews at gate 5. Agents do not run them.

