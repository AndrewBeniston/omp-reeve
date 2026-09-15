# Session 3. The sub-agent and multi-agent rows

Research for [#197](https://github.com/AndrewBeniston/omp-reeve/issues/197), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries every string in the four groups this ticket names, the sub-agent activity row and its grouped summary sentence, the multi-agent action header and its per-agent rows, the delegation user-message label, and the subagents side panel. Every threshold, order and interval below comes from here unless stated otherwise.
- **The extracted main-process build.** Owns the transcript item types the renderer draws: a sub-agent activity item with a kind (the started kind is the one the main process acts on) and an agent thread id, and a collaboration agent tool call carrying a tool name and a list of receiver thread ids. It also keeps a sub-agent topology that discovers descendant threads when a spawn is seen, and hydrates background threads on demand. It carries none of the four string groups: two mentions of the sub-agent activity item type and seven of the spawn tool name, no message ids. The strings are renderer-side only.
- **The installed application** (version 26.908.40834). Carries the same ids, each with 64 translated tables beside the English source: the four summary ids, the panel title, the multi-agent count suffix and the grouped activity sentence appear 65 times each, and the delegation label 66 times. Nothing contradicts the extracted bundle.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

The surface is four separate things: one row per sub-agent inside a turn, one grouped sentence when several sub-agents share an anchor, the multi-agent action block for tool calls that spawn or steer agents, and the Subagents side panel.

| State | When it shows | What decides it |
|---|---|---|
| Sub-agent started working | A named sub-agent exists in this turn and is neither interrupted, updated nor finished | Row display status `active` |
| Sub-agent updated | The sub-agent reported an update | Row display status `updated` |
| Sub-agent interrupted | The sub-agent was interrupted | Row display status `interrupted` |
| Sub-agent finished | The sub-agent completed | Row display status `completed`; a background thread whose status is `done` also renders as done |
| Sent message to {agent} | The activity item is a message to a named agent | The item is flagged as a message and carries a display name |
| Sent message to parent | The same item with no display name | The item is flagged as a message and the display name is null |
| Row openable | The sub-agent has a known background thread, or is still active | `canOpen` is true when a background thread exists or the display status is `active`; the row becomes a button with the Open label, otherwise a plain div |
| Row suppressed | No usable name | A row is dropped when the display name is empty, or equals the agent thread id |
| Grouped summary, 1 to 3 agents | Several sub-agent rows share one anchor item | All names are shown |
| Grouped summary, 4 or more agents | Same, with more than three agents | Two names are shown and the rest become a hidden count |
| Group status | Derived from the rows, not stored | First interrupted wins, then updated, then completed when every row is completed or done, otherwise active |
| Multi-agent action in progress | Any action in the block is in progress | Aggregate status `inProgress` |
| Multi-agent action failed | No action in progress and any failed | Aggregate status `failed` |
| Multi-agent action interrupted | No action in progress and none failed, any interrupted | Aggregate status `interrupted`; header and row both render the shared Interrupted string |
| Multi-agent action completed | Everything else | Aggregate status `completed` |
| Per-agent state suffix | The action knows a per-agent state | Suffix appended to the row, suppressed for close and resume actions |
| Panel, active section | The panel is open on the overview | Sub-agents whose status is not `done` |
| Panel, done section | Same | Sub-agents whose status is `done` |
| Panel, waiting | A sub-agent is awaiting work | Status `waiting`, shown as a row label and counted in the active heading |
| Panel, selected sub-agent | A row is selected or the panel was opened with a requested conversation | The panel swaps the list for that sub-agent transcript with a back control |
| Delegated user message | A prompt arrived from another task | Rendered as a user message with a label above it |

**Row composition.** A sub-agent row is an avatar seeded from the hashed agent thread id, then the summary sentence for its state. When openable, the whole row is a button carrying the Open label. A message row is different: a message icon, then the sent-message string, and it is never openable.

**Grouped summary composition.** Up to 4 avatar chips are rendered before the sentence, and that cap is independent of how many names the sentence shows. Names are clickable when the group supplies an open handler for that agent; Enter and Space activate them. The hidden count is itself clickable when an overflow handler is supplied, and it opens the full agent list. The sentence sits in an aria-live region.

**Named-name rule.** The number of named agents is the group size when the group holds 3 or fewer, and 2 when it holds 4 or more. The hidden count is the group size minus the named count. So 4 agents render two names and "2 more". Note that the ticket assumed a threshold of more than two; the shipped rule is more than three.

**Grouping.** Rows are grouped against the anchor item they sit under, walking the turn from the last activity group backwards, so a later group claims a conversation id before an earlier one can. Background agents for this turn that no group claimed are appended as a final group with no anchor. A group with no rows is dropped.

**Multi-agent action composition.** One header row, then one row per agent, then an optional input line. The header is the action verb for the aggregate status followed by a count suffix. The count is the number of distinct agent ids across the receiver threads and the per-agent state map, and falls back to the number of actions when no ids are known. Agent ids are sorted for stable order.

**Multi-agent row precedence.** A completed spawn with instructions renders the created-with-instructions row. A send-input action with prompt text renders the messaged-with-prompt row. Everything else renders the generic per-agent row with the state suffix. Only in that third case is a separate Input line added, and only when the prompt is non-empty. A fallback row renders the verb alone when no agent ids are known yet. Prompt text truncates to one line, with a tooltip that opens only when the text overflows.

**Agent name chip.** The chip shows the agent name with a leading @ stripped, a role in parentheses when a role exists and is not `default`, and a tooltip naming the model the agent uses. The model map is built from spawn actions, keyed by receiver thread, falling back to the action-level model. No model means no tooltip.

**Action names.** Eight tool names map onto four verb sets: spawn, send input (shared by send-input, send-message and follow-up-task), interrupt, list, resume and close. There is no wait action in the shipped mapping, though the panel has a waiting state for an agent that has nothing to do.

**Panel behaviour.** The active section shows at most 4 items before overflow, the done section at most 10. Each row previews the sub-agent objective truncated to 60 characters, or its status summary, or the Working fallback when it is still active with neither. A running sub-agent shows elapsed time re-read on a 1,000 ms interval; a finished one shows a relative completion time from its last assistant message or its recency timestamp, in a time element carrying the ISO timestamp. The active heading carries a waiting count when any sub-agent is waiting. The selected-sub-agent header shows the model and its reasoning effort, mapped through a select with nine named levels and a Medium fallback.

**Panel opening.** Opening the panel creates or reuses a right-side-panel tab titled Subagents, with a durable route that records the selected conversation so the tab survives a reload. Opening with a selection verifies the descendant first; if the selection cannot be verified it falls back to the overview, and if the parent has unobserved descendants it hydrates background threads including their turns. Selecting a row re-opens the same tab with the new selection.

**Delegated message.** The label sits above a user-message bubble and is clickable: it navigates to the source thread, with a separate route when the window is the hotkey window. The product name in the label is substituted at render time, so the same string serves both products.

## Table 2. Shipped strings per state

Sixty-eight ids in the four groups the ticket named, plus two in the `subagents` namespace that carry the grouped sentence. Defaults are the shipped English source text.

### Sub-agent activity

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.subagentActivity.defaultName` | Agent | none | Fallback name for a subagent when no specific name is available |
| `localConversation.subagentActivity.summary.startedWorking` | {displayName} started working | none | Subagent activity summary shown when a subagent starts working |
| `localConversation.subagentActivity.summary.updated` | {displayName} updated | none | Subagent activity summary shown when a subagent reports an update |
| `localConversation.subagentActivity.summary.interrupted` | {displayName} interrupted | none | Subagent activity summary shown when a subagent is interrupted |
| `localConversation.subagentActivity.summary.completed` | {displayName} finished | none | Subagent activity summary shown when a subagent finishes successfully |
| `localConversation.subagentActivity.openSubagent` | Open {displayName} subagent | none | Accessible label for opening a subagent activity row |
| `localConversation.subagentActivity.messageSentToAgent` | Sent message to {agent} | none | Activity after sending a message to another agent; agent is the recipient's name |
| `localConversation.subagentActivity.messageSentToParent` | Sent message to parent | none | Activity after sending a message to the root or unnamed parent agent |

### Grouped activity sentence

| Id | Default | Plural or select |
|---|---|---|
| `subagents.activity.summary` | {count, select, 1 {&lt;first&gt;Subagent&lt;/first&gt;} 2 {&lt;first&gt;Subagent&lt;/first&gt; and &lt;second&gt;Subagent&lt;/second&gt;} 3 {&lt;first&gt;Subagent&lt;/first&gt;, &lt;second&gt;Subagent&lt;/second&gt; and &lt;third&gt;Subagent&lt;/third&gt;} other {&lt;first&gt;Subagent&lt;/first&gt;, &lt;second&gt;Subagent&lt;/second&gt; and &lt;more&gt;{hiddenCount} more&lt;/more&gt;}} {status, select, active {started working} updated {updated} interrupted {{count, plural, one {was interrupted} other {were interrupted}}} completed {finished} failed {finished with errors} progress {made progress} other {started working}} | select on count, select on status, plural inside the interrupted branch |
| `subagents.activity.unnamed.ariaLabel` | Subagent | none |

Its shipped description states the rule directly: show all names for up to three agents, or the first two names and the hidden count for larger groups; the name tags replace the translated Subagent fallback with the agent name when available and make it clickable; `more` opens the full agent list when supported; translators may reorder names, count and status. The status select carries two values the row-level strings do not have: `failed` renders "finished with errors" and `progress` renders "made progress".

### Multi-agent action, headers and count

| Id | Default | Description shipped with the string |
|---|---|---|
| `localConversation.multiAgentAction.header` | {action}{countLabel} | Header row for multi-agent action events. |
| `localConversation.multiAgentAction.header.count` | (leading space) {count, plural, one {an agent} other {# agents}} | Agent count suffix shown for multi-agent actions. |
| `localConversation.multiAgentAction.header.spawn.inProgress` | Creating | Header for in-progress spawnAgent multi-agent action. |
| `localConversation.multiAgentAction.header.spawn.completed` | Created | Header for completed spawnAgent multi-agent action. |
| `localConversation.multiAgentAction.header.spawn.failed` | Failed to create | Header for failed spawnAgent multi-agent action. |
| `localConversation.multiAgentAction.header.sendInput.inProgress` | Messaging | Header for in-progress sendInput multi-agent action. |
| `localConversation.multiAgentAction.header.sendInput.completed` | Messaged | Header for completed sendInput multi-agent action. |
| `localConversation.multiAgentAction.header.sendInput.failed` | Failed to message | Header for failed sendInput multi-agent action. |
| `localConversation.multiAgentAction.header.close.inProgress` | Closing | Header for in-progress closeAgent multi-agent action. |
| `localConversation.multiAgentAction.header.close.completed` | Closed | Header for completed closeAgent multi-agent action. |
| `localConversation.multiAgentAction.header.close.failed` | Failed to close | Header for failed closeAgent multi-agent action. |
| `localConversation.multiAgentAction.header.resume.inProgress` | Resuming | Header for in-progress resumeAgent multi-agent action. |
| `localConversation.multiAgentAction.header.resume.completed` | Resumed | Header for completed resumeAgent multi-agent action. |
| `localConversation.multiAgentAction.header.resume.failed` | Failed to resume | Header for failed resumeAgent multi-agent action. |
| `localConversation.multiAgentAction.interrupt.inProgress` | Interrupting | Header and row label while interrupting an agent's work. |
| `localConversation.multiAgentAction.interrupt.completed` | Interrupted | Header and row label after interrupting an agent's work. |
| `localConversation.multiAgentAction.interrupt.failed` | Failed to interrupt | Header and row label when interrupting an agent fails. |
| `localConversation.multiAgentAction.list.inProgress` | Listing | Header and row label while listing agents. |
| `localConversation.multiAgentAction.list.completed` | Listed | Header and row label after listing agents. |
| `localConversation.multiAgentAction.list.failed` | Failed to list | Header and row label when listing agents fails. |
| `localConversation.multiAgentAction.action.interrupted` | Interrupted | Header and row label for an agent action interrupted before completion. |

### Multi-agent action, rows

| Id | Default | Description shipped with the string |
|---|---|---|
| `localConversation.multiAgentAction.row.agent` | {action} {agent}{stateSuffix} | Per-agent row for multi-agent action events. |
| `localConversation.multiAgentAction.row.generic` | {action} | Fallback row when there are no known agent ids yet. |
| `localConversation.multiAgentAction.row.spawn.createdWithInstructions` | &lt;row&gt;Created {agent} with the instructions: {instructions}&lt;/row&gt; | Per-agent row for completed spawn actions when prompt instructions are present. |
| `localConversation.multiAgentAction.row.sendInput.messagedWithPrompt` | &lt;row&gt;{action} {agent}: {prompt}&lt;/row&gt; | Per-agent row for sendInput actions when prompt text is present. |
| `localConversation.multiAgentAction.meta.prompt` | Input: {prompt} | Input prompt metadata for multi-agent actions. |
| `localConversation.multiAgentAction.rowAction.spawn.inProgress` | Creating | Per-agent verb for in-progress spawnAgent actions. |
| `localConversation.multiAgentAction.rowAction.spawn.completed` | Created | Per-agent verb for completed spawnAgent actions. |
| `localConversation.multiAgentAction.rowAction.spawn.failed` | Failed creating | Per-agent verb for failed spawnAgent actions. |
| `localConversation.multiAgentAction.rowAction.sendInput.inProgress` | Messaging | Per-agent verb for in-progress sendInput actions. |
| `localConversation.multiAgentAction.rowAction.sendInput.completed` | Messaged | Per-agent verb for completed sendInput actions. |
| `localConversation.multiAgentAction.rowAction.sendInput.failed` | Failed messaging | Per-agent verb for failed sendInput actions. |
| `localConversation.multiAgentAction.rowAction.sendInput.messaged.inProgress` | Messaging | Row action label for in-progress sendInput rows. |
| `localConversation.multiAgentAction.rowAction.sendInput.messaged.completed` | Messaged | Row action label for completed sendInput rows. |
| `localConversation.multiAgentAction.rowAction.sendInput.messaged.failed` | Failed to message | Row action label for failed sendInput rows. |
| `localConversation.multiAgentAction.rowAction.close.inProgress` | Closing | Per-agent verb for in-progress closeAgent actions. |
| `localConversation.multiAgentAction.rowAction.close.completed` | Closed | Per-agent verb for completed closeAgent actions. |
| `localConversation.multiAgentAction.rowAction.close.failed` | Failed closing | Per-agent verb for failed closeAgent actions. |
| `localConversation.multiAgentAction.rowAction.resume.inProgress` | Resuming | Per-agent verb for in-progress resumeAgent actions. |
| `localConversation.multiAgentAction.rowAction.resume.completed` | Resumed | Per-agent verb for completed resumeAgent actions. |
| `localConversation.multiAgentAction.rowAction.resume.failed` | Failed resuming | Per-agent verb for failed resumeAgent actions. |

The two send-input row families differ by one string: the plain failed verb is "Failed messaging" and the messaged-row failed label is "Failed to message". Interrupt and list have no separate row family; their three strings serve both header and row. Every verb family also carries an interrupted entry, and all of them point at the one shared Interrupted string.

### Multi-agent action, per-agent state suffix

| Id | Default | Description shipped with the string |
|---|---|---|
| `localConversation.multiAgentAction.agentState.pendingInit` | pending init | Status label for pendingInit sub-agent state. |
| `localConversation.multiAgentAction.agentState.running` | running | Status label for running sub-agent state. |
| `localConversation.multiAgentAction.agentState.completed` | completed | Status label for completed sub-agent state. |
| `localConversation.multiAgentAction.agentState.errored` | errored | Status label for errored sub-agent state. |
| `localConversation.multiAgentAction.agentState.interrupted` | interrupted | Status label for interrupted sub-agent state. |
| `localConversation.multiAgentAction.agentState.shutdown` | shutdown | Status label for shutdown sub-agent state. |
| `localConversation.multiAgentAction.agentState.notFound` | not found | Status label for notFound sub-agent state. |

The suffix renders as the state in parentheses, and as the state and the agent message separated by a colon when a message exists. It is suppressed entirely for close and resume actions.

### Subagents panel

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.subagentsPanel.title` | Subagents | none | Title for the subagents right side panel tab |
| `localConversation.subagentsPanel.active` | Active · {count} | none | Heading and count for active subagents in the subagents side panel |
| `localConversation.subagentsPanel.done` | Done · {count} | none | Heading and count for completed subagents in the subagents side panel |
| `localConversation.subagentsPanel.noActive` | No active subagents | none | Empty state for the active subagents section |
| `localConversation.subagentsPanel.summary.waiting` | {count, plural, one {# waiting} other {# waiting}} | plural on count, both branches identical | Count of currently waiting subagents in the overview header |
| `localConversation.subagentsPanel.status.waiting` | Waiting | none | Status label for a subagent awaiting work in the overview |
| `localConversation.subagentsPanel.status.completedAgo` | {time} ago | none | Relative completion time for a finished subagent in the overview |
| `localConversation.subagentsPanel.working` | Working | none | Fallback preview shown when an active subagent has no objective or response yet |
| `localConversation.subagentsPanel.back` | Back to subagents | none | Accessible label for returning from a subagent transcript to the subagent list |
| `localConversation.subagentsPanel.modelAndReasoningEffort` | {model} · {reasoning, select, none {None} minimal {Minimal} low {Light} medium {Medium} high {High} xhigh {Extra High} max {Max} ultra {Ultra} persistent {Persistent} other {Medium}} | select on reasoning, nine named levels plus a Medium fallback | Model and reasoning effort shown in a selected subagent's details header. The model is a product name such as GPT-5.4. The reasoning value describes how much computational effort that subagent used. |

### Delegated user message

| Id | Default | Description shipped with the string |
|---|---|---|
| `localConversation.codexDelegationUserMessage.app` | Sent by {appName} from another task | Label shown above a user-message-style prompt delegated from another task; {appName} is the product name, either ChatGPT or Codex |

## Table 3. OMP event per state in Reeve

Read from the transcript components, the subagents panel and the session hook on this branch. Reeve has two sub-agent events, `subagent_lifecycle` and `subagent_progress`, both forwarded by the session wrapper from a sub-agent registry subscribed at progress level. The third event the ticket names, `collab_status`, is not a sub-agent event at all: it carries a live human collaboration snapshot, and it drives the collaboration card, which is a share-link surface with a QR code, participant avatars and writable and view-only links.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Sub-agent started working | Panel row, glyph `running`, activity "Running" or the last intent | `subagent_lifecycle` with status `started`; `subagent_progress` refines it |
| Sub-agent updated | none as a distinct state. Progress replaces the row in place | `subagent_progress`, which has no update-versus-unchanged distinction |
| Sub-agent interrupted | Panel row, activity "Aborted" | `subagent_lifecycle` with status `aborted`; a status of `cancelled` maps to the same |
| Sub-agent finished | Panel row under History, activity "Finished" | `subagent_lifecycle` with status `completed` |
| Sub-agent failed (grouped-sentence status `failed`) | Panel row, activity "Failed" | `subagent_lifecycle` with status `failed` |
| Sent message to {agent} or to parent | none | no source. No message-passing item exists between agents |
| Open sub-agent row | Panel row is a button that opens the detail view in the same panel | local state only; the row comes from the two sub-agent events |
| Grouped summary sentence in the turn | none. Nothing about sub-agents appears in the transcript | no source at transcript level. The two events feed the side panel only |
| Hidden count for larger groups | none | no source |
| Multi-agent action header and count | none. A spawn is an ordinary tool row | no source. `subagent_lifecycle` carries the parent tool call id, so a header could be attached to that row |
| Per-agent action rows and state suffix | none | no source. The per-agent state vocabulary has no equivalent |
| Input and instruction metadata rows | none | no source |
| Agent model tooltip and role | Detail view shows execution details for the selected sub-agent | `subagent_progress`; the payload carries the agent name and its source, not a model or a role |
| Panel active and done sections | Panel Running and History groups, counts in the collapse toggle | both sub-agent events; active means status pending, running, starting or waiting |
| Panel waiting state and waiting count | Waiting counts as active, with no label of its own and no count | partial. The status exists in the active test; nothing renders it |
| Panel elapsed and relative completion time | Row duration, formatted as seconds or minutes and seconds | `subagent_progress` supplies a duration; there is no relative completion time and no ticking clock |
| Panel preview line | Row title from task, assignment or description; activity line from the current tool, last intent or status | `subagent_progress` |
| Panel model and reasoning effort header | none | no source |
| Retry state | Row activity "Retrying {attempt}/{max}" | `subagent_progress` with a retry state; the reference has no retry string on this surface |
| Back to subagents | Detail view back control, "Back to subagents" | local state |
| Delegated user message label | none | no source. No delegated-prompt provenance is recorded or rendered |
| Live collaboration card (no reference equivalent on this surface) | Collaboration card in the transcript: QR code, participant avatars capped at 4, writable and view-only links, "Collaboration stopped" when inactive | `collab_status` |

Reeve's own strings on this surface: Subagents, Running, Finished, History, "{count} running", "{count} finished", Failed, Aborted, "Back to subagents", "Retrying {attempt}/{max}", "Using {tool}", "Subagent execution details", "Close subagent details", "No task description", "{count} tools", "{count} tokens", "Loading live transcript…", "The subagent has not written any transcript messages yet.", and "Live transcript is not available yet. Retrying while the subagent runs."

## Parity checklist

**Matches**

- Both separate active sub-agents from finished ones, and both count each group in the section heading.
- Both give every sub-agent a row that opens a detail view of that sub-agent's own transcript, and both label the way back "Back to subagents" in the same words.
- Both show a per-sub-agent activity line that falls back to a generic working label when nothing better is known.
- Both distinguish finished, failed and interrupted or aborted endings.
- Both show elapsed time for a running sub-agent.
- Both cap avatars at 4.

**Lacks**

- Nothing about sub-agents appears in Reeve's transcript. The reference puts a row, or a grouped sentence, inside the turn that spawned the agent; Reeve puts everything in a side panel that is hidden on mobile and hidden whenever the list is empty.
- No grouped summary sentence, so no name list, no hidden count, and no clickable names.
- No multi-agent action block: no header verb, no agent-count suffix, no per-agent rows, no per-agent state suffix, no instruction or input metadata line, and no model tooltip.
- No message-passing rows. An agent messaging another agent or its parent leaves no trace.
- No updated state. Progress overwrites the row, so a sub-agent that reports back looks the same as one that has not.
- No waiting label or waiting count, although the status is already treated as active.
- No relative completion time for a finished sub-agent, and no ticking clock; the duration is whatever the last progress event carried.
- No model or reasoning effort in the detail header.
- No delegated-prompt label and no navigation back to the delegating task.
- No durable route for the panel selection, so the open sub-agent is lost on reload; the panel also clears its selection whenever the session changes.

**Differs**

- Reeve identifies a sub-agent by its id with the agent name as a badge; the reference identifies it by display name and drops the row entirely when the name is missing or equals the thread id.
- Reeve's status vocabulary is pending, running, starting, waiting, failed, aborted, cancelled and completed. The reference carries two vocabularies: a row-level one of active, updated, interrupted, completed and done, and a per-agent action one of pending init, running, completed, errored, interrupted, shutdown and not found. Neither maps cleanly onto Reeve's.
- Reeve names the current tool in the activity line ("Using {tool}"); the reference names only the lifecycle state, and leaves tool detail to the sub-agent transcript.
- Reeve has a retry state on this surface; the reference has none, but it does have a `progress` and a `failed` status in the grouped sentence that Reeve has no sentence to put anywhere.
- Reeve's panel list is complete and scrolls; the reference caps the visible rows at 4 active and 10 done before overflow.
- Reeve's collaboration card is a live-sharing surface and has no counterpart here. The ticket pairs it with the reference sub-agent rows, but `collab_status` carries participants and links, not agents.
- The reference derives a group status from its rows; Reeve has no grouping, so no aggregate state exists to derive.

## What only a live run can settle

- Where the sub-agent row and the grouped sentence actually sit inside a turn: above the divider with the rest of the activity, or pinned outside it.
- Whether a single sub-agent renders the individual row or the one-name form of the grouped sentence, and what decides between them.
- Whether the grouped sentence updates in place as states change, and what a mixed group reads as when one agent is interrupted and two are still working.
- What the hidden-count control opens: the panel, a popover, or the full list in place.
- Whether the two statuses that only the grouped sentence has, `failed` and `progress`, ever appear, since the row-level state machine has no route to them.
- The wording of a multi-agent block that mixes actions, since the header verb is chosen from one action while the aggregate status is chosen across all of them.
- Whether the messaged and plain send-input row families are both reachable, or whether one is dead.
- How the panel behaves at the overflow limits: whether the caps are a scroll boundary, a show-more control, or a hard truncation.
- The relative-time format for a finished sub-agent, and how often it re-renders.
- Whether opening the panel from a row selects that sub-agent directly or lands on the overview when the descendant cannot be verified.
- Whether the avatar seed produces a stable identity for the same agent across a reload.
- Whether the delegated-message label appears for a prompt delegated within the same product, or only across products.
