# Session 4. The system notes

Research for [#198](https://github.com/AndrewBeniston/omp-reeve/issues/198), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries every note in this group: the synthetic divider components for model, personality and compaction, the continued-from and parent-chat attachments, the stream-error status with its attempt counter, the capacity-retry button and its countdown, the earlier-messages failure callout, the status row above the composer, the inline usage-limit message, the usage-limit reset divider and the archived card. Every string, branch, threshold and interval below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Carries the same ids, so the shipped build and the extracted bundle agree. Nothing contradicts the bundle.
- **The extracted main-process build.** Ships none of these strings. It carries three of the item kind names (rerouted model, personality change, forked conversation) and it owns the app-server connection retry: the delay starts at 1,000 ms, doubles on each scheduled reconnect, is capped at 20,000 ms, takes a per-host jitter, and resets to 1,000 ms on a fresh connect and on a successful initialize. The attempt number logged there is a connection attempt, not the per-response reconnect counter the transcript shows.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | Where it sits | Form | Persists after reload |
|---|---|---|---|
| Model changed | In the transcript at the point the model changed, before the next turn | Divider with an icon; a warning tooltip hangs off it, centred and narrow, holding two lines | Yes |
| Model rerouted | Same place, when a request was routed elsewhere | Divider with an icon and a two-line warning tooltip; the second line carries a link and names a slash command | Yes |
| Personality changed | In the transcript at the switch point | Divider row: icon, then the label with the personality name resolved to its display label | Yes |
| Compacting context (manual, running) | In the transcript where compaction started | Icon-and-summary row; the running label is wrapped in a shimmer | Yes for the completed form; the running form is a live state |
| Context compacted (manual, done) | Same row, once complete | Icon-and-summary row, no shimmer | Yes |
| Context automatically compacting | Same row, automatic source | Shimmered row | Live state |
| Context automatically compacted | Same row | Plain row | Yes |
| Optimizing the conversation | Same row, Work mode only | Shimmered row | Live state |
| Optimized the conversation | Same row, Work mode only | Plain row | Yes |
| Continued from chat | Divider above the first message of the continued chat | Divider with an icon and a clickable label, truncated to a fixed width, that navigates to the source chat | Yes |
| Parent chat | Attachment label above the first message of a forked subagent task | Attachment label, clickable, navigates to the parent task | Yes |
| Reconnecting {n}/{max} | Where the interrupted response sits | Inline status text beside the stream error, with a rolling attempt number | No; connection state |
| Server is busy, reconnecting | Same place, when the error is a capacity error | Same status, different wording; with or without the counter | No |
| Retry / Retry in {n}s | Beside the failed turn after a capacity error | Button with a progress fill that drains as the countdown runs | No |
| Couldn't load earlier messages | Above the transcript, where the earlier page would have loaded | Warning callout with a ghost Retry action, announced as an alert, stacked on narrow widths | No |
| Loading task… | Above the composer | Single status row: spinner, then the label; polite live region | No |
| Reconnecting to ChatGPT… | Above the composer, same row, when the status is reconnecting | Same row | No |
| Usage limit reached | Inline in the transcript where the turn failed | Message chosen from the action the account can take, each with a reset-date and a no-reset form | Yes |
| Usage limits reset | Transcript divider at the turn where a reset was applied | Divider, non-selectable, gated per conversation and turn | Yes |
| This task is archived | Replaces the transcript when an archived task is opened | Card: icon, title, explanation, an unarchive-and-open button, with its own error and progress states; a read-only preview variant has its own copy and a Done action | Yes, the task stays archived |
| Archived chat | Toast after archiving | Toast | No |

**Compaction branch order.** One component decides all six compaction labels from four inputs: a completed flag, an explicit label pair, a Work-mode flag and a source. An explicit label wins. Otherwise, a source of manual gives the manual pair, Work mode gives the optimizing pair, and everything else gives the automatic pair. The completed flag picks past tense over present tense within the chosen pair, and it also decides the wrapper: complete renders plain, in progress renders inside the shimmer.

**Reconnect counter.** The counter renders only when both the current attempt and the maximum are known; either one missing drops the counter and the status falls back to its bare form. The attempt number animates as a rolling number and both halves are tabular. The capacity wording is chosen when the error is the server-overloaded kind or when a disconnected response stream carries HTTP 429.

**Capacity retry.** The countdown re-reads the clock every 1,000 ms while it is live, and the remaining seconds are the deadline minus now, rounded up, floored at 0. At 0 it fires the retry itself and marks it automatic; pressing the button fires the same retry and marks it manual. The fill is scaled by elapsed over total, so the bar drains left to right. With no deadline, the button is a plain Retry.

**Persistence.** The reload column follows the render path: the notes above are read from the turn's items, while the reconnect status, the capacity countdown, the earlier-messages failure and the composer status row are read from connection state. Not verified at runtime.

## Table 2. Shipped strings per state

All ids are in the local-conversation namespace unless the table says otherwise. Defaults are the shipped English source text.

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `modelChanged` | Model changed from {fromModel} to {toModel}. | none | Synthetic divider shown when model changes for the next turn. |
| `modelChanged.warning.line1` | Changing models mid-conversation will degrade performance. | none | First line of warning tooltip shown after the model-changed inline status. |
| `modelChanged.warning.line2` | Context may automatically compact. | none | Second line of warning tooltip shown after the model-changed inline status. |
| `modelRerouted` | Your request was routed to {toModel}. | none | Synthetic divider shown when a request is rerouted to another model. |
| `modelRerouted.warning.line1` | Heads up, your request was re-routed to reduce cyber-abuse risk. | none | First line of warning tooltip shown after the model-rerouted inline status. |
| `modelRerouted.warning.line2` | Think this is a mistake? Request a review at <link>chatgpt.com/cyber</link> or report via /feedback | rich-text link tag | Second line of warning tooltip shown after the model-rerouted inline status. |
| `personalityChanged` | Switched to {personality} personality | none | Synthetic item shown when the personality changes. |
| `contextManuallyCompacting` | Compacting context | none | In-progress label shown while manually triggered context compaction is running. |
| `contextManuallyCompacted` | Context compacted | none | Synthetic divider shown when the user manually compacts context. |
| `contextAutomaticallyCompacting` | Context automatically compacting | none | In-progress label shown while automatic context compaction is running. |
| `contextAutomaticallyCompacted` | Context automatically compacted | none | Synthetic divider shown when context compaction occurs automatically. |
| `conversationOptimizing` | Optimizing the conversation | none | In-progress label shown during automatic context optimization in Work mode. |
| `conversationOptimized` | Optimized the conversation | none | Synthetic divider shown after automatic context optimization in Work mode. |
| `forkedFromConversation` | Continued from chat | none | Divider shown when a chat was continued from another chat |
| `parentThread` | Parent chat | none | Attachment label shown above the first message in a forked subagent task. Clicking it navigates to the parent task. |
| `streamError.reconnecting` | Reconnecting {progress} | none; progress is a composed element | Status shown while a disconnected response stream is reconnecting. The values are the current retry attempt and maximum retry attempts. |
| `streamError.reconnectingProgressDenominator` | /{maxAttempts} | none | The denominator portion of reconnect retry progress, for example /5 in Reconnecting 1/5. |
| `streamError.serverOverloadedReconnecting` | Server is busy, reconnecting | none | Status shown while reconnecting after the server is overloaded. |
| `streamError.serverOverloadedReconnectingWithProgress` | Server is busy, reconnecting {progress} | none | Status shown while reconnecting after the server is overloaded. The values are the current retry attempt and maximum retry attempts. |
| `serverOverloaded.retry` | Retry | none | Button to retry a task after a model capacity error |
| `serverOverloaded.retryCountdown` | Retry in {seconds}s | none | Button to retry a task after a model capacity error, showing the number of seconds until it automatically retries |
| `historyLoadFailed` | Couldn't load earlier messages | none | Error shown when loading earlier conversation messages fails |
| `retryHistoryLoad` | Retry | none | Button to retry loading earlier conversation messages |
| `loadingTask` | Loading task… | none | Status shown above the composer while loading a task |
| `reconnectingToCodex` | Reconnecting to ChatGPT… | none | Status shown above the composer while reconnecting to the Codex app server |
| `usageLimit.upgrade` | You've hit your usage limit. Upgrade your plan to continue, or try again at {resetDate}. | none | Inline transcript usage-limit message prompting the user to upgrade. |
| `usageLimit.upgrade.noReset` | You've hit your usage limit. Upgrade your plan to continue, or try again later. | none | …without a known reset time. |
| `usageLimit.addCredits` | You've hit your usage limit. Add credits to continue, or try again at {resetDate}. | none | Inline transcript usage-limit message prompting the user to add credits. |
| `usageLimit.addCredits.noReset` | You've hit your usage limit. Add credits to continue, or try again later. | none | …without a known reset time. |
| `usageLimit.upgradeOrAddCredits` | You've hit your usage limit. Upgrade your plan or add credits to continue, or try again at {resetDate}. | none | Inline transcript usage-limit message prompting the user to upgrade or add credits. |
| `usageLimit.upgradeOrAddCredits.noReset` | You've hit your usage limit. Upgrade your plan or add credits to continue, or try again later. | none | …without a known reset time. |
| `usageLimit.retry` | You've hit your usage limit. Try again at {resetDate}. | none | Fallback inline transcript message shown when a user reaches a usage limit. |
| `usageLimit.retry.noReset` | You've hit your usage limit. Try again later. | none | …without a known reset time. |
| `usageLimit.workspaceMember` | You've hit your usage limit. Contact your workspace owner for more access. | none | Inline transcript message shown when a workspace member reaches a usage limit. |
| `usageLimit.workspaceOwner` | You've hit your usage limit. Review your workspace's usage settings to continue. | none | Inline transcript message shown when a workspace owner reaches a usage limit. |
| `usageLimitsReset` | Usage limits reset | none | Transcript divider marking when a Codex usage-limit reset was applied |
| `archived.title` | This task is archived | none | Title shown when a user opens a Codex task that has already been archived |
| `archived.description` | Unarchive this task to open it | none | Explanation that an archived Codex task must be restored before the user can open it |
| `archived.unarchive` | Unarchive and open | none | Button that restores an archived Codex task and opens the restored task |
| `archived.unarchiveError` | Could not unarchive this task | none | Error message shown when restoring an archived Codex task fails |
| `archived.restoringDescription` | Restoring this chat and its workspace… | none | Progress message while an archived task is being restored |
| `archived.restoredDescription` | This chat has been restored | none | Confirmation shown before leaving an archived task preview |
| `archived.previewDescription` | This chat is archived. To continue, unarchive it first | none | Explanation displayed beneath a read-only archived task preview |
| `archived.previewDone` | Done | none | Leaves Archive with the restored task selected |
| `archived.previewUnarchiveError` | Could not unarchive this task | none | Error shown when restoring an archived task from the transcript footer fails |
| `codex.archiveInfo.archived` | Archived chat | none | Toast title shown after archiving a chat or task |

The usage-limit message is selected from an action key rather than from a plan: upgrade, upgrade-or-add-credits, add-credits and retry, with the workspace member and owner forms outside that switch. Every action form has a paired no-reset string, and the reset-date form is used only when a reset date is known.

Neighbouring strings that are not this surface, recorded so a later search does not mistake them: a usage-limit label and a resets section in the reset-prompt modal, a voice-chat warning about approaching the limit, a usage-limited goal summary above the composer, and the archived-chat management strings in settings and the archive sidebar.

## Table 3. OMP event per state in Reeve

Read from the transcript components and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Model changed | none in the transcript. The composer model control shows a busy state while a switch is in flight | `model_change` entries are written by OMP and read back as the session's role-to-model record; after an explicit switch the hook reloads the canonical session. Nothing renders a transcript note |
| Model changed warning lines | none | no source |
| Model rerouted | none | no source. Reeve talks to providers directly; no reroute signal exists |
| Personality changed | none | no source. There is no personality concept |
| Compacting context (manual, running) | Composer compact control flips to "Stop compaction" and the button reports a running state | `compaction_start` (and the older `auto_compaction_start`) set the compacting flag; the manual compact is a blocking POST |
| Context compacted (manual, done) | Compaction card in the transcript: "Conversation compacted", then "The conversation history before this point was compacted into the following summary:", the summary body, and a disclosure listing modified and read files | The compaction entry in the session file, surfaced as a custom message; `compaction_end` clears the flag and carries an error message when it failed |
| Context automatically compacting / compacted | Same card and same flag; Reeve does not distinguish manual from automatic in the transcript | `compaction_start` / `compaction_end` and their legacy names, which do not say which triggered it |
| Optimizing / optimized the conversation | none | no source. There is no Work mode |
| Continued from chat | Sidebar only: a fork writes a new session file whose header names its parent, and the sidebar nests the child under it | The fork command's new session id. No transcript divider, and nothing navigates from the transcript to the source |
| Parent chat | none above the first message. Subagent activity is tracked for the composer | no source for the attachment |
| Reconnecting {n}/{max} | Composer retry status: "Retrying ({attempt}/{max})…" with the error message as detail | `auto_retry_start` carries the attempt and the maximum and the error message; `auto_retry_end` clears it. This is a provider-side retry of the turn, not a stream reconnect |
| Server is busy, reconnecting | none with that wording; a capacity error reaches the same retry status if OMP retries it | `auto_retry_start`, with no distinct overload state |
| Retry / Retry in {n}s | none. There is no per-turn retry button and no countdown | no source |
| Stream disconnect and recovery | Invisible. The event stream reconnects itself, and the hook re-opens it when the browser gives up, with a grace window and state reconciliation on visibility and network changes | Connection handling in the hook; the server sends no reconnect event and nothing is shown |
| Couldn't load earlier messages + Retry | none. The lazy-load affordance is "Scroll up to load earlier messages ({count} hidden)" and has no failure state | no source |
| Loading task… | none above the composer. Loading is silent | no source |
| Reconnecting to ChatGPT… | none | no source. Reeve's server is the same process, so there is no app-server connection to lose |
| Usage limit reached | none as a transcript message. A failed prompt raises a transient notice carrying the provider's own text | `prompt_error`, which is generic; no rate-limit shape is parsed |
| Usage limits reset | none | no source |
| This task is archived | none. Reeve has no archive; sessions are deleted instead | no source |
| Archived chat toast | none | no source |

## Parity checklist

**Matches**

- Both write a compaction note into the transcript and both keep the summary readable after reload.
- Both show that compaction is running and both let the user start it by hand.
- Both expose a retry attempt and its maximum while a turn is being retried, and both attach the underlying error to it.
- Both record a parent relationship for a forked conversation and let the user reach the parent, though Reeve does it from the sidebar rather than the transcript.

**Lacks**

- No model-change note. Reeve records the change and shows nothing in the transcript, so a session that switched model mid-run reads as one continuous conversation.
- No warning that changing model mid-conversation costs performance and may force a compaction.
- No reroute note, no personality note and no Work-mode optimization pair; none of these concepts exist.
- No distinction between manual and automatic compaction in the transcript, and no in-transcript running label, so a compaction in flight is visible only on the composer button.
- No continued-from divider and no parent-chat attachment inside the transcript.
- No stream-reconnect status. The reconnect is real but silent, so a stalled response looks like a slow one.
- No capacity-error treatment: no server-busy wording, no retry button, no countdown, no automatic retry at zero.
- No failure state for loading earlier messages, so a failed page is indistinguishable from an empty one.
- No status row above the composer while a session loads.
- No usage-limit message, no action-specific guidance, no reset date, and no usage-limits-reset divider.
- No archived state at all: no card, no unarchive action, no toast.

**Differs**

- Reeve's retry counter is a provider retry of the turn; the reference's counter is a reconnect of a dropped response stream. They look alike and mean different things.
- Reeve's compaction note is a card with a title, an explanation, the summary body and a file disclosure; the reference's is a one-line divider that names only the trigger.
- Reeve's retry status sits above the composer; the reference's reconnect status sits beside the interrupted response, in the transcript.
- Reeve's fork relationship lives in the sidebar tree; the reference puts it in the transcript as a clickable divider and, for a subagent, as an attachment above the first message.
- Reeve surfaces a usage failure as a transient notice that disappears; the reference writes it into the transcript where it stays.

## What only a live run can settle

- Whether the notes listed as persistent really survive a reload, and whether a compaction that is still running is re-rendered as running or as complete after a reload.
- The maximum reconnect attempt count the transcript shows, and how it relates to the main process's own connection backoff.
- The capacity-retry deadline: how many seconds the countdown starts from, and whether it restarts after a failed automatic retry.
- Whether the model-change warning tooltip opens on hover, on focus, or on press, and whether it is dismissible.
- Which action key the usage-limit message resolves to for a given account, and what a known reset date is formatted as.
- Whether the compaction row is shimmered in place, or replaced when it completes.
- Whether the archived card appears in place of the transcript or above it, and what the read-only preview looks like next to a live task.

