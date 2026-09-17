# Adversarial audit of Epic #119, Side chat

Audit ticket: [#333](https://github.com/AndrewBeniston/omp-reeve/issues/333).
Audit map: [#332](https://github.com/AndrewBeniston/omp-reeve/issues/332).

## Result

Epic #119 is not complete enough for implementation.

This audit checked 55 capabilities and found 30 gaps.

The largest defects concern Session ownership, inheritance, failure recovery, close paths, and acceptance evidence.

The current plan also uses a stale OMP fork seam.

## Sources and limits

The audit read Epic #119, all ten child tickets, native dependencies, and acceptance ticket #128.

It also read map #61, decisions #67 and #104, and runtime ticket #113.

The audit read `docs/research/panel-side-chat.md` and the Side chat orchestrator handoff.

The Reeve source was read at `origin/main`, commit `2920ac0`.

The OMP source was read from `@oh-my-pi/pi-coding-agent` 18.1.6.

The reference web bundle supplied only the missing conversation-header value.

No running Side chat exists in Reeve yet.

Therefore, all Reeve findings below are source findings.

## Corrections to old conclusions

1. OMP now supplies `SessionManager.forkFrom()`.
   It clones a Session without mutating the parent manager.
2. OMP now preserves additional workspace directories in `forkFrom()`.
3. OMP exposes additional workspace directories through `getAdditionalDirectories()`.
4. Reeve can read active tools, thinking level, fast mode, model, and Approval mode.
5. Reeve can set those runtime choices through existing RPC commands.
6. The reference bundle settles the open header question.
   A Side chat suppresses the in-view utility bar.
7. Ticket #113 no longer needs to block ticket #127 for that value.

## Eight-check result

| Check | Result | Evidence |
| --- | --- | --- |
| Reference mapping | Failed | Seven reference capabilities have no ticket or maintainer decision. |
| Current OMP | Failed | Tickets still name the mutating fork path and omit current inheritance fields. |
| Input and output states | Failed | Creation failure, cancellation, retry, crash recovery, and every close route are incomplete. |
| Keyboard and accessibility | Failed | The plan omits several keyboard, focus, dialog, mobile, zoom, and status checks. |
| Dependencies | Failed | Native dependencies differ from several ticket bodies. Acceptance misses a required host ticket. |
| Ticket size | Failed | Tickets #120 and #121 exceed one clear worker boundary. |
| Orchestrator handoff | Failed | The handoff preserves the stale #113 gate and misroutes one small ticket. |
| Acceptance proof | Failed | Ticket #128 does not separate visible proof from backend proof. |

## Feature-to-ticket traceability

“Source” means the value was verified in source during this audit.

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- |
| Side chat Tab kind | No kind exists. | Side chat research, Tab section | #120 | `Tab` has five kinds. | None | Keep #120. |
| Application shortcut | The menu item is disabled. | Side chat research, entry points | #120 | The menu action is null. | None | Keep #120. |
| Launcher entry | The row says not yet built. | Side chat research, entry points | #120 | `BUILT_PANEL_ACTIONS` excludes Side chat. | None | Keep #120. |
| Tab-strip plus entry | The Launcher supplies the plus menu. | Side chat research, entry points | #120 | Both surfaces share `launcherActions`. | None | Keep #120. |
| Command-palette open action | No action exists. | Side chat checklist | None | The palette lists Quick chat only. | G01 | Add this action to #120. |
| Main header action | The Session header does not exist yet. | Side chat research, entry points | #154 | #154 includes New side chat. | G02 | Block #128 on #154, or move this item into Side chat. |
| Forked history | The ordinary fork copies a branch. | Side chat research, identity | #177 | Reeve supports `fork`. | None | Keep this requirement. |
| Non-mutating fork creation | Reeve mutates a temporary manager today. | OMP 18.1.6 source | #177 says existing fork path. | OMP supplies `SessionManager.forkFrom()`. | G03 | Rewrite #177 to use `forkFrom()`. |
| Parent remains usable | Existing fork destroys the parent wrapper. | Reeve RPC source | #177 | `shutdownAfterCommittedFork()` runs today. | G04 | Require concurrent parent and Side chat use. |
| Working directory | OMP preserves the requested directory. | Side chat research, identity | #177 | `forkFrom()` accepts `cwd`. | None | Keep #177. |
| Workspace roots | OMP preserves additional directories. | OMP 18.1.6 source | None | `forkFrom()` copies `additionalDirectories`. | G05 | Add workspace-root proof to #177. |
| Model and role | Reeve exposes the active model. | Reeve RPC source | #177 | `get_state` returns the model. | None | Keep #177 and record the role. |
| Thinking level | Reeve exposes and changes it. | Reeve RPC source | None | `get_state` and `set_thinking_level` exist. | G06 | Add thinking-level inheritance to #177. |
| Fast service tier | Reeve exposes and changes it. | Reeve RPC source | None | `get_state` and `set_fast_mode` exist. | G07 | Add fast-mode inheritance to #177. |
| Active tools | Reeve exposes and changes them. | Reeve RPC source | None | `get_tools` and `set_tools` exist. | G08 | Add tool-state inheritance to #177. |
| Approval mode inheritance | Reeve exposes the effective mode. | Reeve RPC source | #177 | `get_state` returns Approval mode. | None | Keep #177. |
| Approval mode lock | The Composer can change the mode. | Side chat research, identity | Epic records a divergence. | Current Reeve can disable this control per surface. | G09 | Replace the divergence with a lock requirement. |
| Project instructions | Reeve resolves prompt files by Session directory. | Side chat research, identity | #122 | `resolveSessionSystemPrompts()` exists. | None | Keep #122. |
| Boundary instruction | No Side chat instruction exists. | Side chat research, identity | #122 | The OMP append-prompt path exists. | None | Keep #122. |
| No inherited task continuation | No Side chat exists. | Side chat checklist | #122 | The ticket requires a Fixture observation. | None | Keep #122. |
| No sub-agents | The boundary text is the only planned control. | Side chat research, identity | #122 | Reeve exposes sub-agents in ordinary Sessions. | G10 | Require hidden controls and a behavioral refusal check. |
| Ephemeral registry | No registry exists. | Decision #67 | #121 | Session listing has no Side chat filter. | None | Keep the registry work. |
| Hidden Session listing | Every disk Session is listed. | Side chat research, lifetime | #121 | `listAllSessions()` returns every OMP Session. | None | Keep #121. |
| Close deletes the file | The delete endpoint exists. | Side chat research, closing | #121 | The endpoint deletes one Session and reparents children. | None | Keep backend proof. |
| Normal application exit | No Side chat cleanup exists. | Side chat research, lifetime | #121 | Electron terminates the server immediately. | G11 | Add an awaited shutdown protocol or synchronous server cleanup. |
| Crash and stale-registry recovery | No recovery exists. | Reference expiry addendum | None | Process exit is not guaranteed after a crash. | G12 | Add a startup reconciliation ticket. |
| Expired state and restart action | No state exists. | Reference expiry addendum | Epic omits it. | The reference shows page and banner states. | G13 | Add an expired-state ticket or a maintainer decision. |
| Pending Tab | No pending kind exists. | Side chat research, open path | #120 | The ticket requests an immediate placeholder. | None | Keep #120. |
| Creation failure | No behavior is specified. | Side chat research, open path | None | The reference removes the pending Tab and reports failure. | G14 | Add failure cleanup and retry criteria to #120. |
| Creation cancellation | No behavior is specified. | Audit check 3 | None | Reeve fetches can abort during navigation. | G15 | Specify cancellation ownership and cleanup. |
| Numbered titles | No Side chat titles exist. | Side chat research, Tab | #123 | The ticket covers close and reopen. | G16 | Count loading Tabs and define failed-Tab numbering. |
| Derived title | Reeve has a title path. | Side chat research, Tab | #123 | `session-title.ts` exists. | None | Keep #123. |
| Working state | Tabs have no Side chat state. | Side chat research, Tab | #123 | The ticket requires a working state. | None | Keep #123. |
| Unread state | Tabs have no unread state. | Side chat research, Tab | #123 | The ticket requires accessible status text. | None | Keep #123. |
| Close confirmation | No Side chat dialog exists. | Side chat research, closing | #124 | The ticket covers turns, empty, cancel, and preference. | None | Keep #124. |
| Every close path | Close button, middle-click, and close-others bypass dialogs today. | Reeve Tab source | None | All paths call direct state mutations. | G17 | Route every close action through one Side chat guard. |
| Reopen closed Tab | Side chat would be reopenable by default. | Reeve panel source | None | Only Terminal is excluded today. | G18 | Mark Side chat non-reopenable in #121. |
| Do-not-ask setting | Browser storage patterns exist. | Side chat research, closing | #124 | Settings has a General section. | G19 | Specify the key, default, reset control, and storage-failure behavior. |
| `/side` opens | No command exists. | Side chat research, slash command | #125 | Browser-native commands omit `side`. | None | Keep #125. |
| `/side <text>` sends | No command exists. | Side chat research, slash command | #125 | The browser handler can return a prompt. | None | Keep #125. |
| `/side` reuses idle chat | No reuse exists. | Side chat research, slash command | #125 | The ticket specifies active-first reuse. | None | Keep #125. |
| `/side` adopts loading chat | No behavior exists. | Side chat research, slash command | #125 says idle only. | The reference adopts a loading Side chat. | G20 | Add loading adoption to #125. |
| Slash refusals | No behavior exists. | Side chat research, slash command | #125 | The ticket covers three refusal cases. | G21 | Add archived and pending-state proof for every entry path. |
| Focus commands | No commands exist. | Side chat research, focus | #126 | The ticket covers focus and availability. | None | Keep #126. |
| In-view header | No Side chat exists. | Reference bundle, conversation component | #127, blocked by #113 | The reference suppresses its utility bar. | G22 | Rewrite #127 with this value and remove #113 as its blocker. |
| Ordinary Composer | No Side chat exists. | Side chat research, Tab | #125 | The ticket removes only `/side`. | None | Keep #125. |
| Right-only placement | Reeve currently has only the Right panel. | ADR-0014 | #120 and ADR-0014 | The ADR declares right-only. | None | Add a declaration test after the Tab contract lands. |
| Parent Session ownership | Tabs currently persist across Sessions in one Project. | Reeve `AppShell` source | None | Tabs are one Project-level state array. | G23 | Add a ticket for parent ownership and Session switching. |
| Concurrent main and Side chat runs | Reeve can host many wrappers. | Reeve RPC source | None | The existing fork shuts the parent wrapper. | G24 | Add a two-Session concurrency acceptance case. |
| Selected-text action | Reeve has no selection overlay. | Side chat research, entry points | Epic says out of scope. | Map #61 has no reduction decision. | G25 | Add a ticket or record a maintainer decision on #61. |
| Queued-message action | Reeve has queued messages. | Side chat research, entry points | Epic says out of scope. | The current Composer has a queue surface. | G26 | Re-check the current queue and add a ticket or decision. |
| Side chats summary section | Reeve has no such section. | Side chat research, Tab | None | The reference exposes a Side chats section. | G27 | Add a ticket or explicit parity reduction. |
| Voice close handling | Reeve has no voice Session. | Side chat research, closing | None | The reference stops voice before discard. | G28 | Record an explicit no-OMP-counterpart decision. |
| Browser, mobile, and zoom | No decision or proof exists. | Audit check 4 | None | The reference action requires local desktop access. | G29 | Specify availability and add mobile and zoom acceptance cases. |
| Visible and backend acceptance | Ticket #128 uses one checklist. | Map #332 check 8 | #128 | It does not separate proof classes. | G30 | Replace criteria with separate visible and backend evidence tables. |

## Ticket size and dependency findings

Ticket #120 combines the Tab union, four entry surfaces, pending state, and failure recovery.

Split its lifecycle from its entry wiring before implementation.

Ticket #121 combines a registry, list filtering, destructive deletion, shutdown, startup reconciliation, and tests.

Split registry and filtering from lifecycle cleanup.

Native blockers add #177 to tickets #121 through #128.

Several ticket bodies omit that dependency.

Workers must trust the native dependency graph.

Ticket #128 blocks panel acceptance #171.

Ticket #154 contains a reference entry point, but #128 does not depend on #154.

That graph permits Side chat acceptance before the main header action exists.

## Orchestrator handoff findings

The handoff names the correct epic, ten children, branch, progress rule, and main model selector.

It correctly starts with ticket #120.

It incorrectly says ticket #113 still requires a live header check.

The reference bundle now supplies that value.

Ticket #127 is now a small mechanical ticket.

The handoff should route it through the stated trivial-work selector.

The handoff must also mention the #120 and #121 splits.

## Required issue corrections

The planner should make these edits before dispatch:

1. Split #120 into entry wiring and pending lifecycle tickets.
2. Rewrite #177 around `SessionManager.forkFrom()`.
3. Add workspace roots, thinking, fast mode, tools, and lock proof to #177.
4. Split #121 into registry filtering and lifecycle cleanup tickets.
5. Add startup reconciliation and the expired state.
6. Add one guarded close path for every Tab close command.
7. Mark Side chat as non-reopenable.
8. Add loading-chat adoption to #125.
9. Rewrite #127 with the verified hidden utility bar.
10. Remove #113 as #127's native blocker.
11. Add parent ownership and multi-Session switching.
12. Add concurrent parent and Side chat proof.
13. Add the command-palette open action.
14. Add or decide selected-text, queued-message, and Side chats summary capabilities.
15. Record the voice divergence as a maintainer decision.
16. Add browser, mobile, zoom, keyboard, and dialog accessibility proof.
17. Make #128 depend on #154, or move the header action into this epic.
18. Rewrite #128 around separate visible and backend evidence.
19. Add `Side chat` to `CONTEXT.md` beside `Quick chat`.
20. Update the orchestrator handoff after the issue graph changes.

## Acceptance evidence required

Visible proof must cover every open path, state, failure, close route, and focus route.

It must use a disposable Fixture in the desktop build.

Backend proof must read the parent and Side chat Session records separately.

It must prove inheritance, filtering, deletion, startup cleanup, and parent preservation.

Accessibility proof must inspect names, roles, status announcements, focus restoration, and keyboard-only operation.

Regression proof must cover Quick chat and two parent Sessions in one Project.

## Recommendation

Do not dispatch Epic #119 from its current tickets.

Apply the corrections above, refresh the native graph, and regenerate the handoff frontier.
