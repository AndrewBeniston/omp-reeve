# Research: how Codex Desktop gives its agent the built-in Browser

Research for [#440](https://github.com/AndrewBeniston/omp-reeve/issues/440).

Status: complete.

## Verdict

Codex Desktop uses a Session-scoped `cua_repl` MCP service.

Codex Desktop does not give the agent a global CDP endpoint.

Codex Desktop creates a Browser Tab and its page in one host operation.

OMP 18.1.6 exposes one discoverable Browser tool.

OMP selects connected pages with a URL or title substring.

OMP does not understand Reeve Browser Tab identifiers.

Reeve does not register its Browser Tabs with an `AgentSession`.

Reeve restores Project URLs with new Browser Tab identifiers.

Reeve supports the Right placement only.

Reeve requires manual CDP endpoint copying after the restart-bound grant.

Reeve renders Browser calls as generic tool cards.

Reeve cannot open the controlled Browser Tab from a tool card.

Ticket #437 describes a necessary Reeve adaptation.

Ticket #438 partly matches Codex Desktop.

Ticket #191 must adapt OMP target selection to Reeve identity.

Ticket #439 describes a different sequence from Codex Desktop.

Replace #439 with atomic creation through the Session Browser service.

Create one ticket for Browser activity cards and exact Tab focus.

The table has 18 reference capabilities.

Reeve completes one capability, partly completes four, and lacks thirteen.

The four partial capabilities also require work.

Therefore, the integration has seventeen open capability gaps.

## Evidence boundary

This final pass used the completed findings and the existing checkpoint.

It did not perform new source research.

The Codex reference is ChatGPT Desktop 26.908.40834.

The OMP comparison uses the locked OMP 18.1.6 source.

The Reeve comparison uses this branch and its accepted ADRs.

No live application test occurred during this final pass.

This report makes no user-visible success claim.

The prior pass read these primary sources:

- Codex Desktop web assets under `/tmp/reeve-codex-ref/app/webview/assets`.
- Codex Desktop main-process assets under `/tmp/reeve-codex-ref/app/.vite/build`.
- OMP Browser source and Browser prompt files for version 18.1.6.
- Current Reeve Browser source, ADR-0011, and ADR-0012.
- Current issue bodies and native issue relationships.

## Source anchors

### Codex Desktop

- `.vite/build/main-DaMR-wdT.js` contains `Bte`, `HRe`, `fze`, `xze`, `UX`, `Cze`, `WX`, `GX`, `Lie`, and `Rie`.
- `.vite/build/src-CCXHtyvY.js` contains plugin registration and Browser runtime configuration.
- `webview/assets/hidden-browser-use-webview-host-4b649c08f83b.js` contains `HiddenBrowserUseWebviewHost`.
- `webview/assets/tab-persistence-state-4974387415e5.js` contains Browser Tab persistence and placement values.

### OMP 18.1.6

- `src/tools/browser.ts` defines the built-in Browser tool.
- `src/prompts/tools/browser.md` teaches the model how to call that tool.
- `src/tools/browser/attach.ts` attaches to a connected Chromium target.
- `src/tools/browser/registry.ts` owns Browser connection registration.
- `src/tools/browser/tab-supervisor.ts` selects and supervises controlled pages.

### Reeve

- `desktop/agent-browser-access.cjs` owns the restart-bound CDP grant.
- `desktop/browser-views.cjs` owns Browser pages and window ownership checks.
- `components/browser/BrowserTabs.tsx` hosts Browser Tabs in the Right placement.
- `lib/browser-tab-registry.ts` stores Browser URLs by Project.
- `app/api/browser-tabs/route.ts` exposes the Project Browser registry to Reeve.
- `lib/rpc-manager.ts` creates each OMP `AgentSession`.
- `components/MessageView.tsx` renders generic OMP tool calls.

## Verified Codex Desktop findings

Codex Desktop installs the hidden `unified-computer-use` plugin.

The plugin exposes the `cua_repl` MCP service and its initialized `cua` API.

The main process requires app-server MCP tool support and enabled Browser feature gates.

Desktop configuration writes the plugin `.mcp.json` file.

That configuration selects `@oai/browser-desktop/service` for the Browser surface.

An environment value supplies the available backends.

The in-app backend has the name `iab`.

Each request carries `session_id`.

The main process converts that value into the conversation identifier.

The backend rejects a request without a Browser route for that conversation.

Each Browser route also identifies one desktop window.

The public runtime methods include `getState`, `getBrowser`, `getTab`, and `createBrowserTab`.

The first API call returns runtime documentation and current surface state.

The in-app backend reports the name `Codex In-app Browser`.

It reports Browser and Tab capability groups.

It disables `Browser.user`.

A feature gate can enable Browser history.

The backend supports `Tab.markDeliverable` and `Tab.markHandoff`.

The backend returns two Tab identifiers.

`id` is a numeric CDP-facing identifier.

`providerTabId` is the Browser Tab identifier.

The backend maps both identifiers by Browser route and Browser Tab identifier.

The Browser Tab identifier survives renderer remounts.

The numeric identifier survives while the backend retains its route mapping.

`createBrowserTab("iab", ...)` asks the backend to create a Tab.

The backend creates a `browser-use:<uuid>` Browser Tab identifier.

It calls the Browser host with `createPanelTab: true`.

The host creates the page and sends `open-browser-tab` to the renderer.

That message sets `active: false` and `deferUntilPanelVisible: true`.

`HiddenBrowserUseWebviewHost` mounts pages absent from the Right and Bottom placements.

The hidden host uses the same conversation identifier and Browser Tab identifier.

The hidden host makes the page invisible and enables hidden bootstrap.

Visibility is a separate Tab capability.

Showing a Tab opens the Browser panel for that conversation.

Hiding a Tab closes the panel only when that Tab is active.

The agent does not select Right or Bottom placement directly.

The renderer's existing Tab record owns visible placement.

The backend lists only Tabs from the Session Browser route.

It rejects a Tab from another Browser route.

It reports explicit errors for unknown Tabs, missing Sessions, missing routes, and missing windows.

A supported navigation command creates a temporary Tab when no Tab exists.

Other commands require a Tab identifier.

A visibility request can remain pending until a Tab exists.

This rule prevents an empty Session from selecting an unrelated Tab.

The backend attaches Electron's debugger to the selected page.

It executes CDP commands against that page.

It checks Browser-use navigation restrictions before navigation.

It verifies that the current page still matches the Browser route and Tab.

The backend tracks temporary and persistent lifetimes.

Turn completion closes an unmarked temporary Tab.

A deliverable or handoff mark preserves the Tab.

A persistent human Tab remains after Browser control ends.

Cleanup removes debugger state, cursor state, clipboard bridges, and page-capture leases.

Browser results can include `codex/toolSurface` metadata.

The metadata names the backend, Browser identifier, open Tab identifiers, and an optional screenshot.

Codex Desktop converts this metadata into Browser activity and picture-in-picture content.

Selecting the presentation focuses the matching Session and numeric Tab identifier.

The Browser Session registry performs that focus operation.

## Codex Desktop reference sequence

1. Codex Desktop enables the Browser surface for a local Session.
2. Codex Desktop enables the hidden `unified-computer-use` plugin.
3. The plugin exposes the Session-scoped `cua_repl` MCP service.
4. The service loads `@oai/browser-desktop/service` for the Browser surface.
5. The model sees one JavaScript MCP tool.
6. The first `cua` call returns documentation and current surface state.
7. The model lists Browser backends and selects `iab`.
8. The backend validates the Session route and desktop window.
9. A create request allocates a `browser-use:<uuid>` Browser Tab identifier.
10. The Browser host creates the page and Browser Tab together.
11. The renderer mounts the page in a visible or hidden host.
12. The backend maps the Browser Tab identifier to a numeric runtime identifier.
13. Each command verifies the Session route, Browser Tab, and current page.
14. The backend attaches Electron's debugger to that exact page.
15. The backend checks navigation policy before navigation.
16. Tool results can include `codex/toolSurface` metadata and a screenshot.
17. The transcript uses that metadata for Browser activity presentation.
18. Selecting the presentation focuses the matching Session and Browser Tab.
19. Turn cleanup releases debugger state and page-capture resources.
20. Cleanup closes unmarked temporary Tabs and preserves marked or persistent Tabs.

This sequence does not discover an unmanaged page and adopt it later.

## Capability table

`Complete` means the current Reeve stack supplies the capability.

`Partial` means the stack supplies only part of the capability.

`Gap` means the agent cannot use the capability through Reeve.

| # | Capability | Codex Desktop | Reeve and OMP today | Design source | Result |
| ---: | --- | --- | --- | --- | --- |
| 1 | Agent discovery | The Session exposes one documented JavaScript tool. | OMP exposes one generic Browser tool. It does not describe Reeve Tabs. | Adapt OMP. | Partial. |
| 2 | Session registration | Each request carries the Session identifier. | Reeve registers no Browser service or Tab set with `AgentSession`. | Match Codex. | Gap. |
| 3 | List Tabs | The service lists Tabs from one Session route. | OMP can inspect Chromium pages. It cannot list Reeve Browser Tab identifiers. | Match Codex. | Gap. |
| 4 | Open a Tab | One operation creates the Tab and page together. | Reeve only lets the human create a panel Tab. | Match Codex. | Gap. |
| 5 | Focus a Tab | Visibility opens the correct Session panel and Tab. | The agent has no Reeve focus command. | Match Codex. | Gap. |
| 6 | Control a page | The service controls the selected routed page. | OMP controls a page after manual endpoint and target setup. | Adapt OMP. | Partial. |
| 7 | Close a Tab | The service closes the requested routed Tab. | The agent cannot close a Reeve Browser Tab by Reeve identifier. | Match Codex. | Gap. |
| 8 | Select a target | The backend maps the stable Tab identifier to one page. | OMP matches URL or title substrings. It does not know Reeve identifiers. | Adapt OMP. | Gap. |
| 9 | Survive a renderer remount | The Browser Tab identifier remounts the same logical Tab. | Reeve reuses a live page for the same current Tab identifier. | Reeve-specific implementation. | Partial. |
| 10 | Survive Session restoration | The route and Tab state restore the logical Tab. | Reeve restores Project URLs and creates new identifiers. | Match Codex. | Gap. |
| 11 | Use both placements | The Tab record owns Right, Bottom, or hidden placement. | Reeve supports Right only. | Match Codex. | Gap. |
| 12 | Receive the connection | The Session service hides the transport from the model. | Reeve requires manual CDP endpoint copying after restart. | Reeve-only. | Gap. |
| 13 | Handle no Tab | Navigation can create one temporary panel Tab. | OMP can create a page, but Reeve does not create its panel Tab. | Match Codex. | Gap. |
| 14 | Isolate Sessions | Route checks reject a Tab from another Session. | Reeve shares the endpoint and stores Tabs by Project. | Match Codex. | Gap. |
| 15 | Grant access | Feature gates and routes control the service. | Reeve has an explicit restart-bound CDP grant. | Reeve-only. | Complete. |
| 16 | Isolate page privileges | The app Browser Session owns cookies and page policy. | Reeve separates Browser cookies from the app. All Browser Tabs share one partition. | Reeve-only. | Partial. |
| 17 | Manage lifetime | Temporary, marked, and persistent Tabs have different cleanup. | Reeve has persistent human Tabs only. | Reeve-only. | Gap. |
| 18 | Render and open activity | Metadata renders Browser activity and opens the controlled Tab. | Reeve shows a generic tool card without a Tab action. | Match Codex. | Gap. |

## Reference-to-OMP mapping

| Reference behavior | OMP 18.1.6 behavior | Reeve decision | Ticket |
| --- | --- | --- | --- |
| A Session exposes one Browser capability. | OMP already exposes one built-in Browser tool. | Keep the OMP tool for page control. Register one Reeve Session Browser service beside it. | #438. |
| The first call returns documentation and state. | The OMP prompt documents the Browser tool. | Document Reeve Tab commands and return the Session Tab list. | #438. |
| The service lists only Session Tabs. | OMP internally sees connected Chromium pages. | Query the per-Session Reeve Tab store. Never expose another Session. | #438. |
| One request creates a Browser Tab and page. | OMP can create a Chromium page. | Create through Reeve first. Return its Tab identifier after page creation succeeds. | Replace #439. |
| A stable identifier names the logical Tab. | OMP accepts URL or title substring matching. | Keep the Reeve identifier as the public identity. Resolve OMP targeting internally. | #191. |
| The backend rejects ambiguous identity. | URL or title substrings can match several pages. | Reject zero or multiple target matches. Never select the first match silently. | #191. |
| The backend controls the mapped page. | OMP already supplies page actions and supervision. | Reuse the OMP Browser tool after exact target resolution. | #191 and #437. |
| The agent focuses a panel Tab. | OMP has no Reeve panel concept. | Add a Session Browser focus command through the desktop bridge. | #438. |
| The agent closes a panel Tab. | OMP can close a page but cannot update Reeve state. | Close through Reeve so the Tab model and page close together. | #438. |
| The Browser transport needs no manual value. | OMP accepts `browser.cdpUrl`. | Send the current launch endpoint through the authenticated desktop channel. | #437. |
| No Tab plus navigation creates a panel Tab. | OMP can create an unmanaged page. | Route page creation through the Session Browser service. | Replace #439. |
| Several Sessions remain isolated. | One CDP endpoint can expose all application pages. | Scope management commands and target resolution to one Session. | #191 and #438. |
| Placement belongs to the Tab record. | OMP has no panel placement. | Use ADR-0014 and the shared Tab model. | #142, #165, and #438. |
| Tool metadata identifies the controlled Tab. | OMP emits an ordinary Browser tool call. | Add Reeve metadata during event folding. | New Browser activity ticket. |
| Selecting activity focuses the exact Tab. | OMP has no application focus action. | Resolve Session and Tab metadata through the panel controller. | New Browser activity ticket. |
| Temporary Tabs can close at turn end. | OMP supervises its Browser page lifetime. | Reeve panel Tabs remain persistent. Hidden temporary Tabs require a later decision. | Epic #158. |

## Security table

| Area | Codex Desktop | Reeve today | Required result |
| --- | --- | --- | --- |
| Transport exposure | The service gives controlled commands. It does not expose global CDP. | CDP reaches every application page on loopback. | Keep ADR-0011 warnings. Do not describe #437 as narrow access. |
| Session identity | Every request carries a Session identifier. | OMP receives one endpoint without Reeve Tab registration. | Bind every management request to one `AgentSession`. |
| Window identity | A Session route identifies one desktop window. | Browser views check their owning window. | Preserve window ownership in every new command. |
| Tab identity | The backend rejects cross-route Tab identifiers. | OMP does not know Reeve Tab identifiers. | Resolve identifiers server-side and reject cross-Session access. |
| Endpoint injection | No browser client supplies an endpoint. | The human copies the endpoint today. | Accept the endpoint only from the authenticated desktop process. |
| Endpoint authenticity | The desktop service owns the Browser route. | CDP itself has no authentication. | Keep loopback binding and the ephemeral port. Never expose it remotely. |
| Grant timing | Feature gates enable the service before use. | The grant only changes the next Reeve launch. | Keep the restart boundary and all four honest grant states. |
| Stale endpoint | Route disposal removes the service route. | Chromium can leave `DevToolsActivePort` after a closed launch. | Delete stale state and reject an endpoint from another launch. |
| Application renderer | The Browser route excludes unrelated pages. | Global CDP can control Reeve's renderer. | Exact target resolution must exclude Reeve, DevTools, workers, and unknown pages. |
| Page privileges | The app owns the Browser page and policy. | Browser pages are sandboxed and have no preload or Node access. | Preserve `WebContentsView` ownership and current page preferences. |
| Cookies | The app Browser Session supplies the page cookie context. | All Reeve Browser Tabs share one persistent Browser partition. | Keep the partition separate from Reeve's renderer. State the shared-cookie effect. |
| Permissions | The app Browser policy controls requests. | Reeve denies every Browser permission. | Keep denial until #162 changes the policy. |
| Navigation | The backend checks Browser-use navigation restrictions. | Reeve accepts Browser navigation through its desktop bridge. | Apply the existing Reeve URL and deep-link policy to agent opens. |
| Downloads | A short-lived grant binds Session, Tab, and URL. | Reeve has no complete download product yet. | Keep agent downloads blocked by #188 and its policy. |
| Tool output | Page text remains untrusted content. | OMP Browser output enters the transcript. | Mark page text as untrusted. Never interpret it as application authority. |
| Debugger cleanup | Turn cleanup releases debugger and capture state. | OMP owns its Browser supervision. | Release OMP resources when the Session or selected Tab ends. |
| Transcript action | Metadata identifies one routed Browser surface. | Generic cards contain no trusted Reeve Tab identity. | Use server-produced Session and Tab metadata. Reject stale card actions. |

The exact-target adapter reduces accidental selection.

It does not reduce the authority of Reeve's global CDP endpoint.

ADR-0011 must continue to explain that authority.

## Failure-state table

| State | Codex Desktop result | Required Reeve result | Owner |
| --- | --- | --- | --- |
| Missing Session identifier | The backend rejects the request. | Reject the request before any Tab query. | #438. |
| Missing Session route | The backend reports that no Browser route exists. | Report that the Session Browser service is unavailable. | #438. |
| Missing desktop window | The backend reports that the window is unavailable. | Return an explicit desktop-window failure. | #438. |
| Browser bridge unavailable | The Browser backend is absent. | Hide the service outside Reeve Desktop and return an explicit failure. | #438. |
| Grant closed | No Browser route is available. | Report that access is closed. Do not return stale CDP data. | #437. |
| Grant opens after restart | The service is unavailable until enabled. | Report that restart is required and no endpoint exists now. | #437. |
| Grant closes after restart | The current route remains valid until disposal. | Report that access remains open until restart. | #437. |
| Stale port file | The reference route does not reuse stale transport. | Delete the stale file and reject the old endpoint. | #437. |
| Endpoint delivery fails | The Browser service is unavailable. | Fail the Session Browser setup. Never use a user-supplied fallback silently. | #437. |
| No Tab and open requested | The backend creates one temporary panel Tab. | Create one Reeve Browser Tab and page atomically. | Replace #439. |
| No Tab and control requested | The backend requires a Tab identifier. | Require `open` or a valid selected Tab. | #191 and #438. |
| Invalid URL | Navigation policy rejects the request. | Reject it before page creation and preserve current state. | #438. |
| Unknown Tab identifier | The backend rejects the numeric identifier. | Reject the Reeve identifier and return a stale-Tab error. | #438. |
| Cross-Session Tab identifier | The backend rejects the other route's Tab. | Reject the request without revealing Tab details. | #438. |
| Duplicate URL or title | Stable identity avoids substring ambiguity. | Reject ambiguous OMP matches. Never select the first page. | #191. |
| Renderer remount | The logical Tab remounts its retained page. | Reuse the current Tab identifier and current page. | #165 and #191. |
| Session restoration | The Browser route restores logical Tab state. | Restore a Session Tab identity and resolve its new live page. | #165 and #191. |
| Placement unavailable | The renderer can use another owned placement. | Return an explicit placement failure. Do not create an unmanaged page. | #142 and #438. |
| Closed page | The backend removes stale runtime state. | Remove the target mapping and keep the Tab failure visible. | #191. |
| Crashed page | The Browser host can rematerialize retained state. | Report the crash. Require the existing Browser recovery path. | #189 and #191. |
| Stale page association | The backend rejects the mismatched page. | Re-resolve identity once. Then fail safely. | #191. |
| Debugger attach fails | The command fails and cleanup releases state. | Return the OMP attach error and preserve the Reeve Tab. | #191. |
| Navigation denied | The backend rejects the navigation. | Keep the current page and show the policy failure. | #438. |
| Page load fails | The Browser surface shows its failure state. | Use #189 failure and retry behavior. | #189 and #438. |
| Duplicate open request | The host owns one Tab and one page. | Apply one documented idempotency key. Return the existing Tab. | #438. |
| Route disposal | Temporary pages close and persistent pages leave control. | Release mappings and OMP resources. Keep persistent Reeve Tabs. | #191 and #438. |
| Turn end | Marks decide temporary Tab lifetime. | Keep ordinary panel Tabs. Do not invent temporary cleanup yet. | Epic #158. |
| Tool metadata missing | The transcript falls back to ordinary activity. | Keep the generic card without an unsafe focus action. | New Browser activity ticket. |
| Tool metadata stale | The route cannot focus the old Tab. | Show an unavailable state. Do not focus a similar Tab. | New Browser activity ticket. |

## Ticket traceability

| Ticket | Final classification | Final action |
| --- | --- | --- |
| #191 | OMP adaptation. | Rewrite target selection around a Session Tab identity and exact live-page resolution. |
| #437 | Reeve-only design. | Keep endpoint delivery. State that it differs from Codex's controlled service. |
| #438 | Partial Codex match. | Rewrite it as the Session Browser service and panel management surface. |
| #439 | Different from Codex. | Replace unmanaged target adoption with atomic Reeve Tab and page creation. |
| #170 | Integration acceptance. | Add the corrected owner set, failure matrix, and transcript focus proof. |
| #158 | Epic contract. | Replace the adoption decision and add the Session service and activity-card decisions. |

The three new delivery tickets do not all match Codex Desktop.

#438 matches the Codex Session-scoped management capability after revision.

#437 adapts Reeve's global CDP design to OMP.

The current #439 describes a plausible Reeve repair, but Codex uses another sequence.

## Exact change for #191

Rename #191 to `Browser: resolve the selected Session Tab to the exact OMP target`.

Replace its scope with these requirements:

1. Store the selected agent target in the per-Session Tab model.
2. Keep the Reeve Browser Tab identifier as the public identity.
3. Resolve that identity to the current live Chromium page inside Reeve.
4. Pass only an OMP-compatible target selector into OMP.
5. Reject zero matches and multiple matches.
6. Never select by the first visible page.
7. Exclude Reeve's renderer, DevTools, workers, and unknown targets.
8. Preserve the selected identity through renderer remount.
9. Re-resolve the live page after Session restoration and placement transfer.
10. Clear the selection when its Tab closes or changes Session.

Add these acceptance cases:

- Two Tabs have the same URL and title.
- The selected Tab changes its URL and title.
- The renderer remounts during an active Session.
- Session restoration creates a new live page.
- Another Session owns a similar Tab.
- The selected page crashes or closes.
- The OMP attach operation fails.

Set these native blockers:

- #165 for stable per-Session restoration.
- #437 for the current launch endpoint.
- #438 for the Session Browser service.

Remove the statement that #438 depends on #191.

## Exact change for #437

Keep the title `Browser: hand the Reeve CDP endpoint to OMP automatically`.

Keep the restart-bound grant from ADR-0011.

Keep the desktop-authenticated Electron-to-Bun channel.

Add this design statement:

> This ticket is a Reeve-only transport adaptation. Codex Desktop uses a Session-scoped Browser service instead of global CDP.

Limit the scope to endpoint delivery and launch truth.

Do not add Tab listing, target selection, or panel actions here.

Add these acceptance cases:

- A new `AgentSession` receives the current launch endpoint without user text.
- An existing wrapper cannot retain an endpoint from another application launch.
- A browser client cannot set or replace the endpoint.
- The Bun server accepts the endpoint only through desktop authentication.
- A closed launch removes stale endpoint state.
- A pending grant reports no current endpoint.
- A pending revocation reports that the current endpoint remains live.

Keep this ticket without blockers.

## Exact change for #438

Rename #438 to `Browser: register a Session-scoped panel Browser service`.

Replace its scope with these requirements:

1. Register the service when Reeve creates an `AgentSession`.
2. Expose the service only when the desktop Browser bridge exists.
3. Bind every service instance to one Session.
4. List only Browser Tabs from that Session.
5. Open a URL through the Reeve Tab model.
6. Create the Browser Tab and its page in one operation.
7. Focus the exact Session, placement, and Tab.
8. Close the Tab and page through one Reeve operation.
9. Return the stable Reeve Browser Tab identifier.
10. Delegate selected-target resolution to #191.
11. Leave page interaction inside OMP's built-in Browser tool.

Add these acceptance cases:

- A missing Session fails before any Tab operation.
- The web build does not expose the service.
- An invalid URL creates nothing.
- A stale Tab identifier changes nothing.
- A cross-Session identifier reveals nothing.
- A duplicate open request follows one idempotency rule.
- The Right and Bottom placements use the same command contract.
- A failed page creation removes the reserved Tab.
- A failed Tab write closes the created page.

Set these native blockers:

- #142 for the Bottom placement.
- #165 for the per-Session Tab record.

Remove #191 as a blocker.

## Replacement for #439

Rename #439 to `Browser: route agent page creation through the Session Browser service`.

Delete the unmanaged-target adoption design.

Replace it with these requirements:

1. An agent page starts through the service from #438.
2. Reeve creates the Browser Tab and page together.
3. OMP controls the page only after #191 resolves the exact target.
4. OMP must not create an unmanaged page beside this path.
5. Page-created foreground and background popups remain owned by #416.
6. Reeve's renderer, DevTools, workers, and denied dispositions never become Tabs.
7. A failed operation removes both the Tab record and page.

Add these acceptance cases:

- No Browser Tab exists before the agent opens a URL.
- One Browser Tab and one page exist after success.
- No invisible Chromium page remains after failure.
- Repeating the request follows #438's idempotency rule.
- The created Tab uses the requested or last Session placement.
- OMP controls that exact page after creation.
- A popup follows #416 instead of this creation path.

Set these native blockers:

- #437 for automatic OMP connection.
- #438 for the Session Browser service.
- #191 for exact target resolution.
- #416 for page-created popups.

#142 and #165 remain transitive blockers through #438 and #191.

## New ticket

Create `Browser: render agent Browser activity and open its panel Tab`.

The ticket has this scope:

1. Add trusted Session and Browser Tab metadata to Reeve Browser activity.
2. Render Browser calls as Browser activity instead of generic tool cards.
3. Show the Browser icon, action, page title, and URL when available.
4. Let the human open the exact controlled Browser Tab from the activity.
5. Focus the owning Session before the placement and Tab.
6. Keep a generic card when metadata is absent.
7. Show an unavailable state when metadata is stale.
8. Never search for a similar Tab by URL or title.

Set these native blockers:

- #191 for exact Tab identity.
- #438 for Session Browser metadata.
- The replacement #439 for atomic creation.

This ticket matches Codex's `codex/toolSurface` presentation behavior.

It uses Reeve's turn folder and panel controller.

## Exact change for #170

Change the child count from 30 to 34 after the new ticket exists.

Change the delivery prerequisite from 28 tickets to 33 non-acceptance children.

Replace group 13 with this row:

| Group | Rows | Owner | Visible proof link | Backend proof link |
| ---: | --- | --- | --- | --- |
| 13 | B24 target selection and Reeve agent Browser integration | #191, #437, #438, replacement #439, new Browser activity ticket, and #158 | Required | Required |

Do not describe B25 or B28 as implemented capabilities.

Keep their explicit maintainer decisions in #158.

Add these group 13 acceptance cases:

- The granted restart supplies OMP's endpoint without copied text.
- The closed state supplies no endpoint.
- One Session lists only its own Browser Tabs.
- The agent opens one visible Browser Tab and page.
- The agent focuses, controls, and closes that exact Tab.
- Two identical URLs do not cause silent target selection.
- Reeve's renderer never becomes the controlled target.
- Session restoration resolves the restored logical Tab.
- Right and Bottom placements both pass after #142.
- The transcript card opens the exact controlled Tab.
- A stale transcript card shows an unavailable state.
- Every failure-state row in this report has backend proof.

Add #437, #438, replacement #439, and the new ticket as native blockers.

Keep separate visible and backend proof links.

## Exact change for Epic #158

Set the native child count to 34 after the new ticket exists.

Move the three agent Browser stories under the Browser list.

Renumber the full story list once.

Replace these implementation decisions:

- Register one Session-scoped Reeve Browser service with every desktop `AgentSession`.
- Keep OMP's built-in Browser tool for page control.
- Deliver Reeve's current CDP endpoint automatically after the restart-bound grant.
- Resolve a Reeve Session Tab identity to one exact live OMP target.
- Create agent Browser Tabs and pages together through the Session service.
- Route page-created popups through #416.
- Render trusted Browser activity metadata and open the exact controlled Tab.

Delete this decision:

> New page targets created by OMP are adopted into the Tab model once.

Add this architecture boundary:

> Codex uses a controlled Session Browser service. Reeve reuses OMP page control behind a Session-scoped Reeve adapter.

Keep these Reeve-only decisions:

- The access grant remains opt-in and restart-bound.
- The current launch endpoint reaches every application page.
- Browser cookies remain in Reeve's persistent Browser partition.
- Ordinary panel Browser Tabs remain persistent after a turn.

Keep the site-tools and extensions decisions unchanged.

Add this report as the decision source for the agent Browser integration.

## Epic #158 handoff change

Keep branch `codex/browser-terminal-parity`.

Keep one fresh worker per implementation ticket.

Keep the 200,000-token hard stop and 150,000-token aim.

Change the progress denominator to 34 after the new ticket exists.

Use this agent Browser order in the handoff:

1. Run #437 after its existing grant foundation.
2. Finish #142 and #165 before #438 can pass full acceptance.
3. Run revised #438 after #142 and #165.
4. Run revised #191 after #165, #437, and #438.
5. Run replacement #439 after #437, #438, #191, and #416.
6. Run the new Browser activity ticket after #191, #438, and replacement #439.
7. Run #170 only after every other epic child closes.

The handoff must report closed children divided by 34.

The handoff must keep the existing model selectors and verification rule.

## Final counts

| Count | Result |
| --- | ---: |
| Reference sequence steps | 20 |
| Reference capabilities | 18 |
| Complete Reeve capabilities | 1 |
| Partial Reeve capabilities | 4 |
| Missing Reeve capabilities | 13 |
| Open capability gaps | 17 |
| Security areas | 17 |
| Failure states | 29 |
| Existing implementation tickets requiring body changes | 6 |
| Replacement tickets | 1 |
| New tickets | 1 |
| Epic children after the new ticket | 34 |
| Non-acceptance epic children | 33 |

## Final answer

Codex Desktop supplies a Session-scoped Browser service with atomic Tab and page creation.

Reeve should copy that ownership sequence and Session isolation.

Reeve should retain OMP 18.1.6 for page control.

Reeve must adapt OMP's substring target selection behind exact Reeve Tab identity.

Reeve's endpoint grant and automatic endpoint delivery remain Reeve-only architecture.

#437 is necessary but does not match Codex Desktop.

#438 becomes the closest Codex match after its Session-scoped rewrite.

#439 must stop adopting unmanaged OMP pages.

The revised #439 must route creation through #438 before OMP controls the page.

The new Browser activity ticket closes the transcript and human-focus gap.
