# Adversarial audit of the panel host and header

Research for #337 under audit map #332. Read on 2026-09-17.

## Resolution

Epic #148 does not completely cover the reference or current OMP.

The audit found 38 capability groups, 15 capability gaps, and six blocker mismatches.
Every one of the 13 child tickets was inspected.
Tickets #153 and #154 are likely split candidates.

No user-visible behavior was verified during this audit.
The findings separate source evidence from later desktop proof.

## Sources checked

- Epic #148 and children #149 to #157 and #182 to #185.
- Audit map #332 and audit ticket #337.
- Native blockers #111, #120, #140, #141, #143, #146, #178, #179, and #181.
- Bottom placement epic #139.
- `docs/research/panel-host-and-header.md`.
- ADR-0014.
- The panel host orchestrator handoff.
- Current Reeve source at `origin/main`.
- Installed OMP package source, version 18.1.6.

The audit did not copy a reference bundle value into this report.

## Verified facts

### Current Reeve

- Reeve registers `Cmd+Alt+B` and shows a header panel control.
- The desktop menu calls the command `Toggle panel`.
- The reference title is `Toggle Review Panel`.
- Reeve reserves 352px for the Session at normal desktop widths.
- The 1200px panel ceiling remains only as a fallback.
- Reeve has a Session summary panel and a header control.
- The summary shows environment data, Session actions, branches, system prompt, usage, subagents, and sources.
- Reeve stores panel open state only in component state.
- Reeve stores panel width in local storage.
- Reeve stores maximised state in the resizer.
- Reeve has no per-Session workspace record.
- Reeve keeps ten closed Tabs in a volatile stack.
- Reeve excludes Terminal tabs with a hard-coded kind check.
- Reeve loses the closed-Tab stack after restart.
- Reeve has five plain Tab variants.
- Reeve has no ADR-0014 capability declarations.
- The Session header shows a visual ellipsis.
- The ellipsis does not open a Chat actions menu.

### Current OMP

- OMP supports Share.
- OMP supports HTML export.
- OMP supports Markdown formatting.
- OMP supports Fork.
- OMP supports continuation.
- OMP supports Session naming.
- OMP supplies Session summary data.
- OMP has no Session deeplink support.
- OMP has no archive support.

These facts make the `Coming soon` plan stale for Share.
They also require an explicit HTML export decision.
The deeplink and archive controls can remain disabled.

### Reference and plan

- The reference has one Tab model across two Placements.
- Each Tab kind declares its host capabilities.
- One per-Session record stores the panel workspace.
- The bottom placement epic owns the shared model and record.
- Native GitHub blockers control the execution frontier.
- Runtime item states and header geometry remain for #111.

## Feature-to-ticket matrix

`Covered` means a ticket or decision names the capability.
It does not mean that the implementation works.
`Gap Gx` links the row to the correction list below.

| #   | Reference or OMP capability                                 | Current Reeve state                             | Evidence                        | Ticket or decision     | Proof                    | Gap                    | Recommended correction                                          |
| --- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------- | ---------------------- | ------------------------ | ---------------------- | --------------------------------------------------------------- |
| 1   | Toggle the Right panel with `Cmd+Alt+B`.                    | The chord and control exist. The title differs. | Host research and Reeve source. | #149                   | Source read.             | Gap G1.                | Narrow #149 to the title, empty Launcher, and state proof.      |
| 2   | Toggle the Bottom panel with `Cmd+J`.                       | The Bottom panel is absent.                     | Host research.                  | #139                   | Ticket trace.            | Covered outside #148.  | Keep #139 as the owner.                                         |
| 3   | Hide or show the Tab strip with `Cmd+Shift+B`.              | This capability is absent.                      | Host research and Reeve source. | #149                   | Source read.             | Gap G2.                | Add complete state and input criteria to #149.                  |
| 4   | Toggle Full view with `Cmd+Shift+F`.                        | Width maximisation exists with `Ctrl+]`.        | Host research and Reeve source. | #150                   | Source read.             | Gap G3.                | Remove the stale ceiling task and test the layout mode.         |
| 5   | Restore Full view after close or resize.                    | Width state does not implement these rules.     | Host research and ADR-0014.     | #182                   | Ticket trace.            | Gap G3.                | Add reload, resize, and record proof to #182.                   |
| 6   | Apply three full-width flags by Tab kind.                   | Tab kinds cannot declare the flags.             | Host research and ADR-0014.     | #140, #178, #182       | Ticket trace.            | Gap G3.                | Name each kind and each expected flag in #182.                  |
| 7   | Declare Tab capabilities by kind.                           | Five plain variants exist.                      | ADR-0014 and Reeve source.      | #140 and #178          | Source and ticket trace. | Covered.               | Keep both native blockers.                                      |
| 8   | Store one workspace record per Session.                     | No workspace record exists.                     | Host research and ADR-0014.     | #141 and #179          | Ticket trace.            | Covered.               | Keep both native blockers.                                      |
| 9   | Correct focus across three areas.                           | Reeve has no host focus model.                  | Host research and #111.         | #146                   | Ticket trace.            | Covered by dependency. | Preserve #146 as a blocker where needed.                        |
| 10  | Restore focus after close without stealing guest input.     | Reeve has no equivalent handling.               | Host research.                  | #146                   | Ticket trace.            | Covered by dependency. | Verify Browser and Terminal input in #157.                      |
| 11  | Move a Tab between Placements.                              | Tab drag is absent.                             | Host research.                  | #181                   | Ticket trace.            | Covered by dependency. | Keep #181 authoritative.                                        |
| 12  | Reorder a Tab by pointer and keyboard.                      | Reordering is absent.                           | Host research.                  | #143 and #151          | Ticket trace.            | Gap G4.                | Put host menu behavior in #151 and movement in #143.            |
| 13  | Pin a Tab and keep it at the front.                         | Pinning is absent.                              | Host research.                  | #151                   | Ticket trace.            | Gap G4.                | Add keyboard, pointer, persistence, and refusal proof.          |
| 14  | Show the complete strip context menu.                       | Reeve offers only close actions.                | Host research and Reeve source. | #151                   | Source read.             | Gap G4.                | Add destructive, disabled, and per-kind states.                 |
| 15  | Keep strip scroll position per Placement.                   | Reeve does not keep it.                         | Host research.                  | #143 and #151          | Ticket trace.            | Gap G4.                | Assign storage to #143 and visible proof to #151.               |
| 16  | Reopen eligible Tabs with titles and Project isolation.     | A volatile hard-coded stack exists.             | Host research and Reeve source. | #183                   | Source read.             | Gap G5.                | Add unavailable, reload, cancellation, and isolation states.    |
| 17  | Hide the strip for one Tab.                                 | Reeve always uses its existing strip rules.     | Host research.                  | #183                   | Ticket trace.            | Gap G5.                | Add close-panel semantics and accessible naming.                |
| 18  | Detach a Tab into a desktop window.                         | This capability is absent.                      | Host research.                  | #153                   | Ticket trace.            | Gap G8.                | Split creation from lifecycle and restoration.                  |
| 19  | Move a Tab to another Session.                              | This capability is absent.                      | Host research.                  | #185                   | Ticket trace.            | Gap G9.                | Add target, cancellation, failure, and atomicity criteria.      |
| 20  | Find in the focused surface with `Cmd+F`.                   | Reeve has no host command.                      | Host research.                  | #152                   | Ticket trace.            | Gap G6.                | Add empty, error, retry, cancellation, and focus return.        |
| 21  | Navigate application history with keys and mouse buttons.   | Only Browser navigation exists.                 | Host research and #111.         | #184                   | Source read.             | Gap G7.                | Resolve stack scope and test two windows and Sessions.          |
| 22  | Keep file navigation separate.                              | File navigation remains a separate decision.    | Host research.                  | Decision #69           | Research trace.          | Covered outside #148.  | Keep the explicit cross-epic decision.                          |
| 23  | Route Go to line, Go to definition, and file-tree commands. | Current chords conflict or are absent.          | Host research.                  | Decisions #69 and #110 | Research trace.          | Covered outside #148.  | Keep the command ownership explicit.                            |
| 24  | Show the Launcher when an empty panel opens.                | Reeve already shows it.                         | Host research and Reeve source. | #149                   | Source read.             | Gap G1.                | Replace build work with desktop proof.                          |
| 25  | Use the same Launcher from the plus control.                | Reeve already matches this behavior.            | Host research and Reeve source. | Existing behavior      | Source read.             | Covered.               | Protect it in #157.                                             |
| 26  | Toggle the pinned summary with no chord.                    | Reeve has an existing summary panel.            | #111 and Reeve source.          | #155                   | Source read.             | Gap G12.               | Rewrite #155 around the existing summary.                       |
| 27  | Copy the working directory.                                 | Reeve has an existing path source.              | Ticket and Reeve source.        | #154                   | Source read.             | Gap G10.               | Name the exact existing path and error state.                   |
| 28  | Copy a Session deeplink.                                    | OMP has no Session deeplink.                    | OMP source.                     | #154 disabled decision | Source read.             | Covered as disabled.   | Keep `Coming soon` and explain the missing source.              |
| 29  | Copy the Session as Markdown.                               | OMP supports Markdown formatting.               | OMP source.                     | #154                   | Source read.             | Gap G10.               | Enable the action and define clipboard failure behavior.        |
| 30  | Export the Session as HTML.                                 | Reeve already exposes OMP HTML export.          | OMP and Reeve source.           | No #148 decision       | Source read.             | Gap G11.               | Record an explicit keep, move, or omit decision in #148.        |
| 31  | Start a side Session or a Worktree Session.                 | Separate creation paths exist or are planned.   | Ticket and Reeve source.        | #120 and #154          | Ticket trace.            | Gap G10.               | Name loading, cancellation, failure, and placement behavior.    |
| 32  | Fork a Session.                                             | OMP and Reeve support Fork.                     | OMP and Reeve source.           | #154                   | Source read.             | Gap G10.               | Enable supported destinations and test failure cleanup.         |
| 33  | Continue a Session in a Worktree.                           | OMP supports continuation.                      | OMP source.                     | #154                   | Source read.             | Gap G10.               | Enable local continuation and define unavailable targets.       |
| 34  | Open a Session in a new window.                             | No header action exists.                        | Host research and Reeve source. | #154                   | Source read.             | Gap G10.               | Put the desktop lifecycle in the second #154 split.             |
| 35  | Rename a Session.                                           | OMP and Reeve support naming.                   | OMP and Reeve source.           | #154                   | Source read.             | Gap G10.               | Enable rename and test cancel, empty, and failure states.       |
| 36  | Archive a Session.                                          | OMP has no archive support.                     | OMP source.                     | #154 disabled decision | Source read.             | Covered as disabled.   | Keep `Coming soon` until Reeve owns an archive registry.        |
| 37  | Share a Session.                                            | OMP supports Share. Reeve has no header action. | OMP source and Reeve source.    | #154                   | Source read.             | Gap G10.               | Remove `Coming soon` and implement the OMP-backed action.       |
| 38  | Match header geometry, controls, and final evidence.        | Existing geometry remains unmeasured live.      | Host research and #111.         | #156 and #157          | Research trace.          | Gaps G13 to G15.       | Add responsive proof and separate visible and backend evidence. |

## Fifteen capability gaps

### G1. Right-panel toggle scope is stale

Edit #149 to state that the chord and header control already exist.
Change the menu title to `Toggle Review Panel`.
Require desktop proof for an empty panel and an occupied panel.
Require the Launcher after an empty open.
Require focus return after close.

### G2. Hidden-strip state lacks complete criteria

Keep `Cmd+Shift+B` in #149.
Add keyboard routing for both Placements.
Add an accessible command name and state announcement.
Verify right-side insertion clears the hidden state.
Verify bottom insertion preserves the hidden state.
Verify persistence after reload and application restart.
Verify two Sessions keep independent values.

### G3. Full view contains stale work and incomplete states

Remove the normal 1200px-ceiling task from #150.
Keep its fallback only as an implementation detail.
Require `Cmd+Shift+F` to create a Tab when no Tab exists.
Require Enter full screen and Exit full screen labels.
Require `Ctrl+]` removal and conflict proof.
Expand #182 with human-close, resize-close, reload, and restart evidence.
Name every test Tab kind and its expected full-width flags.

### G4. Strip menu, pinning, reorder, and overflow lack state coverage

Edit #151 with the exact menu order.
Remove `reopen per kind` from the #151 title because #183 owns reopen.
Add disabled states when a command cannot act.
Add close-right and close-others behavior for pinned Tabs.
Add keyboard reorder and keyboard pin actions.
Add drag-to-pin behavior and refusal cues.
Verify pin and scroll state after reload.
Verify accessible menu roles, names, focus, and escape behavior.

### G5. Reopen and single-Tab behavior lack recovery coverage

Edit #183 to cover an empty stack.
Cover an unavailable restored route.
Cover cancellation when reopening needs a choice.
Cover application restart and Project change.
Prove that the stack never crosses Projects.
Name the single-Tab close control and its focus destination.

### G6. Find covers only the happy path

Edit #152 to define loading, empty, error, retry, and cancellation states.
Remove `application back and forward` from the #152 title because #184 owns it.
Define focus return after close.
Define behavior when Browser find is unavailable.
Require accessible result counts and next-result controls.
Verify chat, file, and Browser surfaces.

### G7. Application navigation has unresolved scope

Keep #111 as a blocker for #184.
Edit #184 after #111 settles the stack key.
Test keyboard and mouse input in two windows.
Test two Sessions in one window.
Test Browser-page history separately from application history.
Define empty-history and failed-target behavior.
Verify state after reload and reconnect.

### G8. Detached-window work is likely too large

Keep #153 for drag-out, window creation, placeholder creation, Show window, and source focus.
Create a second ticket for Restore, restore failure, close cleanup, crash recovery, and page disposal.
Put pin-to-front behavior in the first ticket.
Put stale-window and missing-page recovery in the second ticket.
Require keyboard and screen-reader access in both tickets.
Require a responsive fallback decision for platforms without detached windows.

### G9. Session transfer lacks transaction states

Edit #185 with a target chooser, cancellation, and closed-target behavior.
Define transfer as one atomic workspace-record change.
Preserve the source Tab after every failed transfer.
Test refusal for a kind without transfer support.
Test two concurrent Sessions, reload, reconnect, and application restart.
Test focus in both source and target Sessions.

### G10. The Chat actions ticket uses stale OMP conclusions

Split #154 into local OMP actions and desktop topology actions.
The local ticket owns working-directory copy, Markdown copy, Fork, continuation, rename, and Share.
The desktop ticket owns side Session, Worktree Session, and new-window actions.
Keep deeplink and archive disabled because OMP does not support them.
Remove `Coming soon` from Share because OMP supports it.
Add loading, cancellation, failure, retry, and clipboard error states.
Keep the exact reference menu order across both implementation tickets.

### G11. HTML export has no explicit plan decision

OMP supports HTML export, and Reeve already exposes it.
Epic #148 must explicitly keep it outside the reference menu or place it elsewhere.
Do not silently remove the existing export path.
Add its regression proof to #157.

### G12. Pinned summary still treats known Reeve behavior as unknown

Rewrite #155 around Reeve's existing Session summary panel.
Use #111 only for reference contents and enabled state.
Map OMP summary data to each visible field.
Add loading, empty, error, reconnect, and stale-data behavior.
Add keyboard and screen-reader criteria.
Verify independent summary state across two Sessions.

### G13. The visual ticket omits responsive and zoom proof

Keep #111 as a blocker for #156.
Add desktop measurements at default zoom and at 200 percent zoom.
Add narrow-window behavior before the mobile breakpoint.
Add the mobile layout or an explicit unsupported decision.
Verify pointer targets, visible focus, labels, contrast, overflow, and splitter keyboard control.

### G14. Acceptance does not separate visible and backend evidence

Replace #157 acceptance with two evidence sections.
The visible section covers the Fixture in the desktop build.
The backend section covers records, native messages, failures, reload, and reconnect.
Add rows for keyboard, accessibility, mobile, zoom, and two concurrent Sessions.
Add loading, empty, retry, cancellation, and destructive states.
Keep the full suite and changelog requirements.

### G15. Keyboard conflicts lack an owner

Create a decision ticket for host keyboard conflicts.
Settle Reeve's `Cmd+1` to `Cmd+9` Tab focus behavior.
The reference uses those chords for Session navigation.
Record ownership for `Ctrl+]`, `Cmd+]`, and Browser `Cmd+L`.
Require menu discoverability, key repeat behavior, and Terminal interception proof.

## State coverage verdicts

The following verdicts use only ticket text and cited evidence.
`Partial` means that a ticket names one state but omits related states.
`Missing` means that the ticket gives no acceptance criterion for that area.
`N/A` means that the area does not apply to the ticket.

| Ticket | Loading, empty, error, retry, cancel, destructive                         | Keyboard                                                    | Accessibility                                            | Mobile and zoom                                   | Persistence, reload, reconnect                                    | Multi-Session                                               |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| #149   | Empty is partial. Other states are missing.                               | Both chords are covered. Focus routing is missing.          | Missing.                                                 | Missing.                                          | Persistence is partial. Reload and reconnect are missing.         | Missing.                                                    |
| #150   | Empty creation is partial. Other states are missing.                      | The main chord is covered. Conflict proof is missing.       | Labels are partial. Focus and announcements are missing. | Missing.                                          | Record transitions are partial. Reload and reconnect are missing. | Missing.                                                    |
| #151   | Destructive actions are partial. Disabled and failure states are missing. | Menu use is implicit. Keyboard reorder and pin are missing. | Missing.                                                 | Missing.                                          | Scroll storage is partial. Reload and reconnect are missing.      | Missing.                                                    |
| #152   | Only the successful result is covered.                                    | `Cmd+F` is covered. Focus return is missing.                | Missing.                                                 | Mobile is missing. Zoom is not applicable.        | Missing.                                                          | Missing.                                                    |
| #153   | Restore failure is partial. Cleanup and cancellation are missing.         | Missing.                                                    | Missing.                                                 | A platform fallback and zoom routing are missing. | Missing.                                                          | Source-Session focus is partial.                            |
| #154   | Disabled tooltips are partial. Other states are missing.                  | Menu operation is partial.                                  | Roles, focus, and announcements are missing.             | Mobile is missing. Zoom is not applicable.        | Rename and window reload behavior are missing.                    | Fork and new-Session behavior are partial.                  |
| #155   | Only successful visible behavior is covered.                              | Missing.                                                    | Missing.                                                 | Missing.                                          | Loading, stale data, reload, and reconnect are missing.           | Missing.                                                    |
| #156   | Visible comparison is partial. Failure states are missing.                | Missing.                                                    | Missing.                                                 | Both are missing.                                 | Not applicable beyond acceptance proof.                           | Missing.                                                    |
| #157   | The checklist gives partial happy-path coverage.                          | Missing as a named evidence set.                            | Missing.                                                 | Both are missing.                                 | All three are missing as named evidence.                          | Missing.                                                    |
| #182   | Human close and resize close are covered. Other states are missing.       | Missing.                                                    | Missing.                                                 | Both are missing.                                 | Persistence is implied. Reload and reconnect are missing.         | Missing.                                                    |
| #183   | Empty stack behavior is missing. Closing is partial.                      | `Cmd+Shift+T` is covered.                                   | Missing.                                                 | Mobile is missing. Zoom is not applicable.        | Record storage is partial. Reload and reconnect are missing.      | Project isolation is partial. Session isolation is missing. |
| #184   | Empty and failed history are missing.                                     | Keys and mouse buttons are covered.                         | Missing.                                                 | Mobile and zoom routing are missing.              | Reload and reconnect are missing.                                 | Missing.                                                    |
| #185   | Refusal is partial. Cancel, failure, and target closure are missing.      | Missing.                                                    | Missing.                                                 | Mobile is missing. Zoom is not applicable.        | All three are missing.                                            | The successful two-Session path is partial.                 |

## Six blocker mismatches

The ticket bodies omit native blockers in six places.
The native dependency graph remains authoritative.

| Ticket | Body says            | Native graph says             | Exact correction   |
| ------ | -------------------- | ----------------------------- | ------------------ |
| #149   | #141                 | #141 and #179                 | Add #179.          |
| #150   | #140 and #141        | #140, #141, #178, and #179    | Add #178 and #179. |
| #151   | #140 and #143        | #140, #143, #178, and #181    | Add #178 and #181. |
| #153   | #143 and #151        | #143, #151, #181, and #183    | Add #181 and #183. |
| #156   | #111, #149, and #150 | #111, #149, #150, and #182    | Add #182.          |
| #157   | #149 to #156         | #149 to #156 and #182 to #185 | Add #182 to #185.  |

## Ticket size and exact ticket changes

All child tickets use the wrong budget contract.
Each child plans for 150,000 tokens and stops at 250,000.
Audit map #332 requires a 200,000-token goal and a 200,000-token hard stop.

Edit Epic #148 and all 13 child tickets.
Set each worker goal to 200,000 tokens.
Keep the target near 150,000 tokens.
Set 200,000 tokens as the hard stop.

Apply these ticket changes before implementation:

| Ticket | Exact edit                                                                                   |
| ------ | -------------------------------------------------------------------------------------------- |
| #148   | Correct OMP support, add the HTML export decision, add G15, and replace the budget contract. |
| #149   | Apply G1 and G2, then add blocker #179.                                                      |
| #150   | Apply G3, remove normal 1200px work, then add blockers #178 and #179.                        |
| #151   | Apply G4, correct its title, separate movement ownership, then add blockers #178 and #181.   |
| #152   | Apply G6, correct its title, and keep #111 until navigation scope is recorded.               |
| #153   | Apply G8, remove Session transfer from its title, then add blockers #181 and #183.           |
| #154   | Apply G10 and G11. Split local OMP actions from desktop topology actions.                    |
| #155   | Apply G12 and keep #111 only for the unresolved reference facts.                             |
| #156   | Apply G13 and add blocker #182.                                                              |
| #157   | Apply G14 and add blockers #182 to #185.                                                     |
| #182   | Add the record, reload, resize, kind-table, and accessibility evidence from G3.              |
| #183   | Apply G5 and distinguish Project isolation from Session isolation.                           |
| #184   | Apply G7 after #111 records the stack scope.                                                 |
| #185   | Apply G9 and define atomic transfer between two Session records.                             |

Create these tickets or equivalent sub-issues:

1. Create a detached-window lifecycle ticket from the second half of #153.
2. Create a desktop topology actions ticket from the second half of #154.
3. Create the keyboard conflict decision ticket from G15.

Tickets #153 and #154 remain likely split candidates until the planner applies these boundaries.

## Orchestrator handoff corrections

The handoff names Epic #148 and all 13 children correctly.
It names branch `codex/panel-host` correctly.
It names the bottom-placement dependency correctly.
It names the required model selectors correctly.
It reports progress as closed tickets divided by all tickets.

The handoff needs two corrections.

1. Replace the 250,000-token worker stop with a 200,000-token goal and hard stop.
2. Remove the fixed instruction to start #149 and #150 after Epic #139 merges.

The orchestrator must query native blockers after Epic #139 merges.
It must dispatch the first unblocked, unassigned child in issue order.

## Final verdict

The epic has a sound structural dependency on ADR-0014 and Epic #139.
The plan still has 15 capability gaps and six blocker mismatches.
Its OMP capability mapping is stale for Share and incomplete for HTML export.
Its acceptance evidence omits required failure, input, accessibility, responsive, and continuity states.
The planner should apply the named edits before any child implementation starts.
