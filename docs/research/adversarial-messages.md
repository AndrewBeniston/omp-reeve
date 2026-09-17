# Adversarial audit: scrolling and message rows

Research for [#339](https://github.com/AndrewBeniston/omp-reeve/issues/339), against [Epic #223](https://github.com/AndrewBeniston/omp-reeve/issues/223).

## Final result

The audit covers 42 capability groups and finds 24 gaps.
Epic #223 does not yet provide complete traceability or safe implementation scopes.
Fifteen existing children fit one 200,000-token worker.
Tickets #237, #240, and #242 require splits.
The corrected epic has 26 children, including 25 implementation tickets and one acceptance ticket.
Eight new Epic #223 tickets are required.
One referenced-file menu ticket belongs under Files Epic #129.

No issue was edited during this audit.
This report gives the exact edits for the planner.

## Evidence boundary

The audit checked these sources:

- The eight checks in [audit map #332](https://github.com/AndrewBeniston/omp-reeve/issues/332).
- Issue #339, Epic #223, and all 18 child issue bodies.
- Every native dependency on those 18 children.
- Blockers #258, #307, and #308.
- Goal ticket #327 and Composer ticket #272.
- `docs/research/session-6-scrolling.md`.
- `docs/research/session-7-assistant-message.md`.
- `docs/research/session-8-user-message.md`.
- ADR-0015 and the Session map in #194.
- Current Reeve source at `origin/main` commit `2920ac0`.
- OMP 18.2.4 payloads and queue commands.
- The current orchestration handoff.

Live-check tickets #215, #216, and #217 contain no results.
Their runtime-only values remain evidence-gated.
The planner must preserve these tickets and make them native blockers of acceptance #259.

## Corrections from OMP 18.2.4

OMP 18.2.4 emits `goal_updated` with the persisted Goal object.
The object includes status, token budget, token use, elapsed time, and timestamps.
Epic #318 owns Goal parity.
Ticket #327 owns `Sent as goal` and `Goal achieved` transcript markers.
Epic #223 must remove its stale reference to “Epic D”.

OMP persists visible `live-delegation` custom messages.
Those messages contain the source needed for delegation attribution.
OMP also persists hook-authored custom messages and their details.
Those details can source hook-blocked and hook-feedback rows.

OMP 18.2.4 preserves video attachment markers and hidden source-path context.
It also stages large pasted text as attachment state.
Epic #223 must assign user video and pasted-text rows to explicit tickets.

OMP queue snapshots contain queued text and image data.
They contain no persisted failed-send state.
OMP exposes no queue retry command with a failed-item identity.
Ticket #244 therefore lacks its required backend source.

## Feature-to-ticket traceability

The table uses capability groups rather than individual strings.
The next section traces every shipped string group.

| # | Capability | Current Reeve state | Evidence | Owner | Gap | Required correction |
|---:|---|---|---|---|---|---|
| 1 | Four follow modes | One pin flag | Session 6 | #225 and #226 | None | Keep the two-ticket split. |
| 2 | Three turn phases | No transcript phase model | Session 6 and ADR-0015 | #239, #260, then #225 | G1 | Remove the provisional phase implementation from #225. Consume the shared Turn phase. |
| 3 | One 24 px band | Pinning uses 48 px | Session 6 | #226 | None | Keep #226. |
| 4 | Wheel, touch, key, and pointer intent | Coarse intent expires after 1,200 ms | Session 6 | #226 | G2 | Add every normalization and exclusion rule from Session 6. |
| 5 | Scroll button geometry | The existing control mostly matches | Session 6 | #227 | None | Keep #227. |
| 6 | Scroll button hidden state | The control unmounts | Session 6 | #227 | None | Keep the placed, hidden state in #227. |
| 7 | Scroll button movement | The browser owns smooth scrolling | Session 6 | #227 | None | Keep the 260 ms move in #227. |
| 8 | Response spacer | A CSS transition owns the hold | Session 6 | #228 | None | Keep #228. |
| 9 | 300 px latest-turn placement | No rule exists | Session 6 | #228 | None | Keep #228. |
| 10 | Saved scroll offset | Every open lands at the end | Session 6 | #229 | G3 | Define storage, lifecycle, expiry, and Session isolation. |
| 11 | Composer growth compensation | No position correction exists | Session 6 | #229 | G3 | Add resize, focus, compact-layout, and cancellation cases. |
| 12 | 64 px history trigger | A top sentinel triggers loading | Session 6 | #230 | G4 | Add loading, exhaustion, cancellation, failure, and retry behavior. |
| 13 | In-place content-growth restoration | Only prepend restoration exists | Session 6 | New Scrolling 7 | G5 | Add a ticket for streamed content and late-media height changes. |
| 14 | Header and panel overlap probe | No equivalent exists | Session 6 | Epic decision | G6 | Record an explicit kept divergence. |
| 15 | Assistant announcements | No assistant live region exists | Session 7 | #234 | G7 | Add concurrency, reconnect, locale fallback, and cleanup behavior. |
| 16 | Assistant action-row order | Copy appears on hover | Session 7 | #235 | G8 | Add focus behavior, failure states, and pin-state rules. |
| 17 | Rich response copy | Copy writes plain text | Session 7 | #235 | G8 | Define sanitized HTML, plain-text fallback, and clipboard failure. |
| 18 | Branch from assistant message | No assistant entry point exists | Session 7 | #235, blocked by #231 | G8 | Add retry protection, failure recovery, and focus return. |
| 19 | Goal achieved label | No Goal client state exists | Session 7 and OMP 18.2.4 | #318 and #327 | G9 | Correct Epic #223 ownership. |
| 20 | Inspected-image disclosure | Images always render inline | Session 7 | #236 | None | Keep #236. |
| 21 | Inspected-image dialog | No dialog exists | Session 7 | #236 | G10 | Add Escape, focus trap, focus return, zoom, and image failure. |
| 22 | Markdown table copy and expand | Tables only scroll horizontally | Session 7 | #237 | G11 | Keep table controls in #237. |
| 23 | Markdown block error isolation | No markdown boundary exists | Session 7 | New Message 13b | G11 | Split block isolation and retry from #237. |
| 24 | Inline image states | Images have no loading or failure label | Session 7 | #238 | None | Keep #238. |
| 25 | Inline markdown video | No player exists | Session 7 | #238 | G12 | Limit #238 to assistant markdown output. |
| 26 | Inline audio playback | No player exists | Session 7 | #240 | G13 | Keep playback, loading, and unavailable states in #240. |
| 27 | Audio path and save actions | No action integration exists | Session 7 | New Message 15b | G13 | Split native path and save behavior from #240. |
| 28 | File citation chips | Local links render as plain links | Session 7 | New Message 18 | G14 | Add a citation-chip ticket under Epic #223. |
| 29 | File reference menu | A plain click opens a file Tab | Session 7 | New Files ticket | G14 | Add a child under #129, blocked by #175. |
| 30 | Markdown metadata disclosure | A frontmatter card already renders | Session 7 | Epic decision | G14 | Record the current card as a kept divergence. |
| 31 | Two-line user-message collapse | Full text always renders | Session 8 | #232 | G15 | Add keyboard, focus, image, zoom, and resize behavior. |
| 32 | Empty user message | An empty body renders | Session 8 | #232 | G16 | Add the `(No content)` state to #232. |
| 33 | Confirmed user copy | The tooltip changes only | Session 8 | #232 | None | Keep the accessible-label correction in #232. |
| 34 | In-place edit | Reeve moves the branch pointer | Session 8 | #233 | G17 | Add eligibility, attachments, pending state, keyboard paths, and duplicate prevention. |
| 35 | Fork destination dialog | Fork runs immediately | Session 8 | #231 | G18 | Add cancellation, default, focus, failure, and rollback behavior. |
| 36 | User image and video states | Images have empty alt text | Session 8 and OMP 18.2.4 | New Message 16c | G19 | Split user media states from #242. |
| 37 | File, folder, upload, and paste rows | Only sent images remain visible | Session 8 and Composer research | #242 and New Message 16b | G20 | Keep file rows in #242. Move pasted text to its own ticket. |
| 38 | User Goal marker | No marker exists | Session 8 and OMP 18.2.4 | #318 and #327 | G9 | Correct Epic #223 ownership. |
| 39 | Hook blocked and feedback rows | Generic custom cards can lose meaning | Session 8 and OMP 18.2.4 | New Message 19 | G21 | Render persisted hook custom messages as named user-message statuses. |
| 40 | Scheduled, automation, and delegation origins | No origin row exists | Session 8 and OMP 18.2.4 | #205 and New Message 19 | G21 | Route scheduled decisions to #205. Build OMP-backed delegation attribution. |
| 41 | Failed queued message and Retry | No failed queue state exists | Session 8 and OMP 18.2.4 | New Queue 1, then #244 | G22 | Add a persisted backend failure source before the row. |
| 42 | Existing queue behavior | Queue, pause, reorder, edit, and steer exist | Session 8 | #244 and #259 | G23 | Add keyboard and concurrent-update regression coverage. |

Acceptance #259 has a separate completeness gap, G24.
It lacks the required environment, isolation, reconnect, and failure sweeps.

## Shipped-string traceability

Every listed string needs an i18n entry and a named owner.
Runtime-only behavior remains gated by the live-check tickets.

| String group | Exact ids or defaults | Owner |
|---|---|---|
| Scrolling | `localConversation.scrollToBottomButton` | #227 |
| Assistant announcements | `started`, `progress`, `completed`, `completedWithContent` under `localConversation.assistantResponse.announcement` | #234 |
| Assistant actions | `copyResponseTooltip`, `branchInNewChatTooltip`, `forkAriaLabel` | #235 |
| Goal completion | `assistantMessageContent.goalAchieved` | #327 |
| Inspected images | `localConversation.imageView.summary`, `previewAlt` | #236 |
| Markdown tables | `copyTable`, `expandTable`, `tablePreview`, `closeTablePreview` | #237 |
| Markdown errors | `markdown.renderError.title`, `retry` | New Message 13b |
| Inline images | `imageLoading`, `imagePreviewButton`, `imageUnavailable` | #238 |
| Inline video | `videoPlayer`, `videoUnavailable` | #238 |
| Inline audio playback | `audioPlayer`, `play`, `pause`, `seek`, `progress`, `loading`, `unavailable`, `fileType`, `formattedFileType` | #240 |
| Inline audio actions | `actions`, `copyPath`, `saveCopy`, `saveFailed` | New Message 15b |
| File citations | Seven location labels, three aria labels, and six artifact type labels | New Message 18 |
| File references | `viewFile`, `viewInCodexBrowser`, `copyPath`, `copyFileContents`, platform reveal labels, `openInGitHub`, `openInTarget`, `openWith`, `openWithTarget`, `saveAs` | New Files ticket |
| Markdown metadata | `markdown.metadata.title`, `showMore`, `showLess` | Explicit kept divergence |
| Fork dialog | The seven `forkFromOlderTurnDialog` ids and the Git-repository blocked reason | #231 |
| User collapse and copy | `showMore`, `showLess`, `noContent`, `copyAriaLabel`, `copiedAriaLabel` | #232 |
| User edit | The five edit controls and `localConversation.editLastMessageFailed` | #233 |
| User Goal | `codex.userMessage.goal` | #327 |
| Hook statuses | `codex.userMessage.hookBlocked`, `hookFeedback` | New Message 19 |
| User media | `userImageAttachment`, `userImageAttachmentFailed`, `userImageAttachmentFailedShort` | New Message 16c |
| Delegation | `localConversation.codexDelegationUserMessage.app` | New Message 19 |
| Scheduled and automation origins | Four scheduled-task and automation ids | #205 decision |
| Attachment rows | `unavailableFileAttachment`, `pastedTextAttachment`, `additionalPastedTextAttachments` | #242 and New Message 16b |
| Failed queue | `retry`, two retry tooltips, and two paused tooltips | #244 |
| Existing queue | Existing queue, pause, steer, edit, delete, undo, and image strings | Regression criteria in #244 and #259 |

The reference also lists appshot, review, pull-request, and prior-conversation chips.
Those rows remain outside Epic #223 until #205 assigns an OMP source or an explicit omission.

## Evidence-gated runtime values

These values have no live result.
The implementation tickets must not guess them.

### #215, scrolling and anchoring

- The visible effect of the conflicting 48 px and 24 px thresholds.
- The relative timing of spacer release and the final-answer reset.
- The perceived timing of native smooth scrolling against the 260 ms curve.
- The reading-position effect of Composer growth during a stream.
- The effect of late image loading in both products.
- The sentinel behavior during a fast scroll to the top.
- The button visibility during prework follow.

### #216, assistant message

- The practical screen-reader cadence for 5,000 ms announcements.
- The normal combination of action-row slots.
- The code-block header used by the Codex transcript.
- Any streaming cursor or placeholder.
- The assistant messages that receive the branch control.
- The open-Goal label.
- The image dialog's multi-image controls.
- The markdown boundary's real isolation and recovery level.
- File-menu variation by file type and its default action.
- The practical trigger for the edit-failure toast.

### #217, user message

- The user messages that receive the edit control.
- Whether an edit replaces a turn or creates a branch.
- The number and default order of fork destinations.
- The measured collapsed height and treatment of images or chips.
- Whether one failed queued message blocks later messages.
- Whether scheduled and automation labels can coexist.
- Queue behavior when a run ends during a drag.

## Eight-check result

### 1. Every capability maps to a ticket or decision

This check fails in the current plan.
Eight Epic #223 tickets and one Files ticket are missing.
Two kept divergences lack explicit decisions.

### 2. Current OMP replaces stale source claims

This check fails in the current plan.
Goal, delegation, hook, video, and pasted-text claims are stale.
The queue failure claim now has a verified negative result.

### 3. Every state and action has complete behavior

This check fails.
Several tickets define success paths without failure, retry, cancellation, or destructive-action behavior.

### 4. Every environment and accessibility path is covered

This check fails.
The current plan omits mobile, zoom, reconnect, multi-Session isolation, and several keyboard paths.

### 5. Cross-epic dependencies and native blockers are correct

This check partially passes.
Acceptance #259 correctly depends on #258 and all current implementation children.
Ticket #242 correctly depends on #307 and #308.
The corrected graph adds #239, #272, #215, #216, #217, and the new tickets.

### 6. Each ticket fits one worker

This check fails.
Fifteen current children fit one worker.
Tickets #237, #240, and #242 require splits.

### 7. The orchestration handoff is correct

This check fails.
The current handoff names the old child count and old frontier.
It creates a 150,000-token goal despite a 200,000-token hard stop.
It also describes merged research and ADR work as pending.

### 8. Acceptance proves visible and backend behavior separately

This check partially passes.
Ticket #259 asks for separate visual and backend evidence.
It omits the live gates, platform sweeps, Session isolation, reconnect, and several failure states.

## Exact issue edits

The planner can apply these changes without further design research.

### Epic #223

1. Replace the provisional phase decision with the shared Turn phase from #239 and #260.
2. Replace “Epic D” with “Epic #318, with transcript markers in #327.”
3. Assign hook and delegation rows to New Message 19.
4. Assign scheduled and automation origin decisions to #205.
5. Record the overlap probe as a kept divergence.
6. Record the existing metadata card as a kept divergence.
7. Change the child count from 18 to 26.
8. State that 25 children implement behavior and #259 accepts the epic.
9. Change every worker goal to 200,000 tokens.
10. Keep 150,000 tokens as the planning target.

Use this overlap decision:

> Reeve does not implement the reference's edge-scroll header and panel overlap probe.
> Reeve has no equivalent edge-scroll presentation.
> Revisit this decision if that presentation is added.

Use this metadata decision:

> Reeve keeps its existing frontmatter card for Markdown metadata.
> This card is an accepted product difference.
> Acceptance verifies that the card remains readable and keyboard accessible.

### #225, follow reducer

Remove the provisional phase function and its reclassification logic.
Make #225 consume the shared `Turn.phase` contract from #239 and #260.
Add #239 as a native blocker.

### #226, reducer wiring and intent

Add these acceptance criteria:

- Normalize line-mode wheel deltas by 16 px.
- Normalize page-mode wheel deltas by the viewport height.
- Require an 8 px vertical touch move.
- Ignore horizontal-dominant touch moves.
- Map Arrow Up, Home, Page Up, and Shift-Space away from the end.
- Map Arrow Down, End, Page Down, and Space toward the end.
- Ignore repeated, handled, editable-target, and button-Space key events.
- Record pointer geometry for scrollbar drags.

### #229, saved offset and Composer compensation

Add a versioned browser store keyed by Session id.
Write the distance from the end after settled scroll changes.
Restore only after the first stable layout.
Ignore stale offsets for missing Sessions.
Isolate two open Sessions from each other.
Cancel pending restoration when the user scrolls.
Test compact layout, footer focus, resize, reload, and Session switching.

### #230, history loading

Add explicit idle, loading, exhausted, failed, and cancelled states.
Prevent duplicate page requests.
Keep the reading position after success.
Keep the current page after failure.
Expose Retry only when the load path can fail.
Stop pending restoration when the Session changes.

### #231, fork destination dialog

Add Cancel and Escape behavior.
Return focus to the invoking control.
Do not assume a default destination until #217 records it.
Keep destination order evidence-gated behind #217.
Report worktree creation and fork failures separately.
Remove a newly created empty worktree when the fork fails.
Prevent repeated activation while either operation runs.

### #232, collapse, copy, and empty messages

Add `codex.userMessage.noContent` with `(No content)`.
Recalculate collapse after resize, zoom, font load, and attachment load.
Keep the toggle reachable by keyboard.
Keep focus stable when the message expands or collapses.
Keep image and chip treatment evidence-gated behind #217.

### #233, in-place edit

Keep edit eligibility evidence-gated behind #217.
Preserve text and attachments during edit and cancellation.
Disable duplicate submission while Send is pending.
Support Escape for cancellation and the documented send shortcut.
Restore focus after success, cancellation, and failure.
Keep the original turn until the replacement succeeds.

### #234, assistant announcements

Give each response its own announcement cursor and timer.
Cancel timers on completion, unmount, Session change, and superseding response.
Reconcile missed completion after reconnect without repeating announced text.
Define a deterministic fallback when `Intl.Segmenter` lacks the locale.
Prevent concurrent responses from overwriting each other's live text.

### #235, assistant action row

Return focus after the fork dialog closes.
Keep the row visible while focus remains inside it.
Report clipboard denial without claiming success.
Sanitize copied HTML and preserve plain-text fallback.
Disable repeated fork requests.
Restore the action after fork failure.
Keep branch eligibility evidence-gated behind #216.

### #236, inspected-image dialog

Add Escape, focus trap, focus return, and keyboard image navigation.
Define zoom controls and reduced-motion behavior.
Render a named unavailable state when an image fails.
Keep multi-image controls evidence-gated behind #216.

### #237 and New Message 13b

Keep table copy and preview in #237.
Move markdown failure isolation into New Message 13b.
The new ticket owns per-block containment, Retry, reset behavior, and repeated failure.
Keep the actual isolation level evidence-gated behind #216.

### #238

State that #238 handles assistant markdown image and video output only.
It does not own video attachments on user messages.

### #240 and New Message 15b

Keep playback, seek, loading, unavailable, and file-type states in #240.
Move Copy path, Save a copy, and save failure into New Message 15b.
The new ticket must define desktop and browser behavior separately.

### #242, New Message 16b, and New Message 16c

Rename #242 to “Message 16. File, folder, and uploaded-file attachment rows.”
Keep blockers #307 and #308 on #242.
Move pasted-text rows into New Message 16b, blocked by #272.
Move user image and video states into New Message 16c.
Block New Message 16c on #307 and #308.
Remove pasted-text acceptance criteria from #242.

### #244 and New Queue 1

Create New Queue 1 before #244 starts.
It owns persisted failure identity, failure reason, queue position, and retry command.
It must survive reload and reconnect.
It must reject duplicate Retry activation.
Keep queue-blocking behavior evidence-gated behind #217.
Add New Queue 1 as a native blocker of #244.
Add keyboard reorder and simultaneous-update regression criteria to #244.

### #205

Add explicit decisions for scheduled-task and automation-origin rows.
Do not assign those rows to Epic #223 without an OMP source.
Keep their coexistence evidence-gated behind #217.

### #259, acceptance

Add #215, #216, and #217 as native blockers.
Keep #258 as a native blocker.
Add every new Epic #223 implementation ticket as a native blocker.
Verify all 25 implementation tickets.
Test keyboard-only use, screen readers, 200 percent zoom, and compact layout.
Test two Sessions, reload, reconnect, failure, retry, cancellation, and repeated activation.
Test macOS visibly and record platform-table evidence for other platforms.
Record every evidence-gated value from #215, #216, and #217.
Keep visual and backend evidence separate.

## New ticket definitions

These ticket names are stable enough for creation.
Each ticket needs the standard review contract, budget, dispatch, and changelog clauses.

### New Scrolling 7. Restore position after in-place content growth

Record distance and scroll height before a rendered turn changes height.
Restore the distance on the next animation frame when the height changes.
Discard the record when the element changes or the height stays equal.
Cover streamed markdown, late images, disclosures, errors, and Session changes.

### New Message 13b. Isolate markdown block failures and retry

Contain a rendering failure at the verified reference boundary.
Keep the rest of the message usable.
Render `Markdown couldn't render` and `Try again`.
Reset the boundary before Retry.
Keep the exact boundary blocked by #216.

### New Message 15b. Copy and save inline audio files

Render the audio actions menu.
Copy only a permitted user-facing path.
Save through a user-selected destination.
Report `Couldn't save audio` after cancellation-independent failures.
Define browser and desktop behavior separately.

### New Message 16b. Pasted-text attachment rows

Render one and many pasted-text descriptors after send.
Preserve the same descriptors in queue, steer, follow-up, edit, and reload.
Use the two shipped pasted-text strings.
Block this ticket on #272.

### New Message 16c. User image and video attachment states

Render ready, loading, and failed user images.
Use `User attachment`, `Image failed to load`, and `Failed`.
Render OMP 18.2.4 video attachment markers without exposing hidden source paths.
Cover queue, send, reload, and inaccessible media.
Block this ticket on #307 and #308.

### New Message 18. File citation chips

Render code, document, file, image, presentation, and spreadsheet citations.
Render line, line-range, page, slide, and named-object locations.
Use all sixteen citation strings from Session 7.
Open the existing file surface without exposing a private path.

### New Message 19. Hook and delegation message origins

Map persisted hook custom messages to `Hook blocked this message` or `Hook feedback`.
Map `live-delegation` custom messages to `Sent by {appName} from another task`.
Preserve unknown custom messages through the generic fallback.
Cover reload, reconnect, missing details, and unsafe app names.
Block rendering integration on #260.

### New Queue 1. Persist failed queued sends and expose Retry

Persist a failed status on the queued item.
Persist a safe error summary and the item identity.
Expose one retry command for that identity.
Keep queue order and controls after failure.
Reconcile failure and retry after reload or reconnect.
Do not invent the reference's queue-blocking rule before #217 resolves it.

### New Files ticket. Referenced-file context menu in Markdown

Reuse the file action model from #175.
Apply file-type and platform suppression rules to referenced files.
Keep the default action evidence-gated behind #216.
Block this ticket on #175.

## Corrected blocker graph

| Ticket | Required native blockers |
|---|---|
| #225 | #239 |
| #226 | #225 |
| #227, #228, #229, #230 | #226 |
| #235 | #231 |
| #240 | #238 |
| #242 | #307 and #308 |
| New Message 13b | #216 for the isolation value |
| New Message 15b | #240 |
| New Message 16b | #272 |
| New Message 16c | #307 and #308 |
| New Message 19 | #260 |
| #244 | New Queue 1 |
| New Files ticket | #175 |
| #259 | #215, #216, #217, #258, and all 25 Epic #223 implementation children |

The planner must re-fetch every dependency after each write.
GitHub can retain a different parent or blocker than the request intended.

## Corrected orchestration handoff

The handoff must state these facts:

- Epic #223 has 26 children after correction.
- Twenty-five children implement behavior.
- Ticket #259 performs acceptance.
- Every worker creates a 200,000-token goal as its first action.
- Every worker aims to finish around 150,000 tokens.
- A worker stops at 200,000 tokens and reports the remainder.
- The branch remains `codex/session-messages`.
- Ticket #225 waits for #239.
- Ticket #259 waits for #215, #216, #217, #258, and every implementation child.
- Tickets #242, New Message 16b, and New Message 16c keep their external Composer blockers.
- The research and ADR work has merged and is not pending.
- Progress reports use closed children divided by 26.
- The orchestrator checks native blockers before every dispatch.
- Model selectors remain those named on each ticket.
- No worker silently substitutes a model.

## Final gap register

1. Ticket #225 duplicates the transcript phase source.
2. Ticket #226 omits complete input normalization.
3. Ticket #229 lacks a persistence store and Session isolation.
4. Ticket #230 lacks complete load states.
5. In-place content-growth restoration has no ticket.
6. The overlap probe lacks an explicit decision.
7. Ticket #234 lacks concurrency, reconnect, locale fallback, and cleanup.
8. Ticket #235 lacks complete copy, fork, focus, and failure behavior.
9. Epic #223 assigns Goal rows to the wrong epic.
10. Ticket #236 lacks complete dialog and failed-image behavior.
11. Ticket #237 combines table controls with markdown failure isolation.
12. Ticket #238 does not separate markdown video from user video attachments.
13. Ticket #240 combines playback with path and save integration.
14. Citation chips, file menus, and metadata lack final ownership or decisions.
15. Ticket #232 lacks complete collapse behavior.
16. The empty-message placeholder lacks ownership.
17. Ticket #233 lacks eligibility, attachment, pending, and keyboard rules.
18. Ticket #231 lacks cancellation, focus, default, failure, and rollback rules.
19. User image and video attachment states lack a ticket.
20. Pasted-text rows use the wrong blocker path.
21. Hook, delegation, scheduled, and automation origins lack correct ownership.
22. Ticket #244 has no backend failure source.
23. Existing queue behavior lacks keyboard and concurrent-update regression coverage.
24. Ticket #259 lacks live gates and complete environment and failure sweeps.

## Final counts

| Measure | Count |
|---|---:|
| Capability groups audited | 42 |
| Final gaps | 24 |
| Current Epic #223 children | 18 |
| Current children that fit one worker | 15 |
| Current children requiring splits | 3 |
| New Epic #223 tickets | 8 |
| Corrected Epic #223 children | 26 |
| Corrected implementation children | 25 |
| Acceptance children | 1 |
| New Files Epic #129 tickets | 1 |
| Evidence-gated live-check tickets | 3 |

Epic #223 should not enter implementation with its current issue graph.
The planner can apply the edits above without more source research.
