# Session 1. The turn structure and its dividers

Research for [#195](https://github.com/AndrewBeniston/omp-reeve/issues/195), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the divider component, its status switch, the elapsed-time hook, the duration formatter, the collapse rule and the disclosure row. The per-turn render-error boundary sits in a separate conversation-thread chunk of the same bundle. Every threshold, interval and ordering below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Confirms the same shipped English defaults for `working`, `workingFor`, `workedFor.v2`, `userStoppedAfter`, `previousMessagesSummary` and `turnRenderError.title`, and carries the translated tables for the same ids. Nothing contradicts the extracted bundle.
- **The extracted main-process build.** Searched for all eight string groups and for the divider identifiers. No match. The turn divider, its timer and its collapse state are renderer-side only; the main process contributes nothing to this surface.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Working | The turn has started, activity exists, and the elapsed time is under 1,000 ms | Divider item status `working` with elapsed < 1,000 ms |
| Working for {time} | Same, once elapsed reaches 1,000 ms; the label re-renders every 1,000 ms | Divider item status `working` with elapsed >= 1,000 ms |
| Worked for {time} (current) | The turn is complete and the divider item carries a start and a completion time | Divider item status `worked` |
| Worked for {time} (duration-only) | The turn is complete but only a total duration is known, with no divider item | A turn-level duration value, no divider item |
| You stopped after {time} | The user interrupted the turn | Divider item status `stopped`, synthesised on interruption with a start time of 0 and the recorded duration as the completion time, so elapsed equals the duration |
| N previous messages | A collapsed turn with neither a divider item nor a duration | Fallback branch; counts the collapsed items, plus one when a final-response unit exists |
| N denied actions | An auto-review denial happened in this turn; shown at the end of the same disclosure row | Denied-action count > 0; a count of 0 renders nothing |
| Denied-actions tooltip | Hovering or focusing the denied-action count | Present whenever the count is shown |
| This turn couldn't render + Try again | A turn throws while rendering; the boundary is per turn, so the rest of the transcript survives | Error boundary fallback; the button resets the boundary and re-renders that turn |
| No divider | The turn has no collapsible activity, or the final assistant response has not started, or the turn was cancelled, or the only collapsible unit is a context compaction | Collapse rule below |

**Collapse rule.** Collapse is allowed only when all three hold: the final assistant response has started, the turn is not cancelled, and renderable agent items exist. When allowed, the turn starts collapsed unless auto-collapse is prevented, and a persisted per-turn choice overrides both. A forced-expanded turn stays open. When collapse is not allowed the disclosure is not rendered at all, so a turn with no activity shows the user message and the response with nothing between them.

**Placement.** The divider is one disclosure row: label, then a chevron that points right when collapsed and down when expanded, then the denied-action count pushed to the end of the row. A full-width rule sits directly under the row. Collapsed, the row sits between the user message and the final response and the activity is hidden behind it. Expanded, the row stays in the same place and the activity appears under it, above the final response. Units that are never collapsible (a tool call awaiting input, a steered or hook-fed user message, and optionally live MCP app entries) render outside the collapsible group, so they stay visible in both states. The aria-expanded state on the row is the inverse of the collapsed flag.

**Denied count interaction.** The count sits inside the same button. Clicking it toggles the turn like the rest of the row, but suppresses the scroll anchoring the ordinary toggle applies. Expanding a previous turn logs a product event carrying that turn's number and the total turn count.

**Expansion anchoring.** Expanding keeps the clicked row visually still: the scroll position is corrected on every animation frame against the row's recorded top, watching the turn element for resizes. The correction is abandoned after 350 ms, or immediately on a wheel, touch-move, pointer-down or key-down.

**Timer.** While the status is `working` and no completion time exists, a 1,000 ms interval re-reads the clock. Elapsed is (completion time or now) minus start time, floored at 0.

**Duration format.** Locale-aware narrow units through the platform number formatter, with zero units trimmed and sub-second values rendered as zero seconds; the fallback string when formatting yields nothing is `0s`.

| Elapsed | Rendered (en) |
|---|---|
| < 1 s | 0s |
| 1 s to 59 s | 45s |
| 1 min to 59 min, with seconds | 1m 5s |
| Whole minutes | 2m (trailing zero seconds trimmed) |
| >= 1 h | 1h 5m 3s, with zero units dropped |
| >= 1 day | 1d 2h, with zero units dropped |

Hungarian is special-cased in the formatter: the separator parts are stripped from each unit.

## Table 2. Shipped strings per state

All ids are in the local-conversation namespace. Defaults are the shipped English source text.

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.working` | Working | none | Divider shown while the assistant has started working but has not yet crossed the elapsed-time threshold |
| `localConversation.workingFor` | Working for {time} | none | Divider shown while the assistant is still working before the final response starts |
| `localConversation.workedFor.v2` | Worked for {time} | none | Divider shown between agent activity and the final assistant response in a completed turn. 'For' indicates elapsed duration, so translate this as a natural duration phrase. |
| `localConversation.workedFor` | Worked for {time} | none | Divider shown between agent activity and the final assistant response in a completed turn (duration-only branch; the v2 id is the one the live divider uses) |
| `localConversation.userStoppedAfter` | You stopped after {time} | none | Divider label shown when the user interrupts a turn, including elapsed time |
| `localConversation.previousMessagesSummary` | {count, plural, one {# previous message} other {# previous messages}} | plural on count | Summary shown in collapsed turns when no worked-for duration is available |
| `localConversation.deniedActionsCount` | {count, plural, one {# denied action} other {# denied actions}} | plural on count | Historical number of actions denied by auto-review in this turn, shown beside Worked for. Approving a retry does not remove a past denial from this count. |
| `localConversation.deniedActionsTooltip` | {count, plural, one {Auto-review denied # action. View the action and why it was denied.} other {Auto-review denied # actions. View the actions and why they were denied.}} | plural on count | Tooltip for the denied-action count beside Worked for. Clicking this part of the disclosure opens or closes the turn's activity, where denial details can be viewed. |
| `localConversation.turnRenderError.title` | This turn couldn't render | none | Error message shown when an individual conversation turn fails to render |
| `localConversation.turnRenderError.retry` | Try again | none | Button label to retry rendering a failed conversation turn |

Label precedence inside the disclosure: a live divider item wins; otherwise a turn-level duration renders the duration-only string; otherwise the previous-messages count renders. Only one of the three ever shows.

A neighbouring workflow surface ships `widgets.hermes.workflow.workedForDuration` ("Worked for {duration}"). It is a different surface and is recorded here only so a future search does not mistake it for the transcript divider.

## Table 3. OMP event per state in Reeve

Read from the transcript components and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Working | Transcript phase line, shown only while the agent runs and nothing is streaming: "Thinking", "Running command...", "Running {name}..." | `agent_start`, `message_start`, `tool_execution_start` and `tool_execution_end` set the phase; `agent_end` and `prompt_done` clear it |
| Working for {time} | none | no source. No turn clock exists; nothing consumes a turn start timestamp, although `agent_start` could supply one |
| Worked for {time} | none at turn level. Per-block durations exist: the thinking disclosure shows a duration derived from session-file timestamps, and tool rows show their own durations | no source for the turn total. `agent_start` to `prompt_done` bounds it, and session-file timestamps already bound it after reload |
| You stopped after {time} | none. The abort command is sent on Esc or the stop control, and the run simply ends | no source. The abort round-trip and `prompt_done` mark the end, but no cancelled-turn state is recorded or rendered |
| N previous messages | Lazy-load sentinel above the transcript: "Scroll up to load earlier messages ({count} hidden)" | no source. It counts locally withheld messages, not a collapsed turn |
| N denied actions and its tooltip | none. Approval denials render as their own rows | no source. No per-turn denial aggregate exists |
| This turn couldn't render + Try again | none. There is no per-turn error boundary | no source |
| Collapsed and expanded activity behind one divider | Activity rows are individually collapsible (thinking disclosure, tool rows); there is no turn-level group | no source for the turn-level toggle |
| Anchoring while the response arrives | Active-turn response spacer: reserves viewport height when a run starts, places the turn a fixed distance from the bottom, and gives the height back as the response fills it | driven by the running flag and the streaming flag, which come from `agent_start`, `message_update` and `prompt_done` |
| Turn-level progress (no reference equivalent on this surface) | Composer turn status: step progress from the todo tool and a changed-file count with diff stats | tool calls and their results inside the active turn |

## Parity checklist

**Matches**

- Both show a live indication that the agent is working, and both stop it when the run ends.
- Both keep the activity separate from the final assistant response.
- Both reserve or correct scroll position so the final response does not jump; the mechanisms differ (see below).
- Both collapse older detail, though at different granularity.

**Lacks**

- No turn divider. Reeve has no row between the activity and the final response, so there is no place for a duration, a stop label or a denied count.
- No turn clock. Nothing tracks elapsed time for a turn, so neither "Working for" nor "Worked for" can render, and the 1,000 ms threshold has no analogue.
- No cancelled-turn state. Aborting leaves no "You stopped after" marker in the transcript.
- No turn-level collapse. There is no collapsed-turn summary, so no "N previous messages" and no persisted per-turn expansion.
- No denied-action aggregate or its tooltip.
- No per-turn error boundary, so one bad turn can take the transcript with it.
- No expansion anchoring with a bounded correction window and user-input abandonment.

**Differs**

- Reeve's working indicator names the current activity ("Running command...", "Running {name}..."); the reference names only the elapsed time and leaves the activity to the rows behind the divider.
- Reeve's working indicator disappears once streaming starts; the reference's divider stays for the life of the turn and becomes the completed label.
- Reeve's "hidden messages" string is a scroll affordance for lazy loading; the reference's count is a collapsed-turn summary and is clickable.
- Reeve anchors by reserving height before the response arrives; the reference corrects position after expansion for up to 350 ms and gives up on any user input.
- Reeve shows per-block durations; the reference shows one duration for the whole turn.

## What only a live run can settle

- Whether the divider animates between Working, Working for and Worked for, and whether the row re-lays out when the denied count appears mid-turn.
- Whether the tooltip on the denied count opens on hover, on focus, or both, and whether clicking it closes the tooltip before the turn toggles.
- The actual collapsed default in the shipped build: the rule allows an auto-collapse prevention flag and a persisted choice, and which of those the product sets by default is not visible in the bundle.
- Whether a turn's expansion state survives navigating away and back, and across an application restart.
- Whether a stopped turn can later become a worked turn on retry, and what the divider shows during that retry.
- How the divider renders for a turn whose only collapsible unit is a context compaction, since that case is excluded from the disclosure.
- Frame-accurate timer behaviour: whether the 1,000 ms tick pauses in a background window, and what the label shows after a long sleep.
- Whether the render-error retry recovers a turn whose data is malformed, or only a transient failure.

