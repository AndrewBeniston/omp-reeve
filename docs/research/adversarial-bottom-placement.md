# Adversarial audit of the bottom placement

Audit ticket: #336  
Epic: #139  
Audit date: 2026-09-17

## Result

The epic has a sound architecture, but its plan is incomplete.

The matrix contains 62 capability rows.

- 32 rows have complete ownership.
- 20 rows have partial ownership.
- 10 rows have no implementation owner.
- 30 rows therefore need a ticket correction or a new ticket.

The count treats work in a later epic as owned when a specific ticket exists.

The count does not treat an acceptance checklist as implementation ownership.

The implementation plan needs six new Bottom tickets.

The wider panel plan needs two decision tickets in other epics.

The native dependency graph needs thirteen new edges and one edge removal.

Issue #147 cannot accept the epic in its current form.

## Evidence boundary

This report separates verified facts from recommendations.

Verified facts came from these already-inspected sources:

- [The host research](./panel-host-and-header.md).
- [The Terminal research](./panel-terminal-audit.md).
- [ADR-0014](../adr/0014-one-tab-model-for-two-placements.md).
- Epic #139 and its twelve child issues.
- The native blockers on those issues.
- Current Reeve source on the audited branch base.
- OMP `@oh-my-pi/pi-coding-agent` 18.1.6 source.
- The installed reference, its web bundle, and its main process.
- The Bottom placement orchestrator prompt.

No new broad source research was performed for this report.

No runtime observation was performed for this report.

Recommendations use the word “Correct”.

Facts use the words “Verified” or “Current”.

## Status key

| Status | Meaning |
| --- | --- |
| Complete | A specific ticket owns the capability and its known acceptance. |
| External | A specific ticket in another epic owns the capability. |
| Partial | A ticket exists, but it omits required behavior or evidence. |
| Missing | No implementation ticket owns the capability. |

## Feature-to-ticket matrix

### Tab model and declarations

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | One Tab list carries a placement. Both hosts filter that list. | Reeve has one right-panel Tab array. | Host research, “The host in one paragraph”. ADR-0014, “The rule”. | #140, #142, and #178. | Verified in `components/AppShell.tsx`. | Complete. | Keep the current ownership. |
| T02 | Each kind declares its permitted drop placements. | Reeve has no drop declaration. | Host research, “What a Tab kind declares”. | #140 and #181. | Verified in the current Tab union. | Complete. | Keep the current ownership. |
| T03 | Each kind declares its title, icon, availability, and Launcher presence. | Reeve hard-codes five actions. Files is not a file-browser Tab. Side chat is unavailable. | Host research, declaration table. | #140 and #178. Files #130. Side chat #121. | Current Reeve has five visible action kinds. | Partial. | Add a later-kind adoption rule to #140 and #178. |
| T04 | Each durable route carries a kind payload and payload version. | Browser and Review use separate Project stores. | Host research, workspace record. | #140, #141, and #179. | Current stores have incompatible records. | Partial. | Extend #179 with unknown-kind and unknown-version behavior. |
| T05 | Each kind declares whether close can be undone. | Reeve uses a hard-coded kind test. | Host research, declaration table. Terminal research, row 7. | #140, #178, and Host #183. | `lib/panel-actions.ts` excludes Terminal today. | Partial. | Make #140 record the final Terminal rule from Terminal parity. |
| T06 | Each kind declares window and Session transfer. | Reeve has neither transfer path. | Host research, declaration table. | Host #153 and #185. | Those tickets name both transfer paths. | External. | Keep these in the host epic. |
| T07 | Each kind declares three full-width flags and an entry hook. | Reeve has a width toggle and no kind flags. | Host research, declaration table. | #140, Host #150, and Host #182. | #111 has not settled three kind values. | External. | Block the affected flag values on a focused #111 result. |
| T08 | Each kind declares external focus and focus restoration. | Reeve has no kind focus contract. | Host research, closing and focus. | #140 and #146. | The ticket names Browser and Terminal ownership. | Complete. | Keep the current ownership. |
| T09 | Each kind can add strip menu items. Pinning has a declared model. | Reeve has Browser menu special cases and no pin model. | Host research, controller and menu rows. | #140, #178, and Host #151. | #140 names extra items but omits pin behavior. | Partial. | Add `pinned` ordering and persistence to #140 and #151. |
| T10 | Every kind adopts declarations when it reaches `main`. | #140 can migrate only kinds present when it runs. | ADR-0014, “Consequences”. | #140 and #178. | Files and Side chat epics remain open. | Partial. | Add declaration acceptance to Files #130 and Side chat #121. |

### Workspace record and restoration

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | One per-Session record stores every ordered route. | Reeve has separate Browser and Review stores. | Host research, workspace record. | #141. | #141 names route, kind, payload, and version. | Complete. | Keep the current ownership. |
| P02 | The record stores open state, active Tab, and order per placement. | Reeve stores none of these together. | Host research, workspace record. | #141 and #179. | Both write and restore rules are named. | Complete. | Keep the current ownership. |
| P03 | The record stores focus, layout mode, full width, and hidden strip. | Reeve stores only right-panel width globally. | Host research, workspace record. | #141 and #179. | Current `useResizablePanel` stores width only. | Complete. | Keep the current ownership. |
| P04 | An untouched Session writes no record. | Reeve writes kind-specific Project records. | Host research, write rules. | #141. | The acceptance criterion names this rule. | Complete. | Keep the current ownership. |
| P05 | The plan selects one durable storage path. | No path is selected. | ADR-0014, workspace record. | No ticket. | #141 describes a record but no storage owner. | Missing. | Create “Bottom 2c. Workspace record storage lifecycle”. |
| P06 | The record has a schema migration policy. | No migration policy exists. | Host research, schema version 1. | No ticket. | #141 names payload versions only. | Missing. | Add schema migration to Bottom 2c. |
| P07 | Restore handles unknown kinds, versions, malformed data, and permission failures. | Current stores reject some malformed entries separately. | Host research, placeholder rule. | #179. | #179 covers only a missing target. | Partial. | Add all invalid-record states to #179 and Bottom 2c. |
| P08 | A write failure has visible failure, retry, and cancellation behavior. | Current stores use unrelated best-effort behavior. | Audit map #332, input and failure rule. | No ticket. | #141 has no failure acceptance. | Missing. | Add write failure, retry, and cancellation to Bottom 2c. |
| P09 | Restore keeps surviving routes in their stored order. | No common restore exists. | Host research, restore rules. | #179. | The ticket states survivor insertion order. | Complete. | Keep the current ownership. |
| P10 | Restore selects the stored active Tab, then current, then first. | No common restore exists. | Host research, restore rules. | #179. | The ticket states every fallback. | Complete. | Keep the current ownership. |
| P11 | Browser and Review records migrate without duplicate ownership. | Browser migration is named. Review migration is not. | ADR-0014, settled consequences. | #141 and #179. | Current Browser and Review stores are separate. | Partial. | Add explicit Browser and Review migration acceptance to #141. |
| P12 | A Terminal does not restore after an application restart. | Reeve already avoids Terminal restore. | Terminal research, main-process addendum. | #140 and #141. | The reference host keeps shells in memory only. | Complete. | Preserve this rule. |
| P13 | Two Sessions restore independently during switching, reload, and concurrent writes. | No common per-Session record exists. | Audit map #332, multi-Session rule. | No ticket. | No child has multi-Session acceptance. | Missing. | Create “Bottom 2d. Multi-Session isolation and switching”. |

### Bottom host, geometry, and responsive behavior

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | `Cmd+J` toggles the bottom panel through the application menu. | Reeve has no bottom placement. | Host research, main-process addendum. | #142. | The menu title and local-access gate are verified. | Partial. | Add the local-access gate and command-palette acceptance to #142. |
| B02 | An empty bottom host uses the same placement-aware Launcher. | Reeve has a right-only Launcher. | Host research, Launcher rows. | #142. | #142 names the shared Launcher and declarations. | Complete. | Keep the current ownership. |
| B03 | Both placements can open together without sharing ownership. | Reeve has one placement. | ADR-0014. | #142. | The acceptance criterion names both placements. | Complete. | Keep the current ownership. |
| B04 | The bottom height defaults to 280px. | No bottom height exists. | Host research, geometry. | #180. | #180 names the exact value. | Complete. | Keep the current ownership. |
| B05 | The height clamps at 160px and half the main content height. | No bottom resizer exists. | Host research, geometry. | #180. | #180 names both limits. | Complete. | Keep the current ownership. |
| B06 | Dragging below 160px closes the bottom panel. | No bottom resizer exists. | Host research, geometry. | #180. | #180 names the close rule. | Complete. | Keep the current ownership. |
| B07 | One application-wide height survives restart and Session changes. | Reeve stores right width in browser storage. | Host research, geometry. | #180. | #180 names restart and cross-Session sharing. | Complete. | Keep the current ownership. |
| B08 | A vertical separator supports keyboard resizing with correct direction. | The current separator is width-oriented. | Current `hooks/useResizablePanel.ts`. | No ticket. | #180 names only generic splitter behavior. | Missing. | Add vertical keyboard resizing to a new accessibility ticket. |
| B09 | Mobile defines panel replacement, height, Launcher, and gesture behavior. | Reeve hides the fixed subagent pane on mobile. | Current `components/AppShell.tsx`. | No ticket. | No child contains mobile acceptance. | Missing. | Create “Bottom 3c. Mobile bottom placement”. |
| B10 | Every promised Launcher kind exists before acceptance. | Review exists. Files is a command action. Side chat is unavailable. | Panel map #61. | #142, Files #138, and Side chat #128. | Both dependent epics remain open. | Partial. | Block #147 on #138 and #128. |

### Movement, strip, focus, and routing

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | A pointer reorders Tabs inside one placement. | Reeve has no Tab drag. | Host research, controller. | #143. | #143 names pointer reordering. | Complete. | Keep the current ownership. |
| M02 | A keyboard route reorders Tabs inside one placement. | Reeve cannot reorder Tabs. | Host research, accessibility implication. | #143. | #143 names a strip-menu route. | Complete. | Keep the current ownership. |
| M03 | A pointer moves a Tab between placements with a named cue. | Reeve has one placement. | Host research, drag cues. | #181. | #181 names both directions and cues. | Complete. | Keep the current ownership. |
| M04 | A keyboard route moves a Tab between placements. | No movement route exists. | Audit map #332, keyboard rule. | No ticket. | #181 has pointer acceptance only. | Missing. | Add keyboard movement to a new accessibility ticket. |
| M05 | A right-only kind refuses a bottom drop without a false cue. | Reeve has no drop declarations. | Host research, declaration table. | #181. | #181 names refusal and cue suppression. | Complete. | Keep the current ownership. |
| M06 | Moving the last Tab closes its placement and corrects focus. | Reeve has one right panel. | Host research, drag rules. | #181. | #181 names both placements. | Complete. | Keep the current ownership. |
| M07 | The strip keeps horizontal scroll per placement. | Reeve does not keep strip scroll. | Host research, geometry. | #143. | #143 names per-placement scroll. | Complete. | Keep the current ownership. |
| M08 | One Tab hides the strip and changes close semantics. | Reeve always renders the strip. | Host research, closing rules. | Host #183. | The host ticket owns this behavior. | External. | Remove this implementation line from #147. |
| M09 | The menu orders pin, close, close others, and close-right. | Reeve offers close and close others only. | Host research, menu row. | Host #151. | The host ticket owns the complete order. | External. | Remove this implementation line from #147. |
| M10 | New, closed, and restored Tabs follow the three-area focus model. | Reeve has no panel focus model. | Host research, focus rules. | #146. | #146 names correction and external focus. | Complete. | Keep the current ownership. |
| M11 | Close-active and page-zoom commands route by focus and placement. | Reeve has global zoom roles and right-only close behavior. | Host research, main-process addendum. | #146. | #146 combines routing with broad focus acceptance. | Partial. | Require separate renderer state and desktop routing evidence. |

### Subagent, Terminal, OMP, and host integration

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Subagent activity becomes a Tab in either placement. | It is a fixed secondary pane. | ADR-0014, settled consequences. | #144. | Current `SubagentPanel` has fixed-pane ownership. | Complete. | Keep the current ownership. |
| S02 | Automatic opening respects a durable user close state. | The pane appears whenever subagents exist. It has no close state. | Current `components/AppShell.tsx`. | #144. | #144 says “unless the user closed it” without storage behavior. | Partial. | Add close-state persistence and reset rules to #144. |
| S03 | Restoration handles missing transcripts and completed history. | Live and retained snapshots use different paths. | Current `rpc-manager.ts` and `SubagentDetail.tsx`. | No ticket. | #144 only requires existing behavior and restart. | Missing. | Create “Bottom 5b. Subagent restoration and missing history”. |
| S04 | A setting chooses Terminal placement, defaulting to bottom. | Reeve has no placement setting. | Terminal research, row 1. | #145. | #145 names both values. | Complete. | Keep the current ownership. |
| S05 | `Control+backtick` hides or reveals the existing Terminal. | Reeve opens a Terminal action in the right panel. | Terminal research, rows 2 and 3. | #145. | #145 names reveal and hide semantics. | Complete. | Keep the current ownership. |
| S06 | Only the Launcher and in-Terminal action create a new Terminal. | Current behavior does not enforce this split. | Terminal research, row 3. | #145. | #145 names both creation paths. | Complete. | Keep the current ownership. |
| S07 | Moving a Terminal preserves its shell, process, and scrollback. | A Terminal is coupled to its current Tab view. | Terminal research, rows 5, 6, and 8. | #145 and Terminal #166. | #145 names process and scrollback. | Complete. | Add alternate-screen evidence from #166 to #145. |
| S08 | Terminal shows bridge failure, shell exit, reconnect, and reload states. | Reeve has an exit notice and limited error behavior. | Terminal research, rows 19 and current source. | No Bottom ticket. | #145 covers only the success path. | Missing. | Create “Bottom 6b. Terminal movement failure states”. |
| S09 | OMP additional directories can support multi-root Terminal behavior. | The epic says OMP has one directory. | OMP 18.1.6 `SessionManager` source. | No current decision ticket. | The old exclusion is stale. | Partial. | Create a Terminal epic decision ticket and block #170. |
| S10 | OMP sharing and collaboration can inform the header Share action. | Host #154 plans a disabled Coming soon control. | OMP 18.1.6 collaboration source. | Host #154. | The old unsupported conclusion is stale. | Partial. | Create a Host decision ticket before #154. |

### Acceptance, accessibility, size, and orchestration

| ID | Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Acceptance records visible and backend evidence separately. | No Bottom implementation exists yet. | Audit map #332, check 8. | #147. | #147 asks only for a checked line. | Partial. | Require two evidence fields for every capability. |
| A02 | Acceptance verifies behavior but implements nothing. | #147 says it builds nothing. Its checklist includes unowned work. | Host parity checklist. | #147. | Single-Tab and menu ownership belong to Host. | Partial. | Replace its checklist with Bottom-owned rows only. |
| A03 | Every pointer action has keyboard and assistive technology acceptance. | Existing controls have partial labels. | Audit map #332, keyboard and accessibility rule. | #143, #146, and #180. | No ticket owns the complete accessible path. | Partial. | Create “Bottom 4c. Accessible placement controls”. |
| A04 | Mobile behavior has direct acceptance. | Every Bottom child omits mobile acceptance. | Audit map #332, mobile rule. | No ticket. | The omission affects both hosts and all controls. | Missing. | Create Bottom 3c and block #147 on it. |
| A05 | Persistence acceptance covers success and every failure path. | No common record exists. | Audit map #332, persistence rule. | #141 and #179. | Both tickets cover successful operation mainly. | Partial. | Block #147 on Bottom 2c. |
| A06 | Multi-Session acceptance proves isolation and switching. | Current kind stores use Project or owner keys. | Audit map #332, multi-Session rule. | No dedicated acceptance. | No child tests two Sessions. | Partial. | Block #147 on Bottom 2d. |
| A07 | Each implementation ticket fits one bounded worker context. | Most tickets fit. #141, #144, and #146 grow beyond one seam after corrections. | Epic #139, execution agreement. | All Bottom children. | Their current 150,000-token plan permits a 250,000 stop. | Partial. | Use the six new tickets to keep each seam bounded. |
| A08 | The handoff uses current blockers, counts, budgets, and scope. | The handoff names twelve tickets and stale gates. | Bottom orchestrator prompt. | Epic #139 handoff. | #109 is stale. #111 has unrelated host work. | Partial. | Apply every handoff correction listed below. |

## Exact issue edits

The planner should make these edits after accepting this report.

### Epic #139

Replace the twelve-ticket count with nineteen after creating six implementation tickets and one preflight.

Add these implementation decisions:

- The workspace record has one selected storage path and one schema owner.
- Record parsing never discards an invalid route without a visible placeholder.
- Record writes report failure and offer retry or cancellation.
- Mobile uses an explicit layout and control policy.
- Pointer movement always has a keyboard route.
- Multi-Session switching cannot leak active Tabs, focus, or writes.

Replace the multi-root exclusion with this text:

> OMP 18.1.6 supports additional workspace directories. Terminal multi-root behavior needs a fresh Terminal-epic decision.

Keep encrypted sharing and collaboration outside the Bottom epic.

Add a cross-reference to the new Host decision ticket.

### Issue #140

Add `pinned` ordering and persistence to the declaration model.

State that each later Tab-kind ticket must add its own declaration.

State that #140 migrates every kind present on its branch.

Do not claim that #140 can migrate kinds that are not yet merged.

### Issue #141

Add explicit Browser and Review migration acceptance.

State the selected storage boundary.

Move schema migration, write failures, retry, and cancellation to Bottom 2c.

Add Bottom 2c as a native blocker on #179 and #147.

Add Bottom 2d as a native blocker on #147.

### Issue #142

Remove the claim that #111 confirmed the default Terminal.

Replace it with a link to the focused default-Tab preflight described below.

Add the local-access gate and command-palette title to acceptance.

Keep the 280px fixed height in this ticket.

### Issue #143

Keep pointer and keyboard reordering.

Clarify the keyboard command names and focus result.

Move keyboard movement between placements to Bottom 4c.

### Issue #144

Define where the automatic Tab opens.

Define how a user close suppresses automatic reopening.

Define when that close state resets.

Move missing transcript and completed-history reconstruction to Bottom 5b.

### Issue #145

Add alternate-screen preservation to movement acceptance.

Add bridge-disconnection behavior to the handoff with Bottom 6b.

Do not add multi-root behavior here.

The Terminal epic owns that decision.

### Issue #146

Split acceptance into visible renderer behavior and desktop routing behavior.

Add direct cases for close-active, zoom-in, zoom-out, and reset-zoom.

Add one case where main focus routes zoom to no Browser.

Add one case where a Terminal intercepts an application chord.

### Issue #147

Keep this ticket acceptance-only.

Remove Host-owned implementation lines for Full view, hidden strip, pinning, menu order, and single-Tab strips.

Require one row for visible evidence and one row for backend evidence.

Require accessibility, mobile, persistence failures, and two-Session isolation evidence.

Add native blockers for #128, #138, and all six new Bottom tickets.

### Issue #181

Keep pointer movement in this ticket.

Add an explicit pointer-cancellation case.

Move keyboard movement to Bottom 4c.

### Issue #68

Correct the resolution comment through a new correction comment.

The correction must say that #111 did not confirm the default Tab.

The maintainer observation remains a decision until a focused live check verifies it.

### Issue #109

Add a resolution comment linking PR #279 and issue #278.

Then close #109.

Remove its native dependency edge from #140.

Remove any matching edge from Host work.

### Issue #111

Keep #111 open for its remaining host and header observations.

Do not make the Bottom orchestrator close it.

Move only the default-Tab question to the focused preflight.

### Files #130 and Side chat #121

Add ADR-0014 declaration acceptance to each ticket.

Files must declare both placements and its singleton policy.

Side chat must declare the right placement only.

### Host #154

Remove the settled claim that Share has no OMP mapping.

Block #154 on the new OMP collaboration decision ticket.

The decision must choose enabled behavior, phased behavior, or a documented divergence.

## New tickets

Create these tickets as children of Epic #139.

### Bottom preflight. Verify the default Tab on `Cmd+J`

This is a small research ticket.

It observes the installed reference with an empty bottom placement.

It records whether `Cmd+J` creates, reveals, or selects a Terminal.

It blocks #142.

It does not close #111.

### Bottom 2c. Workspace record storage lifecycle

This ticket selects the durable path and schema owner.

It owns schema migration, corrupt data, unknown versions, permission failures, and atomic writes.

It owns visible write failure, retry, and cancellation.

Acceptance reads the record after every failure and recovery.

It blocks #179 and #147.

### Bottom 2d. Multi-Session isolation and switching

This ticket opens two Fixture Sessions with different placement states.

It switches rapidly while one record writes.

It reloads each Session and proves independent Tabs, order, focus, and layout.

It covers deletion and a stale selected Session.

It blocks #147.

### Bottom 3c. Mobile bottom placement

This ticket defines the mobile layout for both placements.

It covers the Launcher, height, overflow, keyboard appearance, and panel replacement.

It covers pointer, touch, and assistive controls.

It verifies narrow portrait and landscape sizes.

It blocks #147.

### Bottom 4c. Accessible placement controls

This ticket adds keyboard movement between placements.

It adds vertical keyboard resizing with correct arrow direction.

It defines focus after move, cancel, refusal, and last-Tab movement.

It adds accessible names, values, instructions, and announcements.

It blocks #147.

### Bottom 5b. Subagent restoration and missing history

This ticket restores running and completed subagent Tabs.

It handles a missing transcript, an unavailable transcript, and reconstructed completed history.

It persists the user close state and defines its reset rule.

It blocks #147.

### Bottom 6b. Terminal movement failure states

This ticket handles an unavailable desktop bridge during movement.

It handles shell exit during movement and reconnect after movement.

It preserves the exit notice and readable scrollback.

It offers a safe new Terminal when the old shell cannot reconnect.

It blocks #147.

Create these tickets in other epics.

### Terminal decision. Additional directories and multi-root switching

Add this ticket to Epic #158.

It re-checks the old exclusion against OMP 18.1.6.

It decides whether additional directories support the reference directory switcher.

It blocks Terminal acceptance #170.

### Host decision. Map OMP collaboration to Share

Add this ticket to Epic #148.

It maps encrypted sharing and live collaboration to the header action.

It records any security, identity, and lifecycle mismatch.

It blocks Host #154 and Host acceptance #157.

## Native blocker corrections

The native graph is the execution gate.

Apply these corrections after the new tickets exist.

1. Close stale gate #109 after its resolution comment.
2. Remove #109 from #140 and any Host ticket it blocks.
3. Add the focused default-Tab preflight as a blocker on #142.
4. Add Bottom 2c as a blocker on #179 and #147.
5. Add Bottom 2d as a blocker on #147.
6. Add Bottom 3c as a blocker on #147.
7. Add Bottom 4c as a blocker on #147.
8. Add Bottom 5b as a blocker on #147.
9. Add Bottom 6b as a blocker on #147.
10. Add Files acceptance #138 as a blocker on #147.
11. Add Side chat acceptance #128 as a blocker on #147.
12. Add the multi-root decision as a blocker on #170.
13. Add the collaboration decision as a blocker on #154 and #157.

Re-fetch every dependency after each write.

GitHub can retain a different parent or edge without a visible command failure.

## Orchestrator handoff corrections

The Bottom orchestrator prompt needs these exact changes.

1. Start from current `main`, which already contains Review through PR #279.
2. Remove the instruction to wait for open issue #109.
3. Require the planner to resolve and close #109 before the first implementation dispatch.
4. Replace the twelve-ticket denominator after creating the six Bottom tickets and one preflight.
5. Report closed tickets divided by the new total after every worker report.
6. Remove the instruction to run and close all of #111.
7. Dispatch only the focused default-Tab preflight before #142.
8. Preserve #111 for the Host epic.
9. Re-fetch native blockers before every frontier selection.
10. Do not rely on body text for blockers.
11. State that #140 migrates only kinds present on its branch.
12. Require Files #130 and Side chat #121 to adopt declarations later.
13. Block #147 on #128 and #138.
14. Require visible and backend evidence as separate fields.
15. Add mobile, accessibility, failure, and two-Session evidence to the final handoff.
16. Keep implementation worker budgets at 150,000 planned and 250,000 hard stop.
17. Use the 200,000-token budget only for adversarial audit ticket #336.
18. Keep model selector verification before every dispatch.
19. Keep one worker context per ticket.
20. Do not let the acceptance worker implement missing behavior.

The 200,000-token rule from map #332 applies to this audit.

It does not replace Epic #139's implementation budget agreement.

## Verdicts

### Ticket size

The current tickets mostly fit one worker context.

Issues #141, #144, and #146 become too broad when the missing behavior is added.

The six new Bottom tickets keep each implementation seam bounded.

The focused preflight is small and should stay separate.

### Acceptance

Issue #147 is not sufficient.

It mixes acceptance with Host-owned implementation.

It does not separate visible evidence from backend evidence.

It cannot pass before Files, Side chat, and the six new Bottom tickets finish.

### Accessibility

Accessibility ownership is incomplete.

Issue #143 covers keyboard reordering only.

No ticket covers keyboard movement between placements.

No ticket covers vertical separator keys or movement announcements.

Bottom 4c must own those behaviors.

### Mobile

Mobile ownership is absent.

Every Bottom child omits mobile acceptance.

The existing mobile shell cannot establish the new panel behavior.

Bottom 3c must define and verify it.

### Persistence

The successful record shape is well specified.

The storage lifecycle is not specified.

The plan lacks a path, schema migration, corrupt-record policy, and write-failure behavior.

Bottom 2c must own those rules.

### Multi-Session behavior

The architecture says the record is per Session.

No ticket proves that isolation with two Sessions.

No ticket covers rapid switching or concurrent writes.

Bottom 2d must provide that proof.

## Final capability and gap counts

| Measure | Count |
| --- | ---: |
| Capability rows | 62 |
| Complete or externally owned rows | 32 |
| Partial rows | 20 |
| Missing rows | 10 |
| Total gap rows | 30 |
| Existing Bottom child tickets | 12 |
| New Bottom implementation tickets | 6 |
| New Bottom preflight tickets | 1 |
| New external decision tickets | 2 |
| Stale native blockers | 1 |
| New native blocker edges | 13 |
| Native blocker removals | 1 |

Current native data shows that #109 blocks only #140.

The planner must still query those edges before editing the graph.

## Final decision

Epic #139 is not ready for implementation acceptance.

Its core architecture is ready.

The planner should apply the issue edits, create the tickets, and repair the native graph.

Implementation can start after the focused default-Tab preflight resolves #142's disputed premise.

Acceptance must wait for every corrected native blocker.
