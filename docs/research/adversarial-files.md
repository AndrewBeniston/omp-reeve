# Final adversarial audit of the Files surface

Status: complete.

This report resolves issue #334 against Epic #129 and its fourteen current child tickets.

Verified facts describe inspected sources. Recommendations describe changes that the planner must apply.

## 1. Complete feature-to-ticket matrix

The status column uses four values.

- `Covered` means the current ticket assigns the capability correctly.
- `Correction` means a ticket exists, but its scope or acceptance text is wrong.
- `Gap` means no ticket proves or preserves the capability.
- `Gate` means issue #112 must supply a runtime value.

### Entry, host, and placement

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The Files row opens a file browser Tab. | The row opens file search. | `panel-files.md`, What Files is | #130 | Shipped reference and Reeve source | Correction | Limit #130 to the Tab shell and launcher action. |
| 2 | Files appears only for a Project with a workspace root. | The current launcher already knows Project context. | `panel-files.md`, What Files is | #130 | Shipped reference | Covered | Keep the existing acceptance criterion. |
| 3 | One file browser Tab exists per host. | No file browser Tab exists. | `panel-files.md`, file browser Tab | #130 | Shipped reference | Covered | Keep the singleton acceptance criterion. |
| 4 | The launcher opens Files in the selected placement. | Reeve has only the right placement. | `panel-files.md`, What Files is | #130, Bottom Epic #139 | Shipped reference | Correction | Test right placement now and bottom placement after #142. |
| 5 | `Cmd+Shift+E` opens the same Tab. | The desktop menu does not expose this contract. | `panel-files.md`, What Files is | #130 | Shipped reference and main process | Correction | Separate this action from file search in the menu contract. |
| 6 | `Cmd+P` remains Search Files. | Reeve already opens file search. | `panel-files.md`, What Files is | #130 | Reeve source | Covered | Add a regression criterion. |
| 7 | The tree lives in Files, not the sidebar. | The sidebar tree is currently unmounted. | Current Reeve source audit | #172 | Reeve at `2920ac0` | Correction | Replace the stale instruction to move a rendered sidebar tree. |

### Tree behavior, state, and accessibility

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | Directories load separately and show loading state. | The old tree does not meet the complete state contract. | `panel-files.md`, file browser Tab | #131 | Shipped reference | Covered | Keep this scope. |
| 9 | Empty, searching, and no-match states differ. | The old tree does not expose all three states. | `panel-files.md`, file browser Tab | #131 | Shipped reference | Covered | Keep this scope. |
| 10 | The filter hides non-matches and has a clear control. | The old tree lacks the reference filter. | `panel-files.md`, file browser Tab | #131 | Shipped reference | Covered | Keep this scope. |
| 11 | Filter results form a flat list. | The old tree remains hierarchical. | `panel-files.md`, file browser Tab | #131 | Shipped reference | Covered | Keep this scope. |
| 12 | Folder rows remain visible during scrolling. | The old tree has no sticky folder contract. | `panel-files.md`, file browser Tab | #131 | Shipped reference | Covered | Keep this scope. |
| 13 | Multiple workspace roots show a chooser. | Reeve has no equivalent root list. | `panel-files.md`, file browser Tab | #173 | Shipped reference and Reeve source | Correction | Move this visual work into a new tree-state ticket. |
| 14 | The Files tree has no Git decoration. | The old tree owns Git badges and changed files. | `panel-files.md`, file browser Tab | #173 | Shipped reference and Reeve source | Correction | Move this removal into the new tree-state ticket. |
| 15 | Root and directory failures remain visible and retryable. | Root failures lack retry. Directory failures disappear. | Current Reeve source audit | None | Reeve source | Gap | Create the accessibility and resilience ticket below. |
| 16 | A keyboard user can traverse and activate the tree. | The old tree has no keyboard tree interaction. | Current Reeve source audit | None | Reeve source | Gap | Create the accessibility and resilience ticket below. |
| 17 | The tree exposes roles, states, focus, and live loading. | The old tree lacks tree roles and live announcements. | Current Reeve source audit | None | Reeve source | Gap | Create the accessibility and resilience ticket below. |
| 18 | The tree menu has the shipped order and asynchronous app state. | Reeve has no matching tree menu. | `panel-files.md`, file browser Tab | #133 | Shipped reference | Covered | Keep #133 limited to the tree menu. |
| 19 | Save a copy uses Downloads and rejects remote hosts. | The ticket says Save as without these rules. | `panel-files.md`, main-process addendum | #133 | Shipped main process | Correction | Add naming collisions, Downloads, and remote refusal. |
| 20 | Expanded paths, scroll, filter, and selection belong to the Tab payload. | Current state is not a versioned Tab payload. | `panel-files.md`, file browser Tab | #173, #141 | Reference and current Reeve source | Correction | Let #173 define payloads. Let #141 store and restore them. |
| 21 | Tree drag behavior remains unknown. | The epic excludes drag pending evidence. | `panel-files.md`, unverified values | #112 | Shipped code absence only | Gate | Do not add a value before #112 records runtime evidence. |

### Opening files and preserving current viewers

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 22 | Selecting a path opens a preview Tab. | Reeve has no preview state. | `panel-files.md`, Opening a file | #132 | Shipped reference | Covered | Keep this scope. |
| 23 | Double-clicking opens a pinned Tab. | Reeve has no pinned distinction. | `panel-files.md`, Opening a file | #132 | Shipped reference | Covered | Keep this scope. |
| 24 | A new preview replaces the prior preview. | Reeve has no preview replacement rule. | `panel-files.md`, Opening a file | #132 | Shipped reference | Correction | Add direct acceptance for replacement and promotion. |
| 25 | Opening a path follows the recorded router order. | Reeve uses its existing file-source routes. | `panel-files.md`, Opening a file | #174 | Shipped reference | Covered | Keep the focused router test. |
| 26 | An existing Tab wins across placements. | Reeve has only one placement. | `panel-files.md`, Opening a file | #174 | Shipped reference | Covered | Keep #174 blocked on #132. |
| 27 | A line request reanchors the Tab and resets stored state. | Current file routes can carry a line. | `panel-files.md`, Opening a file | #174 | Shipped reference and Reeve source | Covered | Keep this scope. |
| 28 | Source, preview, and diff modes remain available. | Reeve already supports these modes. | `panel-files.md`, Reeve today | #174, #138 | Reeve source | Correction | Add preservation acceptance. |
| 29 | Image, audio, PDF, and DOCX viewers remain available. | Reeve already supports these viewers. | Current Reeve source audit | None | Reeve at `2920ac0` | Gap | Add preservation acceptance to #174 and #138. |
| 30 | Live updates, downloads, and line mentions remain available. | Reeve already supports these paths. | Current Reeve source audit | None | Reeve at `2920ac0` | Gap | Add preservation acceptance to #174 and #138. |
| 31 | Review file editing and autosave remain available. | Reeve already edits review file sources. | Current Reeve source audit | None | Reeve at `2920ac0` | Gap | Correct the epic's stale viewer-only statement. |
| 32 | The wrap toggle remains available. | Reeve already supports wrapping. | `panel-files.md`, Reeve today | #138 | Reeve source | Correction | Add a regression row to acceptance. |
| 33 | File Tabs stay separate between Sessions in one Project. | They currently share Project state. | Current Reeve source audit | None | Reeve at `2920ac0` | Gap | Make #141 own per-Session Tab storage. |
| 34 | File Tabs return after an application restart. | File Tabs currently disappear after reload. | Current Reeve source audit | None | Reeve at `2920ac0` | Gap | Move restart restoration from #179 into #141. |

### File context menu

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 35 | Open file, browser, preferred app, and Open with follow the shipped order. | A file Tab has no matching menu. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |
| 36 | Open in GitHub appears only for a resolvable path. | A file Tab has no matching menu. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |
| 37 | The separator appears only after a preceding action. | A file Tab has no matching menu. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |
| 38 | Workspace mode suppresses Save as, contents, and browser actions. | Reeve has no matching mode contract. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |
| 39 | Reveal uses the platform label and rejects remote hosts. | Reeve has no complete file menu. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |
| 40 | Copy path and permitted contents remain available. | Reeve has no complete file menu. | `panel-files.md`, file context menu | #175 | Shipped reference | Covered | Keep this scope. |

### File commands and language intelligence

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | `Cmd+F` finds and steps through matches. | A file Tab has no find control. | `panel-files.md`, file commands | #134 | Shipped reference | Covered | Keep this scope. |
| 42 | Go to line validates a whole number and range. | A file Tab has no line overlay. | `panel-files.md`, file commands | #134 | Shipped reference | Covered | Keep this scope. |
| 43 | File history uses a per-Tab stack. | Reeve has no file navigation stack. | `panel-files.md`, file commands | #135 | Shipped reference | Covered | Keep #174 as a native blocker. |
| 44 | Go to definition opens an LSP location through the router. | Reeve has no file language command. | `panel-files.md`, addendum | #137 | Shipped reference and OMP source | Correction | Route #137 through the OMP adapter from #176. |
| 45 | Type definition is claimed by the epic. | The latest reference table does not expose it. | `panel-files.md`, addendum | #137, maintainer decision | Conflicting completed source reads | Correction | Reconcile the evidence before implementation. |
| 46 | Hover reaches the reference application. | No Files ticket includes hover. | `panel-files.md`, addendum | None | Shipped main process | Gap | Add hover to #137 or record an explicit exclusion. |
| 47 | OMP owns LSP configuration and process lifecycle. | The tickets propose a second Reeve host. | Current OMP source audit | #136, #176 | OMP 18.1.6 package | Correction | Rewrite both tickets around OMP reuse. |
| 48 | The provider table includes SourceKit LSP for Swift. | The epic names five servers and omits Swift. | `panel-files.md`, addendum | #136, #137, #138 | Shipped main process | Correction | Add Swift or record a deliberate exclusion. |
| 49 | Missing servers use verified provisioning, cache, and notices. | #136 duplicates all server downloads. | Current OMP and reference audits | #136 | OMP and shipped main process | Correction | Provision only missing compatible servers. |
| 50 | LSP uses safe configuration, cleanup, and surfaced errors. | #176 reimplements lifecycle and omits reference configuration. | Current OMP and reference audits | #176 | OMP and shipped main process | Correction | Preserve OMP ownership and reference safety settings. |
| 51 | File search follows the reference ranking. | The reference ranking remains unknown. | `panel-files.md`, unverified values | #112 | Host behavior requires runtime evidence | Gate | Do not infer ranking from Reeve's current scorer. |
| 52 | The file-language gate uses the reference default. | The default remains unknown. | `panel-files.md`, unverified values | #112 | Web-layer value requires runtime evidence | Gate | Do not select a default before #112 records it. |

### Cross-surface behavior and acceptance

| # | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Status | Required correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 53 | Files works in right and bottom placements. | The bottom placement does not exist. | `panel-files.md`, What Files is | #130, #139, #138 | Shipped reference | Correction | Make #141 and #142 cross-epic blockers for final acceptance. |
| 54 | The surface remains usable on mobile widths. | No Files ticket tests mobile. | Audit map check 4 | None | Ticket audit | Gap | Add mobile evidence to #138. |
| 55 | The surface remains usable at browser zoom. | No Files ticket tests zoom. | Audit map check 4 | None | Ticket audit | Gap | Add 200 percent zoom evidence to #138. |
| 56 | Reconnect and Session switching preserve correct state. | Tickets omit reconnect and Session isolation. | Audit map check 4 | None | Ticket and Reeve audits | Gap | Add #141 and #138 criteria. |
| 57 | Failures, retry, cancellation, and stale responses are proved. | Tickets omit several failure paths. | Audit map checks 3 and 4 | None | Ticket audit | Gap | Add the resilience ticket and acceptance rows. |
| 58 | Acceptance separates source, automated, visible, and accessibility evidence. | #138 points to an incomplete old checklist. | Audit map check 8 | #138 | Ticket audit | Correction | Replace #138 acceptance with the checklist below. |

## 2. Ticket sizes and required splits

The estimates assume one 200,000-token goal. Each ticket must remain below that limit.

Medium means 75,000 to 125,000 tokens. Large means 125,000 to 180,000 tokens.

| Ticket | Revised scope | Size | Decision |
| --- | --- | --- | --- |
| #130 | Files Tab shell, singleton action, launcher, and menu contract | Medium | Keep after rewrite. |
| #131 | Visual tree states, filtering, flattening, and sticky folders | Large | Split accessibility and failures into a new ticket. |
| #132 | Preview, pinned state, replacement, and promotion | Medium | Keep. |
| #133 | Tree context menu and Save a copy rules | Medium | Keep. |
| #134 | Find and go to line | Medium | Keep. |
| #135 | Per-Tab file history | Medium | Keep. |
| #136 | Missing-server provisioning and notices | Medium | Rewrite around OMP reuse. |
| #137 | Definition UI, hover, router integration, and quiet misses | Large | Keep after the capability decision. |
| #138 | Traceable acceptance and final regression pass | Large | Keep as an acceptance-only ticket. |
| #172 | Extract the tree surface, mount it, and preserve uploads | Large | Keep after rewrite. |
| #173 | Versioned Files and file Tab payload contracts | Medium | Remove unrelated visual work. |
| #174 | Router order, cross-placement reuse, and viewer preservation | Medium | Keep. |
| #175 | File Tab context menu | Medium | Keep. |
| #176 | OMP LSP adapter and structured browser endpoint | Large | Rewrite around OMP reuse. |
| New Files 2c | Tree keyboard behavior, accessibility, errors, retry, and cancellation | Large | Required split from #131. |
| New Files 2d | Root chooser and removal of Files Git decoration | Medium | Required split from #173. |

Two new Files tickets are required. The revised epic therefore has sixteen child tickets.

### Required split from #131

Create `Files 2c. Tree accessibility and failure recovery`.

Its scope must include these requirements.

- Use `tree`, `treeitem`, and `group` semantics where the rendered structure requires them.
- Expose expanded, selected, loading, disabled, and error states.
- Support Arrow keys, Home, End, Enter, and Space through the visible rows.
- Keep keyboard focus visible after expansion, filtering, loading, and retry.
- Announce directory loading and result changes without repeated announcements.
- Show root and directory errors at the failed location.
- Provide a retry control for every recoverable load failure.
- Cancel obsolete requests or ignore their late results.
- Preserve the last valid tree when a refresh fails.

Block this ticket on #131 and #172. Block #138 on this ticket.

### Required split from #173

Keep #173 as `Files 2b. Versioned Files and file Tab payloads`.

#173 must define these payloads before #141 stores them.

- The Files Tab payload stores its host, selected root, expanded paths, scroll position, filter, and selected path.
- The file Tab payload stores its host, path, viewer kind, preview state, pinned state, and source mode.
- The file Tab payload stores wrap state, line anchor, history entries, and the history cursor.
- Every payload has a version and a safe decoder.
- An invalid payload produces an unavailable route result.
- A Session switch restores the correct in-memory payload without reading another Session's state.

Create `Files 2d. Root chooser and the undecorated Files tree`.

This ticket owns the multi-root chooser and removal of Files Git decoration.

This ticket must preserve Review Git decoration and sidebar uploads.

Block this ticket on #131 and #172. Block #138 on this ticket.

### Cross-epic size correction

Expand #141 to own both per-Session storage and restart restoration.

This revised scope remains one large worker ticket.

Reduce #179 to the unavailable placeholder Tab and unknown payload handling.

## 3. Exact issue, blocker, acceptance, and handoff corrections

### Epic #129

Replace the stale opening problem statement with this text.

> Reeve has file Tabs and file search. File Tabs currently share Project state across Sessions and disappear after reload. The Files tree is not mounted. The current viewers support source, preview, diff, images, audio, PDF, DOCX, live updates, downloads, line mentions, and review editing. Reeve lacks the reference Files Tab, tree behavior, menus, file commands, per-Session persistence, and OMP-backed language navigation.

Replace the language-server decision with this text.

> Reeve reuses OMP's exported LSP subsystem. OMP keeps configuration, process ownership, document synchronization, idle shutdown, crash cleanup, and request behavior. Reeve provisions only missing reference-compatible servers. Reeve exposes structured Files results through a small adapter. The adapter does not create a second LSP host.

Replace the server-count sentence with this text.

> The verified reference table has six providers, including SourceKit LSP for Swift. The planner must add Swift or record a deliberate exclusion.

Replace the type-definition claim with this text.

> The latest reference capability table exposes capability query, locations, and hover. It does not expose type definition. The planner must reconcile the older claim before implementation. A retained type-definition command becomes a documented Reeve extension.

Replace the editing exclusion with this text.

> New file editing features remain outside this epic. The implementation must preserve current review editing and autosave behavior.

Add these persistence decisions.

> #173 defines versioned Files and file Tab payloads. #141 stores and restores those payloads per Session. File Tabs must not share active state between Sessions in one Project.

Add this runtime evidence rule.

> Issue #112 remains the only source for tree drag, search ranking, and the file-language flag default. No ticket may infer those values.

### Issue #130

Replace `The Tab shows the existing file explorer component unchanged.` with this text.

> This ticket creates the Files Tab shell and its actions. #172 mounts the extracted tree surface. `Cmd+Shift+E` opens Files. `Cmd+P` remains Search Files.

Add these acceptance criteria.

- The Files row and `Cmd+Shift+E` activate one Files Tab.
- `Cmd+P` still opens Search Files.
- A projectless Session does not offer Files.
- Right placement opens correctly.
- Bottom placement has a deferred criterion under #138 and Epic #139.

### Issue #131

Keep only visual tree behavior in this ticket.

Remove keyboard, accessibility, failure, retry, and cancellation work into Files 2c.

Add #172 as a native blocker.

### Issue #132

Add these acceptance criteria.

- A second preview replaces the first preview.
- Double-clicking a preview promotes it without creating a duplicate.
- Selecting a search result follows the same preview rule.

### Issue #133

Keep only the tree context menu in this ticket.

Add these acceptance criteria.

- Save a copy writes to Downloads without a prompt.
- A name collision adds ` (1)`, then increments the number.
- A remote host cannot save a copy.
- The asynchronous app list exposes loading and failure states.

Add #172 as a native blocker. Remove #132 unless implementation proves a direct dependency.

### Issue #135

Add #174 to the prose blocker list.

GitHub already records this native blocker.

### Issue #136

Rename it to `Files 7. Provision missing language servers`.

Replace its build text with this text.

> Reuse OMP's LSP subsystem. Define the compatible provider table from the reconciled reference evidence. Provision only a required server that OMP cannot resolve. Verify size and digest. Cache the installation. Record its licence notice. Do not start or manage a language-server process in this ticket.

Add these acceptance criteria.

- OMP-resolvable servers require no download.
- A missing compatible server downloads once and reuses its cache.
- A size or digest mismatch fails without replacing a valid cache.
- Every distributed server has a third-party notice.
- Swift is included or has an explicit exclusion.

### Issue #137

Replace `through the language-server host` with `through the OMP LSP adapter from #176`.

Add hover or record its explicit exclusion.

Remove type definition until the evidence conflict is resolved.

If type definition remains, label it as a Reeve extension.

Add #174, #175, and #176 to the prose blocker list.

Keep #112 as the blocker for the feature-flag default.

### Issue #138

Replace the old parity checklist with the acceptance checklist below.

Add #172 through #176 to the prose blocker list.

Add Files 2c, Files 2d, #141, and #142 as native blockers.

### Issue #172

Replace the stale move instruction with this text.

> Extract the reusable tree from the old sidebar component. Mount it in the Files Tab. Keep Sessions and Projects in the sidebar. Preserve upload behavior outside the parity tree. Do not remove Review's changed-files tree.

Add these acceptance criteria.

- Files shows the extracted tree.
- The sidebar shows Sessions and Projects without the tree.
- Existing upload behavior remains available from its retained surface.
- Opening a path still routes through the file Tab path.

### Issue #173

Rename it to `Files 2b. Versioned Files and file Tab payloads`.

Replace its scope with the payload contract in section 2.

Remove restart acceptance from #173. #141 owns restart restoration.

Move root selection and Git decoration into Files 2d.

### Issue #174

Add these preservation criteria.

- Source, preview, diff, image, audio, PDF, and DOCX still open.
- Live updates, downloads, and line mentions still work.
- Review editing and autosave still work.
- Opening one path from two Sessions does not share Tab state.

### Issue #176

Rename it to `Files 7b. OMP LSP adapter for Files`.

Replace its build text with this text.

> Create a small server adapter over OMP's exported LSP subsystem. Translate a Files request into OMP document synchronization and LSP requests. Return structured capabilities, locations, hover results, and structured errors. Preserve OMP configuration, process ownership, idle shutdown, crash cleanup, and project-local binary resolution.

Add these acceptance criteria.

- A TypeScript fixture returns a definition location through OMP.
- A hover request returns a structured result through OMP.
- A missing capability returns a structured unavailable result.
- OMP retains process ownership and idle shutdown.
- OMP errors reach the browser without a second retry policy.

### Issues #141 and #179

Rename #141 to `Bottom 2. Store and restore one workspace record per Session`.

Replace the final sentence of #141 scope with this text.

> On Session open, restore Tabs, payloads, order, active Tabs, placements, focus, and layout. Restore each Session from its own record. An untouched Session creates no record.

Add these #141 acceptance criteria.

- Two Sessions in one Project retain different Tab lists and active Tabs.
- A desktop restart restores both Session records independently.
- Files and file Tab payload versions survive a valid round trip.
- An unknown payload version returns an unavailable route result.
- An untouched Session leaves no record.

Add #178 to the #141 prose blocker list.

Rename #179 to `Bottom 2b. The unavailable placeholder Tab`.

Remove general restart restoration from #179.

### Exact blocker corrections

| Ticket | Prose blockers after correction | Native graph action |
| --- | --- | --- |
| #130 | None | No change. |
| #131 | #130, #172 | Add #172. |
| #132 | #130 | No change. |
| #133 | #130, #172 | Add #172. Remove #132 after dependency confirmation. |
| #134 | None | No change. |
| #135 | #132, #174 | Prose only. Native graph already matches. |
| #136 | Architecture correction applied | Do not dispatch before the rewrite. |
| #137 | #132, #133, #135, #136, #112, #174, #175, #176 | Prose only for the three omitted blockers. |
| #138 | #130 through #137, #172 through #176, Files 2c, Files 2d, #141, #142 | Add four new native blockers. |
| #172 | #130 | No change. |
| #173 | #131, #172 | Add #172. |
| #174 | #132 | No change. |
| #175 | #132 | No change. |
| #176 | #136 | Keep after both rewrites. |
| #141 | #140, #178 | Prose only. Native graph already matches. |

The orchestrator must read GitHub native blockers before every dispatch.

Ticket prose must match the native graph after the planner applies these changes.

### Replacement acceptance checklist for #138

Every row needs four evidence fields where they apply.

The fields are source evidence, automated evidence, visible evidence, and accessibility evidence.

#### Entry and placement

- Files opens one Tab per host in the launcher's placement.
- `Cmd+Shift+E` activates that Tab.
- `Cmd+P` still opens Search Files.
- A projectless Session does not offer Files.
- Right and bottom placements pass separately.

#### Tree

- Directory loading, empty, searching, no-match, filter, flat results, and sticky folders pass.
- Root selection appears only for multiple roots.
- The Files tree has no Git decoration.
- Review keeps its Git decoration.
- Root and directory failures remain visible and retryable.
- Late responses cannot replace newer state.
- Keyboard navigation reaches and activates every visible row.
- Roles, expanded state, selection, focus, and loading announcements pass.
- Issue #112 supplies the tree drag value before any drag claim.

#### Opening and current viewers

- Select opens preview. Double-click pins. A second preview replaces the first.
- Router order passes focused tests.
- Cross-placement reuse activates one Tab.
- A line request reanchors an existing Tab.
- Source, preview, diff, image, audio, PDF, and DOCX still open.
- Live updates, downloads, line mentions, and wrapping still work.
- Review editing and autosave still work.

#### Menus and commands

- The tree and file menus match their recorded order and suppressions.
- Save a copy uses Downloads and collision numbering.
- Platform reveal labels match the platform table.
- Find, go to line, file history, definition, and approved language commands pass.
- Issue #112 supplies the feature-flag default.

#### Persistence and Sessions

- Two Sessions in one Project keep different Files and file Tab states.
- Switching Sessions restores each in-memory state.
- Restart restores each Session from its own record.
- Preview state, history, line anchor, wrap, root, filter, scroll, expansion, and selection restore.
- An unavailable route shows the placeholder Tab.

#### Environment and failure coverage

- Desktop widths, a mobile width, and 200 percent zoom remain usable.
- Reconnect does not duplicate Tabs or restore stale state.
- Download, LSP, directory, and app-list failures show useful recovery behavior.
- Every native blocker is closed before acceptance starts.
- The full suite passes once after visible verification.
- `CHANGELOG.md` has one Unreleased entry.

### Replacement orchestrator handoff

Use this handoff after the planner applies the corrections.

> Implement Epic #129 on branch `codex/files-tab` in its own worktree. The revised epic has sixteen Files child tickets. Use one worker per ticket. Report closed tickets divided by sixteen after every completion. Read GitHub native blockers before every dispatch. Do not dispatch #136, #176, or #137 until the OMP LSP corrections land. Issue #112 supplies only tree drag, search ranking, and the file-language flag default. Issue #173 defines versioned Files and file Tab payloads. Bottom ticket #141 stores and restores those payloads per Session. Bottom ticket #142 supplies the bottom placement. Block final acceptance on #141 and #142. Use `anthropic/claude-opus-5` at medium effort for implementation. Use the epic's smaller model only for work that the corrected ticket marks trivial. Run `/deslop`, then `/code-review` for each completed ticket. Run both Thermos reviews once at the merge gate. Do not push, merge, release, or start paid CI without approval.

The handoff must remove the statement that #136 is ready now.

The handoff must remove the superseded five-server host plan.

## 4. Final capability and gap counts

The matrix contains 58 capability groups.

| Result | Count |
| --- | ---: |
| Correctly assigned by current tickets | 23 |
| Assigned, but requiring ticket correction | 19 |
| Missing ticket coverage | 13 |
| Runtime evidence gates | 3 |
| Total | 58 |

The thirteen missing groups require two new Files tickets and additions to existing acceptance.

The runtime gates are tree drag, search ranking, and the feature-flag default.

They do not create implementation scope until #112 records their values.

## 5. Final status

This audit has no remaining source-research work.

The prior checkpoint and Remaining audit work sections are superseded.

The planner must apply the issue and blocker corrections before implementation starts.

Issue #334 can close after this report is posted.
