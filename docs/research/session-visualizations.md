# Session visualizations

Status: incomplete because the research goal reached its 200,000-token limit.

This report records only verified Codex Desktop findings. The OMP and Reeve comparison remains open.

## Sources inspected

- Codex Desktop extracted webview and Electron bundles.
- The bundled `visualize` skill, version 1.0.38.
- The skill's `tweak.md` and standalone rendering assets.
- Existing visualization files under the Codex home directory.

The application bundle was not required for these findings.

## Verified lifecycle

1. Codex installs the bundled `visualize` plugin into its runtime marketplace.
2. The app asks the Codex server to reload the skill list after marketplace changes.
3. The skill tells the model to write an HTML fragment into the thread visualization directory.
4. Codex adds that directory to the turn's writable sandbox roots.
5. The model emits a visualization content reference in its assistant text.
6. The transcript parser converts the reference into an internal visualization directive.
7. The transcript supplies source paths from the turn's file changes.
8. The renderer reads the referenced file through the host visualization service.
9. The renderer rejects content above 5 MB.
10. Codex starts an isolated Chromium sandbox and supplies the fragment to its widget runtime.
11. The sandbox measures its content and reports the height to the transcript.
12. The transcript shows controls for expansion, image copying, and Sites publication.

## Content reference

The normal reference is:

```text
visualize{"path":"<absolute-path>/<title>.html"}
```

Wide mode adds `"mode":"wide"`. The object can also contain `title`.

Codex also accepts internal `codex-inline-vis` and `codex-live-vis` directives. Those directives accept `file` or `path`.

The parser hides an incomplete streaming reference until its closing marker arrives.

## File location and ownership

Codex computes this root from the Codex home directory and the thread identifier:

```text
$CODEX_HOME/visualizations/YYYY/MM/DD/<thread-id>/
```

The Codex Desktop filesystem service owns this location. The application grants the active turn write access to it.

The transcript records changed visualization paths by file name. This map lets copied or forked transcript content resolve its source thread.

## Sandbox and security

| Area | Verified behavior |
| --- | --- |
| Desktop container | Codex creates an Electron `webview` with a unique partition. |
| Chromium settings | Context isolation, Chromium sandboxing, and web security remain enabled. Node integration is disabled in subframes. |
| Network | The session restriction rejects requests outside the approved policy. Downloads are blocked. |
| Permissions | The session denies permissions except narrowly handled host cases. |
| Referrer | The generated document uses `no-referrer`. |
| Size | The renderer rejects fragments above 5 MB. The skill asks the model to stay below 1 MB. |
| External links | Codex requires a user gesture. Unsafe links receive a confirmation dialog. |

The generated visualization document uses this policy:

| Directive | Policy |
| --- | --- |
| `default-src` | `'none'` |
| `script-src` | Inline scripts, evaluation, WebAssembly evaluation, and approved CDNs |
| `style-src` | Inline styles and approved CDNs |
| `img-src`, `font-src`, `media-src` | `blob:`, `data:`, and approved CDNs |
| `worker-src` | `blob:` |
| `connect-src` | `blob:` and `data:` only |
| `frame-src` | `'none'` |
| `object-src`, `base-uri`, `form-action` | `'none'` |

The approved CDN origins are `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `esm.sh`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, and `fonts.bunny.net`.

The browser fallback uses an iframe with scripts and same-origin access. The standalone export uses a nested iframe with scripts only.

## Host bridge

The sandbox connects these host handlers:

| Handler | Purpose |
| --- | --- |
| `callMcp` and `callTool` | Internal ready, height, error, download, hover, click, and annotation messages. Other tool calls fail. |
| `notifyIntrinsicHeight` | Updates the transcript height. |
| `notifyEnvironmentError` | Reports script failures. |
| `openExternal` | Validates a user gesture and opens an approved external link. |
| `requestDisplayMode` | Changes between inline and full-screen modes. |
| `sendFollowUpMessage` | Creates a confirmed follow-up turn. |
| `notifyBackgroundColor`, `notifyIntrinsicWidth`, `notifyNavigation`, `notifySecurityPolicyViolation`, `sendInstrument` | Present handlers with no visualization action in the inspected route. |
| `updateWidgetState` | Present, but implemented as a no-op in the inspected inline route. |

The skill documents `window.openai.widgetState`, `setWidgetState`, and the `openai:set_globals` event. The runtime initializes this route with `widgetState: null`.

The inspected inline host does not persist `setWidgetState` updates. Saved state restoration therefore remains unverified.

## Theme and utilities

The host supplies light or dark appearance, visualization style variables, and a base stylesheet.

The verified color tokens include surface pairs, six series colors, semantic colors, border, input, and focus colors.

The skill defines utilities for cards, grids, rows, statistics, controls, buttons, tabs, forms, tables, progress, badges, tiles, tooltips, and accessible text.

The complete token values and utility implementation still require a bounded extraction.

## Width and resize behavior

Normal mode targets 736 pixels. Wide mode can expand to 1,024 pixels.

The transcript marks wide blocks with `VisualizationWideBlock`. Wide content can open in a full-screen preview.

The host starts at 240 pixels. It measures the fragment and caches the height against the file content and width.

A resize observer sends new host dimensions into the sandbox. The frame updates when its measured content changes.

## Design controls

The skill exposes a guarded global `Tweak` helper for mockups. It supports sliders, color pickers, toggles, and selects.

The helper registers controls with the host. The host opens a lazy annotation editor over the visualization.

The inspected labels are `Adjust`, `Describe these changes...`, and `Apply the changes`. The ticket's requested labels differ from this bundle.

The host can reset draft values. Submission sends the selected edits and optional text as a follow-up turn.

## Transcript actions

The inline frame appears inside the assistant Markdown transcript.

The action surface supports expansion, `Copy as image`, and `Publish to Sites…`.

Sites publication creates a standalone document with its sandbox and policy. Codex then sends that document to the Sites workflow.

## Failure behavior

| Failure | Verified behavior |
| --- | --- |
| Oversize | A file above 5 MB produces an inline error. |
| Missing or unreadable file | The read error produces an inline error. |
| Script error | The sandbox reports the error and offers an agent repair action. |
| Sandbox timeout | Codex retries preparation once, then reports a timeout. |
| Sandbox initialization | Codex records an initialization failure and shows the error surface. |
| Blocked network request | The Electron session cancels the request. |
| Blocked external link | Codex requires a gesture and can show a confirmation dialog. |
| Stale path | The parser can recover a source path from the file-name map. Other stale-path behavior remains unverified. |

## Remaining work

The research still needs these items:

1. Verify the complete theme token values and utility class contract.
2. Resolve the mismatch between the documented widget state API and the no-op inline host.
3. Verify every stale-path and blocked-origin presentation state.
4. Inspect current OMP skill loading and extension widget support.
5. Inspect current Reeve transcript, panel, and terminal surfaces.
6. Read the established Session-service research pattern.
7. Answer all five OMP and Reeve questions.
8. Estimate the Reeve epic size.
9. Add the final resolution comment and close issue 445 only after completion.

## Continuation findings

### 1. Theme values and utility contract

I verified these values in the bundled skill stylesheet from version 1.0.38.

The host can override nine fallback values through its active theme.

The stylesheet uses each host value before its bundled fallback.

| Purpose | Light value | Dark value |
| --- | --- | --- |
| Page surface | RGB 255, 255, 255 | RGB 24, 24, 24 |
| Main text | RGB 26, 28, 31 | RGB 255, 255, 255 |
| Card surface | 5 percent text mixed with page | 5 percent text mixed with page |
| Card text | RGB 26, 28, 31 | RGB 255, 255, 255 |
| Popover surface | RGB 255, 255, 255 | RGB 45, 45, 45 |
| Popover text | RGB 26, 28, 31 | RGB 255, 255, 255 |
| Primary surface | RGB 51, 156, 255 | RGB 131, 195, 255 |
| Primary text | RGB 255, 255, 255 | RGB 13, 13, 13 |
| Secondary surface | RGB 255, 255, 255 at 96 percent | RGB 54, 54, 54 at 96 percent |
| Secondary text | RGB 26, 28, 31 | RGB 255, 255, 255 |
| Muted surface | Main text at 10 percent | Main text at 10 percent |
| Muted text | RGB 26, 28, 31 at 49.4 percent | RGB 255, 255, 255 at 49.8 percent |
| Accent surface | RGB 229, 242, 255 | RGB 13, 39, 63 |
| Accent text | RGB 51, 156, 255 | RGB 131, 195, 255 |
| Destructive text | RGB 226, 85, 7 | RGB 255, 133, 73 |
| Subtle border | RGB 26, 28, 31 at 8 percent | RGB 255, 255, 255 at 8.2 percent |
| Input border | RGB 26, 28, 31 at 11.8 percent | Black at 10 percent |
| Focus ring | RGB 51, 156, 255 | RGB 131, 195, 255 at 76 percent |
| Blue | RGB 51, 156, 255 | RGB 51, 156, 255 |
| Orange | RGB 226, 85, 7 | RGB 251, 106, 34 |
| Green | RGB 0, 162, 64 | RGB 64, 201, 119 |
| Red | RGB 224, 46, 42 | RGB 255, 103, 100 |
| Purple | RGB 146, 79, 247 | RGB 173, 123, 249 |
| Yellow | RGB 255, 195, 0 | RGB 255, 210, 64 |
| Series one | Primary surface | Primary surface |
| Series two | RGB 243, 136, 59 | RGB 245, 154, 86 |
| Series three | RGB 93, 201, 119 | RGB 116, 213, 139 |
| Series four | RGB 235, 119, 177 | RGB 240, 143, 192 |
| Series five | RGB 155, 121, 236 | RGB 170, 145, 239 |
| Series six | RGB 58, 185, 177 | RGB 90, 203, 194 |

The base text size is 14 pixels unless the host supplies another value.

Normal text cannot become smaller than 11 pixels.

Small text uses two pixels below the base size, with an 11-pixel minimum.

Tooltip text uses one pixel below the base size.

Heading sizes equal 1.714, 1.429, and 1.286 times the normal size.

The stylesheet uses text weights 430 and 500.

The skill tells the model to use weights 400 and 500.

The default radius is 10 pixels.

Small, medium, large, extra-large, and full radii are 6, 8, 10, 16, and 9,999 pixels.

I verified the complete utility behavior without copying the utility identifiers.

| Utility group | Verified contract |
| --- | --- |
| Root layout | Full width, transparent background, vertical flow, and a 12-pixel gap. |
| Cards | A 12-pixel inset, a 16-pixel radius, no border, and a five-percent text tint. |
| Peer grids | Automatic equal columns use a 180-pixel minimum and a 10-pixel gap. |
| Rows | Related items wrap, align centrally, and use a 10-pixel gap. |
| Statistics | Values use the second heading size and a 500 weight. |
| Separators | A one-pixel theme border has six pixels of vertical margin. |
| Navigation | Items align centrally with a four-pixel gap. |
| Progress | The track is eight pixels high with fully rounded ends. |
| Badges | The inset is three pixels vertically and eight pixels horizontally. |
| Control groups | Controls wrap with an eight-pixel gap. Labeled fields become two columns when space permits. |
| Buttons | The minimum height is 28 pixels. The horizontal inset is eight pixels. |
| Primary buttons | The main text color supplies the background. The inverse color supplies the text. |
| Ghost buttons | The background stays transparent until interaction. |
| Selected buttons | The primary pair supplies the fill and text. Selectable tiles keep their category fill. |
| Disabled controls | Controls use 40 percent opacity and a disabled cursor. |
| Text fields | The minimum height is 28 pixels. The horizontal inset is eight pixels. |
| Text areas | The minimum height is 72 pixels. Vertical resizing remains available. |
| Color inputs | The control measures 40 by 28 pixels. |
| Select controls | The right inset is 32 pixels. Two gradients draw the arrow. |
| Checkboxes and radios | Each control measures 14 pixels. Checked controls use the primary pair. |
| Switches | The track measures 32 by 20 pixels. The thumb measures 16 pixels. |
| Range controls | The track is two pixels high. The thumb measures 20 pixels. |
| Tables | Cells use 10 pixels vertically and 24 pixels after content. |
| Compact tables | Cells use six pixels vertically and 16 pixels after content. |
| Tooltips | The inset is four by eight pixels. The maximum width is 20 root font units. |
| Hidden text | The accessible box measures one pixel and remains outside visual flow. |
| Coarse pointers | Interactive targets increase to at least 44 by 44 pixels. |
| Icons | Icons measure 16 pixels and use a 1.6-pixel stroke. |
| Error text | The destructive theme value supplies the text color. |

The stylesheet also supplies hover, focus, disabled, selected, and coarse-pointer states for every interactive utility.

The utility contract includes responsive tables, alignment, no-wrap text, muted text, small text, and tabular numbers.

The utility contract includes buttons, tabs, fields, selects, checkboxes, radios, switches, ranges, progress, badges, and tooltips.

### 2. Widget state resolution

I verified two separate visualization routes in the current desktop bundle.

The earlier no-op handler belongs to the shared snapshot route.

That route disables interactions and expansion.

It does not represent an active session transcript.

The active transcript route implements widget state persistence.

| State behavior | Verified active transcript result |
| --- | --- |
| Initial state | The host reads the saved snapshot before sandbox execution. |
| Availability | The host reports persistence when a visualization has a stable identity. |
| Update | The host validates and replaces the complete snapshot. |
| Immediate response | The sandbox updates its local value before the host receipt arrives. |
| Re-render | The host supplies the saved snapshot to the new sandbox instance. |
| Host update | The host can replace the running sandbox state without restarting it. |
| Scope | The key combines the host, session, and normalized visualization path. |
| Retention | The state store retains at most 100 visualization entries per session scope. |
| Snapshot limit | One snapshot cannot exceed 16 KiB after serialization. |
| Model context | Only model content can enter later model context. |
| Context limit | Collected visualization context stops before 64 KiB. |
| Private state | Private content returns to the sandbox but does not enter model context. |
| Images | The route rejects image attachments. |
| Invalid state | The host returns a permanent invalid-state result. |
| Storage failure | The host returns a permanent storage-unavailable result. |

The host initializes missing model content and private content as null.

The state update replaces the prior snapshot.

The state update does not create a new turn.

The active route restores state during component reconstruction.

I did not verify restoration after a complete application restart.

The standalone export uses browser storage instead of the desktop state store.

The standalone export keys state by its page path and query.

The standalone export reports no persistence when browser storage is unavailable.

### 3. Stale paths and blocked origins

I verified these presentation rules in the current desktop renderer and Electron host source.

I did not force each failure in the running application.

| Path state | Verified source behavior |
| --- | --- |
| Missing reference | The renderer creates no visualization surface. |
| Missing session identity | The renderer creates no visualization surface. |
| Loading | A 240-pixel placeholder shows an accessible loading label. |
| Copied filename | The renderer can resolve the original source path through the turn file map. |
| Copied source session | The renderer reads the file against the source session. |
| Explicit stale path | The renderer does not replace an explicit path through the filename map. |
| Missing map entry | The renderer attempts the supplied reference without recovery. |
| Invalid file name | The host rejects the read. |
| Path outside allowed roots | The host rejects the read. |
| Symbolic-link path | The host rejects the read. |
| Missing file | The read fails without an automatic retry. |
| Unreadable file | The read fails without an automatic retry. |
| Oversized file | The host returns no content above 5 MB. |

A failed read creates the same danger alert as a script failure.

The alert says that an error occurred inside the visualization.

The alert does not show the underlying file error.

The user can dismiss the alert.

The alert offers a repair action when the session can accept a follow-up turn.

The repair action includes the file name and internal error in a confirmed prompt.

| Origin state | Verified source behavior |
| --- | --- |
| Approved secure resource | The Electron session permits the request. |
| Approved embedded data | The Electron session permits the request. |
| Unapproved resource origin | The Electron session cancels the request. |
| Blocked connection | The document policy prevents the connection. |
| Blocked frame or object | The document policy prevents the embedded content. |
| Security policy report | The active transcript host records no visible action. |
| Dependent script failure | A later script exception can create the generic danger alert. |
| Direct popup | The Electron host denies the popup without a visualization message. |
| Download attempt | The Electron host cancels the download without a visualization message. |
| Permission request | The Electron host denies the permission without a visualization message. |
| External link without gesture | The host ignores the request. |
| Approved external link | The host opens the link after a user gesture. |
| Unapproved external link | The host shows a confirmation dialog with the destination. |

The confirmation dialog offers Cancel and Open link actions.

The dialog warns that the external website could receive information.

Blocked resource requests therefore fail silently unless their absence causes a script failure.

## OMP and Reeve continuation

This continuation preserves the earlier report and completes remaining items four through nine.

### 4. OMP skill loading and extension widgets

The OMP comparison uses the locked OMP 18.1.6 package source.

| Area | Finding | Evidence label |
| --- | --- | --- |
| Skill format | OMP accepts `SKILL.md` files with Agent Skills frontmatter and a Markdown body. | Source-verified. |
| Skill discovery | OMP scans enabled user, Project, custom, and installed plugin sources. | Source-verified. |
| Model discovery | OMP lists each visible skill by name, description, and file location. | Source-verified. |
| Skill activation | OMP reads the selected Markdown body and removes only its frontmatter. | Source-verified. |
| Skill delivery | OMP sends the complete Markdown body inside a skill prompt message. | Source-verified. |
| Relative resources | OMP tells the model to resolve relative skill resources from the skill directory. | Source-verified. |
| Visualize portability | OMP can load the bundled `visualize` skill unchanged from a discovered source. | Source-verified. |
| Current installation | Reeve would require the skill inside an OMP-discovered directory or installed plugin. | Inference. |
| Widget content | OMP widgets accept text lines or a terminal component factory. | Source-verified. |
| Widget placement | OMP places widgets above or below the terminal editor. | Source-verified. |
| RPC widgets | OMP RPC sends text-line widgets and ignores terminal component factories. | Source-verified. |
| Custom interface | OMP interactive mode can replace the editor or show a terminal overlay. | Source-verified. |
| RPC custom interface | OMP RPC does not support custom terminal components. | Source-verified. |
| HTML support | OMP defines no HTML widget, iframe, browser sandbox, or widget-state bridge. | Source-verified. |
| Near match | OMP renders tool results, including edit differences, as terminal components. | Source-verified. |
| Near match | OMP also has a fixed-height terminal visualizer for live voice. | Source-verified. |
| Artifact support | OMP artifacts store large text output and expose text references. | Source-verified. |
| Visualization concept | OMP has no visualization content type or visualization lifecycle. | Source-verified. |

The portable skill keeps its current Markdown instructions.

Those instructions can make the model create the same HTML fragment.

OMP does not interpret the fragment reference or render the resulting file.

Source anchors:

- `package.json`
- OMP `src/capability/skill.ts`
- OMP `src/extensibility/skills.ts`
- OMP `src/extensibility/extensions/types.ts`
- OMP `src/modes/rpc/rpc-mode.ts`
- OMP `src/tools/renderers.ts`
- OMP `src/live/visualizer.ts`

### 5. Reeve transcript, panel, and terminal surfaces

I read the current Reeve source in this repository.

| Area | Finding | Evidence label |
| --- | --- | --- |
| Transcript body | Reeve renders assistant text as Markdown in the page document. | Source-verified. |
| Markdown pipeline | Reeve enables tables, math, frontmatter, raw HTML, and sanitization. | Source-verified. |
| Sanitization | The schema removes frame, object, style, and form elements from assistant HTML. | Source-verified. |
| Raw HTML limit | An assistant reply therefore cannot create a frame through Markdown alone. | Source-verified. |
| Existing rich block | The transcript renders one diagram language as generated markup inside the page. | Source-verified. |
| Diagram isolation | That markup enters the page document and not a separate browsing context. | Source-verified. |
| Directive precedent | Reeve already reads a structured directive out of assistant text for review comments. | Source-verified. |
| Directive safety | That parser refuses a directive inside fenced, indented, or quoted text. | Source-verified. |
| Written files | The transcript lists turn output files from tool calls and not from reply text. | Source-verified. |
| Closest frame host | The file viewer shows an HTML file in a frame with a script-only sandbox. | Source-verified. |
| Generated document | The file route can return generated HTML with a strict policy and no referrer. | Source-verified. |
| Path safety | The file route serves only paths inside allowed roots. | Source-verified. |
| Panel tabs | The right panel supports file, sources, browser, terminal, and review tabs. | Source-verified. |
| Panel sizing | Panel width rules exist with a 320-pixel floor and a 1,200-pixel ceiling. | Source-verified. |
| Browser tab | The desktop main process owns each page. The browser build offers no browser tab. | Source-verified. |
| Terminal tab | The terminal needs the desktop process bridge for each shell. | Source-verified. |
| Extension status | Reeve shows extension status as one sanitized text line with color segments. | Source-verified. |
| Missing concept | Reeve defines no visualization content type, height bridge, or widget-state store. | Source-verified by repository search. |

Reeve has a sandboxed frame today.

That frame exists only in the file viewer and not in the transcript.

The frame uses a script-only sandbox and carries no host message channel.

Reeve therefore holds the containment half of the Codex surface.

Reeve holds no part of the transcript visualization lifecycle.

Source anchors in this repository:

- `components/MarkdownBody.tsx`
- `components/MermaidBlock.tsx`
- `lib/markdown.ts`
- `lib/review-finding-directive.ts`
- `components/TurnWrittenFiles.tsx`
- `components/FileViewer.tsx`
- `app/api/files/[...path]/route.ts`
- `components/TabBar.tsx`
- `lib/panel-layout.ts`
- `components/browser/BrowserTabs.tsx`
- `components/terminal/TerminalTabs.tsx`
- `components/ExtensionStatusBar.tsx`

### 6. The established Session-scoped service pattern

I read the completed Browser research on the merged main line.

That report is `docs/research/panel-agent-browser-integration.md`.

It defines how Reeve gives an agent a host surface.

| Pattern rule | Statement | Evidence label |
| --- | --- | --- |
| Service scope | The host registers one service against the active agent session. | Source-verified. |
| Identity owner | Reeve owns the stable object identifier. The engine resolves its own target internally. | Source-verified. |
| Atomic creation | One host operation creates the record and its live object together. | Source-verified. |
| Isolation | Route checks reject an object that belongs to another session. | Source-verified. |
| Transport hiding | The model never receives a raw endpoint or a raw host address. | Source-verified. |
| Engine reuse | Reeve keeps the OMP capability for the work OMP already performs. | Source-verified. |
| Engine adaptation | Reeve wraps loose OMP matching behind exact Reeve identity. | Source-verified. |
| Activity card | Tool metadata renders a typed transcript card with a host action. | Source-verified. |
| Acceptance | One acceptance ticket proves the owner set, the failure matrix, and transcript focus. | Source-verified. |

The visualization work maps onto the same pattern.

A visualization is a session-scoped object with a stable identifier.

A visualization needs atomic creation of its file record and its render surface.

A visualization needs session isolation for its saved state.

A visualization needs a typed transcript card and a host action.

This match is an inference from the Browser report and the current Reeve source.

### 7. The five OMP and Reeve answers

#### Question one: can OMP deliver the same skill

Yes. OMP can deliver the bundled skill unchanged.

OMP reads a `SKILL.md` file, removes the frontmatter, and sends the Markdown body.

The skill body is instruction text, so OMP transports it without change.

The skill must sit in a directory OMP already scans.

This answer is source-verified from the OMP 18.1.6 source.

One limit applies. The delivered skill makes the model write an HTML file.

OMP then does nothing with that file.

#### Question two: does OMP have an HTML, widget, or artifact surface

No. OMP has no HTML surface.

| OMP surface | What it accepts | Evidence label |
| --- | --- | --- |
| Extension widget | Text lines or a terminal component factory. | Source-verified. |
| RPC widget | Text lines only. | Source-verified. |
| Custom interface | A terminal editor replacement or a terminal overlay. | Source-verified. |
| Tool renderer | Terminal components, including edit differences. | Source-verified. |
| Artifact | Large text output with a text reference. | Source-verified. |
| Visualization | No content type and no lifecycle. | Source-verified. |

OMP defines no frame, no content policy, and no widget-state bridge.

#### Question three: does Reeve have a surface for a sandboxed fragment

Yes, in one place only.

The Reeve file viewer already shows an HTML file inside a script-only sandboxed frame.

The Reeve file route already returns a generated document with a strict content policy.

Both facts are source-verified in this repository.

The transcript has no such surface.

The transcript Markdown sanitizer removes a frame element from assistant HTML.

Reeve therefore holds a containment precedent and no transcript host.

A further advantage applies. A sandboxed frame works in the browser build and the desktop build.

The Browser tab and the Terminal tab need the desktop process. A visualization does not.

That portability claim is an inference from the current source.

#### Question four: what Reeve builds and what comes from OMP unchanged

| Item | Owner | Evidence label |
| --- | --- | --- |
| The skill Markdown and its instructions | OMP unchanged. | Source-verified. |
| Skill discovery and delivery to the model | OMP unchanged. | Source-verified. |
| Model output of an HTML file | OMP unchanged. | Source-verified. |
| File writing through the agent tools | OMP unchanged. | Source-verified. |
| A per-session visualization directory and write permission | Reeve builds. | Inference. |
| The content reference parser in assistant text | Reeve builds. | Inference. |
| The transcript visualization block | Reeve builds. | Inference. |
| The sandboxed frame and its content policy | Reeve builds on its file viewer precedent. | Inference. |
| The host message channel and height reporting | Reeve builds. | Inference. |
| The widget-state store and its limits | Reeve builds. | Inference. |
| The follow-up message action | Reeve builds on its existing prompt route. | Inference. |
| The theme variable bridge | Reeve builds from its own tokens. | Inference. |
| Failure surfaces and the repair action | Reeve builds. | Inference. |
| Export and standalone document | Reeve builds. | Inference. |

The division is simple. OMP supplies the instruction and the file.

Reeve supplies every part that renders, contains, and remembers that file.

#### Question five: is a Reeve visualization epic worth proposing

Yes. The epic is worth proposing.

Three reasons support this answer.

The model half already works through OMP with no engine change.

Reeve already contains a sandboxed frame and a strict generated document.

Reeve already parses a structured directive out of assistant text.

Two conditions limit the value.

The epic needs the session service pattern from the Browser research first.

The epic needs an accepted decision record before any transcript frame ships.

The scope appears in item 8.

### 8. Reeve epic size

The epic holds 23 tickets in eight groups.

One of the 23 tickets is the acceptance ticket.

| Group | Tickets | Work |
| ---: | ---: | --- |
| A. Skill delivery | 2 | Place the skill in an OMP source. Point its instructions at the Reeve write root. |
| B. Session visualization service | 4 | A session-scoped service, a write root, atomic creation, and session isolation. |
| C. Transcript render surface | 4 | The reference parser, the transcript block, normal width, and wide mode. |
| D. Sandbox and host bridge | 4 | The frame document, the content policy, the message channel, and height reporting. |
| E. State | 2 | The widget-state store with its size and count limits, plus restoration. |
| F. Theme and utilities | 2 | The theme variable bridge and the base stylesheet delivery. |
| G. Failure and actions | 4 | Failure surfaces, the repair action, expansion, and export. |
| H. Acceptance | 1 | The owner set, the failure matrix, and a proof of a rendered visualization. |

The group order is also the delivery order.

Groups A and B must complete before group C starts.

Group D carries the highest risk because it defines the security boundary.

The Browser epic holds 33 non-acceptance children.

This epic is therefore about two thirds of the Browser epic size.

That comparison is an inference from the two ticket sets.

## Can Reeve do this

Yes, Reeve can do this. The work divides into two halves.

The model half is portable today.

OMP reads and delivers the visualization skill without any change.

The model then writes the same HTML file it writes for Codex Desktop.

Reeve needs no engine fork for that half.

The host half does not exist in Reeve.

Reeve must build the reference parser, the transcript block, the sandboxed frame, the content policy, the host message channel, the height measurement, the state store, the theme bridge, and the failure surfaces.

Reeve starts this half with two real assets.

The file viewer already runs an HTML file in a script-only sandboxed frame.

The file route already returns a generated document with a strict content policy and no referrer.

The build costs 23 tickets in eight groups.

The security boundary group carries the highest risk.

The epic is about two thirds the size of the Browser integration epic.

A sandboxed frame needs no desktop process, so both Reeve builds can show a visualization.

The last statement is an inference. I did not run a visualization in Reeve during this research.
