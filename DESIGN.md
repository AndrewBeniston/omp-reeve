# OMP-Web Interface Redesign Specification

## 1. Outcome

This specification defines a semantic component architecture for the OMP-Web redesign.

Candidate B provides the architecture foundation.
Candidate A provides the safe migration sequence.
Candidate C provides transcript, composer, streaming, and motion rules.
Candidate D provides Andrew's acceptance lens.

The implementation must preserve every OMP behavior.
The implementation must not change API contracts, session files, or security boundaries.

## 2. Evidence and provenance

### 2.1 Verified source inputs

The following sources were inspected for this specification:

- `AGENTS.md` and `CLAUDE.md` at commit `29d08f4`.
- All four files in `/tmp/omp-web-design-candidates/`.
- `/tmp/omp-web-deepseek-reference/report.md`.
- `/tmp/omp-web-font-audit/report.md`.
- The current OMP-Web source at commit `29d08f4`.
- The Codex reference screenshots and raw measurement files.
- The shipped Codex stylesheet at `/tmp/codex-css/app-BY4JAmsE.css`.
- The existing safe OMP-Web evidence files.

The requested `/tmp/omp-web-codex-reference/audit.md` was absent.
The verified values below come from the supplied JSON measurements and screenshots.

### 2.2 Verified Codex desktop values

| Property | Verified value | Evidence |
|---|---:|---|
| Measurement viewport | `2056px × 1225px` | `detailed_measurements.json` |
| Window canvas | `#141414` | `detailed_measurements.json` |
| Main surface | `#181818` | `detailed_measurements.json` |
| Primary text | `#dfdfdf` | `detailed_measurements.json` |
| Base type | `16px / 24px` | `detailed_measurements.json` |
| Header height | `46px` | `detailed_measurements.json` |
| Header border | `1px rgba(255,255,255,0.082)` | `detailed_measurements.json` |
| Sidebar width | `275px` default | `--spacing-token-sidebar` in `/tmp/codex-css/app-BY4JAmsE.css` |
| Sidebar surface | `rgba(40,40,40,0.70)` | `detailed_measurements.json` |
| Sidebar top inset | `46px` | `detailed_measurements.json` |
| Navigation row height | `30px` | Scoped sidebar tokens in `/tmp/codex-css/app-BY4JAmsE.css` |
| Navigation text | `13px` | `detailed_measurements.json` |
| Sidebar task row radius | `12.5px` | current shipped bundle, re-extracted 2026-09-04 |
| Project row radius | `15px` | current shipped bundle, re-extracted 2026-09-04 |
| Navigation row padding | `5px 8px` | `detailed_measurements.json` |
| Header icon control | `24px × 24px`; Summary uses `28px × 28px` | current shipped bundle, re-extracted 2026-09-04 |
| Transcript width | `760px` in a compact pane | `dom_inspection.json` |
| Composer width | `790px` and `810px` | `dom_inspection.json` |
| Composer height | `98px` empty frame | 7.5.1 shipped CSS and screenshot measurement |
| Composer radius | `24px` | `--radius-3xl-base` in shipped CSS |
| Composer input type | `16px / 24px` | 7.5.1 screenshot measurement |
| Composer controls | `24px` ghost controls and `28px` Send or Stop | 7.5.1 screenshot measurement |

The verified composer uses separate light and dark elevation recipes.

```css
/* light */
0 0 0 1px rgba(0,0,0,0.04),
0 2px 8px 0 rgba(0,0,0,0.04),
0 4px 80px 8px rgba(0,0,0,0.024)

/* dark */
inset 0 0 1px 0 rgba(255,255,255,0.2)
```

The reference screenshot contains private chat content.
It must never enter repository evidence.

The earlier screenshot measured a `302.5px` sidebar and a `33px` navigation row.
Those values remain historical measurements from the `2056px × 1225px` rendering.
The shipped `275px` default and `30px` scoped row token supersede them as design intent.
The shipped `--radius-lg` value supersedes the earlier `12.5px` screenshot measurement.
The shipped token represents design intent across display scaling and zoom conditions.

### 2.3 Verified current OMP-Web facts

The architecture review measured the inline-style baseline. These counts are the
reference for every enforcement rule in section 12.

| Measure | Count |
|---|---|
| Files with an inline style | 23 |
| Inline style objects | 1,056 |
| CSS declarations inside them | 3,443 |
| Objects with no dynamic expression | 831 |
| Direct DOM style mutations | 164 |
| Colour literals inside inline styles | 217 |

`ModelsConfig.tsx` holds 173 objects. `ChatInput.tsx` holds 121 objects and 580
declarations, the largest declaration count. `SessionSidebar.tsx` holds 92.
`ChatWindow.tsx` holds 90. `MessageView.tsx` holds 84. `SettingsConfig.tsx` holds
9 objects in 510 lines, because it already uses a CSS module.

The current mobile breakpoint is `640px`.
The current split-panel breakpoint is `960px`.

The sidebar width persists under `omp-sidebar-width`.
The right-panel width persists under `omp-right-panel-width`.

The OMP theme endpoint supplies palette variables from the configured OMP themes.
`lib/omp-theme.ts` emits exactly 26 CSS variables for each theme.
The theme hook preserves `pi-theme`, `omp-theme`, and `omp-theme-config`.

## 3. Synthesis rationale

Candidate B supplies the architecture shape.
It replaces scattered styling with tokens, primitives, modules, and layout boundaries.
The architecture review corrected its token plan.
Candidate B hardcoded light and dark colours that no OMP theme can supply.

Candidate A supplies migration safety.
Its small phases reduce behavior risk during the architecture change.
Candidate A is not the final architecture.
A CSS-only redesign would preserve the current inline-style problem.

Candidate C supplies the conversation surface.
Its disclosure, streaming, composer, and motion rules fit OMP's agent workflow.

Candidate D supplies the acceptance lens.
The result must show calm density, immediate clarity, visible power, and careful craft.

## 4. Design decisions and exact tokens

All values in this section are design decisions.
Components must consume semantic variables only.
Components must not consume raw color values.

### 4.1 Token tiers

The system has three token tiers. The rule between the tiers is strict.

**Tier 1. The OMP adapter contract.** `lib/omp-theme.ts` emits exactly these 26
variables for each theme. `hooks/useTheme.ts` writes them onto the document root
at runtime. Implementation must not rename, replace, or drop any name.

```
--bg  --bg-panel  --bg-hover  --bg-selected  --border
--text  --text-muted  --text-dim  --accent  --accent-hover
--user-bg  --assistant-bg  --tool-bg  --bg-subtle
--success  --danger  --warning
--syntax-text  --syntax-text-muted  --syntax-accent
--syntax-success  --syntax-danger  --syntax-warning
--omp-md-heading  --omp-md-link  --omp-md-code
```

**Tier 2. Semantic tokens.** `app/tokens.css` derives every semantic colour from
Tier 1 with `color-mix`. A constant token declares a fixed value. Tier 2 never
declares a theme colour and never holds a light or dark literal.

**Tier 3. Recipes.** `lib/ui/` holds the recipes. A recipe reads Tier 2 only. A
recipe must never read a Tier 1 variable.

`lib/omp-theme.ts` remains the only Tier 1 adapter. Existing OMP themes must
continue to affect the interface. A hardcoded colour in Tier 2 breaks every
theme except `titanium` and `light`. To add a theme input, extend
`getWebThemePalette` with a
`firstColor` fallback chain, as `--omp-md-heading` does. Do not add the variable
in CSS alone.

### 4.2 Semantic color tokens

Tier 2 derives every colour from Tier 1. No Tier 2 colour holds a literal value.
The one exception is `--ui-backdrop`, which mixes against black by design.

```css
/* app/tokens.css */
--ui-canvas:           var(--bg);
--ui-main:             var(--assistant-bg);
--ui-sidebar:          color-mix(in srgb, var(--assistant-bg) 97.5%, var(--text));
--ui-surface:          var(--user-bg);
--ui-composer:         var(--user-bg);
--ui-user-bubble:      var(--user-bg);
--ui-surface-elevated: color-mix(in srgb, var(--bg-panel) 92%, var(--text));
--ui-surface-inset:    var(--tool-bg);
--ui-hover:            var(--bg-hover);
--ui-active:           var(--bg-selected);
--ui-row-hover:        color-mix(in srgb, var(--text) 5%, transparent);
--ui-row-selected:     color-mix(in srgb, var(--text) 5%, transparent);
--ui-sidebar-row-foreground: color-mix(in srgb, var(--text) 84%, var(--assistant-bg));
--ui-sidebar-label-foreground: color-mix(in srgb, var(--text) 46%, var(--assistant-bg));
--ui-scrollbar-thumb:  color-mix(in srgb, var(--text) 12%, transparent);
--ui-backdrop:         color-mix(in srgb, #000 45%, transparent);
--ui-border:           var(--border);
--ui-border-strong:    color-mix(in srgb, var(--border) 60%, var(--text));
--ui-border-subtle:    color-mix(in srgb, var(--border) 55%, transparent);
--ui-text:             var(--text);
--ui-text-muted:       var(--text-muted);
--ui-text-dim:         var(--text-dim);
--ui-accent:           var(--accent);
--ui-accent-hover:     var(--accent-hover);
--ui-accent-wash:      color-mix(in srgb, var(--accent) 12%, transparent);
--ui-success:          var(--success);
--ui-warning:          var(--warning);
--ui-danger:           var(--danger);
--ui-success-wash:     color-mix(in srgb, var(--success) 12%, transparent);
--ui-warning-wash:     color-mix(in srgb, var(--warning) 12%, transparent);
--ui-danger-wash:      color-mix(in srgb, var(--danger) 12%, transparent);
--ui-syntax-text:      var(--syntax-text);
--ui-syntax-text-muted: var(--syntax-text-muted);
--ui-syntax-accent:    var(--syntax-accent);
--ui-syntax-success:   var(--syntax-success);
--ui-syntax-danger:    var(--syntax-danger);
--ui-syntax-warning:   var(--syntax-warning);
```

Light mode uses `5%` row washes.
Dark mode overrides the row washes to `8%`.
Dark mode sets `--ui-composer` to `color-mix(in srgb, var(--assistant-bg) 88%, var(--text))`.
That places the composer one step above the sidebar's `92%` mix.
Measured from the Codex desktop app on 2026-09-02: main `#181818`, sidebar `#222222`, composer `#2a2a2a`.
The composer has no border. Its hairline comes from `--shadow-composer`.
Dark mode sets `--ui-user-bubble` to `color-mix(in srgb, var(--assistant-bg) 86%, var(--text))`.
Measured from the Codex desktop app on 2026-09-02: background `#181818`, sidebar `#222222`, composer `#2b2b2b`, user bubble `#2f2f2f`.
The order from darkest to lightest is background, sidebar, composer, user bubble. The bubble has no border.
The light sidebar mixes `2.5%` foreground into the main surface.
The dark sidebar mixes `8%` foreground into the main surface.

The wash tokens replace the 217 colour literals that section 2.3 records.
`#ef4444` becomes `var(--ui-danger)`. The OMP theme then controls the colour.

The adapter already enforces contrast. `ensureContrast` holds `--text-muted` at a
ratio of 6 and `--text-dim` at a ratio of 5. Tier 2 inherits that guarantee.
The six syntax-text tokens reach at least 4.5 against FileViewer and TerminalOutput surfaces.
The built-in CSS fallbacks derive those syntax-text tokens from the existing light and dark tokens.

### 4.3 Typography tokens

```css
--font-sans: "Autospawn Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;

--font-weight-light: 300;
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

--text-2xs: 11px;
--leading-2xs: 15px;
--text-xs: 12px;
--leading-xs: 16px;
--text-sm: 13px;
--leading-sm: 18.5px;
--text-base: 14px;
--leading-base: 22px;
--text-ui: 16px;
--leading-ui: 24px;
--text-title: 18px;
--leading-title: 26px;
```

Transcript prose uses `16px / 24px`. Composer input text uses `14px / 20px`.
Project and New chat rows use `14px / 21px`. Session rows use `13px / 18.5px`.
Small navigation labels use `12px / 16px`.
These tokens are Tier 2 constants.

### 4.4 Spacing, radius, elevation, and motion tokens

```css
--space-0-5: 2px;
--space-1: 4px;
--space-1-5: 6px;
--space-2: 8px;
--space-2-5: 10px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

--height-token-nav-row: 30px;
--height-token-row: var(--height-token-nav-row);
--padding-row-x: 8px;
--padding-row-cell-x: 8px;
--sidebar-item-icon-size: 24px;
--sidebar-item-gap: 8px;
--sidebar-footer-height: 46px;

--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
--radius-nav-row: 12.5px;
--radius-project-row: 15px;
--radius-control: 12.5px;
--radius-card: 16px;
--radius-composer: 24px;
--radius-composer-squircle: 30px;
--radius-round: 9999px;
--corner-row: superellipse(1.5);
--corner-round: round;

--duration-press: 80ms;
--duration-fast: 120ms;
--duration-enter: 160ms;
--duration-overlay: 200ms;
--duration-shimmer: 2400ms;
--ease-enter: cubic-bezier(0.19, 1, 0.22, 1);
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

--composer-frame-min-height: 98px;
--composer-footer-inset: 8px;
--composer-send-size: 28px;

/* light: the Codex --elevation-composer recipe */
--shadow-composer: 0 0 0 1px rgba(0,0,0,0.04),
  0 2px 8px 0 rgba(0,0,0,0.04),
  0 4px 80px 8px rgba(0,0,0,0.024);

/* html.dark: the Codex --elevation-composer-dark recipe */
--shadow-composer: inset 0 0 1px 0 rgba(255,255,255,0.2);
```

Sidebar task rows use `--radius-nav-row`.
Project rows use `--radius-project-row`.

## 5. Autospawn Sans delivery

The separate OFL 1.1 audit verified the embedding licence and unrestricted rights.
That audit is the record of authority for font delivery.
The installed family contains ten static TTF files with weights `300` to `700`.

Implementation must convert each source file to WOFF2.
Implementation must not modify font outlines or naming.

Place all ten WOFF2 files in `public/fonts/`.
Keep `public/fonts/OFL.txt` unchanged beside them.

Define one `@font-face` rule for each weight and style.
Use `font-display: swap` for every rule.

Preload only regular `400` and medium `500` normal files.
Other files must load when requested.

No font may load from a network service. No font stack may include Inter.

## 6. Layout and responsive behavior

### 6.1 Desktop geometry

The shell fills `100dvh` and the measured application viewport variable.
The header height is exactly `46px`.

The desktop sidebar default is `275px`.
The resize minimum is `220px`.
The resize maximum remains `480px`.

Existing persisted sidebar widths remain valid.
The migration must clamp old values without deleting them.

The transcript maximum width is `810px`.
The chat content gutter has two states and one cause. Decided on 2026-09-02, grill Q4, from the live Codex DOM in a wide and a narrow window. The thread column and the composer column share one maximum, `768px`, and one inner padding, `16px`. The transcript scroller reserves a stable scrollbar gutter on both edges, `15px`, with `scrollbar-gutter: stable both-edges`. The composer does not sit inside that scroller.

- Wide state, pane wider than `768px`: both columns stop at their maximum. The text and the composer share edges. Measured at a `2024px` window: both at `x 789.9`, both `736px` wide.
- Narrow state, pane narrower than `768px`: both columns fill the pane and share edges. The scrollbar gutter pushes the text `15px` inside the composer on each side. Measured at a `712px` pane: composer `307.9` to `988`, scroller client width `682` inside an offset width of `712`.

The gutter is a property of the scroller, not a padding on the text. `--thread-content-inset` therefore names the scrollbar gutter, `15px`, and applies only in the narrow state. The earlier flat `16px` at every width, from the "about double" estimate, is superseded. A test asserts both states.

Note on the `810px` composer maximum below and in 7.5.1: Codex declares `--composer-adjacent-max-width` as `48rem + 2 * 24px - 2 * 13px`, which is `790px`, but the live composer never exceeds the `736px` thread content width because it sits in the thread column. Our `810px` is our own decision and stays.

The composer maximum width is `810px`.
The composer minimum resting height is `108px`.
The composer uses a `24px` round fallback.
Supporting browsers use a `30px` `superellipse(1.5)` corner.

The right panel keeps its current `42vw` initial rule.
The right panel keeps its `360px` to `640px` initial clamp.
The resize range remains `300px` to `1200px`.

The chat root lays out the transcript and composer as one flex column.
The transcript pane uses `flex: 1`, `min-height: 0`, and `overflow: hidden`.
The composer dock sits in normal relative flow without flex growth.
Composer growth removes available transcript height directly in flex layout.
Normal flex flow prevents overlap without a `ResizeObserver` or measured CSS variables.
The test `components/chat/composer-clearance.test.mjs` verifies this clearance contract.

### 6.2 Responsive ranges

| Range | Rule |
|---|---|
| `0px` to `640px` | Use the current mobile navigation and single-panel behavior. |
| `641px` to `959px` | Use a sidebar overlay and a right-panel overlay. |
| `960px` to `1279px` | Use split panels. The chat content follows the two-state gutter rule in 6.1. |
| `1280px` and wider | Use split panels and the `810px` transcript limit. |

Mobile controls use a minimum `44px × 44px` target.
Standard desktop controls use `24px × 24px`; Summary uses `28px × 28px`.

The mobile composer includes `env(safe-area-inset-bottom)`.
The layout must retain the current keyboard viewport handling.

## 7. Component architecture and rules

### 7.1 Architecture layers

The architecture has five layers.

1. Tokens define shared values. Tier 1 and Tier 2 hold them.
2. `lib/ui/` holds the recipes. It is one deep module.
3. Primitives define native elements, states, focus, and accessibility.
4. Domain components define OMP visual modules.
5. Containers own data, hooks, RPC callbacks, and orchestration.

`lib/ui/` presents one small interface. Its implementation holds the recipes, the
variants, the states, the hover rules, and the motion rules.

```ts
// lib/ui/index.ts
export function cx(...parts: Array<string | false | null | undefined>): string;
export function ui<K extends RecipeName>(recipe: K, variants?: Variants<K>): string;
export type RecipeName = keyof Recipes;
```

A caller writes one call: `ui("iconButton", { size: "sm", tone: "danger", pressed })`.
The compiler rejects an unknown recipe name and an unknown variant.

Every primitive returns a class name from `ui`.
No primitive accepts a free `style` property, because that reopens the seam.

Primitive components must not import hooks from `hooks/`.
Primitive components must not call `fetch`.
Primitive components must not know OMP message types.

Domain components receive state and callbacks through typed props.
Containers retain every current state transition and side effect.

### 7.2 Required primitives

| Primitive | Contract |
|---|---|
| `Button` | Uses a native button and supports tone, size, loading, and disabled states. |
| `IconButton` | Requires a label and exposes pressed state for toggles. |
| `Surface` | Applies semantic surface, border, radius, and elevation variants. |
| `StatusBadge` | Displays text and icon without using color alone. |
| `Disclosure` | Uses a button with `aria-expanded`, a labelled region, and supports compact and default density variants. |
| `Dialog` | Traps focus, restores focus, supports centered and `fullWindow` presentation modes, and closes with `Escape` when dismissible. |
| `Menu` | Supports arrow keys, `Home`, `End`, `Enter`, and `Escape`. |
| `Tabs` | Implements roving focus and the correct ARIA relationships. |
| `Tooltip` | Appears on hover and focus after `500ms`. |
| `FormField` | Connects labels, descriptions, errors, and controls. |
| `VisuallyHidden` | Hides text visually while preserving accessibility. |
| `DynamicStyleVars` | Applies approved runtime CSS variables only. |

### 7.3 Shell and navigation

`AppShell` remains the state owner for sidebar, files, subagents, audio, theme, and settings.
`ShellLayout` owns geometry and responsive panel placement.
`AppHeader` owns header presentation and global action placement.

The header is `46px` high and has one vertical centre line at `23px`.
Every header control centres on that line.
Standard icon controls are `24px × 24px`. Summary uses a `16px` icon in a `28px × 28px` control.
Text actions share one height, one label line-height, one icon size, and one muted colour.
`Branches`, `Full history`, `Generate title`, and `System` use Summary sections instead of header actions.
The Electron sidebar starts with a `46px` native title row.
Electron uses a `16px` control position to produce Codex's measured `15px` left and top inset.
It places the sidebar toggle on the current Codex title-bar line after the macOS traffic controls.
The `46px` identity row contains the OMP wordmark, Search, and Notifications.
The next `46px` row contains New chat and ends with the shipped Codex new-session icon.
Refresh sits beside Add Project in the Projects heading.
When the sidebar closes, the main title row shows the sidebar toggle, New chat, and the current Session title.

The header holds only navigation and session actions.
Left group: sidebar toggle, New chat, and current Session title when the sidebar is closed.
Right group: Summary and file panel toggle.
Full history, Generate title, Branches, and System live inside Summary and stay out of the top bar.
Theme and language controls move into Settings.
The header does not show tokens, cost, context, or project trust.
The composer owns those, see 7.5.

`SessionSidebar` retains polling, unread persistence, projects, worktrees, search, and file exploration.
Session hover actions contain Pin and Archive only.
Pinned Sessions use OMP's `session-pins.json` registry and sort before recent Sessions.
Double-click opens the centered Rename chat dialog.
The Electron right-click menu contains Rename, Pin or Unpin, Mark as unread or read, and Archive.
The sidebar exposes no Session deletion control.
Each Session row is `30px` high with `5px 8px` padding.
Selected rows use `--ui-row-selected` without an accent border.
Project rows use an `8px` outer inset.
The `24px` icon box centres a `16px` folder icon.
An `8px` gap places the project text and child session text at `48px`.
On macOS, the document and shell stay transparent above Electron's `menu` vibrancy.
The sidebar layers `70%` of `--ui-sidebar` over that native material.
The conversation and header remain opaque through `--ui-main`.
The macOS desktop sidebar remains inside the shell layout at every window width.
Only touch browsers use the compact overlay drawer.
The conversation shrinks beside an open desktop sidebar and never renders underneath it.
Dragging a project name reorders complete project groups with live movement.
The source group stays at `20%` opacity while a compact row follows the pointer at `70%` opacity.
The project drag starts after `6px` of movement and has no delayed drop animation.
Reeve stores the final order in `~/.omp/agent/reeve-ui-state.json`.
New projects appear before projects from an older saved order, matching Codex.
The project sidebar contains no Archive or Explorer utility section.
Archived chats live in the dedicated Settings section and expose Unarchive without Delete.
The sidebar footer is `46px` high with a top hairline.
The footer uses Codex's Settings fallback because Reeve has no profile identity interface.
Help occupies the right edge and opens the OMP documentation.
Voice stays absent until Reeve has a real voice interface.

Resize handles keep pointer, keyboard, persistence, and clamping behavior.
Each handle exposes `role="separator"` and the current value.

### 7.4 Transcript

`ChatWindow` remains the transcript container and orchestration boundary.
`MessageTurn` handles user, assistant, custom, and compaction presentation.

User messages align right and use a `70%` desktop maximum.
Mobile user messages use `min(456px, 100%)`.
User bubbles use a `22px` superellipse and `10px 16px` padding.
User bubble text and assistant prose use `14px / 23px`.
User bubbles have no height cap and no internal scrollbar.
The transcript owns scrolling for long user messages.

Assistant messages use a transparent full-width flow.
Assistant prose uses the exact transcript typography tokens.

`ThinkingDisclosure` starts expanded during active reasoning.
It collapses after the first answer or tool block appears.
The completed state remembers the user's disclosure choice for that turn.

`ToolActivity` uses a `32px` collapsed header.
It shows the tool name, target, duration, and status.
The Process details label uses `13px` Autospawn Sans.
Secondary monospace text uses `11px` with an `18.5px` content line.
This two-pixel compensation keeps it visually smaller than `13px` Autospawn Sans.
Todo states route to the live Steps pill above the composer.
Tool activity preserves ANSI output, diffs, and custom content.

Compaction summaries remain at their chronological transcript position.
Oversized markdown protection remains active.
Deferred thinking retrieval remains active.

Auto-follow stays pinned while the reader remains within `48px` of the transcript bottom.
An upward user scroll detaches auto-follow immediately.
Detached streaming renders `NewMessagesControl` above the composer with an accessible label.
Activating the control restores bottom pinning.
When a new turn starts, a response spacer grows below the latest turn over `500ms`.
The spacer height is the smaller of two-thirds of the transcript or the transcript minus `240px`.
The transcript moves once to one pixel from the bottom while the spacer grows.
This movement places the user message and `Thinking` status higher in the viewport.
Streaming content does not force the transcript to its bottom.
The spacer remains after final answer text starts and after the run completes.
User scrolling towards the response consumes the spacer by the same distance.
Consumed spacer height does not return when the user scrolls backwards.
Normal auto-follow resumes after the spacer reaches zero or the user selects New messages.
User scrolling still detaches automatic following immediately.
The `Thinking` status uses Codex's theme-derived text shimmer without an ellipsis.
The user-message navigation rail appears after four saved user messages.
It sits 16px from the transcript edge and remains vertically centered.
Each 36px by 10px button contains one 26px by 2px marker.
Hover expands the target marker and its three nearest markers over `160ms`.
Hover opens a 320px, three-line response preview after `150ms`.
The current scroll-position marker stays highlighted while the pointer is outside the rail.
Rail hover temporarily transfers emphasis from the scroll-position marker to the hovered marker.
Leaving the rail restores the current scroll-position marker.
Click scrolls smoothly and highlights the target for `350ms`.
Pointer dragging scrubs through messages with instant scrolling.
The rail uses OMP Palette text, border, surface, shadow, and blur roles.

`ExtensionDialogs` renders extension-requested dialogs, inputs, question wizards, plan reviews, and custom terminal panels.

### 7.5 Composer

`ChatInput` remains the composer container and behavior owner.
`ComposerFrame` owns the measured surface and control layout.

The ProseMirror editor grows to `25dvh`, a quarter of the window, then scrolls.
Codex uses the same ProseMirror editor foundation.
The input retains drafts, images, history, slash commands, and mentions.

The toolbar shows five things on desktop, from left to right.

| Position | Control | Menu contents |
|---|---|---|
| Left 1 | Attach, `16px` plus icon in a `28px` round ghost control | image attachment |
| Left 2 | Approval selector, always visible after trust resolves | Ask for approval, Workspace write, Full access |
| Right 1 | Context donut | hover tooltip with usage, click opens the session menu: input, output, and cache tokens, cost, `Compact` |
| Right 2 | Model pill | Model, Effort, optional Speed, and Advanced menus |
| Right 3 | Dictate, `16px` mic icon in a `28px` round ghost control, rendered with the `hidden` attribute | none |
| Right 4 | Send, or Stop while streaming, in a `28px` circle | none |

The model pill opens the Codex advanced menu shape.
Its first rows are Model, Effort, and Speed.
Each row opens a nested menu on the left.
The main menu is `260px` wide.
The Model menu is `280px` wide.
The Effort menu is `180px` wide.
The Speed menu is `233px` wide.
The Advanced row opens OMP's Auto and Off effort modes and the tool preset menu.
This row is the only intentional behavior difference from the Codex Advanced view toggle.
The Effort menu shows only levels reported by the selected model.
OMP `low` displays as Light, `xhigh` displays as Extra High, and `max` displays as Ultra.
An empty supported-level list shows that the model does not support effort levels.
`Shift+Tab` calls OMP's own model-aware effort cycle.
The Speed menu calls OMP's own per-model-family fast mode.
The Speed row appears only when the selected model supports a service-tier family.
Inactive Sessions restore this state from their persisted service-tier entry.
These settings are not separate toolbar controls.
The Approval selector uses the warning colour and a semantic `16px` icon.
`Ask for approval` maps to OMP `always-ask`.
`Approve for me` maps to OMP `write`.
`Full access` maps to OMP `yolo`.
The selected Approval mode persists in OMP's global configuration.
Every active Reeve AgentSession receives the new Approval mode immediately.
Untrusted Projects show `Restricted mode` and open the Project trust dialog.
The Context donut is a button. Its Session menu holds the Session metrics and the two rare actions.
All toolbar controls centre on one line inside the footer row, see 7.5.1.
Mobile keeps the existing collapse behaviour and the existing `more` control.
The footer renders the Dictate control at the Codex position and hides it, because OMP has no dictation path. Decided on 2026-09-02, grill Q2. `ComposerFrame` renders it with `aria-label` `Dictate` and the `hidden` attribute until a `dictationAvailable` prop is true. No caller passes that prop today. A test asserts the control exists, is hidden, and sits between the model pill and Send.

The footer groups follow the live Codex DOM, read on 2026-09-02 over the app's debug port, see the private design-reference archive (kept outside this repository):

```
left group   Attach, Mode pill                       gap 5px
right group  model area: Context donut, Model pill   gap 4px, justify end, flex 1
             trailing cluster: Dictate, Send         gap 8px, shrink 0
```

A test asserts this DOM order and the three gaps.

The completion sound toggle does not live in the composer. Decided on 2026-09-02, grill Q2: a chat control is not the place for a preference. It lives in Settings, see 7.6.

#### 7.5.2 Composer intelligence

Verified from Codex Desktop `26.901.31953` on 2026-09-05.
Codex uses ProseMirror atom nodes for mentions.
Reeve uses the same editor foundation.

Reeve keeps OMP text contracts under each chip.
Command chips show only the friendly command label.
The hidden chip value keeps the complete slash command and subcommand.
Child command chips use `Parent: Child`, while child menu rows keep their short label.
Mention nodes use Codex's inline presentation without a border, background, radius, or smaller font.
Each mention uses a 16px semantic icon, a 3px label gap, medium weight, and 2px horizontal padding.
The active OMP Palette mixes its accent and text colors for the mention color.

| Result | Chip text | Serialized form and OMP behavior |
|---|---|---|
| File | file name | `@path`, which OMP reads before the turn |
| Skill | formatted skill name | `/skill:name`, which OMP supports inside a prompt |
| Computer use | `Computer use` | `@computer`, a capability cue shown only while the loaded extension tools are active |
| Live agent | agent name | `agent://id`, which OMP reads through its internal URL router |
| Slash command | command title | the canonical slash command and optional subcommand |

The menu never substitutes a skill path for the skill name.
Each skill row shows its description and its Project or User scope.
Slash commands come from OMP's command discovery interface.
This includes built-ins, extensions, prompts, MCP prompts, files, custom commands, and skills.
Registered subcommands open a second filtered level.

An empty `@` query shows available categories.
A typed `@` query merges all matches into one ranked list.
An exact filename stem ranks before same-name directories and descriptive skill matches.
The ranked list has eight rows maximum, matching Codex.
The result title stays hidden during a typed query.
The menu is full-width, `320px` maximum height, and has a `16px` radius.
Each row has a `30px` minimum height and uses a text-derived theme surface.
The active row raises its icon to the theme text colour.
Skills, agents, plugins, and computer-use items use the neutral icon colour.

Arrow keys move the active row.
Enter and Tab select the active row.
Escape closes the menu without removing typed text.
Enter cannot submit while a menu is loading.
Directory selection keeps the menu open for path navigation.
Image paste, plain-text paste, IME input, multiline input, Undo, drafts, and queued messages remain available.

Reeve omits Codex-only categories without an OMP contract.
These categories currently include Sites, ChatGPT conversations, browser tabs, and ChatGPT apps.

Every slash command row has a semantic vector icon.
OMP's built-in registry owns the command icon names.
The OMP text discovery path currently drops those names.
`getAvailableSlashCommands` restores them from `BUILTIN_SLASH_COMMAND_DEFS`.
Skills, extensions, MCP prompts, prompts, custom commands, and file commands receive source-specific fallback icons.
`SlashCommandIcon` maps the complete OMP icon vocabulary to Lucide icons.
An unknown future icon uses the terminal icon.
The interface never uses the slash glyph as a command icon.

OMP's `/join` and `/leave` commands remain terminal-only.
Their registry entries have `handleTui` functions without text `handle` functions.
Reeve adds `/collab` as a browser-native command from OMP's canonical registry.
The terminal `/collab` command connects to the configured encrypted relay.
It prints writable and read-only browser links and renders a QR code.
The default relay is `wss://my.omp.sh`.

`CollaborationAdapter` owns host startup, status, stop, session switching, participant updates, relay failures, and shutdown cleanup.
The adapter uses OMP's `CollabHost`, encrypted wire protocol, relay client, writable token, and read-only token.
Reeve renders both browser links and a scannable QR code without terminal UI dependencies.
The active card presents collaboration as a live event with one primary permission state.
It shows a QR stage, live state, participant presence, writable access, and view-only access.
The permission cards stack at narrow widths.
An active collaboration keeps its session wrapper alive and its SSE connection open.
The card updates when guests join or leave.
Reeve stops collaboration during session shutdown and wrapper destruction.
GitNexus reports high risk for changes inside `AgentSessionWrapper`, including session startup and cleanup.

#### 7.5.1 Composer geometry and tone, measured from the Codex desktop app

Measured on 2026-09-02 from the shipped Codex CSS (`_ComposerLayoutRoot_ut334`, `_ComposerLayoutFooter_ut334`) and a 2× screenshot of the empty composer in the dark Electron window. These values supersede the `108px` frame and the `25px` radius in section 2.2, which came from a different composer state.

| Property | Value | Source |
|---|---:|---|
| Frame height, empty, one text row | `98px` | screenshot |
| Frame width | `100%` of the pane minus `24px` each side, maximum `810px` | screenshot and 2.2 |
| Radius fallback | `24px` (`--radius-3xl-base: 1.5rem`) | CSS |
| Radius with `corner-shape` | `30px`, from Codex's `1.25` Electron radius scale | CSS |
| Corner shape | `superellipse(1.5)`, with the `24px` round radius as the unsupported-browser fallback | CSS |
| Fill | `--ui-composer` | 4.2 |
| Edge | `inset 0 0 1px 0 rgba(255,255,255,0.2)`. No border. No outer ring in dark mode | CSS `--elevation-composer-dark` |
| Light shadow | `0 0 0 1px rgba(0,0,0,0.04), 0 2px 8px 0 rgba(0,0,0,0.04), 0 4px 80px 8px rgba(0,0,0,0.024)` | CSS `--elevation-composer` |
| Text row | `14px / 20px`, `12px` inset left, `14px` inset top. Superseded by the code table below | screenshot |
| Placeholder | tertiary text at `0.5` opacity, dark sample `#606060` | CSS `.placeholder:after` |
| Footer row | CSS grid, columns `auto minmax(0,1fr) auto`, column gap `5px`, inline padding `8px`, bottom margin `8px` | CSS `_ComposerLayoutFooter` multiline |
| Footer centre line | `22px` above the frame bottom. The `8px` inset plus half the `28px` send circle. An earlier draft said `26px`, which was an arithmetic slip | screenshot, icon centre at device row 253.5 against the frame bottom at 297 |
| Pane inset | `16px` each side and below, the same gap on three sides | Andrew's rule on 2026-09-02, checked against the Codex bottom gap |
| Context donut | `12px` donut, `2px` stroke, track at `0.16` opacity, arc rotated `-90deg`, `120ms` ease-out, inside a `16px` box. Hover shows a `152px` centred tooltip: "Context window:", the used and left percentages, the tokens used. Click opens the Session menu | Codex component `EGo` and the composer footer tooltip strings |
| Footer order, desktop | left: attach, mode pill. right: context donut, model pill, Dictate (hidden), Send | live Codex DOM on 2026-09-02 |

Rounded surfaces use `superellipse(1.5)` when the rendering engine supports it.
True circles and pills use `corner-shape: var(--corner-round)`.
The desktop application uses Electron 44 with Chromium 152 because the macOS system webview lacks this property.

Read from the Codex source on 2026-09-02, which supersedes the screenshot rows above where they differ:

| Part | Codex code | Value |
|---|---|---|
| Empty attachments strip above the text | `_ComposerLayoutAttachments` default spacing: `padding: 8px 8px 6px`, plus the editor wrapper `translate-y-0.5` | 14px top inset plus a 2px nudge, token `--composer-text-nudge` |
| Text wrapper | `RX.Input`: `px-3 mb-1` | 12px sides, 4px below |
| Editor | `text-base`, `[&_.ProseMirror]:leading-5`, `minHeight: 2.75rem`. `--text-base` is `14px` at the theme root in Electron. Only the browser window raises it to `1rem` | 14px on a 20px line, 44px minimum |
| Footer | `_ComposerLayoutFooter` multiline default: `margin-bottom: 8px`, `padding-inline: 8px`, `column-gap: 5px` | as shown |
| Footer control, size `composer` | `h-token-button-composer px-2 py-0 text-sm leading-[18px] rounded-full`, token `calc(--spacing * 7)` in Electron | 28px tall, 28px square when uniform, 8px side padding, 14px on 18px, pill |
| Frame sum | 14 + 44 + 4 + 28 + 8 | 98px, which matches the measured frame |

Tokens: `--composer-control-size: 28px` for every footer control. `--composer-send-size` aliases it. `--leading-ui: 20px`.
| Icon controls (attach, mic) | `16px` icon in a `28px` round hit box, ghost, no fill, icon in tertiary text. The earlier `24px` came from a screenshot and is superseded by the live DOM | live Codex DOM on 2026-09-02 |
| Approval selector | `14px` text in the warning colour with a semantic `16px` icon, no fill, no border | screenshot `#ff8649` |
| Model pill | `14px` text. Model name in primary text, Effort in tertiary text, then a chevron. No fill, no border at rest | screenshot |
| Model menu | Advanced rows Model, Effort, Speed, then Advanced. Width `260px`. Nested widths are `280px`, `180px`, and `233px` | Codex bundle, re-extracted 2026-09-03 |
| Effort labels | `low` Light, `medium` Medium, `high` High, `xhigh` Extra High, `max` Ultra | Codex bundle and OMP effort order |
| Send | `28px` circle, fill `var(--ui-text-muted)`, arrow in `var(--ui-composer)`, flush right. Codex ships a neutral `#959595`. Decided on 2026-09-02: the theme owns the tone, so titanium reads a little cool and no literal enters `composer.module.css`. `ComposerFrame.test.mjs` asserts the token and rejects any colour literal in that file | screenshot and grill Q1 |
| Stop | same `28px` circle, square glyph. The live Codex Stop is `--color-background-composer-primary`, which is `#ffffff` in dark mode, with a black glyph and `2px` padding. The `#959595` above is a screenshot read of the idle Send, not a token. Our Stop keeps the Send fill | live Codex DOM on 2026-09-02 |
| Send disabled | same circle at `--ui-disabled-opacity` | Codex behaviour |

Textarea growth: the frame grows with the text row up to `25dvh`, then the text scrolls. The footer row keeps its `22px` centre from the bottom.

#### 7.5.2 Live Steps and changes bar

Measured from ChatGPT desktop version 26.901.31953 on 2026-09-04.
The extraction method and application hash are recorded in the private design-reference archive, kept outside this repository.

During an active turn, Todo content does not render inside the transcript.
The latest Todo state renders as a centred Steps pill directly above the composer.
The `32px` fixed row holds a `35px` pill that extends `11px` into the transcript area.
The pill uses an `8px` gap, `6px 12px` padding, the theme border, and a blurred soft surface.

The Steps control contains a `16px` progress donut and `Step {current} / {total}`.
It selects the first active step, then the first unfinished step, then the final step.
Hover and keyboard focus show every step in an immediate rich tooltip.
The tooltip uses a `320px` maximum width and an `8px` edge allowance.
The Steps tooltip sits `8px` above its control.

Successful write and edit tools add a current change summary to the same pill.
A middle dot separates the Steps control from `{count} files changed`.
The change summary shows theme success and danger line counts.
Its tooltip lists each changed file and its line counts.
The changes tooltip sits `4px` above its control.

Reeve removes the fixed row after the turn finishes.
Historical changed files remain available beside the final answer.

Section 4.4 lists the tokens for this geometry.
They include both Composer radius tokens and the two `--shadow-composer` recipes.

Ripple list. Every item below touches the composer and must be checked after the change:

- `components/chat/composer-clearance.test.mjs` asserts the dock and the frame. Update the expected values.
- `components/chat/ComposerFrame.test.mjs` and `components/ChatInput.test.mjs` assert control order, classes, and sizes.
- `components/MobilePwaLayout.test.mjs` asserts `.composer` keeps `padding-bottom: env(safe-area-inset-bottom)`.
- `components/ui/ui-style-boundaries.test.mjs` lists every Tier 2 token. Add the new tokens there.
- `app/tokens.css` holds both Composer radius tokens and `--shadow-composer`.
- `components/chat/NewMessagesControl.tsx` positions itself above the composer. Check its offset after the height change.
- `hooks/useIsMobile.ts` and the `data-mobile` toolbar branch. Mobile keeps the `more` control and the collapse.
- Streaming, queued, and steering states in `ChatInput.tsx` render a Stop control and queue text. They must fit the new footer row.
- Attachments render above the text row. Their inset follows the frame radius.
- The trust dialog opens from the mode pill. Keep the click path.
- `lib/i18n` labels for Send, Stop, Attach, and the mode pill stay as they are. The Send label moves to `aria-label`.
- The user message bubble in `message-view.module.css` uses `--ui-user-bubble`, the token 4.2 measured from Codex, not `--ui-composer`. Leave it.

The action control has four explicit states.

| State | Action |
|---|---|
| Empty and idle | Disable send. |
| Ready and idle | Send the prompt. |
| Empty and streaming | Stop the active run. |
| Text and streaming | Preserve steer, queue, and follow-up behavior. |

Queued messages render in a separate surface above the Composer.
The surface uses a `13px` side inset and ends one pixel behind the Composer.
Each queue row and the paused header use a `32px` shared row with a `1px` row gap.
Their `14px` icons and text share one leading column with an `8px` gap.
The queue colour mixes `92%` Composer colour with `8%` main background.
The outer border uses `12%` of the theme text colour.
This preserves Codex contrast when an OMP theme supplies a dark border token.
The queue has no lower corner radius or lower border.
The queue hides horizontal overflow and shows no row separators.
Each row supports Steer, Delete, Edit, and drag ordering.
The drag handle uses a compact six-dot icon without a coloured hover background.
The sortable row is the measured drag element and follows the pointer at `60%` opacity.
Other rows move before release, while a return to the starting position preserves the order.
Reeve keeps the source slot hidden while a drag overlay settles into the target slot over `180ms`.
The drag overlay keeps `60%` opacity during the complete settling motion.
Delete offers Undo through the existing notice system.
Edit removes the queued row while its content occupies the Composer.
Submitting the edit restores its original queue position.
The More menu changes the saved Queue or Steer preference.
Command-Shift-Enter uses the opposite preference for one message.
Stop pauses every pending message until Resume or a message-specific Steer action.
The paused queue shows one notification with Pause and Resume icons.
The individual message actions remain Steer actions.
Submitting a new message while the queue is paused opens the `Send message?` dialog.
`Clear queue` removes every paused message before sending the new message.
`Send message` preserves the paused messages and resumes them after the new message.
Closing the dialog preserves the new message draft and the complete paused queue.
OMP remains the delivery engine for every queue action.

#### 7.5.3 Project context selection

The Composer context bar follows the Codex Desktop project selector.
This contract was verified against the installed Codex bundle on 2026-09-07.
Reeve uses Codex structure and geometry with Reeve theme tokens.

The left control opens a `336px` project menu above the Composer.
An unassigned new chat labels this control `Choose project`.
Its managed OMP directory remains an implementation detail.
The menu contains a focused project search field.
Saved local projects follow the sidebar's persisted project order.
Linked worktrees collapse under their repository project.
Each row shows its readable project name and folder slug.
The selected row shows a check mark.
Search matches the readable name, folder slug, and complete path.

The complete local state map is:

| Input or state | Reeve result |
|---|---|
| Menu opens | Refresh project discovery and focus Search projects. |
| Projects load | Show ordered local projects and the selected check. |
| Projects are loading | Show a stable loading row. |
| Discovery fails | Show one retry state inside the menu. |
| No project exists | Show `No projects yet`. |
| Search has no result | Show `No matching projects`. |
| Existing project selected | Validate its complete path, close the menu, and update the new chat context. |
| Validation fails | Keep the menu open and show the returned error. |
| New project in Electron | Open the protected native directory chooser. |
| Native chooser is cancelled | Preserve the current context without changes. |
| Native chooser fails | Reopen the menu and show the error. |
| New project in a browser | Open the browser directory fallback. |
| Removed project is added again | Remove its hidden marker and restore it to both project entry points. |
| Don't work in a project | Create a projectless OMP chat in its managed directory. |
| Selected directory is a Git root | Show `Local` and its active branch. |
| Selected directory is a linked worktree | Show `Worktree`, its repository project, and its branch. |
| Selected directory is not Git | Show `Local` without a branch. |

Codex also maps remote projects and cloud environments.
Its remote flow includes host selection, SSH setup, path validation, duplicate mapping, missing-folder confirmation, and folder creation.
Reeve currently has no remote-host or cloud execution adapter.
The menu must hide remote and cloud actions until those adapters exist.
It must never display a decorative action that cannot create a usable OMP session.

The same native directory bridge serves the Composer and sidebar add-project controls.
Electron accepts calls only from the trusted Reeve renderer.
The server validates every returned path before Reeve uses it.

### 7.6 Settings, files, subagents, and audio

Settings use the shared `Dialog`, `Tabs`, `FormField`, and button primitives.
Settings retain models, themes, skills, plugins, MCP, access, and OMP settings.

Settings navigation follows Codex Desktop's current four-group information architecture.
The Settings sidebar captures the current app sidebar width when Settings opens.
Settings does not expose a separate resize handle.
Its first navigation row reserves `44px` above Back to app for the macOS title-bar controls.
`Personal` contains General, Appearance, Terminal appearance, and Security.
`Integrations` contains Skills, Plugins, MCP servers, and Services.
`Coding` contains Models, Agent behavior, Context, Memory, Files, Shell, Tools, and Tasks.
`Archived` contains Archived chats.
Unknown future OMP tabs remain visible under Coding instead of disappearing.

Settings search replaces the normal navigation list while a query is present.
It indexes destination names, descriptions, groups, OMP field labels, descriptions, paths, and field groups.
Results show their destination context and open either the complete destination or the exact OMP control.
Arrow keys, Home, End, Enter, Space, Escape, and Command-Control-F keyboard paths remain available.
Search, selection, focus, hover, and empty states use semantic theme tokens only.

The Security destination is the existing Reeve access implementation with Codex-compatible naming and placement.
Passwords remain write-only and are stored only as scrypt digests.
Environment-managed access remains read-only.
Recovery continues to require machine access, and network exposure guidance remains visible.
The redesign must not weaken the proxy, recovery, hashing, or secret-return contracts.

The completion sound row lives in the OMP settings `Interaction` tab, `Notifications` group, beside OMP's own `Completion Notification`. Decided on 2026-09-02, grill Q2. Codex keeps its `Notifications` group inside General, and OMP already names that group, so the browser row joins it. It is a web-only field on the `omp-sound-enabled` key, injected the same way the Themes section injects its web-only rows. The Session menu holds no sound item. A test asserts the Settings row writes `omp-sound-enabled` and the Session menu has no `Completion sound` item.
`SettingsConfig` renders inside a `fullWindow` presentation `Dialog` primitive.
It traps focus, provides Codex's `Back to app` control above search, and restores trigger focus on close.
Settings opens General by default.
The accessible Settings title and Project path remain available without duplicating visible page headings.
Navigation group labels use sentence case and regular weight.
Navigation rows, Models rows, role tags, and thinking choices use theme-derived selection surfaces.
Settings maps Codex contrast relationships through the complete active OMP Palette.
Settings preserves the Palette hue instead of converting the Palette to gray.
Settings owns one `28px`, `14px`, `13px` typography scale for titles, labels, descriptions, and values.
Settings owns one `10px`, `12px`, `8px` radius scale for rows, cards, and controls.
The embedded Models page groups providers and roles into bordered card surfaces instead of full-height colour bands.
The accent remains available for focus, enabled switches, links, and primary save actions.
Settings rows use one theme-derived card surface and retain their grouped borders and corner treatment.
Desktop switches use a `38px` by `22px` visible track.
Coarse pointers place that fixed track inside a separate `44px` touch target.
Narrow desktop windows keep the complete Settings sidebar and desktop control sizes.
Narrow desktop windows keep the two-column Settings row layout.
Only coarse pointers can select the compact Settings rail and touch control sizes.
The General content column keeps an `820px` maximum and the measured Codex top spacing.
The embedded Models page uses the Settings navigation instead of rendering a second close control.

`ThemePreview` acts as a per-palette preview adapter.
It scopes palette variables with `[data-theme-preview]` selectors without mutating global theme state.
It validates hex, rgb, and keyword colors before generating style declarations.

Bounded production seams isolate configuration complexity:
- `components/models/**` organizes provider trees, auth details, headers, compat logic, and model fields.
- `components/plugins/PluginSourceField` isolates package and repository input parsing.
- `components/skills/**` organizes skill discovery, list management, and detail views.

The file viewer retains source, preview, diff, image, audio, PDF, and DOCX modes.
It retains live file watching, line selection, mentions, wrapping, and deleted diffs.

The subagent panel remains a desktop sibling column.
It remains hidden by the current mobile behavior.
Completed subagent transcripts must remain available.

Audio retains one reusable `AudioContext`.
Audio remains locked until a user gesture unlocks it.
The completion tone respects `omp-sound-enabled`.

## 8. Required component states

Every interactive primitive supports default, hover, focus, pressed, disabled, and loading states.
Toggle controls also support selected and mixed states.

The shell supports booting, ready, disconnected, empty, and fatal states.
The navigation supports loading, empty, selected, unread, running, collapsed, and error states.

The transcript supports loading, history, streaming, detached-scroll, compacted, and provider-error states.
Tool activity supports queued, running, success, error, cancelled, and unavailable states.

The composer supports empty, ready, streaming, queued, steering, compacting, retry, and model-error states.
Attachment controls support reading, ready, rejected, and removed states.

Settings support loading, clean, dirty, saving, saved, validation-error, and reload-required states.
The file viewer supports loading, source, preview, diff, binary, changed, deleted, and error states.

Subagents support starting, running, waiting, completed, failed, cancelled, and transcript-loading states.
Audio supports locked, enabled, muted, unsupported, and playback-error states.

## 9. Streaming and motion

SSE deltas must append directly without delayed typewriter simulation.
Motion must never reduce token visibility or reorder content.

New turns use `160ms` opacity and `translateY(4px)` motion.
Menus use `120ms` opacity and `translateY(4px)` motion.
Dialogs use `200ms` opacity and scale motion.

Disclosure motion uses CSS grid rows and the standard easing token.
Frequent motion may animate only `opacity` and `transform`.

Active reasoning may animate one icon or short label.
It must not shimmer full paragraphs.

Auto-scroll remains active within `48px` of the transcript bottom.
An upward user scroll detaches auto-scroll immediately, even within the `48px` band.

Detached streaming shows a labelled new-message control (`NewMessagesControl`) above the composer.
Activating the control restores bottom pinning.

Reduced motion removes transforms, shimmer, smooth scrolling, and view-transition wipes.
Programmatic scrolling uses instant behavior when reduced motion is preferred.
State changes remain immediate under reduced motion.

## 10. Accessibility

The implementation must meet WCAG 2.2 AA.
Normal text needs a `4.5:1` contrast ratio.
Large text and graphical controls need a `3:1` contrast ratio.

Every control needs a visible `2px` focus ring with a `2px` offset.
Focus must remain visible against light and dark surfaces.

The project-search and command-menu text fields are exceptions, following Andrew's explicit Codex-style search request.
Keep these fields borderless, with a visible text caret and highlighted result selection.
Do not apply this exception to other controls.

The shell uses `header`, `nav`, `main`, and `aside` landmarks.
The composer uses a labelled `form`.

Streaming phase changes use one polite live region.
Errors use an assertive alert only when immediate action is required.

Tool output regions use stable labels.
Disclosure labels include the tool or reasoning state.

Dialogs trap focus and restore the trigger focus.
Menus and tabs use roving keyboard focus.

Icon-only controls require accessible names and visible tooltips.
Status indicators use text or shape with color.

The design preserves existing shortcuts.
New shortcuts require a separate product decision and test coverage.

## 11. Exact implementation files

| Scope | Exact files |
|---|---|
| Foundation and recovery | `app/globals.css`, `app/tokens.css`, `app/layout.tsx`, `app/recover/page.tsx`, `app/recover/recover.module.css`, `app/recover/page.test.mjs`, `lib/settings-api.ts`, `hooks/useTheme.ts`, `lib/omp-theme.ts`. `lib/omp-theme.ts` defines the Tier 1 adapter. |
| Recipes | `lib/ui/index.ts`, `lib/ui/recipes.ts`, `lib/ui/recipes.module.css`, `lib/ui/recipes.test.mjs` |
| Enforcement | `eslint.config.mjs`, `package.json`, `scripts/check-ui-style-boundaries.mjs`, `scripts/ui-style-exceptions.mjs`, `config/inline-style-baseline.json` |
| Font assets | `public/fonts/OFL.txt`, `public/fonts/AutospawnSans-Bold.woff2`, `public/fonts/AutospawnSans-BoldItalic.woff2`, `public/fonts/AutospawnSans-Light.woff2`, `public/fonts/AutospawnSans-LightItalic.woff2`, `public/fonts/AutospawnSans-Medium.woff2`, `public/fonts/AutospawnSans-MediumItalic.woff2`, `public/fonts/AutospawnSans-Regular.woff2`, `public/fonts/AutospawnSans-RegularItalic.woff2`, `public/fonts/AutospawnSans-Semibold.woff2`, `public/fonts/AutospawnSans-SemiboldItalic.woff2` |
| Primitives | `components/ui/Button.tsx`, `components/ui/IconButton.tsx`, `components/ui/Surface.tsx`, `components/ui/StatusBadge.tsx`, `components/ui/Disclosure.tsx`, `components/ui/Dialog.tsx`, `components/ui/Menu.tsx` |
| More primitives | `components/ui/Tabs.tsx`, `components/ui/Tooltip.tsx`, `components/ui/FormField.tsx`, `components/ui/VisuallyHidden.tsx`, `components/ui/DynamicStyleVars.tsx`, `components/ui/primitives.module.css` |
| Shell | `components/AppShell.tsx`, `components/shell/ShellLayout.tsx`, `components/shell/AppHeader.tsx`, `components/shell/shell.module.css`, `components/shell/state-styles.module.css` |
| Navigation | `components/SessionSidebar.tsx`, `components/SidebarFooter.tsx`, `components/DirectoryPicker.tsx`, `components/BranchNavigator.tsx`, `components/TabBar.tsx`, `components/settings/ArchivedChatsSettings.tsx` |
| Navigation support | `components/navigation/navigation.module.css`, `hooks/useIsMobile.ts`, `hooks/useResizablePanel.ts`, `lib/panel-layout.ts` |
| Conversation | `components/ChatWindow.tsx`, `components/ChatInput.tsx`, `components/MessageView.tsx`, `components/MarkdownBody.tsx`, `components/TurnWrittenFiles.tsx`, `components/ExtensionStatusBar.tsx` |
| Transcript composition | `components/chat/MessageTurn.tsx`, `components/chat/ThinkingDisclosure.tsx`, `components/chat/ToolActivity.tsx`, `components/chat/ExtensionDialogs.tsx`, `components/chat/NewMessagesControl.tsx`, `components/chat/transcript-follow.ts`, `components/chat/chat.module.css`, `components/chat/chat-window.module.css`, `components/chat/message-view.module.css` |
| Tool presentation | `components/chat/BashExecutionActivity.tsx`, `components/chat/TerminalOutput.tsx`, `components/chat/TodoPlan.ts`, `components/chat/ComposerTurnStatus.tsx`, `components/chat/ToolDiffView.tsx`, `components/chat/ToolIcon.tsx`, `components/chat/tool-presentation.ts`, `components/MessageView.test.mjs`, `components/chat/ToolActivity.test.mjs`, `components/chat/tool-presentation.test.mjs` |
| Composer composition | `components/chat/ComposerFrame.tsx`, `components/chat/ComposerEditor.tsx`, `components/chat/ComposerAutocomplete.tsx`, `lib/composer-intelligence.ts`, `components/chat/composer.module.css`, `components/chat/composer-clearance.test.mjs` |
| ANSI runtime colors | `components/ui/AnsiSegment.tsx`, `components/ui/AnsiSegment.test.mjs` |
| Transcript runtime | `hooks/useAgentSession.ts`, `hooks/useAgentSession.test.mjs` |
| Secondary panels | `components/FileViewer.tsx`, `components/file-viewer/file-viewer.module.css`, `components/SubagentPanel.tsx`, `components/subagents/SubagentDetail.tsx`, `components/subagents/SubagentRow.tsx`, `components/subagents/SubagentStatusGlyph.tsx`, `components/subagents/subagent-helpers.ts`, `components/subagents/subagent-panel.module.css`, `hooks/useAudio.ts` |
| Settings containers | `components/SettingsConfig.tsx`, `components/SettingsConfig.module.css`, `components/ModelsConfig.tsx`, `components/ModelsConfig.module.css`, `components/ModelRolesPanel.tsx`, `components/ModelRolesPanel.module.css`, `components/PluginsConfig.tsx`, `components/PluginsConfig.module.css`, `components/SkillsConfig.tsx`, `components/SkillsConfig.module.css` |
| Models configuration seams | `components/models/AddProviderPicker.tsx`, `components/models/ApiKeyDetail.tsx`, `components/models/HeaderListEditor.tsx`, `components/models/ModelDetail.tsx`, `components/models/ModelsSidebarTree.tsx`, `components/models/OAuthDetail.tsx`, `components/models/ProviderDetail.tsx`, `components/models/ThinkingLevelMapEditor.tsx`, `components/models/model-fields.tsx`, `components/models/provider-icons.tsx`, `components/models/model-compat.ts`, `components/models/models-tree-navigation.ts`, `components/models/role-selector-change.ts`, `components/models/types.ts`, `components/models/*.module.css` |
| Plugins and skills seams | `components/plugins/PluginSourceField.tsx`, `components/skills/SkillDetail.tsx`, `components/skills/SkillDiscovery.tsx`, `components/skills/SkillList.tsx`, `components/skills/skill-utils.ts` |
| Settings support | `components/AccessConfig.tsx`, `components/ProjectTrustDialog.tsx`, `components/ProjectTrustDialog.module.css`, `components/settings-controls.module.css`, `components/settings/ThemePreview.tsx`, `components/settings/theme-preview.module.css` |
| Remaining visual debt | `components/ReeveWordmark.tsx`, `components/MermaidBlock.tsx`, `components/FrontmatterCard.tsx`, `components/FileIcons.tsx`, `components/SearchableSelect.tsx`, `components/SearchableSelect.module.css` |

## 12. Migration, TDD seams, and regression requirements

### 12.1 Safe migration sequence

Each stage must keep the application usable and testable.
Each stage is reversible. No stage mixes a visual change with a structural change.

1. Capture safe fixture evidence and add failing architecture tests.
2. Add `app/tokens.css` with Tier 2 only. Nothing consumes it yet.
3. Add the WOFF2 files and the font faces. Do not apply the face to the body yet.
4. Add `lib/ui/` with `cx`, `ui`, and the recipes. Nothing imports it yet.
5. Migrate the leaf files: `TabBar`, `TurnWrittenFiles`, `ExtensionStatusBar`,
   `ReeveWordmark`, and `AccessConfig`. They hold 13 objects together.
6. Replace the 217 colour literals with Tier 2 tokens. Change no layout.
7. Replace the 164 direct mutations with CSS state rules. Keep every handler that
   sets React state, for example `setHoveredProject` in `SessionSidebar.tsx`.
8. Migrate `ModelsConfig`, `SkillsConfig`, and `PluginsConfig`. This removes 339
   objects. Follow the `SettingsConfig.module.css` precedent.
9. Migrate the shell and navigation through presentational boundaries.
10. Migrate the transcript, then the composer. Migrate `ChatInput.tsx` last,
    because it holds the most declarations and the most behavior.
11. Turn on enforcement, then complete functional, accessibility, and visual
    verification.

Each touched redesigned component must finish with no direct static inline styles.
Do not leave a touched component partly migrated.

### 12.2 Remaining inline-style migration

Enforcement runs in the pipeline. The system has seven rules.

1. ESLint rejects the `style` attribute in every migrated file.
2. ESLint rejects a `style` prop on any module interface.
3. ESLint rejects a colour literal in a TSX file and names the Tier 2 token.
4. ESLint rejects `element.style` mutation. Use classes, data attributes, ARIA
   state, and CSS selectors instead.
5. A test rejects a Tier 1 variable inside a `lib/ui/` recipe.
6. `scripts/check-ui-style-boundaries.mjs` reads `config/inline-style-baseline.json`
   and fails on count growth. Migrated and new TSX files receive a zero limit by default.
7. `bun run lint` executes both ESLint and the boundary checker.

**The dynamic geometry exception.** Genuinely dynamic geometry may remain inline.
Only `DynamicStyleVars.tsx` may write runtime CSS custom properties. It accepts
measured geometry only, for example panel width, scroll offset, tree depth, and
progress fraction. It must reject colour, spacing, radius, shadow, and
typography values. `hooks/useTheme.ts` may apply theme variables to
the document root. Each approved intrinsic inline style needs a one-line comment
that states why CSS cannot express the value.

**The ANSI runtime-colour exception.** `components/ui/AnsiSegment.tsx` is the
sole typed runtime-colour adapter. ANSI 24-bit colours are arbitrary runtime
values, so finite CSS classes cannot express them. Its checker exception must
name the exact file and rule. Its baseline cap must remain one intrinsic `style`
attribute. ANSI call sites must not contain intrinsic `style` attributes. All
other migrated and new TSX files retain the zero default.

**Vendor syntax maps.** A vendor syntax-highlight style map is data passed to
vendor code. It is not an intrinsic element style. Each map needs an exact,
documented checker exception. It does not permit intrinsic styles at call sites.

### 12.3 Architecture tests

Add `components/ui/ui-architecture.test.mjs`.
It must reject hook imports, network calls, and OMP domain imports from primitives.

Add `components/ui/ui-accessibility.test.mjs`.
It must verify labels, focus contracts, disclosure state, tabs, and dialog restoration.

Add `components/ui/ui-style-boundaries.test.mjs`.
It must verify zero direct styles in every migrated file.
It must verify that no Tier 2 token names a colour outside Tier 1.

### 12.4 Required TDD seams

| Area | Test files | Required contract |
|---|---|---|
| Theme | `hooks/useTheme.test.mjs`, `lib/omp-theme.test.mjs` | Preserve preferences, cache, OMP palettes, auto mode, and reduced motion. |
| Navigation | `components/AppShell.navigation.test.mjs`, `components/SessionSidebar.test.mjs` | Preserve URLs, tabs, widths, projects, worktrees, unread state, and selection. |
| Transcript | `hooks/useAgentSession.test.mjs`, `components/MessageView.test.mjs`, `components/ChatWindow.process-details.test.mjs`, `components/chat/transcript-follow.test.mjs`, `components/chat/NewMessagesControl.test.mjs`, `components/chat/ExtensionDialogs.test.mjs` | Preserve ordering, streaming, tools, thinking, compaction, follow pin, new messages control, and extension dialogs. |
| Composer | `components/ChatInput.test.mjs`, `components/ChatInput.dormancy.test.mjs`, `components/chat/ComposerFrame.test.mjs`, `components/chat/composer-clearance.test.mjs` | Preserve drafts, images, history, models, thinking, tools, queue, steer, follow-up, and flex clearance. |
| Settings | `components/SettingsConfig.test.mjs`, `components/ModelsConfig.test.mjs`, `components/PluginsConfig.test.mjs`, `components/SkillsConfig.test.mjs`, `components/settings/theme-preview.test.mjs`, `components/models/*.test.mjs`, `components/skills/*.test.mjs` | Preserve every section, save contract, reload state, trust, theme preview, provider trees, and skill discovery. |
| Recovery | `app/recover/page.test.mjs` | Preserve password recovery, terminal verification code, and unauthenticated state boundaries. |
| File viewer | `components/FileViewer.test.mjs`, `components/TabBar.test.mjs` | Preserve render modes, live watch, line mentions, tabs, wrap, and deleted diffs. |
| Subagents | `components/SubagentPanel.test.mjs` | Preserve live updates, history, completion, selection, and finished transcripts. |
| Audio | `hooks/useAudio.test.mjs`, `components/ChatInput.test.mjs` | Preserve storage, gesture unlock, context reuse, toggle, and completion playback. |

Tests must assert behavior before styling details.
Visual contract tests may assert tokens, classes, data attributes, and dimensions.

### 12.5 Functional regression requirements

The following behavior must pass before visual acceptance:

- Browse, create, resume, rename, delete, export, and auto-name sessions.
- Start OMP automatic title generation before the first eligible prompt.
- Publish OMP title changes through the active Session event stream.
- Recover first-message labels hidden beyond OMP's bounded list prefix.
- Fork session files and navigate in-session branches without mixing their contracts.
- Reconnect SSE after refresh during streaming.
- Preserve the 30-second SSE grace window and monotonic run guard.
- Accept old and new compaction event names.
- Poll running sessions every `2.5` seconds only while visible.
- Reconcile active runs after visibility and network changes.
- Preserve chronological compaction summaries and entry identifiers.
- Preserve drafts when provisional session identifiers become real identifiers.
- Preserve image validation, paste, drop, preview, removal, and transmission.
- Preserve model roles, direct model choices, thinking levels, and tool presets.
- Preserve slash commands, file mentions, input history, queued message editing, ordering, deletion, Undo, Steer, pause, and Resume.
- Preserve extension dialogs, custom panels, widgets, status, and blocking input.
- Preserve worktree grouping, creation, dirty removal warnings, and deleted-worktree recovery.
- Preserve project trust, system prompts, MCP filtering, and file allow-lists.
- Preserve source, preview, diff, media, document, live-watch, and line-mention file behavior.
- Preserve running and completed subagent transcript behavior.
- Preserve theme light, dark, auto, OMP palette, cache, and first-paint behavior.
- Preserve audio unlock, storage, toggle, completion tone, and background completion.
- Preserve PWA safe areas, mobile viewport height, and software keyboard behavior.
- Preserve password access, recovery, and unauthenticated route boundaries.

Run `bun run typecheck`, `bun run lint`, and `bun test` after each migration stage.
Do not run `bun run build` during development.

### 12.6 Ticket: header and composer consolidation

Review contract: run `deslop`, then the two-axis code review, then both Thermos reviews, before the release commit.

Origin: live audit on 2026-09-01 at `1440 × 900` against the production build of `6075160`.
The header had three vertical centre lines: `15.5px`, `22.5px`, and `28px`.
The header duplicated the Composer Context donut and held cost, tokens, and Project trust with no clear job.
The composer toolbar held eight controls in one row.

Acceptance criteria:

1. Every header control reports a bounding-box centre of `23px ± 0.5px` at `1440 × 900`.
2. Each sidebar title row is `46px` high with the same centre.
3. Superseded on 2026-09-04. `Branches` renders inside Summary through the shared Disclosure primitive.
4. The header contains no token, cost, context, or trust element. A test asserts this.
5. Theme and language controls appear in Settings and keep their current behaviour and tests.
6. The Context donut appears after the first reply, once the Session has usage. Until then, the toolbar is Attach, optional mode pill, model pill, hidden Dictate, and Send. A test asserts both states.
7. The model pill menu contains Model, Effort, Speed, and Advanced rows with nested menus.
8. The Session menu contains input, output, and cache tokens, cost, and `Compact`. The completion sound toggle moved to Settings, see 7.6.
9. The mode pill appears only when `projectTrust.requiresTrust` is true and `projectTrust.trusted` is false. Its click opens the trust dialog.
10. Send sits at the bottom right of the composer on the toolbar line.
11. Every existing composer, navigation, and settings test still passes. New i18n keys exist in `en.ts` and `zh-CN.ts`.
12. Mobile layout keeps its collapse behaviour and the `more` control.

Out of scope: session archive from upstream `v0.4.0`, the light-mode `New` button colour, the settings dialog font.

### 12.7 Ticket: composer geometry and tone match

Review contract: run `deslop`, then the two-axis code review, then both Thermos reviews, before the release commit.

Origin: Andrew compared the empty Codex composer with ours on 2026-09-02 and asked for a match in every aspect. Section 7.5.1 holds the measured target and the ripple list.

Acceptance criteria, all measured on a production build at `1440 × 900` in dark mode with the fixture data:

1. The empty frame is `98px ± 1px` high and `24px` radius.
2. The frame has no CSS border. Its computed `box-shadow` is the inset hairline in dark mode and the three-layer recipe in light mode.
3. Superseded by 7.5.1. The placeholder renders at `14px` with a `12px` left inset and a `14px` top inset.
4. The placeholder colour is the tertiary text at `0.5` opacity. No new literal. It derives from `--ui-text-dim` or `--ui-text-muted`.
5. Superseded by 7.5.1. The footer row centres `22px ± 1px` above the frame bottom. Every footer control shares that centre.
6. Superseded by 7.5.1. Attach is a `16px` icon in a `28px` hit box with no fill at rest.
7. The mode pill is text plus a `16px` icon in `--ui-warning`, no fill, no border.
8. The model pill shows the model name in `--ui-text` and the reasoning level in `--ui-text-dim` at `14px`, then a chevron. No fill at rest.
9. Send is a `28px` circle at the right edge of the footer row. Its `aria-label` is the existing Send label. No visible text. Stop uses the same circle.
10. The textarea grows to `25dvh`, then scrolls. The footer row keeps its `22px` centre while it grows.
11. Every item in the 7.5.1 ripple list is checked and its test passes. `bun run typecheck`, `bun run lint`, and `bun test` pass.
12. Mobile keeps the `more` control and the collapse behaviour. The attachments strip keeps its inset.

Out of scope: the mic control. OMP has no dictation path today, so the footer omits it. Say so in `DESIGN.md` 7.5.

## 13. Safe screenshot evidence

### 13.1 Existing evidence

Preserve these files exactly:

- `docs/design/evidence/before/README.md`
- `docs/design/evidence/before/recover-dark-1280x720.png`
- `public/fonts/OFL.txt`

The recovery image was visually inspected during specification work.
It contains no private session data.

The existing `.png` file contains a JPEG payload.
Preserve it without renaming or re-encoding it.
Future `.png` evidence must contain PNG data.

The after-state browser evidence is in `docs/design/evidence/after/README.md`.

### 13.2 Fixture rules

Use only the scratch directory `~/omp-cwd-design-fixture`.
Do not open a real project during evidence capture.

Use neutral session titles such as `Fixture session 01`.
Do not show private project names, paths, providers, branches, prompts, or chat content.

Do not blur or redact private content.
Recreate the state with fixture data.

Inspect every screenshot before staging it.
Do not stage an image that was not opened and checked.

### 13.3 Required captures

Capture dark and light versions at these viewports:

- Desktop at `1440px × 900px`.
- Tablet at `834px × 1112px`.
- Mobile at `390px × 844px`.

Capture these surfaces before implementation and after implementation:

- Empty shell with fixture navigation.
- Transcript with user, assistant, thinking, tool, error, and completed states.
- Composer in empty, ready, streaming, and queued states.
- Settings with neutral fixture values.
- File viewer with fixture source and diff files.
- Subagent panel with fixture running and completed items.
- Recovery page with placeholder-only fields.

Use the name `<surface>-<theme>-<width>x<height>.png`.
Place images under matching `before/` and `after/` directories.

Compare the same route, fixture, theme, viewport, and state.
Do not compare unrelated application states.

### 13.4 Inspect on a production build

Capture after-state evidence from a production build, not from `next dev`.

`next dev --webpack` adds a `?v=<request timestamp>` query to every CSS link.
Each session switch fetches a new server payload with a new stamp.
React then removes the old `page.css` link and loads the new one.
All component CSS lives in `page.css`, so the shell shows unstyled text for 1 to 4 seconds.

This is a dev-server artifact.
It exists at baseline commit `29d08f4` and at the redesign head.
A production build uses stable hashed CSS names and does not show it.
Verified on 2026-09-01 in the in-app browser against Next.js 16.2.12.

The packaged desktop application uses Electron 44 and Chromium 152.
This rendering engine supports the superellipse corner contract.
The packaged application uses the stable `127.0.0.1:30142` origin.
One Electron instance owns that origin and the packaged Bun process.

Build for inspection in a separate worktree with `OMP_WEB_DIST_DIR` set.
Never run `bun run build` in the main worktree.

On 2026-09-03, a detached worktree produced the signed Electron 44 ARM application at version `0.4.2`.
The application used only `/tmp/omp-web-design-agent` fixture sessions.
The final visible run reported its packaged Bun server ready in `55ms`.
Computer Use inspected fixture session 03 in the packaged application.
The in-app browser inspected the same packaged server at `http://127.0.0.1:30142`.
Chromium reported `corner-shape` support and a `30px` `superellipse(1.5)` Composer.
The user bubble reported `max-height: none`, a `198px` client height, and a `198px` scroll height.
The complete fixture message was visible without internal overflow.
A password-protected launch reached the window while unauthenticated browser requests still returned `401`.
The keyed HMAC test rejected a reflected challenge from another process on the stable port.
A forced update request wrote two cache files into versioned application data.
No runtime cache entered the signed application resources.
A strict signature check and disk-image checksum passed.
The strict signature check passed again after the fixture launch.
A normal application quit terminated both Electron and the packaged Bun server.
The installed application was not replaced during this verification.

On 2026-09-04, commit `d1b16de` produced a signed Electron 44 ARM package.
The packaged renderer used only the three fixture sessions. Current evidence
covers [dark Summary](docs/design/evidence/after/summary-dark-1440x900.png),
[light Summary](docs/design/evidence/after/summary-light-1440x900.png),
[Project hover](docs/design/evidence/after/sidebar-project-hover-dark-1440x900.png),
[Session hover](docs/design/evidence/after/sidebar-session-hover-dark-1440x900.png),
[model menu](docs/design/evidence/after/model-menu-dark-1440x900.png),
[effort menu](docs/design/evidence/after/effort-menu-dark-1440x900.png), and the
[native window](docs/design/evidence/after/desktop-window-dark-1440x900.png).
The Summary panel measured 300px. Its 28px control used a 16px icon and the
Codex 10% neutral active fill. A page reload preserved the collapsed Project.
The full user message remained visible without an internal scrollbar.
The final signed application replaced `/Applications/OMP Desktop.app` at
version `0.4.2`. Its desktop health route returned 204 after installation.

## 14. Visual acceptance checklist

### 14.1 Geometry

- The desktop header measures `46px`.
- The default desktop sidebar measures `275px`, within one device pixel.
- Navigation rows measure `30px`.
- The wide transcript does not exceed `810px`.
- The chat content shares the composer's edges in a wide pane and sits `15px` inside them in a narrow pane, see 6.1. The editor keeps a `4px` gap above the footer row, the Codex `mb-1`.
- The resting composer measures at least `108px` high.
- The composer does not exceed `810px` wide.
- Rounded surfaces use `superellipse(1.5)` in the packaged desktop application.
- True circles and pills use `--corner-round` and remain round.
- Standard desktop icon controls measure `24px × 24px`; Summary measures `28px × 28px`.
- The transcript and composer share normal flex flow without overlap.
- The latest transcript content remains visible above the composer.

### 14.2 Color and typography

- Dark canvas, main surface, sidebar, text, and borders match section 4.
- Light tokens retain equal hierarchy and required contrast.
- Autospawn Sans renders in regular, medium, semibold, and italic samples.
- The browser makes no external font request.
- No font stack or generated CSS contains Inter.
- Transcript prose measures `16px / 24px`.
- Composer input text measures `14px / 20px`.
- Session text measures `13px / 18.5px`; project text measures `14px / 21px`.

### 14.3 Component quality

- Controls share primitive geometry and focus behavior.
- No touched component contains static inline styles.
- The checker reports no new inline-style debt.
- User, assistant, thinking, tool, and compaction content remain distinct.
- Dense tool output collapses without hiding status or errors.
- Composer controls remain clear at every responsive width.
- Settings, files, and subagents use the same component language.

### 14.4 Motion and accessibility

- Streaming appends without token delay or scroll jitter.
- User scrolling detaches automatic scrolling.
- The new-message control restores automatic scrolling.
- Reduced motion removes transforms, shimmer, and smooth scrolling.
- Keyboard users can operate every control.
- Focus order follows visual order.
- Dialog focus returns to the opening control.
- Screen readers receive concise streaming and error announcements.
- Every tested text and control pair meets WCAG 2.2 AA.

### 14.5 Andrew acceptance lens

- Calm density keeps OMP power visible without visual noise.
- Immediate clarity makes each control understandable at first inspection.
- Visible power keeps models, thinking, tools, files, and subagents available.
- Careful craft keeps spacing, corners, borders, motion, and typography consistent.

## 15. Completion gate

The final browser evidence is in `docs/design/evidence/after/README.md`.
It covers every required surface in both themes.
It covers desktop, tablet, and mobile viewports.
The release commit is `Release 0.4.1, the first fork release`.

Any failed OMP behavior blocks visual acceptance.
Any new inline-style debt blocks architecture acceptance.

### 15.1 Release, version, and the update button

Decided on 2026-09-02, grill Q3. This branch is the start of Andrew's own fork. Upstream `omp-web` on npm is the original author's package, and its `latest` is `0.4.0`.

1. Version. `0.4.1` was the first fork release. `0.4.2` identifies the Electron migration. A test rejects upstream `0.4.0`.
2. Update button. Superseded in 0.5.0. electron-updater reads Reeve's GitHub Releases. See ADR-0006 and `RELEASING.md`.
3. Install. The global install comes from a local pack. The steps are in `AGENTS.md`, "Install Reeve globally".
4. The fork's own update. Codex shows an update as a card near the bottom of the sidebar, above the account row, in the same slot as its usage alert and getting-started card. It reads "New Codex update available: {title}" with `Update`, `Read more`, and `Dismiss`, then `Restart now` once downloaded. A small `Update` label also appears in the app header while it downloads. Read from the Codex bundle on 2026-09-02, not seen live. This card, pointed at Reeve's own GitHub Releases feed, ships in 0.5.0 as `components/UpdateCard.tsx` above the sidebar footer. See ADR-0006.
