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
