# Adversarial audit: Browser and Terminal parity

Research for [#335](https://github.com/AndrewBeniston/omp-reeve/issues/335), under
[audit map #332](https://github.com/AndrewBeniston/omp-reeve/issues/332), for
[Epic #158](https://github.com/AndrewBeniston/omp-reeve/issues/158).

## Final status

This audit is complete.

The audit checked 24 delivery groups. Those groups cover all 36 Browser rows and all 22 Terminal rows.

The audit found 18 correction packages. It proposes nine new tickets.

Epic #158 has 20 children now. The corrected plan has 29 children.

Issue #335 was assigned before the audit started.

## Evidence boundary

Verified facts come from public issue bodies, native dependency links, or source files.

Recommendations are proposals. This audit did not edit any issue.

Current Reeve source is `origin/main` at `2920ac07941451fbdffb86998431dc017e1d54b4`.

Reeve locks OMP 18.1.6. The OMP comparison also used 18.2.4 at `dbf3afad4894bde827d90f965e77b3fe1c5a95e5`.

The reference is ChatGPT Desktop 26.908.40834. The installed application and extracted bundle agree.

No reference code, markup, class name, style rule, or asset appears here.

No live Reeve or reference session was used for this final pass. This report makes no runtime success claim.

## Resolved reference values

The original Browser audit left two rendered values unresolved. The reference bundle contains both values.

| Property | Verified reference value | Ticket effect |
| --- | --- | --- |
| Address field shape | The field is 28 pixels high. It has a 10-pixel radius. | Add both values to #164. |
| Address hover | The field changes from transparent to the reference ghost fill. | Add the state to #164. |
| Address focus | The field keeps the ghost fill. It adds a one-pixel inset border ring. | Add the state to #164. |
| Toolbar control focus | A control adds a two-pixel inset focus ring. | Add keyboard focus proof to #164. |
| Toolbar control hover | A control uses the reference subtle text fill. | Add pointer proof to #164. |

The Browser audit row 13 is also settled from source. Reeve has no failed-load event or error surface.

## Final feature-to-ticket traceability

The row references use `B` for the Browser audit and `T` for the Terminal audit.

| Group | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Browser reload and find. B1 and B2. | Reeve offers normal reload from two controls. It has no find path. | Browser rows 1 and 2. | #159. | The bridge accepts normal reload only. | Force reload, page override, empty search, match count, focus, and reconnect lack proof. | Expand #159 with those states and a platform keyboard matrix. |
| 2 | Browser page zoom and its readout. B3 and B4. | Reeve has no page zoom. | Browser rows 3 and 4. | #186 and #161. | No bridge zoom command exists. | Reload, reconnect, per-Tab persistence, and focus routing lack proof. | Expand #186. Keep the readout in #161 and the transient banner in #186. |
| 3 | The device toolbar. B5. | Reeve has no device state. | Browser row 5. | #160 and #187. | No device rectangle or device controls exist. | Keyboard, accessibility, narrow-panel, reload, zoom, and per-Tab states lack proof. | Expand both tickets with the full state matrix. |
| 4 | Browser options and print. B6 and B7. | Reeve has no Browser options menu or print command. | Browser rows 6 and 7. | #161. | The toolbar has no options control. | Keyboard navigation, focus return, cancellation, and print failure lack proof. | Expand #161 with menu and print error states. |
| 5 | Downloads. B8. | Reeve has no download handler or download surface. | Browser row 8 and the Browser addendum. | #188 after its split. | The desktop session registers no download handler. | #188 combines three stateful products. Download cancellation and persistence are absent. | Keep downloads in #188. Move history and settings to new tickets. |
| 6 | History, Browser settings, and import. B9, B26, and B27. | Reeve has a back stack and one clear-data row. | Browser rows 9, 26, and 27. | #188 and an explicit import decision. | Reeve has no history registry or settings route. | History and settings need separate stores and failure states. | Create separate history and settings tickets. Keep import declined in #158. |
| 7 | Site permissions. B10. | Reeve refuses every page permission. | Browser row 10. | #162. | Both Electron permission handlers reject requests. | Deny, dismiss, revoke, unsupported, reload, persistence, and multi-Session states are absent. | Expand #162. Block it on the new Browser settings ticket. |
| 8 | Site information, loading, failure, empty state, search, and suggestions. B11 through B16. | Reeve has none of these surfaces. Bare text becomes an invalid HTTPS address. | Browser rows 11 through 16 and the addendum. | #189. Address suggestions already match. | The bridge emits no certificate, loading, or failed-load events. | Error-page failure, bounded retry, offline, stale cleanup, and provider failure are absent. | Expand #189. Block it on the new Browser settings ticket. |
| 9 | Browser media state and mute. B17 and B18. | Reeve shows no media state. | Browser rows 17 and 18. | #163 and #72. | The Tab model has no media fields. | #163 does not depend on #72. Reload and renderer-loss cleanup lack proof. | Add native blocker #72. Expand #163 acceptance. |
| 10 | Browser popups. B21. | Reeve opens each allowed popup in the system browser. | Browser row 21 and the addendum. | No epic ticket exists. | The reference adopts foreground and background popups as panel Tabs. | The capability has no ticket or linked decision. | Create a Browser popup ticket. |
| 11 | Page screenshot and annotation. B22 and B23. | Reeve has neither feature. | Browser rows 22 and 23. | #190. | The Browser bridge has no capture or annotation path. | #190 combines two bridges. Annotation omits four states. | Keep screenshot in #190. Create a separate annotation ticket. |
| 12 | Browser detach, Session restoration, and transfer. B19 and B20. | Reeve stores addresses per Project. It has no detached Tab window. | Browser rows 19 and 20. | #165, #153, and #185. | The current registry keys Browser Tabs by Project. | Restore conflicts, failures, reconnect, and transfer ordering lack proof. | Expand #165. Add #165 as a native blocker for #185. |
| 13 | Agent targeting, site tools, and extensions. B24, B25, and B28. | Every page target is eligible. OMP has no site-tool surface. | Browser rows 24, 25, and 28. | #191 and #49. Site tools and extensions are out of scope. | Current OMP still selects the first visible page without a matcher. | A Tab marker alone does not supply OMP's matcher. The site-tool decision has no trigger. | Define the matcher integration in #191. Add an OMP capability trigger to #158. |
| 14 | Browser matched chrome and visual details. B29 through B36. | Several rows match. Reeve lacks some toolbar controls and drag reorder. | Browser rows 29 through 36. | #164, #143, #151, and the matched decisions. | The toolbar is 40 pixels. The bundle resolves B32 and B34. | #164 lacks the resolved values and separate pointer and keyboard proof. | Add the resolved values to #164. Keep host behavior in its host tickets. |
| 15 | Terminal placement, toggle, creation, and movement. T1 through T3 and T8. | `Control+backtick` opens a new Right-panel Terminal. | Terminal rows 1 through 3 and 8. | #145 in the bottom-placement epic. | #145 owns the complete placement behavior. | #145 relies on the Terminal registry but lacks that native blocker. | Add #166 and the new replay ticket as blockers for #145. |
| 16 | Terminal lifetime, replay, alternate screen, and undo-close. T5 through T7. | The shell ends when its view ends. | Terminal rows 5 through 7 and the addendum. | #166. | Component cleanup closes the pty. | #166 is oversized. It omits several failure and ownership states. | Keep registry lifetime in #166. Create replay and undo-close tickets. |
| 17 | Terminal keyboard and clear. T4 and T12 through T14. | Xterm receives default keys. Reeve has no custom handler. | Terminal rows 4 and 12 through 14. | #167, #192, and #114. | Application menu accelerators can win before Xterm. | Platform, menu-precedence, accessibility, and non-Terminal proof remain thin. | Expand #167 and #192. Reduce #114 to the Reeve Edit-menu check. |
| 18 | Terminal title, Worktree warning, and multi-root. T9 through T11. | Reeve starts with `Terminal` and stores one directory. | Terminal rows 9 through 11 and current OMP. | #168 plus a new ticket. | OMP stores `additionalDirectories` in the Session header. | The multi-root exclusion is false. Reeve drops the additional directories. | Correct #158. Create the multi-root Terminal ticket. |
| 19 | Terminal links, scroll, and workspace refresh. T15 through T17. | Reeve opens links. It uses default output scrolling and schedules no refresh. | Terminal rows 15 through 17. | #192. | No workspace-refresh timer exists. | Cancellation, rapid output, inactive Tab, reconnect, and multi-Session states lack proof. | Expand #192 with those states. |
| 20 | Terminal font and window zoom. T18. | Reeve hardcodes 12 pixels and `--font-mono`. | Terminal row 18. | #169. | Terminal options contain fixed values. | Invalid values, fallback, persistence, reload, and open-Terminal updates lack proof. | Expand #169. |
| 21 | Terminal crash recovery, palette, and retained refusals. T19 and T22. | Reeve has no Terminal error boundary. Its selection and track colors differ. | Terminal rows 19 and 22. | #168 after its split. | The Terminal component has no recovery surface. | #168 combines unrelated renderer and process work. | Move crash recovery and palette into a new ticket. Keep all refusal states. |
| 22 | Shell, environment, Windows choice, and count. T20 and the addendum. | Reeve uses a login shell and scrubs more variables. Windows uses `COMSPEC`. | Terminal row 20 and the addendum. | #168 and #193. No count cap is required. | The source paths and fallback chains differ. | Missing executables, spawn failure, fallback, and deliberate environment divergence lack proof. | Create a shell-policy ticket. Expand #193 with backend proof. |
| 23 | Terminal transfer between Sessions. T21. | Reeve cannot transfer a Terminal. | Terminal row 21. | #153 and #185 in the host epic. | The host ticket transfers declared Tab routes. | Browser transfer lacks #165. Terminal transfer must retain the registry session. | Add #165 as a blocker for #185. Add Terminal registry proof to host acceptance. |
| 24 | Browser and Terminal acceptance. All rows. | No parity acceptance run exists. | Audit map check 8. | #170. | #170 names mutable audit checklists and one full test run. | It does not separate visible proof from backend proof. It omits the corrected plan. | Replace its checklist with a fixed acceptance matrix. |

## Cross-cutting acceptance sweep

These additions complete map check 4. They do not create separate correction packages.

| Dimension | Missing coverage | Exact acceptance additions |
| --- | --- | --- |
| Keyboard | Several tickets name macOS chords only. Device controls lack keyboard behavior. | Add platform matrices to #159, #160, #161, #167, #187, and #192. Verify focus ownership. |
| Accessibility | Most tickets check pixels or effects only. | Require names, roles, states, focus order, focus return, and announcements in #159 through #164 and #186 through #190. |
| Mobile | Reeve is a desktop application. Mobile coverage means emulated pages and narrow panels. | Add narrow-panel checks to #160, #161, #164, #187, #189, and the popup ticket. |
| Zoom | Page zoom, device scale, and window zoom are independent. | Prove independence in #186, #187, and #169. Check browser controls under window zoom in #164. |
| Reload | Normal reload, force reload, error retry, and Terminal recovery are different actions. | Add proof to #159, #162, #186, #189, and the new Terminal recovery ticket. |
| Reconnect | Renderer loss can leave stale Browser state or a detached pty. | Add reconnect proof to #163, #165, #166, #191, #192, and the new replay ticket. |
| Persistence | Some state is per Tab, per Session, per site, or application-wide. | State each scope in #162, #165, #168, #169, #188, #189, and each new storage ticket. |
| Multi-Session | Shared Browser partitions and isolated Tab state can conflict. | Use two Sessions in #162, #163, #165, #166, #188, #189, and every transfer ticket. |

## Ticket-size audit

The size result is a scope estimate. It is not a measured token result.

Sixteen current tickets fit one 200,000-token context after the acceptance edits.

Four current tickets do not fit that limit.

| Current ticket | Oversized scope | Corrected split |
| --- | --- | --- |
| #166 | Registry lifetime, replay, alternate-screen restore, and undo-close each hold state. | Keep registry lifetime in #166. Create replay and undo-close tickets. |
| #168 | Titles, Worktree state, recovery, palette, shell selection, and environment policy cross three seams. | Keep titles and Worktree state in #168. Create recovery and shell-policy tickets. |
| #188 | Downloads, history, and Browser settings each own storage and destructive actions. | Keep downloads in #188. Create history and Browser settings tickets. |
| #190 | Clipboard screenshot and Composer annotation use different bridges and failures. | Keep screenshot in #190. Create an annotation ticket. |

The four splits create seven tickets. Popup and multi-root coverage create two more tickets.

## Native dependency audit

GitHub records 41 `blocked by` links across the 20 current children.

The current links match the issue bodies, except where the bodies omit native links already present.

| Child | Current native blockers |
| --- | --- |
| #159 | None. |
| #160 | None. |
| #161 | #159. |
| #162 | #161 and #115. |
| #163 | #159. |
| #164 | #163, #115, and #190. |
| #165 | #141 and #179. |
| #166 | None. |
| #167 | #166 and #114. |
| #168 | #166. |
| #169 | #166. |
| #170 | All other 19 current children. |
| #186 | #159. |
| #187 | #160. |
| #188 | #161. |
| #189 | #161 and #115. |
| #190 | #163. |
| #191 | #165. |
| #192 | #166. |
| #193 | #166. |

The corrected graph needs these changes.

1. Add #72 as a native blocker for #163.
2. Add #166 and new ticket N3 as native blockers for #145.
3. Add #165 as a native blocker for #185.
4. Add new ticket N8 as a native blocker for #162 and #189.
5. Replace #190 with new ticket N9 as the annotation blocker for #164.
6. Add N1 through N9 as native blockers for #170.
7. Add the blocker links shown in the new-ticket table.

These changes add 26 links and remove one link. The corrected graph has 66 links.

#49 is a defect that #191 resolves. It is not a prerequisite for #191.

#114 and #115 remain blockers until their reduced runtime checks finish.

## Eighteen correction packages

Each package gives the exact planner action. The planner can apply these actions without another research pass.

| Gap | Target | Exact edit |
| --- | --- | --- |
| G1 | #158 | Remove the one-directory claim from `Out of Scope`. State that OMP supports ordered additional directories. |
| G2 | #158 and N2 | Add the source-directory hint and directory switcher as a Terminal user story. Create N2. |
| G3 | Native dependencies | Apply every dependency change in the dependency section. Keep #72 explicit. |
| G4 | #158 and N1 | Add foreground and background popup adoption. Create N1. Keep unsupported dispositions denied. |
| G5 | #114 | Remove reference restart, clear, environment, and count questions. Keep only the Reeve Edit-menu runtime check. |
| G6 | #115 | Remove settled main-process questions. Keep Reeve failed-load behavior and rendered B32 and B34 validation. |
| G7 | #158, all children, and the handoff | Replace every 250,000-token hard stop with 200,000. Keep the 150,000-token aim. |
| G8 | #166, N3, and N4 | Split registry lifetime, replay with alternate screen, and undo-close. Add the missing failure states. |
| G9 | #168, N5, and N6 | Split title and Worktree state, recovery and palette, and shell policy. |
| G10 | #188, N7, and N8 | Split downloads, history, and Browser settings. Give each ticket its own destructive and persistence states. |
| G11 | #190 and N9 | Keep clipboard screenshot in #190. Move annotation into N9. |
| G12 | N9 | Add the coach mark, marker visibility, hold-to-view-original, hold-space interaction, and discard confirmation. |
| G13 | #188 | Add cancellation, failure, unique names, acknowledgment, show-in-folder, prompt location, reload, and multi-Session behavior. |
| G14 | #162 | Add grant, denial, dismissal, revocation, unsupported requests, reload, persistence, and multi-Session behavior. |
| G15 | #189 | Add bounded retry, error-page failure, crash, offline, stale cleanup, and search-provider failure. |
| G16 | #166 and N3 | Add attach failure, renderer loss, replay truncation, resize races, detached exit, and ownership across Sessions. |
| G17 | #170 | Give each row separate visible-proof and backend-proof fields. Require links to both records. |
| G18 | #170 and all delivery tickets | Replace mutable checklist references with a fixed matrix. Add all eight cross-cutting dimensions. |

## Nine new tickets

The planner must replace `N1` through `N9` with the created issue numbers.

| Label | Proposed title | Scope | Native blockers | Required acceptance |
| --- | --- | --- | --- | --- |
| N1 | Browser: adopt supported popups as panel Tabs | Adopt foreground and background dispositions beside the opener. Deny other dispositions. Preserve deep-link and restricted-navigation handling. | #165. | Verify foreground, background, denied, deep-link, error-page, narrow-panel, and multi-Session behavior. |
| N2 | Terminal: source-directory hint and directory switcher | Surface OMP additional directories. Show numbered roots before first input. Send a shell-specific directory command. | #166. | Verify POSIX, PowerShell, Command Prompt refusal, first interaction, persistence, reconnect, and two Sessions. |
| N3 | Terminal: replay and alternate-screen restoration | Replay the 16,000-character buffer. Restore alternate-screen state first. Apply the repaint resize sequence. | #166. | Verify truncation, attach failure, renderer loss, resize races, detached exit, and a full-screen program. |
| N4 | Terminal: undo-close restores the retained session | Capture the registry session on close. Restore the same id and output through the host reopen path. | N3 and #183. | Verify repeated close, expired retention, wrong Project refusal, focus, and multi-Session isolation. |
| N5 | Terminal: crash recovery and palette parity | Add the Reload boundary. Map scrollbar and selection colors through the Tier 1 adapter. | #166. | Verify crash, failed reload, keyboard focus, all configured palettes, window zoom, and refusal states. |
| N6 | Terminal: shell and environment policy | Resolve the POSIX shell from the user record. Define arguments and environment differences. Keep deliberate Reeve security changes. | #166. | Verify missing shell, spawn failure, quoting, fallback, environment removal, reload, and each desktop platform. |
| N7 | Browser: browsing history | Record history for the Browser partition. Add empty, loading, failure, clear, and persistence states. | #161. | Verify navigation, deletion, cancellation, restart, shared partition, and multi-Session behavior. |
| N8 | Browser: settings and site settings | Add a navigable settings route. Add site settings and Browser-owned settings. | #161. | Verify back, forward, deep links, unavailable rows, keyboard, accessibility, reload, and persistence. |
| N9 | Browser: annotate a page into the Composer | Add markers and the complete annotation mode. Send readable attachments to the Composer. | #163. | Verify every G12 state, page zoom, device scale, reload, discard, failure, accessibility, and two Sessions. |

Every new ticket uses one 200,000-token goal. Each ticket aims near 150,000 tokens.

## Exact existing issue edits

The planner must edit 25 existing issue bodies.

1. Edit #158 with G1, G2, G4, G7, the corrected child count, and the OMP trigger.
2. Edit #114 and #115 with G5 and G6.
3. Edit all 20 current children with the 200,000-token hard stop.
4. Apply the row-specific acceptance additions from the traceability table.
5. Edit #145 and #185 so their `Blocked by` sections match GitHub.
6. Edit #170 with G17, G18, 29 children, and every final native blocker.
7. Edit the maintainer handoff with 29 tickets and the corrected dependency frontier.

The handoff already names the correct epic, branch, progress rule, and model selectors.

The handoff must keep branch `codex/browser-terminal-parity`.

The handoff must report closed tickets divided by 29 after the planner creates N1 through N9.

## Eight-check result

| Map check | Final result |
| --- | --- |
| 1. Map every reference capability. | Complete. All 58 numbered rows map through the 24 groups. |
| 2. Recheck current OMP. | Complete. Multi-root is a stale exclusion. Site tools remain unsupported in OMP 18.2.4. |
| 3. Cover every state and path. | Complete as an audit. G12 through G16 name the missing acceptance work. |
| 4. Cover every cross-cutting dimension. | Complete as an audit. The cross-cutting table gives exact ticket additions. |
| 5. Verify dependencies and blockers. | Complete. The audit checked 41 current links and specifies the 66-link corrected graph. |
| 6. Fit every ticket into 200,000 tokens. | Complete as a plan. Four tickets split into eleven bounded tickets. |
| 7. Verify the orchestrator handoff. | Complete. Only the count, hard stop, and dependency frontier need changes. |
| 8. Separate visible and backend proof. | Complete as a correction. G17 and G18 replace #170's weak contract. |

## Final counts

| Count | Result |
| --- | ---: |
| Browser audit rows | 36 |
| Terminal audit rows | 22 |
| Total numbered rows | 58 |
| Delivery groups | 24 |
| Correction packages | 18 |
| Current epic children | 20 |
| New tickets | 9 |
| Corrected epic children | 29 |
| Oversized current tickets | 4 |
| Current native dependency links | 41 |
| Corrected native dependency links | 66 |
| Existing issue bodies requiring edits | 25 |
