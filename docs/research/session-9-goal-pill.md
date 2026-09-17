# Session 9. The goal pill and the turn status

Research for [#203](https://github.com/AndrewBeniston/omp-reeve/issues/203), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the goal pill, its status labels, its timer, its token progress, its three controls, the goal editor, the replace and resume dialogs, the goal mode indicator, the slash command, the queue rows and the turn status heading. Every value, threshold and order below comes from here unless stated otherwise.
- **The extracted main-process build.** Carries the protocol surface and the conversation-state reducer for the goal. It matches 23 goal references, including the requests `thread/goal/set`, `thread/goal/get` and `thread/goal/clear`, the notifications `thread/goal/updated` and `thread/goal/cleared`, and the notification allow map. The same reducer text appears in both builds, so the two agree.
- **The installed application** (version 26.908.40834). Confirms the shipped English defaults for `Pursuing goal`, `Goal achieved`, `Goal stalled`, `Clear goal`, `Continuing goal…` and `Set a goal to keep pursuing`. It also carries the translated tables for the same ids. Nothing contradicts the extracted web bundle.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Pursuing goal | A goal object exists with status `active` | Goal status `active` |
| Paused goal | The user paused the goal | Goal status `paused` |
| Goal stalled | The goal cannot progress | Goal status `blocked` |
| Goal usage limited | Account usage stopped the goal | Goal status `usageLimited` |
| Goal limited | The token budget stopped the goal | Goal status `budgetLimited` |
| Goal achieved | The goal completed | Goal status `complete` |
| Pill metric: token progress | The status is `active` or `budgetLimited` and a token budget exists | `tokenBudget` is not null |
| Pill metric: elapsed time | Any other case, including an active goal with no budget | `tokenBudget` is null, or the status is not one of the two above |
| Clear control | The pill is present | Always rendered in the pill |
| Pause or resume control | The pill is present and a paused flag is known | The control is skipped when that flag is null |
| Expand control | The pill is present | Opens the goal editor |
| Goal editor dialog | The user opens the expand control | Dialog titled Edit goal, with a 12-row auto-focused text area |
| Goal editor tab | The application opens a goal tab for the same objective | A dedicated goal tab holds the objective, a saved-time label and a revert control |
| Goal editor closes itself | The goal completes, the conversation id is null, or the tab objective no longer matches the goal | Tab close effect |
| Replace confirmation | The user sets a new goal while a goal exists | Replace dialog, with the draft objective clamped to four lines |
| Resume confirmation | A paused or stopped goal can resume | Two titles, one for paused and one for resumable |
| Goal mode composer | The user starts a goal through the slash command or the footer indicator | Goal mode active |
| Submission blocked: Continuing goal | An active goal starts its next turn | Submit disabled reason |
| Transcript mark: Sent as goal | A user message set the goal | Status row under that user message |
| Transcript mark: Goal achieved in {totalTime} | The goal completed | Assistant action row |
| Tab preview | A tab preview shows a goal | Duration spent and token values |
| Turn status: Working | The latest thread turn is still in progress | Heading above the composer |
| Turn status: Latest turn | The composer shows the latest turn preview | Heading above that preview |
| Stop control | A response streams | Submit button becomes Stop |
| Queue holds messages | The user queued follow-ups | Queue rows under the composer |
| Queue paused | The user interrupted the running turn | Queue header with a resume action |
| Heartbeat attached | A scheduled task belongs to the thread | Scheduled section in the thread summary panel |

**Timer.** The pill tick runs every 1,000 ms, and only while the status is `active`. For an active goal the elapsed value is `timeUsedSeconds` in milliseconds, plus the current clock, minus `updatedAt` in milliseconds. For any other status the elapsed value is `timeUsedSeconds` in milliseconds. The value is floored at 0. The pill uses the same duration formatter as the turn divider in Session 1, so it renders narrow locale units.

**Token progress.** Both numbers use compact notation with a maximum of one fraction digit. The tab preview uses the same compact rule.

**Pill order.** The pill renders the status label, then the objective text truncated to one line, then a hidden separator, then the metric. The controls follow the metric.

**Completion clears the goal.** When the goal reaches `complete`, the client records it as the completed goal and sends `thread/goal/clear` for the thread. A failure to clear writes a log line and does not show a toast.

**The continuation loop.** One callback set watches `turn/plan/updated`, `turn/started`, `item/started`, `item/completed`, `thread/goal/updated` and `thread/goal/cleared`. It resets an in-progress plan item to pending. It starts the next turn when the goal stays active, the tracked turn is no longer in progress, and no plan item is in progress. It stops when the goal is cleared, when the status leaves `active`, or when the goal creation time changes.

**Token usage.** `thread/tokenUsage/updated` writes the latest token usage on the conversation. The handler drops the event when the turn id does not match the tracked turn. A follower stream also ignores it.

## Table 2. Shipped strings per state

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `composer.threadGoal.summary.active` | Pursuing goal | none | Summary label for an active thread goal above the composer. |
| `composer.threadGoal.summary.paused` | Paused goal | none | Summary label for a paused thread goal above the composer. |
| `composer.threadGoal.summary.stalled` | Goal stalled | none | Summary label for a stalled thread goal above the composer. |
| `composer.threadGoal.summary.usageLimited` | Goal usage limited | none | Summary label for a usage-limited thread goal above the composer. |
| `composer.threadGoal.summary.budgetLimited` | Goal limited | none | Summary label for a budget-limited thread goal above the composer. |
| `composer.threadGoal.summary.complete` | Goal achieved | none | Summary label for a completed thread goal above the composer. |
| `composer.threadGoal.tokenProgress` | {used} / {budget} | none | Token progress shown in goal status text. |
| `composer.threadGoal.clear` | Clear goal | none | Button label to clear the current thread goal. |
| `composer.threadGoal.clearTooltip` | Clear goal | none | Tooltip for button that clears the current goal. |
| `composer.threadGoal.pause` | Pause goal | none | Button label to pause an active thread goal. |
| `composer.threadGoal.pauseTooltip` | Pause goal | none | Tooltip for button that pauses an active goal. |
| `composer.threadGoal.resume` | Resume goal | none | Button label to resume a paused thread goal. |
| `composer.threadGoal.resumeTooltip` | Resume goal | none | Tooltip for button that resumes a paused goal. |
| `composer.threadGoal.editDialog.title` | Edit goal | none | Title for the goal editor. |
| `composer.threadGoal.editDialog.ariaLabel` | Goal | none | Accessible label and placeholder for the goal editor. |
| `composer.threadGoal.editDialog.save` | Save | none | Save button for the goal editor. |
| `composer.threadGoal.editDialog.cancel` | Cancel | none | Cancel button for the goal edit dialog. |
| `composer.threadGoal.editor.updatedAgo` | {minutes, plural, =0 {Updated just now} one {Updated # min ago} other {Updated # min ago}} | plural on minutes | Relative time since the thread goal objective was last updated. |
| `composer.threadGoal.editor.revert` | Revert | none | Button label that restores the last saved thread goal in the goal editor. |
| `composer.threadGoal.editLoadError` | Failed to load goal objective | none | Toast shown when a file-backed goal cannot be loaded. |
| `composer.threadGoal.editSaveError` | Failed to save goal objective | none | Toast shown when an edited goal objective cannot be saved. |
| `composer.threadGoal.setError` | Failed to set goal | none | Toast shown when setting a thread goal fails. |
| `composer.threadGoal.clearError` | Failed to clear goal | none | Toast shown when clearing a thread goal fails. |
| `composer.threadGoal.statusUpdateError` | Failed to update goal | none | Toast shown when updating a thread goal fails. |
| `composer.threadGoal.materializeError` | Failed to prepare goal attachments | none | Toast shown when goal attachments cannot be written to the execution host. |
| `composer.threadGoal.replaceConfirmation.title` | Replace current goal? | none | Title for the dialog confirming a task goal replacement. |
| `composer.threadGoal.replaceConfirmation.subtitle` | This will keep the chat but replace the saved goal with your current composer text | none | Subtitle for the dialog confirming a chat goal replacement. |
| `composer.threadGoal.replaceConfirmation.confirm` | Replace goal | none | Confirm button for the task goal replacement confirmation dialog. |
| `composer.threadGoal.replaceConfirmation.cancel` | Cancel | none | Cancel button for the task goal replacement confirmation dialog. |
| `composer.threadGoal.resumeConfirmation.title` | Resume paused goal? | none | Title for the dialog confirming a paused goal should resume. |
| `composer.threadGoal.resumeConfirmation.resumableTitle` | Resume goal? | none | Title for the dialog confirming a stopped goal should resume. |
| `composer.threadGoal.resumeConfirmation.subtitle` | ChatGPT will keep working toward this goal when the chat is idle | none | Subtitle for the dialog confirming a paused goal should resume. |
| `composer.threadGoal.resumeConfirmation.resume` | Resume goal | none | Button label for resuming a paused task goal. |
| `composer.threadGoal.resumeConfirmation.keepPaused` | Keep paused | none | Button label for leaving a task goal paused. |
| `composer.threadGoal.resumeConfirmation.notNow` | Not now | none | Button label for dismissing a task goal resume confirmation. |
| `composer.threadGoal.resumeConfirmation.dismissError` | Failed to dismiss goal prompt | none | Toast shown when dismissing the paused goal resume prompt fails. |
| `composer.goalModeIndicator` | Goal | none | Goal mode indicator shown in the composer footer. |
| `composer.goalModeIndicator.tooltip` | Clear goal | none | Tooltip for the goal mode footer indicator. |
| `composer.goalModeIndicator.clear` | Clear goal | none | Accessible label for the goal footer indicator. |
| `composer.goalSlashCommand.title` | Goal | none | Title for the goal slash command. |
| `composer.goalSlashCommand.setDescription` | Set a goal to keep pursuing | none | Description for the goal slash command. |
| `composer.placeholder.goal` | Describe your goal, define measurable outcomes for best results | none | Composer placeholder text when the user is setting a Codex thread goal. |
| `composer.submit.threadGoalContinuation` | Continuing goal… | none | Message shown when submission is disabled while an active goal starts its next turn. |
| `codex.userMessage.goal` | Sent as goal | none | Status shown below a user message when the user set a thread goal. |
| `assistantMessageContent.goalAchieved` | Goal achieved in {totalTime} | none | Assistant action row label shown when a thread goal was completed. |
| `tabThumbnail.goal.timeSpent` | {duration} spent | none | Time spent pursuing a goal, excluding paused time, in a tab preview. |
| `tabThumbnail.goal.tokens` | {used} / {budget} tokens | none | Tokens used and token budget for a goal in a tab preview. |
| `composer.latestTurn.working` | Working | none | Heading shown above the composer when the latest thread turn is still in progress. |
| `composer.latestTurn` | Latest turn | none | Heading shown above the latest thread turn preview above the composer. |
| `composer.placeholder.working` | Working… | none | Placeholder text for the compact floating composer while the current turn is in progress. |
| `quickChat.working` | Working | none | Primary status of the compact floating composer while a task is running. |
| `composer.submitButtonTooltip.stop` | Stop | none | Accessible label for the stop button when a response is streaming. |
| `composer.submitButtonTooltip.send` | Send | none | Accessible label for submit when no response is currently in progress. |
| `composer.submitButtonTooltip.queue` | Queue | none | Accessible label for holding a newly submitted follow-up until the active Codex run finishes. |
| `composer.submitButtonTooltip.steer` | Steer | none | Accessible label for applying a newly submitted follow-up to the active Codex run immediately. |
| `composer.submitButtonTooltip.resume` | Resume | none | Accessible label for resuming an interrupted task. |
| `composer.queuedMessage.interruptedQueue` | Queue paused because you interrupted | none | Header shown above queued messages paused because the user interrupted the running turn. |
| `composer.queuedMessage.resumeInterruptedQueue` | Resume | none | Button label to resume queued messages paused by an interruption. |
| `composer.queuedMessage.sendNow` | Steer | none | Button label for applying a queued follow-up to the active Codex run immediately. |
| `composer.queuedMessage.sendNowTooltip` | Submit without interrupting the model | none | Primary tooltip text for steering with a queued follow-up. |
| `composer.queuedMessage.retry` | Retry | none | Button label to retry a queued follow-up that failed to send. |
| `composer.queuedMessage.retryTooltip` | Try sending this queued message again | none | Primary tooltip text for retrying a queued follow-up that failed to send. |
| `composer.queuedMessage.retryTooltipRemedy` | Edit or delete it if retry keeps failing | none | Secondary tooltip text for a failed queued follow-up. |
| `composer.queuedMessage.pausedTooltip` | This queued message could not be sent | none | Primary tooltip text for a queued message that failed to send. |
| `composer.queuedMessage.pausedTooltipRemedy` | Retry, edit, or delete it to continue the queue | none | Secondary tooltip text for a queued message that failed to send. |
| `composer.queuedMessage.edit` | Edit message | none | Menu item to edit a queued message. |
| `composer.queuedMessage.delete` | Delete queued message | none | Aria label for deleting a queued message. |
| `composer.queuedMessage.more` | Queued message actions | none | Aria label for the queued message row actions menu. |
| `composer.queuedMessage.openInSideChat` | Open in side chat | none | Menu item to start a queued message as a side chat. |
| `composer.queuedMessage.turnOn` | Turn on queueing | none | Menu item to switch the default follow up behavior to queue. |
| `composer.queuedMessage.imageAttachments` | {count, plural, one {# image} other {# images}} | plural on count | Summary shown for a queued message with image attachments and no displayable text. |
| `codex.localConversation.heartbeatAutomation.title` | Scheduled | none | Title for the active scheduled task section in the thread summary side panel. |
| `codex.localConversation.heartbeatAutomation.nextRun` | Next run: {nextRunLabel} | none | Tooltip shown on the heartbeat automation row in the thread summary panel. |
| `codex.localConversation.heartbeatAutomation.open` | Open scheduled task | none | Accessible label for opening the active scheduled task from the thread summary panel. |
| `sidebarTaskRow.heartbeatAutomation.nextRun` | Next run: {nextRunLabel} | none | Tooltip shown on the heartbeat automation icon for a sidebar thread row. |
| `codex.localTaskRow.attachedHeartbeatAutomation` | Scheduled task attached | none | Accessible label for the scheduled task icon on a task with an attached scheduled task. |
| `localConversation.heartbeatUserMessage.automation` | Sent by scheduled task | none | Label shown above a user-message-style scheduled task trigger. |
| `localConversation.heartbeatUserMessage.automationTabTitle` | Scheduled task | none | Right panel tab title for a scheduled task opened from a trigger message. |
| `threadHeader.archiveConfirmHeartbeatTitle` | Archive chat and remove scheduled task? | none | Title for the archive dialog when the chat has an active scheduled task. |
| `threadHeader.archiveConfirmHeartbeatSubtitleUnnamed` | This chat has an active scheduled task. Archiving the chat will also remove it and stop future runs. | none | Subtitle for the archive dialog for an unnamed active scheduled task. |
| `threadHeader.archiveConfirmHeartbeatConfirm` | Archive and remove | none | Confirm button label for that archive dialog. |
| `worktreeInitV2.heartbeatAutomationError` | Started chat, but could not create the heartbeat | none | Toast shown when a worktree conversation starts but creating its heartbeat automation fails. |

Every id in this table carries its shipped English default. The footer indicator label and the clear-failure toast needed a second bounded read, because the first window cut them.

## Table 3. OMP or Reeve source per state

Read from Reeve's composer status components and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP or Reeve source |
|---|---|---|
| Goal pill, all six status labels | none | no source. Reeve has no goal object and no goal status. |
| Pill objective text | none | no source. |
| Pill elapsed timer | none for a goal. Session timing sums active milliseconds from session-file timestamps. | no source for a goal timer. The session timing helper could carry one. |
| Pill token progress | none. The context donut shows context window use, not a budget. | no source. `getContextUsage()` gives percent, context window and tokens, with no budget. |
| Clear control | none | no source. |
| Pause and resume controls | none | no source. Reeve can only abort a run. |
| Expand control and goal editor | none | no source. |
| Replace and resume confirmations | none | no source. |
| Goal mode composer and placeholder | Slash command list from OMP extensions. The Add menu lifts `/goal` and `/plan` to the top when an extension provides them. | The extension command list. Reeve renders the command, and OMP owns its behaviour. |
| Submission blocked: Continuing goal | none | no source. Reeve has no continuation loop. |
| Sent as goal, Goal achieved in {totalTime} | none | no source. |
| Tab preview goal values | none | no source. |
| Turn status: Working | Transcript phase line: Thinking, Running command..., Running {name}..., Running {names}... | `agent_start`, `message_start`, `tool_execution_start` and `tool_execution_end` set the phase. `agent_end`, `prompt_done` and `agent_settled` clear it. |
| Turn status: Latest turn preview | none. Reeve shows the transcript itself. | no source. |
| Step progress inside the turn | Composer steps status: a progress donut and Step {current} / {total}, with a tooltip list of steps | The todo tool call and its result inside the active turn. |
| Changed files inside the turn | Composer changes status: {count} files changed with added and removed counts, and a tooltip file list | Write tool calls and their result diffs inside the active turn. |
| Context and token values | Context donut, with the accessible label Context donut: {percent}% | `getContextUsage()` on the session, returned by the agent state endpoint and synced by SSE state reads. |
| Stop control | Submit button becomes Stop. Separate labels exist for Stop agent and Stop compaction. | The abort command, sent on Escape or the stop control. |
| Queue holds messages | Queued · {count} row, with steer, retry, edit, delete and reorder actions | Reeve's own queue state in the composer. |
| Queue paused | Queue paused because you interrupted, with Resume | Reeve's own interrupt handling. |
| Heartbeat state | none | no source. Reeve has no scheduled task. |

**What OMP exposes that could carry a goal.** Record for the decision ticket. The extension command surface already carries a `/goal` command when an extension provides one. Session timing gives elapsed active time. `getContextUsage()` gives tokens and the context window. The todo tool gives plan steps and their status. Nothing in this list stores an objective, a status, a token budget or a pause state, so a goal object needs a new store.

## Parity checklist

**Matches**

- Both show a live status above the composer while a turn runs.
- Both turn the submit control into a stop control while a response streams.
- Both hold follow-up messages in a queue, and both offer steer as the alternative.
- Both mark a queue paused by an interrupt and offer a resume action.
- Both show step progress with a donut and a step count.
- Both show a changed-file count with added and removed line counts.
- Both show token use with a donut, although the two donuts measure different things.

**Lacks**

- No goal object. Reeve has no objective, status, token budget, elapsed time or pause state.
- No goal pill, so there is no place for the six status labels.
- No goal timer and no token budget, so neither pill metric can render.
- No clear, pause, resume or expand control, and no goal editor.
- No replace confirmation and no resume confirmation.
- No continuation loop, so nothing starts the next turn while the chat is idle.
- No completion behaviour. Nothing marks Goal achieved and nothing clears a completed goal.
- No transcript marks for a goal, so a user message never reads Sent as goal.
- No heartbeat or scheduled task, so the thread summary panel has no Scheduled section.
- No latest-turn preview above the composer.

**Differs**

- The reference status heading names only the state, Working. Reeve's phase line names the current activity.
- The reference token progress measures a goal budget. Reeve's donut measures the context window.
- The reference pill holds the objective text. Reeve's status row holds steps and changes.
- The reference opens the goal in a dialog and in a tab. Reeve has no equivalent editor surface.
- The reference elapsed time excludes paused time in a tab preview. Reeve's session timing sums active time between message timestamps for a whole session.
- The reference queue count sits in a header string. Reeve's queue count sits in one row label, Queued · {count}.

## What only a live run can settle

- The pause and resume control semantics. The tooltip and the accessible label both switch on one paused flag, and the shipped pairing reads as inverted in the bundle. A live run must confirm which label appears for a paused goal.
- Whether the expand control opens the dialog, the goal tab, or both, and what decides which one appears.
- Whether the pill shows the elapsed time and the token progress together in any state, or only one at a time.
- The rendered pill order and the truncation point for a long objective.
- Whether the timer keeps time across a window sleep, and what the pill shows after a long idle period.
- How the pill renders during a status change, because the clear, status and edit actions each have their own loading state.
- Whether the completed goal stays visible after the client sends `thread/goal/clear`, and for how long.
- What the continuation loop sends as the next turn, and what the transcript shows for it.
- Whether a heartbeat run and an active goal can run at the same time, and which status wins above the composer.
- Whether `thread/tokenUsage/updated` moves the pill token progress during a turn, or only at the end of a turn.

I did not run Reeve or the reference application in this session. Every Reeve behaviour above comes from the source on this branch. Every reference behaviour above comes from the three sources named at the top. No rendered output is verified.


## 2026-09-17 correction: current OMP Goal Mode

The OMP comparison above describes the older SDK read during the first audit. Current OMP has per-Session Goal state and a hard budget gate. This section supersedes the OMP-source column in Table 3 and the corresponding "Lacks" statements.

Current OMP facts, verified from its TypeScript source and corrected by the adversarial audit in `docs/research/adversarial-goals.md`:

- `Goal` stores an id, objective, status, optional `tokenBudget`, `tokensUsed`, `timeUsedSeconds`, creation time and update time.
- Statuses are active, paused, budget-limited, complete and dropped.
- `GoalRuntime` creates, replaces, pauses, resumes, drops and completes a Goal.
- The runtime accepts a positive integer token budget, clears it and changes it while a Goal is active.
- Reaching the budget changes the state to budget-limited. Raising or clearing the budget can return it to active.
- Goal accounting includes input, output and cache-write deltas. It excludes cache-read deltas because they represent reused context.
- `GoalRuntime` persists Goal Mode in the Session and emits `goal_updated`.
- `InteractiveMode` owns cold restoration, Goal tool changes, completion cleanup and continuation scheduling and submission.
- `GoalRuntime` can build a continuation prompt. It does not schedule or submit that prompt.
- The hidden `goal` tool supports create, get, complete, resume and drop. Create accepts `token_budget`.
- The OMP TUI supports `/goal set`, show, pause, resume, drop and budget. Budget accepts a positive integer or `off`.
- `goal.enabled` defaults to true. OMP can show Goal status in its footer.

The screenshot supplied by the maintainer confirms the visible reference result of the hard gate: "Goal limited" plus compact token progress such as `133.7K / 100K`. Usage can exceed the configured budget because the gate applies after usage events arrive.

Epic #318 keeps `GoalRuntime` as the source of Goal state, accounting, persistence, commands and the budget gate. It extracts transport-neutral lifecycle coordination from `InteractiveMode` into OMP.

If OMP cannot accept that extraction, the maintainer must approve a named Reeve coordinator. Reeve must not create a second Goal store, token counter or budget gate.

The remaining parity work includes Goal creation, attachments, status, progress, budget editing, pause, resume, clear, objective mutation, replacement, continuation, transcript markers and completion.
