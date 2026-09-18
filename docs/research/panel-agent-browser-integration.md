# Research: how Codex Desktop gives its agent the built-in Browser

Research for [#440](https://github.com/AndrewBeniston/omp-reeve/issues/440).

Status: incomplete. The 200,000-token hard stop ended the research pass before
the OMP and Reeve mappings were complete. This file preserves verified Codex
Desktop findings and identifies the remaining work. It is not the resolution
report requested by the ticket.

## Sources read

- Codex Desktop web assets under
  `/tmp/reeve-codex-ref/app/webview/assets`.
- Codex Desktop main-process assets under
  `/tmp/reeve-codex-ref/app/.vite/build`.
- Current Reeve ADR-0011 and ADR-0012.
- Current Reeve Browser audit and adversarial Browser report.
- GitHub issues #191, #437, #438, #439, and #440, including all comments.

The installed application archive was not required during this partial pass.

## Verified Codex Desktop findings

Codex Desktop does not give the model a raw Chrome DevTools endpoint. It installs
the hidden `unified-computer-use` plugin. That plugin exposes the `cua_repl` MCP
server. The server supplies one JavaScript tool and the initialized `cua` API.

The main process enables the Browser surface only when the app-server supports
MCP tool exposure. The feature gates must also allow in-app Browser use. The
desktop configuration writes the plugin's `.mcp.json` file. It selects
`@oai/browser-desktop/service` for the Browser surface. It also supplies the
available backends through an environment value. The in-app backend has the
name `iab`.

The per-Session request carries `session_id`. The main process converts that
value into the conversation identifier. It rejects a request when no Browser
route exists for that conversation. Each Browser route also identifies one
desktop window.

The agent lists Browser instances through the initialized `cua` API. The agent
can select `iab` explicitly. The public runtime methods include `getState`,
`getBrowser`, `getTab`, and `createBrowserTab`. The first API call returns the
runtime documentation and current surface state.

The in-app backend returns the name `Codex In-app Browser`. It reports Browser
and Tab capability groups. It disables `Browser.user`. It can enable Browser
history through a feature gate. It explicitly supports `Tab.markDeliverable`
and `Tab.markHandoff`.

The in-app backend returns two Tab identifiers. `id` is a numeric CDP-facing
identifier. `providerTabId` is the Browser Tab identifier. The backend maps the
pair by Browser route and Browser Tab identifier. The Browser Tab identifier
survives renderer remounts. The numeric identifier survives while the backend
retains the route mapping.

`createBrowserTab("iab", ...)` asks the backend to create a Tab. The backend
creates a `browser-use:<uuid>` Browser Tab identifier. It then calls the Browser
host with `createPanelTab: true`. The host creates the page and sends an
`open-browser-tab` message to the renderer. That message sets `active: false`
and `deferUntilPanelVisible: true`.

This sequence answers the page-adoption question. Codex Desktop creates the
Browser Tab and its page through one host operation. It does not create an
unmanaged Chromium page and discover it later.

The renderer can host an agent page while both visible placements are occupied.
`HiddenBrowserUseWebviewHost` mounts Browser-use pages that are absent from the
right and bottom placements. It uses the same conversation identifier and
Browser Tab identifier. It sets the page invisible and enables hidden bootstrap.

Visibility is a separate Tab capability. Showing a Tab opens the Browser panel
for that conversation. Hiding a Tab closes the panel only when that Tab is
active. The source does not let the agent select `right` or `bottom` directly.
The renderer's existing Tab record owns the visible placement.

The backend lists only Tabs from the Session's Browser route. It rejects a Tab
whose route differs from the requesting Session. It returns a clear error for
an unknown Tab, a missing Session identifier, a missing Browser route, or a
missing desktop window.

When no Tab exists, a supported navigation command creates one automatically.
Other commands require a Tab identifier. A visibility request can remain pending
until a Tab exists. This distinction prevents an empty Session from selecting an
unrelated Tab.

The backend attaches Electron's debugger to the selected page. It executes CDP
commands against that page. It checks navigation policy before navigation. It
also verifies that the current page still matches the Browser route and Tab.

The backend tracks temporary and persistent lifetimes. At turn end, it closes an
unmarked temporary Tab. A deliverable or handoff mark preserves the Tab. A
persistent human Tab remains present after Browser control ends. The backend
removes debugger state, cursor state, clipboard bridges, and page-capture leases.

Browser tool results can include `codex/toolSurface` metadata. The metadata names
the backend, Browser identifier, open Tab identifiers, and an optional screenshot.
Codex Desktop converts this metadata into Browser-use activity and picture-in-
picture content. Clicking the in-app Browser presentation focuses the matching
Session and numeric Tab identifier through the Browser Session registry.

## Preliminary ticket traceability

| Ticket | Preliminary result | Evidence |
| --- | --- | --- |
| #191 | Partly matches the reference. | Codex has stable Browser Tab identity and Session route checks. It does not expose OMP's matcher or CDP endpoint model. |
| #437 | Reeve-only design. | Codex registers a Session-scoped MCP service and native Browser backend. It does not pass a loopback CDP discovery address to the agent. |
| #438 | Partly matches the reference. | Codex exposes list, create, focus, visibility, close, and control through `cua_repl`. Its tools do not expose Reeve's Tab registry directly. |
| #439 | Contradicts the reference sequence. | Codex creates the panel Tab and page together. It does not adopt an unmanaged agent-created page after target discovery. |

These results require the current OMP mapping before they can become final ticket
corrections.

## Security findings already verified

| Area | Codex Desktop behavior |
| --- | --- |
| Session isolation | Every request carries a Session identifier. The backend rejects cross-route Tab identifiers. |
| Window isolation | A Browser route identifies one live desktop window. A missing window fails safely. |
| Page privileges | The page host owns the Browser page. The agent receives controlled commands instead of a global CDP endpoint. |
| Navigation | The host checks Browser-use navigation restrictions before navigation. |
| Downloads | A download requires a short-lived grant bound to the Session, Tab, and URL. |
| Cookies | The in-app Browser uses the app's Browser Session service. The partial pass did not complete its partition audit. |
| Tool output | Page text remains untrusted content. Browser tool metadata identifies the controlled surface. |
| Lifetime | Temporary Tabs close at turn end unless the agent marks them for handoff or delivery. |

## Failure states already found

| State | Result |
| --- | --- |
| Missing `session_id` | The backend rejects the request. |
| Missing Session route | The backend reports that no ChatGPT Browser route exists. |
| Missing window | The backend reports that the Browser window is unavailable. |
| Unknown Tab | The backend rejects the numeric Tab identifier. |
| Cross-Session Tab | The backend rejects the Tab because it belongs to another Browser Session. |
| Closed page | The backend removes stale runtime state and can rematerialize a retained Tab. |
| Renderer remount | The Browser Tab identifier lets the new host reopen the same logical Tab. |
| Page mismatch | The backend rejects a stale Tab-to-page association. |
| No Tab and navigation requested | The backend creates one temporary panel Tab. |
| No Tab and another command requested | The backend requires a Tab identifier. |
| Route disposal | Temporary Browser-use pages close. Persistent pages leave Browser control. |
| Turn end | Unmarked temporary Tabs close. Marked or persistent Tabs remain. |
| Failed panel attachment | The pending open request rejects. Cleanup closes or releases the page. |

## Reference sequence

1. Codex Desktop selects the Browser surface for a local Session.
2. Codex Desktop enables the hidden `cua_repl` MCP plugin.
3. The plugin loads `@oai/browser-desktop/service`.
4. The model calls the single JavaScript MCP tool.
5. The initialized `cua` API lists Browser backends.
6. The model selects the `iab` backend.
7. The backend validates the Session route and desktop window.
8. A create request allocates one stable Browser Tab identifier.
9. The Browser host creates the page and panel Tab together.
10. The renderer mounts the page in a visible or hidden Browser host.
11. The backend maps the Browser Tab identifier to a numeric Tab identifier.
12. Browser commands attach the debugger and target that mapped page.
13. Tool metadata supplies activity and screenshot presentation data.
14. A human selects that presentation to focus the controlled Browser Tab.
15. Turn cleanup closes, releases, or preserves the Tab according to its lifetime and mark.

## Remaining work

The final report must still inspect current OMP source directly. It must map the
Browser tool, registry, supervisor, settings, extension discovery, skills, system
prompt, and transcript renderer.

The final report must inspect current Reeve Browser source and desktop bridge.
It must verify Session registration, placement, restoration, transfer, and access
grant behavior against `origin/main`.

The final report must complete the cookie, permission, authentication, process
crash, service restart, and access-denial matrices.

The final report must convert the preliminary ticket results into exact issue
edits, removals, splits, and new tickets. It must count the final capabilities and
gaps. Only then can the same report resolve and close #440.

## Codex Desktop source anchors

- `.vite/build/main-DaMR-wdT.js`: `Bte`, `HRe`, `fze`, `xze`, `UX`, `Cze`,
  `WX`, `GX`, `Lie`, and `Rie` in the extracted application.
- `.vite/build/src-CCXHtyvY.js`: bundled plugin registry, Browser instructions,
  MCP exposure gate, and runtime path configuration.
- `webview/assets/hidden-browser-use-webview-host-4b649c08f83b.js`:
  `HiddenBrowserUseWebviewHost`.
- `webview/assets/tab-persistence-state-4974387415e5.js`: Browser Tab persistence
  schema with right and bottom placement values.
