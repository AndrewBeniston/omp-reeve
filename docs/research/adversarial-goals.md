# Adversarial audit: Goal mode and token budgets

Audit for [#342](https://github.com/AndrewBeniston/omp-reeve/issues/342), under the adversarial map [#332](https://github.com/AndrewBeniston/omp-reeve/issues/332).

## Result

Epic [#318](https://github.com/AndrewBeniston/omp-reeve/issues/318) does not yet cover current OMP or the reference completely.

This audit maps 75 capabilities. It finds 16 distinct gaps.

The largest error concerns lifecycle ownership. `GoalRuntime` owns Goal state, accounting, persistence, and the budget gate.

`InteractiveMode` owns restoration, tool changes, completion cleanup, and automatic continuation. Reeve creates a plain `AgentSession`.

The current plan therefore cannot deliver continuation without an OMP extraction or a named Reeve bridge.

The audit also confirms three other material gaps.

- Goal accounting excludes cache-read tokens.
- Cold Goal restoration needs explicit Reeve rules.
- The reference accepts Goal attachments, but the tickets do not.

All conclusions below are verified from the named sources. Recommendations are design proposals.

## Sources

- Epic #318 and its thirteen child tickets, #319 through #331.
- Every native dependency on those tickets.
- Adversarial map #332.
- `docs/research/session-9-goal-pill.md`, including correction commit `5946ac7` from draft PR #317.
- The private orchestrator handoff for Epic #318 and its paste-ready prompt.
- Reeve source at commit `2920ac0`.
- `@oh-my-pi/pi-coding-agent` 18.1.6 source used by Reeve.
- `src/goals/state.ts`, `src/goals/runtime.ts`, and `src/goals/tools/goal-tool.ts` in that package.
- `src/modes/interactive-mode.ts`, `src/session/agent-session.ts`, and `src/session/session-manager.ts` in that package.

The worktree contained no report or source changes from the first auditor.

## Verified corrections

### Token accounting

`goalTokenDelta()` adds input, output, and cache-write deltas. It excludes cache-read deltas deliberately.

Evidence: `src/goals/runtime.ts:65-76` in `@oh-my-pi/pi-coding-agent` 18.1.6.

Epic #318 and the correction in PR #317 both say OMP counts cache-read tokens. Those statements are false.

### Automatic continuation

`GoalRuntime` can build a continuation prompt. It does not schedule or submit that prompt.

`InteractiveMode.#scheduleGoalContinuation()` owns the timer, idle checks, draft checks, image checks, and submission.

Evidence: `src/goals/runtime.ts:505-509` and `src/modes/interactive-mode.ts:1699-1739`.

`GoalRuntimeEvent` declares `goal_continuation_requested`. The runtime does not emit that event.

`AgentSession` forwards only `goal_updated` from the runtime host.

Evidence: `src/goals/state.ts:30-32` and `src/session/agent-session.ts:1626-1630`.

### Goal restoration

`AgentSession` does not restore `GoalModeState` from Session entries during construction.

`InteractiveMode.#reconcileModeFromSession()` reads `mode` and `modeData`, validates the Goal, and sets the runtime state.

It then calls `onThreadResumed()`. A cold resume changes an active Goal to paused.

Evidence: `src/modes/interactive-mode.ts:3108-3161` and `src/goals/runtime.ts:258-282`.

Reeve must define cold start, reconnect, switch, and Fork behavior for its Wrapper.

### Goal attachments

The reference carries Goal attachments and the error `Failed to prepare goal attachments`.

OMP passes Goal-start images into the creating Turn. The persisted `Goal` has no attachment field.

Evidence: `docs/research/session-9-goal-pill.md` and `src/modes/interactive-mode.ts:4391-4408`.

Ticket #321 accepts only objective text and a token budget. No ticket owns Goal attachments.

## Coverage matrix

The Gap column names a finding from the next section. A dash means the capability has adequate planned ownership.

| Reference or OMP capability | Current Reeve state | Research location | Ticket or decision | Evidence | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- |
| Return no Goal for a new Session | No Goal API | OMP correction | #319 | `getGoalModeState()` can return undefined | - | Keep #319 criterion. |
| Store Goal identity and objective | No Goal state | OMP correction | #319 | `Goal.id` and `Goal.objective` | - | Keep OMP as the source. |
| Store budget, usage, time, and timestamps | No Goal state | OMP correction | #319 | `Goal` fields | - | Return the complete OMP object. |
| Use active, paused, limited, complete, and dropped states | No Goal state | OMP correction | #319 and #320 | `GoalStatus` union | - | Preserve OMP status names internally. |
| Create a Goal | No Goal command | OMP correction | #319 and #321 | `createGoal()` | - | Keep the route and Composer ownership. |
| Read the current Goal | No Goal command | OMP correction | #319 and #320 | `getGoalModeState()` | - | Keep mount reconciliation. |
| Replace a Goal | No Goal command | OMP correction | #319 and #325 | `replaceGoal()` resets the Goal | G5 | Separate replacement from objective editing. |
| Pause a Goal | Abort only | OMP correction | #319 and #324 | `pauseGoal()` | - | Keep OMP state mutation. |
| Resume a Goal | No Goal command | OMP correction | #319 and #324 | `resumeGoal()` | - | Keep OMP state mutation. |
| Drop a Goal | No Goal command | OMP correction | #319 and #324 | `dropGoal()` | - | Use `drop` for the reference Clear action. |
| Complete a Goal | No Goal command | OMP correction | #319 and #327 | `completeGoalFromTool()` | G7 | Add completion cleanup ownership. |
| Validate a positive integer budget | No Goal command | OMP correction | #319 and #321 | `validateTokenBudget()` | - | Keep typed route errors. |
| Set, reduce, or clear a budget | No Goal command | OMP correction | #319 and #323 | `onBudgetMutated()` | - | Test active and paused states. |
| Count input tokens | Context total only | OMP correction | #323 | `goalTokenDelta()` | - | Display the OMP total only. |
| Count output tokens | Context total only | OMP correction | #323 | `goalTokenDelta()` | - | Display the OMP total only. |
| Count cache-write tokens | Context total only | OMP correction | #323 | `goalTokenDelta()` | - | Add a backend assertion. |
| Exclude cache-read tokens | Context total only | OMP correction is wrong | Epic, #323, and #331 | Runtime source | G1 | Correct every planning statement. |
| Apply the hard gate after usage arrives | No Goal gate | OMP correction | #323 and #331 | Usage can exceed the budget | - | Keep the over-budget display criterion. |
| Exclude paused time | Session-wide timing only | Session 9 | #322 and #327 | Runtime accounts only active time | - | Use OMP `timeUsedSeconds`. |
| Persist Goal state in mode entries | Session reader has no Goal bridge | OMP correction | #319 and #329 | `appendModeChange()` | - | Preserve OMP persistence. |
| Restore a valid persisted Goal | No restoration | OMP source | #319 and #329 | `InteractiveMode` restores it | G3 | Add explicit Wrapper restoration. |
| Pause an active Goal on cold resume | No restoration | OMP source | #329 | `onThreadResumed()` default | G3 | Specify this result. |
| Preserve a live Goal on reconnect | No Goal client | Adversarial map | #320 and #329 | The live Wrapper remains canonical | G3 | Distinguish reconnect from cold start. |
| Emit Goal updates | SSE has no Goal state | OMP correction | #319 and #320 | `goal_updated` | - | Forward the complete state. |
| Schedule automatic continuation | No continuation | OMP source | #326 | `InteractiveMode` owns scheduling | G2 | Add an OMP lifecycle extraction ticket. |
| Cancel pending continuation | No continuation | OMP source | #326 | Timer cancellation lives in `InteractiveMode` | G2 | Test every terminal transition. |
| Inject active Goal context | No Goal context | OMP source | #319 | `AgentSession` builds Goal context | G4 | Include this in lifecycle acceptance. |
| Enable the hidden Goal tool | Tool presets exclude Goal | OMP source | #319 | `InteractiveMode` changes active tools | G4 | Add tool registration criteria. |
| Restore the previous active tools | No Goal tool lifecycle | OMP source | #319 | `InteractiveMode.#exitGoalMode()` | G4 | Add a separate lifecycle ticket. |
| Respect `goal.enabled` | No Goal route | OMP source | None | `InteractiveMode` rejects disabled mode | G4 | Return a typed disabled error. |
| Pause after a user interrupt | Abort exists | OMP source | #324 | `onTaskAborted({reason:"interrupted"})` | G8 | Add Stop and Escape criteria. |
| Keep internal aborts active | Abort exists | OMP source | None | Internal abort suppresses pause | G8 | Test the reason mapping. |
| Clear completed mode state | No Goal state | OMP source | #327 | `InteractiveMode` clears after completion | G7 | Capture completion before clearing. |
| Persist a completed transcript entry | No Goal marker | OMP source | #327 | `goal-completed` custom entry | G7 | Define one durable Reeve rendering source. |
| Fork the complete Goal snapshot | Fork copies Session entries | OMP source | #329 | `SessionManager.fork()` copies entries | G9 | State the exact parent and child result. |
| Keep archived Goal data | Archive registry only | Adversarial map | #329 body only | Archive does not change Session entries | G9 | Add an acceptance criterion. |
| Stop continuation after Session deletion | Wrapper registry exists | Adversarial map | #329 | No Goal cleanup exists | G9 | Destroy the Wrapper before deletion. |
| Reject corrupt Goal data safely | No Goal restoration | Adversarial map | #329 | Criterion exists without validation rules | G9 | Name required fields and fallback. |
| Create a Goal with attachments | Composer supports some attachments | Session 9 | None | Reference accepts attachments | G6 | Add a Goal attachment ticket. |
| Report attachment materialization failure | No Goal flow | Session 9 strings | None | Reference error exists | G6 | Add the exact error and retry behavior. |
| Open Goal mode from the footer | No Goal indicator | Session 9 | #321 | Reference footer action | - | Keep #321 ownership. |
| Open Goal mode with `/goal` | Extension commands exist | Session 9 | #321 | Reference and OMP expose `/goal` | - | Route both entries to one flow. |
| Show the Goal placeholder | No Goal mode | Session 9 | #321 | Exact string is recorded | - | Keep the exact i18n string. |
| Confirm Goal replacement | No Goal flow | Session 9 | #321 and #325 | Exact dialog strings exist | - | Keep one confirmation implementation. |
| Confirm paused Goal resume | No Goal flow | Session 9 | #325 | Exact dialog strings exist | - | Keep #325 ownership. |
| Show Pursuing goal | No Goal pill | Session 9 | #322 | Reference active label | - | Keep the exact label. |
| Show Paused goal | No Goal pill | Session 9 | #322 | Reference paused label | - | Keep the exact label. |
| Show Goal limited | No Goal pill | Session 9 | #322 and #323 | Reference limited label | - | Keep the exact label. |
| Show Goal achieved briefly | No Goal pill | Session 9 | #322 and #327 | Reference complete label | G7 | Define the clear timing. |
| Remove the pill after drop | No Goal pill | Session 9 | #322 | OMP clears state | - | Keep the criterion. |
| Handle Goal stalled and Goal usage limited | OMP has no states | Session 9 | Epic decision | Epic refuses invented states | G12 | Rename #322 and restate the decision. |
| Select tokens or elapsed time | No Goal pill | Session 9 | #322 and #323 | Reference metric rule | - | Keep one metric at a time. |
| Tick active elapsed time each second | No Goal pill | Session 9 | #322 | Reference timer rule | - | Stop ticking outside active state. |
| Format compact token progress | No Goal pill | Session 9 | #322 | One fractional digit | - | Include over-budget examples. |
| Preserve pill order and truncation | No Goal pill | Session 9 | #322 and #330 | Reference order is recorded | - | Verify at narrow width. |
| Prevent duplicate Goal actions | No Goal controls | Adversarial map | #324 | Double-click criterion exists | - | Apply pending states to every action. |
| Edit the objective without losing accounting | No Goal editor | Session 9 | #325 | OMP only exposes replacement | G5 | Add an OMP objective-update API. |
| Edit the budget in the same surface | No Goal editor | Session 9 | #323 and #325 | OMP supports budget mutation | - | Keep one saved result. |
| Show a Goal Tab with updated time and Revert | No Goal Tab | Session 9 | #325 and #328 | Reference behavior is recorded | - | Keep both tickets aligned. |
| Close a stale Goal Tab | No Goal Tab | Session 9 | #325 and #328 | Reference close conditions | - | Use Goal id and objective version. |
| Show Continuing goal and block Send | No continuation | Session 9 | #326 | Reference disabled reason | G2 | Drive it from the lifecycle bridge. |
| Preserve queue and steer behavior | Queue exists | Session 9 | #326 has one vague criterion | G8 | Add exact queue and draft rules. |
| Mark the creating message Sent as goal | No Goal marker | Session 9 | #321 and #327 | Exact string is recorded | - | Persist the marker source. |
| Mark completion with active elapsed time | No Goal marker | Session 9 | #327 | Exact pluralized string is recorded | G7 | Render from the completion entry. |
| Show inactive-Tab Goal progress | No Goal preview | Session 9 | #328 | Reference token and duration strings | - | Keep #328 ownership. |
| Show exact Goal errors | No Goal flow | Session 9 | #324, #325, and #330 | Exact strings are recorded | - | Put all strings in i18n. |
| Show initial loading and retry failures | No Goal client | Adversarial map | #320 omits these states | G10 | Add loading, empty, failure, and retry criteria. |
| Repair missed events after reconnect | Reconciliation exists for agent state | Adversarial map | #320 | Existing state-read pattern | - | Include Goal state in the same read. |
| Reject stale Goal updates | No Goal client | Adversarial map | #320 | Goal has id and `updatedAt` | - | Compare Goal identity and update time. |
| Isolate concurrent Goals by Session | Wrapper registry is per Session | Adversarial map | No explicit criterion | Architecture supports isolation | G11 | Add multi-Session acceptance. |
| Continue an inactive Session safely | No continuation | Adversarial map | No explicit criterion | Reeve can keep several Wrappers | G11 | Define background behavior. |
| Support keyboard and screen readers | No Goal surfaces | Session 9 | #321, #324, and #330 | Criteria exist | - | Verify the complete flow. |
| Support mobile, reduced motion, zoom, and narrow width | No Goal surfaces | Session 9 | #330 omits mobile | Narrow-width criteria exist | G16 | Add mobile layout and touch criteria. |
| Verify backend and visible behavior separately | No implementation | Adversarial map | #331 | Criterion exists | G15 | Expand the acceptance cases below. |
| Match OMP `/goal` actions | Slash command surface exists | Epic story 17 | #319 through #325 | OMP command set is known | - | Test each action against OMP. |

## Findings and exact corrections

### G1. Correct token accounting

Edit Epic #318 as follows.

- Replace “input, output, cache-read and cache-write” with “input, output and cache-write”.
- State that OMP excludes cache-read tokens because they represent reused context.

Edit #323 to add this criterion.

> A backend test proves that input, output, and cache-write deltas count. Cache-read deltas do not count.

Edit #331 to repeat that assertion with real usage evidence.

Correct the Goal section in draft PR #317. Correct the latest Goal correction comment on #203 too.

### G2. Add an OMP lifecycle extraction ticket

Create a new ticket titled `Goal 1A. Expose Goal lifecycle coordination outside InteractiveMode`.

Use this scope.

> Move transport-neutral Goal continuation coordination from `InteractiveMode` into an exported OMP lifecycle coordinator. The coordinator schedules, submits, and cancels continuation Turns. It exposes pending continuation state. It performs no TUI rendering.

Use these acceptance criteria.

- The coordinator works with a plain `AgentSession`.
- It waits until the current Turn and internal continuations settle.
- It does not continue when a draft or attachment is pending.
- Pause, drop, completion, budget limitation, deletion, and disposal cancel pending continuation.
- One continuation can be pending per Session.
- Tests use two concurrent Sessions.

Block #326 on this ticket. Remove the claim that `GoalRuntime` owns continuation from Epic #318.

If OMP cannot accept the extraction, the maintainer must approve a named Reeve coordinator.

That decision must replace the current ban on a Reeve continuation loop.

### G3. Specify restoration in #319 and #329

Add these criteria to #319.

- The Wrapper reads `mode` and `modeData` before it returns Goal state.
- The Wrapper rejects a malformed Goal snapshot without disabling ordinary chat.
- A cold Wrapper calls OMP restoration with `preserveActiveGoal: false`.
- A reconnect to the same live Wrapper does not repeat cold restoration.
- Restoration honors `goal.enabled`.

Replace #329's Fork criterion with exact outcomes.

- A Fork copies the Goal snapshot at the Fork boundary.
- The child continues from that snapshot when the live Wrapper moves to the child.
- The parent remains unchanged.
- A later cold open pauses a persisted active Goal.
- Parent and child usage diverge after the Fork.

### G4. Split lifecycle work from #319

#319 becomes too large after restoration and tool lifecycle requirements.

Create `Goal 1B. Coordinate Goal tools, settings, and completion cleanup`.

Use these acceptance criteria.

- Goal creation fails with a typed error when `goal.enabled` is false.
- Entering Goal mode registers and activates the hidden Goal tool.
- Restricted tool presets receive a documented Goal result.
- Pause, drop, and completion restore the previous active tools.
- Active Goal context reaches every Goal Turn.
- Cleanup runs once after completion.

Block #321, #324, #327, and #329 on this ticket where their behavior needs lifecycle state.

### G5. Add objective mutation to OMP

`replaceGoal()` creates a new Goal. It resets tokens, time, id, and timestamps.

The reference editor changes the saved objective. Ticket #325 says that OMP stores the edit.

Create `Goal 1C. Add OMP objective mutation without resetting Goal accounting`.

Use these acceptance criteria.

- The operation requires a non-empty objective.
- It preserves Goal id, status, token usage, budget, elapsed time, and creation time.
- It updates `updatedAt` and persists one Goal mode entry.
- It emits one `goal_updated` event.
- It rejects complete and dropped Goals.

Block #325 on this ticket. Keep replacement as a separate confirmed action.

### G6. Add Goal attachments

Create `Goal 3A. Send attachments with a Goal`.

Block it on #319, #320, and #321. Block #331 on it.

Use these acceptance criteria.

- Goal mode accepts every attachment type that the ordinary Composer supports.
- The creating Turn receives the objective and attachments together.
- Attachment preparation finishes before Goal creation submits.
- A preparation failure leaves the draft and attachments intact.
- The failure uses `Failed to prepare goal attachments`.
- Retry cannot create two Goals.
- Reload preserves the creating message and its attachment rendering.

The Goal object does not need a second attachment store.

### G7. Define completion cleanup and durable markers

Add these criteria to #327.

- Reeve captures the completed Goal before OMP clears active mode state.
- Completion appends one durable `goal-completed` entry with objective, usage, budget, and elapsed time.
- Reload renders `Goal achieved in {totalTime}` from that entry.
- Completion restores the previous active tools.
- A completion cleanup failure cannot restart continuation.
- The pill's completed display duration has one tested rule.

The epic must not claim that `GoalRuntime` performs this cleanup.

### G8. Specify Stop, queue, and draft behavior

Add these criteria to #324.

- Stop and Escape send an interrupted abort reason.
- An interrupted abort pauses an active Goal after usage flushes.
- Internal maintenance aborts do not pause the Goal.
- Resume preserves the queued messages.

Replace #326's queue criterion with these criteria.

- A typed draft or pending attachment prevents automatic continuation.
- A queued follow-up prevents automatic continuation until OMP accepts it.
- Steering follows the existing active-Turn behavior.
- Automatic continuation never consumes or removes a user draft.

### G9. Strengthen lifecycle acceptance in #329

Add these criteria.

- Archiving changes no Goal entry and starts no continuation.
- Deleting a Session cancels its continuation and destroys its Wrapper first.
- Stopping the desktop adds no usage and starts no continuation.
- Restart restores the last durable usage and elapsed time.
- Corrupt Goal data identifies the invalid field and leaves ordinary chat available.
- Deleting one Session cannot change another Session's Goal.

### G10. Add client loading and failure states to #320

Add these criteria.

- The client distinguishes loading from no Goal.
- An initial read failure shows a retry action.
- Retry reconciles without creating or mutating a Goal.
- A stale response cannot replace a newer Goal update.
- Reconnect failure preserves the last confirmed state and marks it stale.

### G11. Add multi-Session behavior

Add these criteria to #326.

- Two active Sessions can continue independently.
- One Session's draft blocks only that Session.
- Pausing one Goal does not cancel another Session's continuation.

Add these criteria to #329.

- Inactive-Tab continuation follows the same rule as active-Tab continuation.
- Wrapper disposal cancels only that Session's pending continuation.
- Reload reconciliation uses the correct Session id.

### G12. Correct #322's title and status claim

Rename #322 to `Goal 4. Render the Goal pill and OMP status labels`.

Add this criterion.

> Reeve renders active, paused, budget-limited, and complete labels. Dropped removes the pill. OMP has no stalled or usage-limited state.

Keep the epic's explicit decision not to invent missing OMP states.

### G13. Add the research pull request as a real start gate

Draft PR #317 remains open. Its Goal correction does not exist on `main`.

#319 has no native blocker. The handoff says implementation must wait for PR #317.

Make PR #317 a native blocker for #319, or merge it before dispatch.

The current prose-only gate can let an orchestrator start from stale research.

### G14. Correct the orchestrator handoff

Keep the branch `codex/session-goals`. Keep the native dependency frontier and progress rule.

Replace every claim that OMP owns continuation with this text.

> OMP `GoalRuntime` owns Goal state, accounting, persistence, and the budget gate. The extracted OMP lifecycle coordinator owns restoration, tool lifecycle, completion cleanup, and continuation.

Add the new ticket count after the planner creates G2, G4, G5, and G6 tickets.

Start with the research gate, then #319 and the new lifecycle tickets.

The two named model selectors are available. The prompt already requires verification before each dispatch.

### G15. Expand #331 acceptance

Add these acceptance cases.

- Prove the token formula with non-zero cache-read and cache-write values.
- Prove cold restoration, live reconnect, process restart, and Fork separately.
- Prove attachment success, preparation failure, retained draft, and retry.
- Prove Stop pauses a Goal, while an internal abort does not.
- Prove automatic continuation across two Sessions.
- Prove drafts, queued messages, attachments, and terminal states suppress continuation.
- Prove objective editing preserves accounting, while replacement resets it.
- Prove archive and deletion behavior.
- Record visible evidence and backend evidence for each lifecycle case.

### G16. Add mobile behavior to #330

Add these criteria to #330.

- Every Goal surface works at Reeve's mobile breakpoint.
- The pill preserves its status, metric, and controls without horizontal overflow.
- Dialogs and the Goal Tab fit the viewport and preserve scroll access.
- Touch controls use Reeve's minimum target size.
- Mobile verification uses the running interface.

Add the mobile flow to #331's visible acceptance evidence.

## Ticket size and dependency verdict

The existing thirteen tickets fit one worker each under their present wording.

#319 becomes oversized when the missing lifecycle duties are added. G2 and G4 split those duties.

#325 cannot start safely until OMP exposes objective mutation. G5 supplies that blocker.

Goal attachments form a separate vertical slice. G6 keeps #321 within one worker context.

The current native dependency graph otherwise matches the written blockers.

The missing PR #317 gate is the only wrong start blocker.

## Handoff verdict

The handoff names the correct epic, existing ticket count, branch, progress rule, and model selectors.

Its source-of-truth statement is wrong for continuation. Its start gate is not present in the native dependency graph.

Its ticket count must change after the planner creates the four proposed tickets.

## Final count

- Capability rows: 75.
- Distinct gaps: 16.
- Proposed new tickets: 4.
- Existing issues needing edits: Epic #318 and tickets #319, #320, #322, #323, #324, #325, #326, #327, #329, #330, and #331.
- Other planning corrections: draft PR #317, issue #203's correction comment, and the Epic #318 orchestrator handoff.

This audit did not implement Goal mode. It did not inspect user-visible Goal output because no Goal implementation exists in Reeve.
