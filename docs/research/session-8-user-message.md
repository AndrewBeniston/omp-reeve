# Session 8. The user message and its edit and fork

Research for [#202](https://github.com/AndrewBeniston/omp-reeve/issues/202), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the user message block, its collapse rule, its action row, the edit editor, the fork destination dialog, the scheduled-task and automation trigger messages, and the queued message list with its drag reorder. Every value, threshold and order below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Carries the same string ids and the same shipped English defaults for the four named groups and for the user message group. It also carries the translated tables for the same ids. Nothing contradicts the extracted web bundle.
- **The extracted main-process build.** Searched for all four named groups, for the user message group and for the queued message group. No match. The user message, its edit action, its fork dialog and the queue are renderer-side only. The main process contributes nothing to this surface.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| User message, short | The message text fits the collapsed height | Measured content height is not more than the collapsed height plus 1 px, so the state is "uncollapsible" and no toggle renders |
| User message, truncated | The message text is taller than the collapsed height | Collapsed line count 2 for the transcript user message, measured against a fallback font size of 13 px. A Show more toggle renders below the text |
| User message, expanded | The user opened a truncated message | The toggle switches to Show less and reports the expanded state to assistive technology |
| Empty user message | The message has no displayable text | A placeholder line replaces the body |
| Action row | The pointer hovers the message, or focus enters it | The row is transparent until hover or focus. It holds the sent time, then the copy, edit and extra actions. A compact variant reduces the same row |
| Copy confirmed | The user copied the message | The copy control changes its accessible label after the copy |
| Edit mode | The user started an edit on the previous user message | The edit control replaces the body with an editor. The editor has its own placeholder and accessible label, a Send button and a Cancel button |
| Edit failed | The edit submission failed | A toast reports the failure. The message stays in the transcript |
| Image attachment | The message carries an image | A preview renders with alt text. A failed image renders a failure alt text and a short visible label |
| Appshot attachment | The message carries a screen capture from the app | Its own alt text |
| Unavailable file attachment | A file came from an external chat and is not available here | A pill renders the file name with an unavailable suffix |
| Pasted text attachment | A large paste is attached | Shown in the queued message summary as a pasted-text label, with a count when several exist |
| Mode and origin chips | The message started a special run | Separate chips for review mode, pull request fix, auto resolve conflicts, pull request merge task, merge conflicts, failing checks, inline comment count, references to a prior conversation and a thread goal |
| Hook states | A hook acted on the message | One status for a blocked message and one status for feedback fed back into the turn |
| Fork from here, entry | The user opens the fork action on an earlier message | An action on the message row with its own accessible label |
| Fork from here, dialog | The fork action opened | One dialog title and two destination rows. The labels change with the context: a workspace pair outside a worktree, and a same-worktree pair inside one |
| Fork blocked | The project is not a Git repository | The new-worktree option is disabled and a reason replaces its description |
| Scheduled task trigger | A scheduled task started this turn | A label above a user-message-style row. Opening it adds a right panel tab with its own title |
| Automation origin | An automation run starts | A label above the starting instructions, with the automation name |
| Delegation origin | Another task sent this message through an app | A label naming the app |
| Queued message list | One or more follow-ups wait under the active turn | A row for each queued message, in send order, with a drag handle, a steer control, a delete control and an actions menu |
| Queue paused | The user interrupted the running turn | A header above the list and a Resume control |
| Queued message failed | A queued message could not be sent | Two tooltips: the failure and the remedy. A Retry control renders on the row |
| Paused queue submit dialog | The user sends a new message while the queue is paused | A dialog with a count, a clear action and a send action |
| Steering | The user applies a follow-up to the running turn | A steer control on the queued row, a composer command, and a setting that chooses the default follow-up behaviour |

**Collapse rule.** The block measures the rendered text. When the content height is not more than the collapsed height plus 1 px, the block is uncollapsible and no toggle renders. The transcript user message uses a collapsed line count of 2. Other blocks in the same bundle use 3 and 20, so the value is per call site.

**Queue order and reorder.** The list renders in queue order. Reorder uses a pointer drag limited to the vertical axis and to the parent element. The drop moves the dragged id from its index to the target index. A drop on the same row makes no change.

**Follow-up behaviour.** A setting chooses between queue and steer for a message sent during a run. A named shortcut applies the opposite behaviour for one message. The queued row menu also switches the default.

## Table 2. Shipped strings per state

Defaults are the shipped English source text.

### The four named groups

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| localConversation.forkFromOlderTurnDialog.title | Fork chat from here | none | Title for the destination dialog shown when forking from an earlier message |
| localConversation.forkFromOlderTurnDialog.local.label | Fork in this worktree | none | Button label for forking from an earlier message in the current worktree |
| localConversation.forkFromOlderTurnDialog.local.workspaceLabel | Fork in this workspace | none | Button label for forking from an earlier message in the current workspace |
| localConversation.forkFromOlderTurnDialog.local.description | Fork from this message in the current workspace | none | Description for forking from an earlier message in the current workspace |
| localConversation.forkFromOlderTurnDialog.local.sameWorktreeDescription | Fork from this message in the same worktree | none | Description for forking from an earlier message in the current worktree |
| localConversation.forkFromOlderTurnDialog.worktree.label | Fork in a new worktree | none | Button label for forking from an earlier message in a new worktree |
| localConversation.forkFromOlderTurnDialog.worktree.description | Fork from this message in a new worktree | none | Description for forking from an earlier message in a new worktree |
| localConversation.heartbeatUserMessage.automation | Sent by scheduled task | none | Label shown above a user-message-style scheduled task trigger |
| localConversation.heartbeatUserMessage.automationTabTitle | Scheduled task | none | Right panel tab title for a scheduled task opened from a trigger message |
| localConversation.automationUserMessage.origin | Automation: {title} | none | Label above the starting instructions for an automation run. The title is the name of the automation. |
| localConversation.automation.newTabTitle | New scheduled task | none | Right panel tab title for a scheduled task created from a task |

The fork dialog also uses one neighbouring string for the blocked state: "A Git repository is required to fork in a new worktree". Its description names the same case. The fork entry point on a message carries the same visible text as the dialog title, with the description "Aria label for the button that forks the chat from an assistant message".

### The user message group

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| codex.userMessage.showMore | Show more | none | Button label for expanding a truncated user message |
| codex.userMessage.showLess | Show less | none | Button label for collapsing an expanded user message |
| codex.userMessage.noContent | (No content) | none | Text for when a user message has no content |
| codex.userMessage.copyAriaLabel | Copy message | none | Aria label for the button that copies the user's message |
| codex.userMessage.copiedAriaLabel | Copied | none | Aria label for the copy button after the content has been copied |
| codex.userMessage.editAriaLabel | Edit message | none | Aria label for the button that edits the previous user message |
| codex.userMessage.editPlaceholder | Edit message | none | Placeholder shown in the editor used to edit a previous user message |
| codex.userMessage.editTextareaAriaLabel | Edit message | none | Aria label for the editor used to edit the previous user message |
| codex.userMessage.sendEditedMessage | Send | none | Button label for submitting an edited user message |
| codex.userMessage.cancelEditMessage | Cancel | none | Button label for canceling an edited user message |
| localConversation.editLastMessageFailed | Failed to edit message | none | Toast shown when editing the previous user message fails |
| codex.userMessage.goal | Sent as goal | none | Status shown below a user message when the user set a thread goal |
| codex.userMessage.hookBlocked | Hook blocked this message | none | Status link shown below a user message that was blocked before it entered the conversation |
| codex.userMessage.hookFeedback | Hook feedback | none | Status shown below a user message when a Stop hook fed a follow-up prompt back into the turn |
| codex.userMessage.implementPlan | Yes, implement this plan | none | Display text for the synthetic implement-plan follow-up prompt |
| codex.userMessage.priorConversation | References prior conversation | none | Text for the prior conversation button |
| codex.userMessage.reviewMode | Review mode | none | Chip shown when a user asked for a code review |
| codex.userMessage.pullRequestFixMode | PR fix | none | Chip shown when the user started a pull request CI fix task |
| codex.userMessage.autoResolveSync | Auto resolve conflicts | none | Chip shown when the user requested auto resolve for handoff conflicts |
| codex.userMessage.commentCount | {count, plural, one {# comment} other {# comments}} | plural on count | Chip shown when the user included inline diff comments in the prompt |
| codex.userMessage.pullRequestMergeTask | PR #{number} | none | Pill shown on a user message for a pull request merge task |
| codex.userMessage.pullRequestMergeConflictAttachment | Merge conflicts - PR #{number} | none | Pill shown on a user message for attached pull request merge conflicts |
| codex.userMessage.pullRequestMergeConflictAttachmentWithoutNumber | Merge conflicts | none | Pill shown on a user message for attached pull request merge conflicts without a pull request number |
| codex.userMessage.pullRequestChecksAttachment | {checkName} +{count} more | none | Pill shown on a user message for multiple attached failing pull request checks |
| codex.userMessage.unavailableFileAttachment | {fileName} (unavailable) | none | Attachment pill for a file sent from an external chat that could not be made available in this conversation |
| codex.localConversation.userImageAttachment | User attachment | none | Alt text for user image attachment in local conversation |
| codex.localConversation.userImageAttachmentFailed | Image failed to load | none | Alt text for a user image attachment that could not be loaded |
| codex.localConversation.userImageAttachmentFailedShort | Failed | none | Short visible text for a user image attachment that could not be loaded |
| codex.localConversation.userAppshotAttachment | Appshot attachment | none | Alt text for appshot attachment in local conversation |
| localConversation.codexDelegationUserMessage.app | Sent by {appName} from another task | none | Label above a message sent by an app from another task |

### The queued message list and the paused queue

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| composer.queuedMessage.interruptedQueue | Queue paused because you interrupted | none | Header shown above queued messages paused because the user interrupted the running turn |
| composer.queuedMessage.resumeInterruptedQueue | Resume | none | Button label to resume queued messages paused by an interruption |
| composer.queuedMessage.sendNow | Steer | none | Button label for applying a queued follow-up to the active run immediately instead of waiting in the queue |
| composer.queuedMessage.sendNowTooltip | Submit without interrupting the model | none | Primary tooltip text for steering with a queued follow-up without interrupting the current model run |
| composer.queuedMessage.delete | Delete queued message | none | Aria label for deleting a queued message |
| composer.queuedMessage.more | Queued message actions | none | Aria label for the queued message row actions menu |
| composer.queuedMessage.edit | Edit message | none | Menu item to edit a queued message |
| composer.queuedMessage.openInSideChat | Open in side chat | none | Menu item to start a queued message as a side chat |
| composer.queuedMessage.turnOff | Turn off queueing | none | Menu item to switch the default follow up behavior to steer |
| composer.queuedMessage.turnOn | Turn on queueing | none | Menu item to switch the default follow up behavior to queue |
| composer.queuedMessage.retry | Retry | none | Button label to retry a queued follow-up that failed to send |
| composer.queuedMessage.retryTooltip | Try sending this queued message again | none | Primary tooltip text for retrying a queued follow-up that failed to send |
| composer.queuedMessage.retryTooltipRemedy | Edit or delete it if retry keeps failing | none | Secondary tooltip text explaining alternatives when retrying keeps failing |
| composer.queuedMessage.pausedTooltip | This queued message could not be sent | none | Primary tooltip text for a queued message that failed to send |
| composer.queuedMessage.pausedTooltipRemedy | Retry, edit, or delete it to continue the queue | none | Secondary tooltip text explaining how to resolve a queued message that failed to send |
| composer.queuedMessage.imagePreview | Image attachment | none | Accessible label for the image preview in a queued message |
| composer.queuedMessage.imageAttachments | {count, plural, one {# image} other {# images}} | plural on count | Summary shown for a queued message with image attachments and no displayable text |
| composer.queuedMessage.pastedTextAttachment | Pasted text | none | Summary shown for an attached large text paste without displayable text |
| composer.queuedMessage.additionalPastedTextAttachments | {preview} (+{remainingCount, plural, one {# more pasted text attachment} other {# more pasted text attachments}}) | plural on remainingCount | Summary shown for a queued message with multiple attached large text pastes |
| composer.queuedMessage.pullRequestActions | {count, plural, one {Pull latest} other {# Pull latest actions}} · {targets}{hasText, select, true { — {text}} other {}} | plural on count, select on hasText | Queued pull request update actions, optionally followed by the user's message |
| composer.pausedQueueSubmit.title | Send message? | none | Title shown when sending a message while the queue is paused after an interruption |
| composer.pausedQueueSubmit.description | You are about to send a message. Do you want to clear the {count, plural, one {# message} other {# messages}} previously queued? | plural on count | Description asking whether to clear paused queued messages before sending a new message |
| composer.pausedQueueSubmit.clear | Clear queue | none | Button to clear the paused queue and send the new message |
| composer.pausedQueueSubmit.send | Send message | none | Button to send a new message and resume the paused queue |
| appUndo.queuedMessageDeleted | Queued message restored | none | Toast shown after undo restores a deleted message to the message queue |
| appUndo.queuedMessageEdited | Queued message restored | none | Toast shown after undo returns an edited message to the message queue |
| settings.general.followUpQueueMode.label | Follow-up behavior | none | Label for a setting that chooses how a follow-up message sent during an active run is handled |
| settings.general.followUpQueueMode.queue | Queue | none | Option label for holding a follow-up message until the active run finishes |
| settings.general.followUpQueueMode.interrupt | Steer | none | Option label for applying a follow-up message to the active run instead of queuing it |
| settings.general.followUpQueueMode.description | Queue follow-ups while {appName} runs or steer the current run. Press {invertFollowUpShortcutLabel} to do the opposite for one message | none | Explains the two behaviours and the shortcut that chooses the other one |

## Table 3. OMP or Reeve source per state

Read from the transcript components, the composer and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP or Reeve source |
|---|---|---|
| User message, short | User message view renders text blocks and image blocks | Session file user entries, and the message_start and message_update events for the live turn |
| User message, truncated and expanded | none | no source. Reeve renders the whole user message. There is no collapsed line count and no Show more control |
| Empty user message | none | no source. An empty message renders as an empty body |
| Action row | Message turn action row: copy, edit from here, new session, with a timestamp | Local component state. The row uses the same hover and focus pattern |
| Copy confirmed | Copy control with one label | no source for the confirmed label |
| Edit mode | Edit from here. It moves the branch pointer to the previous assistant entry, then puts the old text back in the composer | navigate_tree command, then local composer state. There is no in-place editor on the message |
| Edit failed | none | no source. The navigate command failure is swallowed |
| Image attachment | Image blocks render inline from base64 data or a URL | Session file image content blocks |
| Appshot attachment | none | no source |
| Unavailable file attachment | none | no source |
| Pasted text attachment | none in the transcript. The queue rows carry text only | no source |
| Mode and origin chips | none | no source. Reeve has no review mode, pull request fix, goal or hook chips on the message |
| Hook states | none on the message | no source |
| Fork from here, entry | New session control on the user message row | fork command through the agent API. The wrapper is destroyed after the fork, so the next request reloads the original session |
| Fork from here, dialog | none. The fork starts at once with no destination choice | no source. Worktrees exist in Reeve through the worktree API, but the fork does not offer them |
| Fork blocked | none | no source |
| Scheduled task trigger | none | no source. Reeve has no scheduled tasks |
| Automation origin | none | no source |
| Delegation origin | none | no source |
| Queued message list | Queued message list with drag reorder, delete, steer and an actions menu | queue_update event, and the reorder_queue_items, delete_queue_item, undo_delete_queue_item and send_queue_item_now commands |
| Queue paused | Paused header and a Resume control | queue_update event and the resume_queue command |
| Queued message failed | none. There is no failed row, no retry and no failure tooltip | no source |
| Paused queue submit dialog | Paused queue submit dialog with the same title, description, clear and send actions | resolve_paused_queue_submission command |
| Queued message edit | Menu item that opens the queued text for edit | begin_queue_edit, cancel_queue_edit and complete_queue_edit commands |
| Open in side chat | none | no source |
| Steering | Steer control on the queued row, and a composer mode that chooses steer or follow-up | steer command, and the follow-up behaviour stored in the browser |
| Queueing on and off | Menu items that switch the default | Local setting in the browser, not a server setting |

## Parity checklist

**Matches**

- The queued message list matches closely. Reeve ships the same header, resume, steer, delete, actions, edit, queue on and queue off text, the same image label and the same reorder model.
- The paused queue dialog matches: same title, same description shape with a count, same clear and send actions.
- Both offer steer and queue as the two follow-up behaviours, and both let the user switch the default.
- Both show a user message bubble with inline images and an action row that appears on hover or focus.
- Both offer copy and fork on the user message.
- Both report a deleted queued message and allow an undo.

**Lacks**

- No message truncation. Reeve has no collapsed line count, no Show more and no Show less.
- No in-place edit. The reference edits the previous user message in an editor with Send and Cancel. Reeve moves the branch pointer and refills the composer instead.
- No edit failure toast.
- No fork destination dialog. Reeve forks at once, with no workspace or worktree choice and no Git repository check.
- No scheduled task trigger message, no automation origin label and no delegation origin label.
- No attachment states beyond images. There is no appshot, no unavailable file pill and no pasted text attachment.
- No chips for review mode, pull request fix, auto resolve conflicts, pull request pills, comment count, prior conversation or thread goal.
- No hook blocked or hook feedback status.
- No failed queued message state, so no retry control and no failure tooltips.
- No empty message placeholder.
- No open in side chat action.

**Differs**

- The reference "Edit message" edits the message in place and resends it. Reeve's "Edit from here" branches inside the session and returns the text to the composer.
- The reference fork asks where to fork. Reeve forks to a new session file at once.
- The reference stores the follow-up behaviour in application settings. Reeve stores it in the browser.
- The reference marks scheduled and automated turns above the message. Reeve renders every user message the same way.
- The reference truncates a long user message to two lines. Reeve renders it in full.

## What only a live run can settle

- Whether the edit control appears on every user message or only on the most recent one. The shipped descriptions say "the previous user message", and the render path gates the control, but the gate value is not readable from the bundle.
- Whether an edited message replaces the turn in place or starts a new branch in the transcript.
- Whether the fork dialog shows two rows or three in a worktree, and which row is the default.
- The exact pixel height of the collapsed user message at the shipped font size, and whether an image or a chip counts toward the collapse measurement.
- Whether a failed queued message blocks the rest of the queue until the user retries, edits or deletes it.
- Whether the scheduled task label and the automation label can appear on the same message.
- How the queue behaves when the run ends while a drag is in progress.

