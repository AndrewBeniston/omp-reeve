# Adversarial audit: Transcript core

Audit for [#338](https://github.com/AndrewBeniston/omp-reeve/issues/338), under [Epic #224](https://github.com/AndrewBeniston/omp-reeve/issues/224).

## Final result

Epic #224 does not completely cover its reference or current OMP.

The four research documents inventory 86 reference states.

The ticket graph names all 86 states or records an exclusion.

This audit finds 11 distinct planning gaps.

Three exclusions now conflict with verified OMP capabilities.

OMP persists fallback routing through `resolvedModelIsFallback`.

OMP classifies usage limits and supplies retry timing.

OMP supplies Goal state and `goal_updated`.

Epic #318 owns Goal implementation.

Reeve already supplies Session loading state.

Reeve also supplies archive persistence, APIs, controls, and recovery settings.

The plan must reuse those sources.

Issue #256 promises history retry without a paginated history request.

Fifteen issue bodies omit native blocker #260.

The native blocker graph itself is correct.

Six tickets exceed one 200,000-token worker context.

Final acceptance omits complete keyboard, zoom, mobile, reconnect, and multi-Session proof.

The private handoff contains two internal contradictions.

All facts below came from the verified research, current issue bodies, native blockers, and the private handoff.

Recommendations below are proposed planning changes.

## Gap register

| Gap | Verified problem                                                     | Required correction                                                  |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| G1  | Fifteen bodies omit native blocker #260.                             | Add #260 to each written blocker list.                               |
| G2  | The epic says OMP has no reroute signal.                             | Add a fallback-routing note from `resolvedModelIsFallback`.          |
| G3  | The epic says OMP has no usage-limit shape or retry timing.          | Add usage-limit and timed-retry work.                                |
| G4  | The epic treats Goal-related state as absent.                        | Preserve Goal events and keep implementation in Epic #318.           |
| G5  | Issue #256 treats Session loading as new state.                      | Consume Reeve's existing Session loading state.                      |
| G6  | Issue #257 treats archive support as missing infrastructure.         | Reuse Reeve's existing archive system.                               |
| G7  | Issue #256 offers Retry without a paginated request.                 | Add the request contract before the failure callout.                 |
| G8  | Issue #258 lacks five required proof areas.                          | Add keyboard, zoom, mobile, reconnect, and multi-Session acceptance. |
| G9  | Six tickets exceed the worker budget.                                | Apply the exact splits below.                                        |
| G10 | Workers create 150,000-token goals but stop at 200,000 tokens.       | Create 200,000-token goals and aim for 150,000 tokens.               |
| G11 | The handoff forbids source reading but requires source verification. | Permit targeted source, diff, test, and interface inspection.        |

## Feature-to-ticket traceability

The Count column accounts for all 86 states.

| Research surface | Capability group                                                      | Count | Current owner                      | Audit result                                          |
| ---------------- | --------------------------------------------------------------------- | ----: | ---------------------------------- | ----------------------------------------------------- |
| Session 1        | Clock labels, stopped labels, previous messages, and no-divider rules |     7 | #241 and #243                      | Covered after #260 and the #239 split.                |
| Session 1        | Denied count and denied tooltip                                       |     2 | #246                               | Covered after #260.                                   |
| Session 1        | Per-Turn render failure                                               |     1 | #247                               | Covered after #260.                                   |
| Session 2        | Live command, read, search, list, edit, web, and connector states     |    17 | #248                               | Covered after the #248 split.                         |
| Session 2        | Repeated connector calls and first-party repeats                      |     2 | #249                               | Covered after the #248 split.                         |
| Session 2        | Question, plugin, browser, and Chrome states                          |     4 | Epic D or explicit exclusion       | The ownership decision remains valid.                 |
| Session 2        | Eleven past-tense summary states                                      |    11 | #250                               | Covered after the #248 split.                         |
| Session 3        | Sub-agent lifecycle, opening, and row suppression                     |     6 | #251                               | Covered after #260.                                   |
| Session 3        | Message-to-agent and message-to-parent rows                           |     2 | Explicit exclusion                 | OMP supplies no matching item.                        |
| Session 3        | Grouped sub-agent sentence and group status                           |     3 | #252                               | Covered after #260.                                   |
| Session 3        | Multi-agent action states                                             |     5 | #253                               | Covered after the #253 split.                         |
| Session 3        | Existing Subagents panel states                                       |     4 | Existing panel                     | The transcript tickets must preserve them.            |
| Session 3        | Delegated user message                                                |     1 | Existing delegation surface        | The transcript folder must preserve it.               |
| Session 4        | Model changed                                                         |     1 | #254                               | Covered after #260.                                   |
| Session 4        | Model rerouted                                                        |     1 | No ticket                          | G2 requires a new ticket.                             |
| Session 4        | Personality changed                                                   |     1 | Explicit exclusion                 | OMP has no personality concept.                       |
| Session 4        | Four compaction states                                                |     4 | #255                               | Covered after #260.                                   |
| Session 4        | Two Work-mode optimization states                                     |     2 | Goal boundary decision             | G4 requires explicit ownership text.                  |
| Session 4        | Continued and parent Session notes                                    |     2 | #257                               | Covered after the #257 split.                         |
| Session 4        | Provider retry progress                                               |     1 | #256                               | Covered after the #256 split.                         |
| Session 4        | Capacity wording and retry countdown                                  |     2 | No ticket                          | G3 requires a new ticket.                             |
| Session 4        | History failure and Session loading                                   |     2 | #256                               | G5 and G7 require new contracts.                      |
| Session 4        | App-server reconnect status                                           |     1 | Explicit exclusion                 | The same-process decision remains valid.              |
| Session 4        | Usage-limit message and reset divider                                 |     2 | No ticket                          | G3 covers the message. Reset needs a source decision. |
| Session 4        | Archived card and archived toast                                      |     2 | #257 and existing archive controls | G6 requires reuse of existing infrastructure.         |

## Exact issue edits

### Epic #224

Replace the reroute exclusion with this text.

> OMP persists fallback routing through `resolvedModelIsFallback`. The transcript renders a neutral reroute note from that signal. It does not claim a cyber-abuse reason.

Replace the capacity and usage-limit exclusions with this text.

> OMP classifies usage-limit failures and supplies retry timing. The transcript renders only actions and timing that OMP supplies. A reset divider remains excluded until OMP supplies a durable reset event.

Replace the Goal and Work-mode statement with this text.

> OMP Goal state and `goal_updated` are real. Epic #318 owns Goal implementation. The Turn projection must preserve those events. Work-mode wording remains excluded because Goal mode has different semantics.

Add this implementation-source statement.

> Reuse Reeve's existing Session loading state. Reuse its archive persistence, APIs, controls, and recovery settings. Do not create parallel stores.

Replace the worker budget statement with this text.

> Each worker creates a 200,000-token goal. Each worker aims to finish near 150,000 tokens and stops at 200,000 tokens.

Update the child count after creating the fourteen tickets below.

The new total will be 32 children.

### Written blocker corrections

Add #260 to the `Blocked by` section for these fifteen issues.

| Issue | Correct written blockers after the edit                          |
| ----: | ---------------------------------------------------------------- |
|  #243 | #239, #241, #260, and the new phase ticket                       |
|  #245 | #243 and #260                                                    |
|  #246 | #243, #245, and #260                                             |
|  #247 | #239 and #260                                                    |
|  #248 | #239 and #260                                                    |
|  #249 | #260 and the new activity-row ticket                             |
|  #250 | #260 and the new live-header ticket                              |
|  #251 | #260 and the new activity-row ticket                             |
|  #252 | #251 and #260                                                    |
|  #253 | #251 and #260                                                    |
|  #254 | #239 and #260                                                    |
|  #255 | #239 and #260                                                    |
|  #256 | #239 and #260                                                    |
|  #257 | #239 and #260                                                    |
|  #258 | #260, every feature ticket, and all three new acceptance tickets |

Do not change the native blockers to match stale body text.

The native blocker graph is authoritative and correct.

### Issue #239

Keep only Turn boundaries, source ordering, queued or steered membership, and the shared fixture in #239.

Remove phase reclassification from #239.

Remove future Activity, Note, sub-agent, denial, clock, and stop fields from #239's initial acceptance.

Later tickets add those fields when they have a real source.

Block #260 on #239 and the new phase ticket.

### Issue #248

Keep only the pure classifier table and its tests in #248.

Move Activity row rendering into the new activity-row ticket.

Move live-header selection and rendering into the new live-header ticket.

Replace downstream blockers as shown in the blocker table.

### Issue #253

Keep aggregate status, the header verb, and the distinct-agent count in #253.

Move per-agent rows and the optional Input line into a new ticket.

Move agent chips, model tooltips, prompt truncation, and overflow tooltips into another ticket.

### Issue #256

Keep only provider retry progress in #256.

Rename it `Transcript 15. Provider retry progress`.

State that this is provider retry, not a dropped-stream reconnect.

Move history paging, history failure, and Session loading into three new tickets.

Do not promise a Retry action before the paging request exists.

### Issue #257

Keep `Continued from chat` and `Parent chat` in #257.

Rename it `Transcript 16. Session origin notes`.

Move the archived Session card into a new ticket.

State that the new card consumes existing archive APIs and settings.

### Issue #258

Reduce #258 to final integration acceptance.

Keep the full suite, side-chat check, changelog audit, public-data check, and divergence record in #258.

Move feature-state acceptance into two new tickets.

Move resilience acceptance into a third new ticket.

Block #258 on all implementation and acceptance tickets.

## New ticket splits

### Transcript 1A. Fold assistant phases into Turns

Block this ticket on #239.

Use this scope.

> Add idle, prework, and final-answer phases to the Turn folder. Settle each phase from ordered events and persisted entries.

Use these acceptance criteria.

- Assistant text starts as a provisional final answer.
- Later thinking, tool, or sub-agent activity reclassifies that text as prework.
- `prompt_done` settles the final phase.
- Live and persisted inputs produce the same settled phase.
- Tests extend the shared fixture without React or DOM imports.

Block #260 on #239 and this ticket.

### Transcript 7A. Render classified Activity rows

Block this ticket on #248 and #260.

Use this scope.

> Render classified Activity items with separate action and detail slots. Only the detail slot can truncate.

Use these acceptance criteria.

- Every classifier kind renders through one Activity row component.
- The action and detail slots remain separate.
- Only the detail slot truncates.
- Interrupted commands use the stopped strings and icon.
- No Activity string ends with an ellipsis.

### Transcript 7B. Select the live Activity header

Block this ticket on #248 and the new Activity-row ticket.

Use this scope.

> Select one live Activity header from Turn state. Keep summary composition in #250.

Use these acceptance criteria.

- A closed or completed Activity area selects the summary.
- Exploration selects the newest running command, then the newest command.
- Other live work selects the newest unfinished item.
- No unfinished item selects the thinking header.
- A finished command can remain the exploration header.

### Transcript 12A. Render multi-agent per-agent rows

Block this ticket on #253.

Use this scope.

> Render one row per agent after the aggregate header. Add the optional Input line through the recorded precedence rules.

Use these acceptance criteria.

- Completed spawn instructions use the created-with-instructions row.
- Send-input text uses the messaged-with-prompt row.
- Other actions use the generic row and optional Input line.
- Close and resume suppress the state suffix.
- Unknown agent identifiers use the fallback row.

### Transcript 12B. Render agent identity and prompt overflow

Block this ticket on the new per-agent-row ticket.

Use this scope.

> Render agent chips, roles, model tooltips, prompt truncation, and overflow-only prompt tooltips.

Use these acceptance criteria.

- The chip removes one leading `@`.
- A non-default role appears in parentheses.
- A known model supplies the model tooltip.
- An unknown model supplies no tooltip.
- Prompt text truncates to one line.
- The prompt tooltip opens only when the text overflows.

### Transcript 15A. Request paginated Session history

This ticket supplies the missing data path for history retry.

Use this scope.

> Add an explicit request for an earlier Session page. Return entries, a cursor, exhaustion, and a typed failure.

Use these acceptance criteria.

- The request identifies the Session and preceding cursor.
- Success returns ordered entries and the next cursor.
- Exhaustion prevents another request.
- A repeated cursor cannot duplicate entries.
- A typed failure preserves the cursor for retry.
- Two Sessions cannot mix pages or cursors.

### Transcript 15B. Render failed history load and Retry

Block this ticket on Transcript 15A and #260.

Use this scope.

> Render the history failure callout at the failed page boundary. Retry the same cursor through Transcript 15A.

Use these acceptance criteria.

- The callout says `Couldn't load earlier messages`.
- The action says `Retry`.
- Retry requests the same cursor once.
- Success replaces the callout with the returned page.
- Another failure keeps the cursor and callout.
- The callout uses an alert and stacks on narrow widths.

### Transcript 15C. Render existing Session loading state

Block this ticket on #260.

Use this scope.

> Render Reeve's existing Session loading state above the Composer. Do not add another loading store.

Use these acceptance criteria.

- Loading shows one spinner and `Loading task…`.
- The row is a polite live region.
- Success removes the row once.
- Failure transfers control to the existing Session error path.
- Switching Sessions cannot show stale loading state.

### Transcript 15D. Render usage-limit failures and timed retry

Block this ticket on #260.

Use this scope.

> Use OMP's usage-limit classification and retry timing. Render only actions supported by the supplied classification.

Use these acceptance criteria.

- A classified usage-limit failure renders an inline transcript message.
- A known retry time renders a countdown and deadline.
- The countdown updates every second and never becomes negative.
- Zero triggers one automatic retry.
- Manual Retry cancels the pending automatic retry.
- Missing timing renders a plain Retry action.
- Unclassified provider errors retain the ordinary error treatment.
- No message claims upgrade or credit actions without matching OMP data.

Keep `Usage limits reset` excluded until a durable reset event exists.

### Transcript 16A. Render the archived Session card

Block this ticket on #260.

Use this scope.

> Render the archived card from Reeve's existing archive state. Use existing APIs, controls, and recovery settings.

Use these acceptance criteria.

- An archived Session replaces the transcript with the archived card.
- `Unarchive and open` calls the existing restore API once.
- Progress, success, and failure use the recorded strings.
- Success selects the restored Session.
- Failure leaves the Session archived.
- Recovery settings continue to control archive visibility.
- Reload uses persisted archive state.

### Transcript 13A. Render persisted fallback routing

Block this ticket on #260.

Use this scope.

> Fold persisted `resolvedModelIsFallback` into a neutral reroute Note on the affected Turn.

Use these acceptance criteria.

- A true fallback flag renders `Your request was routed to {toModel}.`.
- A false or absent flag renders no reroute Note.
- The Note survives reload from persisted Session data.
- The Note appears once at the affected Turn.
- The Note does not claim a cyber-abuse reason.
- The accepted wording difference is recorded on #258.

### Transcript 17A. Accept Turn structure and Activity

Block this ticket on #239 through #250, #260, and their new split tickets.

Use this scope.

> Verify Turn folding, clocks, Dividers, errors, Activity rows, repeats, and summaries in the running desktop build.

Use these acceptance criteria.

- Every built Session 1 and Session 2 state has named visual evidence.
- Backend evidence proves the matching event or persisted entry.
- Keyboard operation covers disclosures, retry, and denied-count focus.
- Two-hundred-percent zoom preserves reading order and controls.
- Mobile width preserves labels, details, and touch targets.
- Reload preserves every state promised as persistent.

### Transcript 17B. Accept sub-agents and Notes

Block this ticket on #251 through #257 and their new split tickets.

Use this scope.

> Verify sub-agent rows, grouped summaries, multi-agent actions, model Notes, compaction, origin, history, loading, limits, and archive states.

Use these acceptance criteria.

- Every built Session 3 and Session 4 state has named visual evidence.
- Backend evidence proves the matching event or persisted entry.
- Reload proves every persistent Note.
- Provider retry and history retry remain visibly distinct.
- Goal events remain available to Epic #318.
- Existing Subagents and archive controls still work.

### Transcript 17C. Accept resilience and Session isolation

Block this ticket on Transcript 17A and Transcript 17B.

Use this scope.

> Verify the complete transcript at mobile width, 200 percent zoom, reload, reconnect, and two concurrent Sessions.

Use these acceptance criteria.

- Keyboard focus remains visible before and after expansion.
- Mobile width preserves every action and error state.
- Two-hundred-percent zoom causes no hidden control or horizontal document scroll.
- Reconnect repairs missed terminal, retry, loading, and Note state.
- Late events from one Session cannot alter another Session.
- Two running Sessions keep independent Turns, retries, history cursors, and archive state.
- Reduced motion preserves every state without relying on animation.

Block #258 on Transcript 17A, Transcript 17B, and Transcript 17C.

## Blocker verdict

The native blocker graph is correct.

The written blocker graph is stale in fifteen issue bodies.

Implementation must not start from those body lists.

Add #260 to the fifteen bodies before dispatch.

Apply the split-ticket blockers at the same time.

## Ticket-size verdict

Twelve existing tickets fit one worker context after dependency corrections.

Six existing tickets do not fit.

| Ticket | Reason                                                                                      | Exact split                                                     |
| -----: | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
|   #239 | It combines boundaries, phase inference, fixture design, and future fields.                 | Keep boundaries in #239. Move phase inference to Transcript 1A. |
|   #248 | It combines classification, row rendering, and live-header selection.                       | Keep classification. Create Transcript 7A and Transcript 7B.    |
|   #253 | It combines aggregate logic, row precedence, identity, and overflow behavior.               | Keep aggregate logic. Create Transcript 12A and Transcript 12B. |
|   #256 | It combines provider retry, history transport, history failure, and loading.                | Keep provider retry. Create Transcript 15A, 15B, and 15C.       |
|   #257 | It combines origin navigation and the archived Session workflow.                            | Keep origin Notes. Create Transcript 16A.                       |
|   #258 | It combines every visual check, backend proof, resilience check, suite, and release record. | Keep final integration. Create Transcript 17A, 17B, and 17C.    |

Transcript 13A and Transcript 15D add capabilities that the current epic wrongly excludes.

The final graph has 32 children after all fourteen new tickets.

## Acceptance verdict

Issue #258 cannot establish complete acceptance in its current form.

It lists eight unresolved reference questions and one side-chat check.

It does not define complete keyboard proof.

It does not define 200 percent zoom proof.

It does not define mobile-width proof.

It does not define reconnect repair proof.

It does not define two-Session isolation proof.

Transcript 17A, 17B, and 17C add these contracts.

Final acceptance must inspect visible output in the running desktop build.

Backend evidence must remain separate from visual evidence.

## Handoff verdict

The handoff is not safe to dispatch unchanged.

Its worker goal budget is 150,000 tokens.

Its worker stop limit is 200,000 tokens.

Those values describe different enforcement limits.

Replace every worker goal budget with 200,000 tokens.

Keep 150,000 tokens as the target completion point.

The handoff also forbids source reading.

The same handoff requires source and running-interface verification.

Replace the prohibition with this rule.

> Read the worker report first. Then inspect the targeted diff, changed source, test evidence, and running interface before acceptance.

Apply the same replacement in the paste-ready prompt.

Keep the two-worker limit and one-ticket-per-worker rule.

## Final recommendation

Do not dispatch Epic #224 from the current ticket bodies.

Apply G1 through G11 first.

Create the fourteen tickets above.

Update the epic child count to 32.

Then dispatch from the corrected native frontier.
