# Adversarial audit checkpoint: scrolling and message rows

Research for [#339](https://github.com/AndrewBeniston/omp-reeve/issues/339), against [Epic #223](https://github.com/AndrewBeniston/omp-reeve/issues/223).

## Status

This report is incomplete because the audit reached its 200,000-token hard stop.
It records verified findings and the exact remaining work.
It is not a resolution report for #339.

The checkpoint covers 42 capabilities and identifies 24 gaps.
The reference bundle still needs targeted checks where the existing research lacks a value.
No implementation ticket was edited.

## Sources checked

- The eight checks in [audit map #332](https://github.com/AndrewBeniston/omp-reeve/issues/332).
- The complete body of #339.
- Epic #223 and all 18 child issue bodies.
- Every native blocker for the epic, including #258, #307, and #308.
- The native dependency edges for every child issue.
- `docs/research/session-6-scrolling.md`.
- `docs/research/session-7-assistant-message.md`.
- `docs/research/session-8-user-message.md`.
- ADR-0015.
- The current orchestration handoff.
- Current Reeve source at `origin/main` commit `2920ac0`.
- Current OMP source from `@oh-my-pi/pi-coding-agent` 18.1.6.
- Session map #194 and the transcript-core epic #224.

## Important correction from current OMP

OMP 18.1.6 emits `goal_updated` with a persisted Goal object.
The Goal object includes status, token budget, token use, elapsed time, and timestamps.
This invalidates the old claim that OMP has no goal event.
Map #194 now assigns Goal parity to Epic #318.
Epic #223 still assigns its Goal action-row slot to “Epic D”.
That cross-epic statement is stale.

OMP 18.1.6 also carries visible custom messages for live delegation.
It carries hook-authored messages and persisted custom details.
It carries video attachment markers and hidden source-path context.
It stages large pasted text as attachment state in its interactive surface.
These sources require new ownership decisions for rows that Epic #223 excludes.

## Feature-to-ticket traceability

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
|---|---|---|---|---|---|---|
| Four follow modes | One pin flag | Session 6, follow-mode machine | #225, #226 | Current `transcript-follow.ts` exposes pin helpers only | None in basic mapping | Keep the two-ticket split |
| Three turn phases | No transcript phase model | Session 6 and ADR-0015 | #225, Epic #224 | The current hook exposes operational phase labels only | Provisional classification can duplicate Epic #224 | Make #225 consume one shared phase interface owned by Epic #224 |
| One 24 px band | Reeve uses 48 px for pinning and 24 px for control visibility | Session 6 | #226 | Current constant is 48 | None in basic mapping | Keep #226 |
| Wheel, touch, key, and pointer intent | Reeve records coarse events for 1,200 ms | Session 6, User intent | #225 and #226 mention expiry only | Current hook does not normalize wheel modes or touch direction | G1 | Expand #226 with every input rule from Session 6 |
| Scroll button geometry | Existing control mostly matches | Session 6 | #227 | Current control exists above the composer | None | Keep #227 |
| Scroll button hidden state | Current component unmounts the control | Session 6 | #227 | Reference keeps the control placed and hidden | None | Keep #227 acceptance criteria |
| Scroll button movement | Native smooth scrolling | Session 6 | #227 | Current hook calls browser smooth scrolling | None | Keep #227 |
| Response spacer | Existing CSS transition and hold | Session 6 | #228 | Current spacer values match partially | None | Keep #228 |
| 300 px latest-turn placement | No rule | Session 6 | #228 | No current source | None | Keep #228 |
| Saved scroll offset | Always opens at the end | Session 6 | #229 | Current initial effect scrolls to the end | G2 | Define the store, lifecycle, and per-Session key in #229 |
| Composer growth compensation | No position correction | Session 6 | #229 | Current transcript does not observe footer deltas | G2 | Add focus, resize, compact layout, and cancellation cases to #229 |
| 64 px history trigger | Intersection sentinel | Session 6 | #230 | Current ChatWindow uses a top sentinel | G3 | Add loading, failure, retry, cancellation, and empty-page states to #230 |
| In-place content growth restore | Only prepend restoration exists | Session 6 | No ticket | Session 6 names virtualized height restoration | G4 | Add a ticket for streamed and late-media height restoration |
| Header and panel overlap probe | No source | Session 6 | Epic excludes it | The exclusion has no linked maintainer decision | G5 | Record an explicit decision or add a scrolling ticket |
| Assistant start, progress, and completion announcements | No assistant live region | Session 7 | #234 | Current message row has no response announcer | G6 | Add concurrent responses, reconnect, locale fallback, and unmount cleanup to #234 |
| Assistant action-row order and visibility | Copy only, hover only | Session 7 | #235 | Current row does not expose focus visibility | G7 | Add focus return, copy failure, fork failure, and pin-state criteria |
| Rich response copy | Plain text only | Session 7 | #235 | Current copy helper receives one text value | G7 | Specify HTML sanitisation and clipboard failure behavior |
| Branch from assistant message | No assistant entry point | Session 7 | #235, blocked by #231 | Fork command exists | G7 | Specify failure recovery and repeated activation |
| Goal achieved label | No Goal client state | Session 7 and current OMP | Epic #318 owns Goal transcript markers | OMP emits `goal_updated` | G8 | Replace “Epic D” with Epic #318 and #327 in Epic #223 |
| Inspected-image disclosure | Images always render inline | Session 7 | #236 | Current image output has empty alt text | None in basic mapping | Keep #236 |
| Inspected-image dialog | No dialog | Session 7 | #236 | No current open action | G9 | Add Escape, focus trap, focus return, zoom, and failed-image criteria |
| Markdown table copy and expand | Horizontal table only | Session 7 | #237 | Current renderer has no table controls | G10 | Split table controls from the markdown boundary |
| Markdown error boundary | No markdown boundary | Session 7 | #237 | Current safe wrapper protects the whole message path | G10 | Give block isolation and retry their own ticket |
| Inline image states | Lazy image without status | Session 7 | #238 | No current loading or failure label | None in basic mapping | Keep #238 |
| Inline video | No player | Session 7 | #238 | OMP now carries video attachments for user input | G11 | Separate markdown video output from user video attachments |
| Inline audio | No player | Session 7 | #240 | No current audio renderer | G12 | Split playback from path-copy and save-copy integration |
| File citation chips | Plain local links only | Session 7 | Epic excludes them | Current file links already carry paths | G13 | Add a ticket or record an explicit maintainer decision |
| File reference menu | Plain click opens a file tab | Session 7 | Epic excludes it | Current Reeve has a file-opening path | G13 | Add a ticket or map it to the file-viewer epic |
| Markdown metadata disclosure | Frontmatter card exists | Session 7 | Epic excludes it | Current Reeve already renders metadata differently | G13 | Record the kept divergence as a maintainer decision |
| Two-line user-message collapse | Full text always renders | Session 8 | #232 | Current user row has no collapse state | G14 | Add keyboard, focus, image, zoom, and resize criteria |
| Empty user message | Empty body | Session 8 | No ticket | Research specifies “(No content)” | G15 | Add the placeholder to #232 or create a small ticket |
| Confirmed user copy | Tooltip changes, aria label does not | Session 8 | #232 | Current aria label stays “Copy message” | None | Keep #232 |
| In-place edit | Branch navigation and composer refill | Session 8 | #233 | Current user action calls `navigate_tree` | G16 | Define eligible messages, pending state, attachments, keyboard paths, and duplicate prevention |
| Fork destination dialog | Immediate fork | Session 8 | #231 | Worktree API and fork API exist separately | G17 | Add cancel, Escape, focus return, default choice, creation failure, and rollback |
| User image states | Empty alt text and no failure label | Session 8 | #242 mentions images, but lacks these states | Session 8 has three image strings | G18 | Add image success and failure criteria to #242 |
| File, folder, upload, and paste rows | Images only after send | Session 8 and Composer research | #242, blocked by #307 and #308 | #242 consumes Composer descriptors | G19 | Add native blocker #272 for pasted-text descriptors |
| User Goal marker | No marker | Session 8 and current OMP | Epic #318, ticket #327 | OMP now has Goal state | G8 | Correct Epic #223 ownership text |
| Hook blocked and hook feedback rows | Generic custom cards at best | Session 8 and current OMP | Epic excludes them | OMP persists hook-authored custom messages | G20 | Recheck exact hook details, then add a ticket or a decision |
| Scheduled and automation origins | No Reeve scheduler source | Session 8 | Epic excludes them | No OMP session event was found | G21 | Route these states to decision #205 explicitly |
| Delegation origin | Generic custom card | Session 8 and current OMP | Epic excludes it | OMP uses visible `live-delegation` custom messages | G20 | Add a message-row ticket for OMP delegation attribution |
| Failed queued message and Retry | No failure state | Session 8 | #244 | OMP queue snapshots expose text and images, without a failed state | G22 | Add a backend queue-failure ticket and block #244 on it |
| Existing queue, pause, reorder, edit, steer | Present | Session 8 | Kept behavior across #244 and acceptance | Current queue component supports these controls | G23 | Add regression criteria for keyboard reorder and simultaneous updates |

## Eight-check result

### 1. Every capability maps to a ticket or decision

This check fails.
The missing mappings include content-growth restoration, the overlap probe, empty messages, citations, file menus, and metadata.
Hook and delegation states also lack current ownership.

### 2. Current OMP source replaces stale “no source” claims

This check fails.
The Goal claim is stale.
The delegation, hook-message, video, and pasted-text claims need correction.

### 3. Every input, output, state, error, retry, cancellation, and destructive action

This check fails.
Several tickets specify only successful paths.
The fork, copy, media, history, edit, and queue tickets lack complete failure and cancellation behavior.

### 4. Keyboard, accessibility, mobile, zoom, persistence, reload, reconnect, and multi-Session behavior

This check fails.
The acceptance ticket covers some accessibility and reload behavior.
It does not cover mobile, zoom, multi-Session isolation, reconnect, or all keyboard paths.

### 5. Cross-epic dependencies and native blockers

This check partially passes.
Acceptance #259 correctly depends on #258 and all 17 implementation children.
Ticket #242 correctly depends on #307 and #308.
Ticket #242 also needs #272 for pasted-text descriptors.
Epic #223 must point Goal rows to Epic #318.

### 6. Each ticket fits one 200,000-token worker

This check fails.
Tickets #237, #240, and #242 combine separate frontend and backend concerns.
They should split before dispatch.

### 7. The orchestrator handoff is correct

This check fails.
The handoff names the correct epic, 18 children, branch, progress rule, and model selectors.
It correctly names blockers #258, #307, and #308.
It tells workers to create a 150,000-token goal while also requiring a 200,000-token hard stop.
A 150,000-token goal stops the worker at 150,000 tokens.
The handoff must use a 200,000-token goal and state a 150,000-token target.
The handoff also describes merged research and ADR pull requests as pending.

### 8. Acceptance proves visible and backend behavior separately

This check partially passes.
Ticket #259 requires separate visual and backend evidence.
It omits mobile, zoom, reconnect, multi-Session isolation, keyboard paths, and several failure states.
It also cannot accept #244 until a backend queue-failure source exists.

## Gap count

The checkpoint identifies 24 gaps.

1. Complete user-intent rules are absent from #225 and #226.
2. Scroll-offset persistence lacks a store and multi-Session rules.
3. History loading lacks failure, retry, cancellation, and empty states.
4. In-place content-growth restoration has no ticket.
5. The overlap probe lacks an explicit maintainer decision.
6. Announcement concurrency, reconnect, and cleanup are unspecified.
7. Assistant action failures and focus behavior are incomplete.
8. Goal ownership in Epic #223 is stale.
9. The image dialog lacks complete keyboard and failure states.
10. Ticket #237 is oversized.
11. Inline markdown video and user video attachments are conflated.
12. Ticket #240 is oversized.
13. Citations, file menus, and metadata lack tickets or decisions.
14. User-message collapse lacks keyboard, image, zoom, and resize behavior.
15. The empty-message placeholder has no ticket.
16. In-place edit lacks eligibility, attachment, pending, and keyboard rules.
17. The fork dialog lacks cancellation and failure behavior.
18. User-image success and failure states are not explicit in #242.
19. Ticket #242 lacks native blocker #272.
20. Hook and delegation sources require new ownership decisions.
21. Scheduled and automation origins do not point to decision #205.
22. Ticket #244 lacks a backend failure source.
23. Existing queue behavior lacks keyboard and concurrent-update regression criteria.
24. Acceptance #259 lacks all required environment and failure sweeps.

## Remaining work at the hard stop

- Inspect only the reference values that Sessions 6 through 8 leave unresolved.
- Read live-check tickets #215, #216, and #217 completely.
- Read Goal ticket #327 and Composer ticket #272 completely.
- Verify the exact current OMP payloads for hook feedback and live delegation.
- Verify whether OMP exposes a queue-send failure through another event or command.
- Check every ticket size against its complete file and API surface.
- Expand the traceability table with each shipped string and each live-only question.
- Produce the final capability count and final gap count.
- Replace this checkpoint with the complete report.
- Post the complete report to #339.

