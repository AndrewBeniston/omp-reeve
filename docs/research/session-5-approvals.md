# Session 5. Approvals and requests for input

Research for [#199](https://github.com/AndrewBeniston/omp-reeve/issues/199), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries every approval, permission, option-picker, plan and elicitation string with its shipped English default and description, the approval card's control order and its keyboard chords, the auto-review nudge card, the auto-review denial detail and the option-picker footer. Every control order, chord and shipped default below comes from here unless stated otherwise.
- **The extracted main-process build.** Carries the request broker: the request method names, the listener sets for approval requests, approval resolutions and user-input requests, the elicitation request list, the automatic-review item with its status and its start and completion timestamps, the synthetic interruption item, and the rule that decides which pending request the composer shows. Cited wherever a request type, a status name or an ordering rule appears.
- **The installed application** (version 26.908.40834). Confirms the same shipped English defaults for the approval card, the interruption warning and the option picker, and carries the translated tables for the same ids. Nothing contradicts the extracted bundle.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Command approval | The agent wants to run a command | Request method for a command-execution approval (main-process build) |
| Command approval, details hidden | The same request when the command preview is withheld | Identity label switches from the terminal label to the ask-permission label |
| Network approval | The agent wants to reach a host that is not on the current allowlist | Same approval card with the network identity label and the destination prompt |
| File change approval | The agent wants to edit, create, move or delete files | Request method for a file-change approval. A file-change request that only deletes files does not raise the composer approval state; it stays behind the tool row |
| Permission approval | The agent asks for view, edit, view-and-edit or network permission | Request method for a permissions approval |
| MCP tool approval | A connector tool call needs consent | Per-tool approval string chosen by connector and tool name, with a generic connector fallback and an elevated-risk header variant |
| Awaiting approval (transcript) | The turn is parked on any of the above | Transcript status row under the item |
| Auto-review in progress | A reviewer agent is judging an action before it runs | Automatic-review item with status in progress; the item records a start timestamp |
| Auto-review approved | The reviewer allowed the action | Item status approved; a completion timestamp is written |
| Auto-review denied | The reviewer refused the action | Item status denied; the denial detail is attached to the item |
| Auto-review denied, high risk | The refusal was for a high-risk action | Denial with the high-risk explanation |
| Auto-review timed out | The reviewer did not finish before the action was due | Item status timed out |
| Auto-review stopped | The review was aborted before the action ran | Item status aborted |
| Auto-review denial detail | Shown inside the denied item | Terminal output and footer first, then the why-it-was-denied heading with the reviewer's rationale (or the no-rationale fallback), then the approve control, which is omitted once approval has been recorded |
| Auto-review nudge | Offered after several manual approvals | A flag computed outside the nudge card; the count that triggers it is not resolvable from the bundle |
| Turn ended by Auto-review | Too many denials in one turn | The main process appends a synthetic interruption item when the interruption kind is too-many-denials; a guidance tooltip carries the next steps |
| Denied-action count | A denial happened earlier in the turn | Recorded per turn and surfaced on the turn divider (measured in session 1) |
| Request for user input | The agent asks one or more questions | Request method for a tool-driven user-input request |
| Option picker | The agent offers a short list of answers | Option-picker pending state, ahead of every approval in the ordering rule |
| Plan summary | A plan exists for the turn | Plan summary card: a title, a writing title while the plan streams, expand and collapse, download, and open in a side panel |
| Implement this plan? | A plan implementation request is open and not completed | The last plan-implementation item in the turn is incomplete. The card reuses the option picker with one option and a free-form field |
| MCP server elicitation | A connector asks the user for structured data | Elicitation request that has not completed; a form with continue and skip, per-field validation, and a server-name fallback |
| MCP elicitation outcome | After the user answers | One of accepted, declined, cancelled, completed, completed request, requested permission, plugin installed, or the app did not install the plugin |

**Which request wins.** One pending request is shown at a time. The main-process build resolves it in this order: user input (including onboarding), then option picker, then a setup step, then an incomplete user-input response, then approval (a command execution, or a file change that is not purely a delete), then permission request, then MCP server elicitation, then implement-plan; an elicitation is the fallback when nothing else matches.

**Approval card layout and order.** Header content, then the title, then the subtitle, then a labelled reason section, then details, then the body, then the action row. The action row is: an optional leading scope action (always allow, allow similar commands, or allow all edits), then deny, then the approve control. The approve control is a plain primary button when there is no scope choice, and a split button with an approval-options dropdown when there is one. The approve button takes focus automatically when hotkeys are available.

**Chords.** Approve is bound to Enter and deny to Escape; both are registered as application-scope commands named in the shortcut settings as approve request and decline request, so a user can rebind them. Both chords are suppressed while focus sits in an input, a textarea or an editable region. Decline is additionally suppressed inside a dialog or a menu, and approve is additionally suppressed on Enter over a button or a link and on Space over a button, so an activated control is not double-fired. The chord glyph is rendered beside the approve and deny labels and is hidden at the card's narrow width.

**After the answer.** The card is removed and the underlying item continues in the transcript: a command runs and shows its output and exit footer, a file change shows its diff, a connector tool call proceeds. While the card is open the transcript shows the awaiting-approval status; a settings write shows a waiting-for-approval label instead. An auto-review denial stays in the transcript permanently, with its rationale, and approving it records approval for one retry without running the action. The denied-action count for the turn is historical: approving a retry does not decrease it.

**Option picker layout.** The options row, then an optional free-form field with the something-else placeholder that submits on Enter, then a footer with skip as a ghost control and submit as the primary control carrying the Enter glyph. A dismiss control has its own accessible label.

**Implement-plan card.** One question, the prompt asking whether to implement the plan, one option labelled as implementing it, and the free-form field enabled. Submitting sends a synthetic user message with the same wording. Escape dismisses the plan: it restores the default collaboration mode for the next turn and removes the plan-implementation request, and a toast reports a failure to dismiss. A separate error covers a failed load or save of an edited plan.

**Auto-review nudge card.** Title, then the description with an inline learn-more link, then a footer with keep-manual-approvals as an outline control and the enable control as the primary submit, focused automatically and carrying the Enter glyph. Enabling switches the conversation's agent mode and records the preference; a failure raises a toast. Keeping manual approvals dismisses the offer permanently.

## Table 2. Shipped strings per state

Defaults are the shipped English source text. Grouped by the string namespace each id sits in.

### Approval card

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `approvalRequestCard.allowOnce` | Allow once | none | Primary action label for approving a request once |
| `approvalRequestCard.allowConversation` | Allow this conversation | none | Button label for approving a request for the current conversation |
| `approvalRequestCard.alwaysAllow` | Always allow | none | Button label for always approving matching requests |
| `approvalRequestCard.approvalOptions` | Approval options | none | Accessible label for opening approval scope options |
| `approvalRequestCard.deny` | Deny | none | Button label for denying an approval request |
| `approvalRequestCard.reasonLabel` | Reason | none | Section label for the reason shown in approval requests |
| `localConversation.approvalRequest.inProgress` | Awaiting approval | none | Label shown while the assistant is waiting for approval |
| `localConversation.settingsToolCall.write.waitingForApproval` | Waiting for approval | none | Shown on a settings write that is parked on approval |
| `codex.command.approval.approve` | Approve request | none | Shortcut settings row for approving the active request |
| `codex.command.approval.decline` | Decline request | none | Shortcut settings row for declining the active request |

### Command and network approval

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `execApprovalRequest.prompt` | Allow ChatGPT to run this command? | none | Prompt shown when approving a command execution |
| `execApprovalRequest.prompt.actor` | Do you want {actor} to run this command? | none | Prompt shown when approving a command execution for a child agent |
| `execApprovalRequest.shellLabel` | Terminal | none | Terminal identity label shown above a command approval prompt |
| `execApprovalRequest.permissionLabel` | Ask permission | none | Identity label shown above a command approval prompt when request details are hidden |
| `execApprovalRequest.allowSimilarCommands` | Allow similar commands | none | Button label for approving similar commands for the current conversation |
| `execApprovalRequest.allowConversation.commandPrefixInfo` | Allow commands that start with {command} for this conversation | none | Tooltip explaining the command prefix covered by the conversation-scoped approval action |
| `execApprovalRequest.networkLabel` | Internet access | none | Identity label shown above a network approval prompt |
| `execApprovalRequest.network.prompt.chatgpt` | Allow ChatGPT to connect to {destination}? | none | Prompt shown when approving managed network access |
| `execApprovalRequest.network.prompt.actor.destination` | Allow {actor} to connect to {destination}? | none | Prompt shown when approving managed network access for a child agent |
| `execApprovalRequest.network.reason.compact` | {host} isn't on the current network allowlist | none | Reason shown below a managed network approval prompt |
| `pendingRequest.approvalExec.expand` | Expand | none | Button label to expand a long approval command preview |
| `pendingRequest.approvalExec.collapse` | Collapse | none | Button label to collapse a long approval command preview |

### File change approval

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `patchApprovalRequest.prompt.chatgpt.files` | Allow ChatGPT to edit {count, plural, one {the following file} other {the following files}}? | plural on count | Prompt shown when approving edits to one or more files |
| `patchApprovalRequest.prompt.actor.files` | Allow {actor} to edit {count, plural, one {the following file} other {the following files}}? | plural on count | Prompt shown when approving edits by a child agent to one or more files |
| `patchApprovalRequest.fileEditsLabel` | Edit files | none | File edit identity label shown above a patch approval prompt |
| `patchApprovalRequest.fileMoveLabel` | {sourcePath} to {targetPath}, joined by an arrow glyph | none | Label showing the source and target paths of a file move awaiting approval |
| `patchApprovalRequest.allowAllEdits` | Allow all edits | none | Button label for approving all file edits for the current conversation |
| `patchApprovalRequest.allowAllEdits.info` | Allow this and future file edits in this conversation without asking again | none | Tooltip explaining the conversation-wide file edit approval action |

### Permission approval

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `permissionRequest.title` | Allow ChatGPT to {actions}? | none | Title asking whether to grant requested permissions |
| `permissionRequest.title.actor.actions` | Allow {actor} to {actions}? | none | Title asking whether to grant permissions requested by a child agent |
| `permissionRequest.title.view.chatgpt` | Allow ChatGPT to view the contents of {paths}? | none | Title asking whether ChatGPT may view requested paths |
| `permissionRequest.title.edit.chatgpt` | Allow ChatGPT to edit the contents of {paths}? | none | Title asking whether ChatGPT may edit requested paths |
| `permissionRequest.title.viewAndEdit.chatgpt` | Allow ChatGPT to view and edit the contents of {paths}? | none | Title asking whether ChatGPT may view and edit requested paths |
| `permissionRequest.title.network.chatgpt` | Allow ChatGPT to connect to the internet? | none | Title asking whether ChatGPT may connect to the internet |
| `permissionRequest.title.view.actor`, `permissionRequest.title.edit.actor`, `permissionRequest.title.viewAndEdit.actor`, `permissionRequest.title.network.actor` | The same four titles with {actor} in place of ChatGPT | none | Titles asking whether a child agent may do the same |
| `permissionRequest.action.view` | view the contents of {paths} | none | Standalone action describing permission to view requested paths |
| `permissionRequest.action.edit` | edit the contents of {paths} | none | Standalone action describing permission to edit requested paths |
| `permissionRequest.action.viewAndEdit` | view and edit the contents of {paths} | none | Standalone action describing permission to view and edit requested paths |
| `permissionRequest.action.network` | connect to the internet | none | Standalone action describing permission to connect to the internet |
| `permissionRequest.permissionsLabel` | Permissions | none | Identity label shown above a filesystem permission prompt |
| `permissionRequest.internet.label` | Internet access | none | Identity label shown above an internet permission prompt |

### Automatic approval review

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.automaticApprovalReview.title.inProgress` | Auto-reviewing | none | Primary title shown while an automatic approval review is in progress |
| `localConversation.automaticApprovalReview.title.approved` | Auto-review approved | none | Primary title shown when an automatic approval review approves an action |
| `localConversation.automaticApprovalReview.title.denied` | Auto-review denied | none | Primary title shown when an automatic approval review denies an action |
| `localConversation.automaticApprovalReview.title.deniedHighRisk` | Auto-review denied high risk | none | Primary title shown when an automatic approval review denies a high-risk action |
| `localConversation.automaticApprovalReview.title.timedOut` | Auto-review timed out | none | Primary title shown when an automatic approval review times out |
| `localConversation.automaticApprovalReview.title.aborted` | Auto-review stopped | none | Primary title shown when an automatic approval review is aborted |
| `localConversation.automaticApprovalReview.summary.inProgress` | A carefully prompted reviewer agent is reviewing this request before ChatGPT runs it | none | Fallback summary shown while an automatic approval review is in progress |
| `localConversation.automaticApprovalReview.summary.completed` | A carefully prompted reviewer agent reviewed this request. | none | Fallback summary shown when an automatic approval review completes without a rationale |
| `localConversation.automaticApprovalReview.summary.timedOut` | A carefully prompted reviewer agent timed out before ChatGPT ran this request | none | Fallback summary shown when an automatic approval review times out before the action runs |
| `localConversation.automaticApprovalReview.summary.aborted` | A carefully prompted reviewer agent stopped reviewing this request before ChatGPT ran it | none | Fallback summary shown when an automatic approval review is aborted before the action runs |
| `localConversation.automaticApprovalReview.approve` | Approve | none | Action that approves one retry of a command declined by auto-review |
| `localConversation.automaticApprovalReview.approving` | Approving, with an ellipsis | none | Temporary action label shown while approving one retry of an auto-review denial |
| `localConversation.automaticApprovalReview.explicitAuthorization` | Requires explicit authorization | none | Explanation shown for a tool call that automatic review declined |
| `localConversation.automaticApprovalReview.explicitAuthorizationHighRisk` | Requires explicit authorization because this action is considered high risk | none | Explanation shown for a tool call that automatic review declined because the action was considered high risk |
| `localConversation.automaticApprovalReview.actionSummary.request` | Request | none | Fallback action summary shown when an automatic approval review has no action payload |
| `localConversation.automaticApprovalReview.actionSummary.editingFile` | Editing {file} | none | Action summary shown when auto-review is evaluating an edit to one file |
| `localConversation.automaticApprovalReview.actionSummary.editingFiles` | Editing {fileCount, plural, one {a file} other {# files}} | plural on fileCount | Action summary shown when auto-review is evaluating edits to multiple files |
| `localConversation.automaticApprovalReview.actionSummary.mcpToolCall` | MCP {toolName} on {connector} | none | Action summary shown when auto-review is evaluating an MCP tool call |
| `localConversation.automaticApprovalReview.actionSummary.networkAccess` | Network access to {target} | none | Action summary shown when auto-review is evaluating a network access request |
| `localConversation.automaticApprovalReview.actionSummary.permissionRequest` | Permission request | none | Action summary shown when auto-review is evaluating a permission request without a reason |
| `localConversation.automaticApprovalReview.actionSummary.permissionRequestWithReason` | Permission request: {reason} | none | Action summary shown when auto-review is evaluating a permission request with a reason |
| `localConversation.automaticApprovalReview.actionSummary.writeStdin` | Send input to process {processId}: {stdin} | none | Action summary for an automatic review of input sent to an existing terminal process |

### Auto-review denial, interruption and nudge

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.autoReviewDenial.whyDenied` | Why it was denied | none | Heading above the reviewer's explanation for declining a command |
| `localConversation.autoReviewDenial.noRationale` | No denial reason was provided | none | Fallback when the automatic review declined an action without providing an explanation |
| `localConversation.autoReviewDenial.whatApprovalAllows` | What approval allows | none | Heading above the scope of a user's approval of an action declined by automatic review |
| `localConversation.autoReviewDenial.approvalEffect` | Records approval for this action and allows one retry. It does not run it. | none | Explains beside the Approve action that approval authorizes one retry of the denied action but does not execute it |
| `localConversation.autoReviewInterruptionWarning` | Turn ended by Auto-review | none | Synthetic divider shown when auto-review short-circuits a turn after too many denials |
| `localConversation.autoReviewInterruptionWarning.nextSteps` | Auto-review stopped this turn after repeated denials. Add more context or choose a different permission mode to continue. | none | Guidance tooltip shown after the auto-review interruption warning inline status |
| `approvalRequest.autoReviewNudge.title` | Want fewer approval prompts? | none | Title for the Auto-review offer shown after several manual approvals |
| `approvalRequest.autoReviewNudge.description` | ChatGPT can automatically approve eligible actions while it works. This may use more credits. Learn more, as an inline link. | none | Description for the Auto-review offer shown after several manual approvals |
| `approvalRequest.autoReviewNudge.enable` | Approve for me | none | Action that enables Auto-review, where ChatGPT reviews requests to run commands with additional access and asks the user only about potentially unsafe actions |
| `approvalRequest.autoReviewNudge.keepManual` | Keep manual approvals | none | Action to keep manual approvals and permanently dismiss the Auto-review offer |
| `approvalRequest.autoReviewNudge.enableFailed` | Could not enable Auto-review, with a dash and try again | none | Toast shown when enabling Auto-review from an approval request fails |

Two related turn-divider strings, `localConversation.deniedActionsCount` and `localConversation.deniedActionsTooltip`, are recorded in the session 1 document and belong to the divider, not to this surface.

### Request for user input and option picker

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.userInputRequest.inProgress` | Asking {count, plural, one {question} other {questions}} | plural on count | Label shown while the assistant is waiting for user input |
| `localConversation.userInputRequest.completed` | Asked {count, plural, one {# question} other {# questions}}, with the label and the count in separate tagged spans | plural on count | Summary shown for a completed request_user_input item with its question count |
| `localConversation.userInputRequest.noAnswer` | No answer provided | none | Placeholder shown when a user input question has no answer |
| `optionPickerRequest.submit` | Submit | none | Submit button label for an option picker request |
| `optionPickerRequest.skip` | Skip | none | Skip button label for an option picker request |
| `optionPickerRequest.freeformPlaceholder` | Something else | none | Placeholder for the option picker custom answer input |
| `optionPickerRequest.dismiss.ariaLabel` | Dismiss | none | Accessible label for dismissing an option picker request |

### Plan summary and implement plan

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.planSummary.title` | Plan | none | Title for the plan summary card header |
| `localConversation.planSummary.titleWriting` | Writing plan | none | Title for the plan summary card header while the plan is still being written |
| `localConversation.planSummary.viewPlan` | Expand plan | none | Button label to expand a collapsed plan summary |
| `localConversation.planSummary.expand` | Expand plan summary | none | Aria label for button that expands a collapsed plan summary |
| `localConversation.planSummary.expandTooltip` | Expand | none | Tooltip text for button that expands a collapsed plan summary |
| `localConversation.planSummary.collapse` | Collapse plan summary | none | Aria label for button that collapses the plan summary content |
| `localConversation.planSummary.collapseTooltip` | Collapse | none | Tooltip text for button that collapses the plan summary content |
| `localConversation.planSummary.download` | Download plan | none | Tooltip text for button that downloads the plan markdown |
| `localConversation.planSummary.openInSidePanel` | Open plan in side panel | none | Tooltip text for button that opens the plan in the side panel |
| `localConversation.planSummary.closeSidePanel` | Close plan side panel | none | Accessible label for the collapsed plan card that closes the plan side panel |
| `implementPlanRequest.prompt` | Implement this plan? | none | Prompt shown when approving execution of a completed plan |
| `implementPlanRequest.option.implement` | Yes, implement this plan | none | Option label to implement the plan immediately |
| `codex.userMessage.implementPlan` | Yes, implement this plan | none | Display text for the synthetic implement-plan follow-up prompt |
| `avatarOverlay.waitingRequest.implementPlan` | Implement plan | none | Compact action button label for starting a proposed plan |
| `implementPlanRequest.dismissError` | Could not dismiss plan, with a dash and try again | none | Toast shown when dismissing a completed plan fails |
| `implementPlanRequest.editedPlanError` | Could not use the edited plan, with a dash and try again | none | Error shown when saving or loading an edited plan before implementation fails |

### MCP elicitation and MCP tool approval

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `composer.mcpFormElicitation.continue` | Continue | none | Primary action for submitting an MCP form elicitation |
| `composer.mcpFormElicitation.skip` | Skip | none | Secondary action for declining an MCP form elicitation |
| `composer.mcpFormElicitation.cancel.ariaLabel` | Cancel | none | Accessible label for canceling an MCP form elicitation |
| `composer.mcpFormElicitation.invalidField` | Complete this field to continue | none | Validation message shown for an invalid MCP form field |
| `composer.mcpServerElicitation.generic.serverFallbackName` | Server | none | Fallback name shown when an unknown MCP server elicitation does not include a usable server name |
| `localConversation.mcpServerElicitation.accepted` | Accepted | none | Status label for an accepted MCP server elicitation |
| `localConversation.mcpServerElicitation.declined` | Declined | none | Status label for a declined MCP server elicitation |
| `localConversation.mcpServerElicitation.cancelled` | Cancelled | none | Status label for a cancelled MCP server elicitation |
| `localConversation.mcpServerElicitation.completed` | Completed | none | Status label for a completed MCP server elicitation with no recorded action |
| `localConversation.mcpServerElicitation.completedRequest` | Completed request | none | Summary shown for a completed MCP server elicitation that was not a permission request |
| `localConversation.mcpServerElicitation.requestedPermission` | Requested permission | none | Summary shown for a completed MCP server tool call permission request |
| `localConversation.mcpServerElicitation.pluginInstalled` | Installed {pluginName} | none | Compact conversation activity shown after the user installs a plugin requested by the assistant |
| `localConversation.mcpServerElicitation.pluginNotInstalled` | {appName} did not install {pluginName} | none | Compact conversation activity shown after the user declines or cancels a plugin installation; appName is ChatGPT in Work mode and Codex in coding mode |
| `composer.mcpToolCallApproval.formattedToolTitle` | Allow {connectorName} to run {toolName} tool?, with the tool name in its own tagged span | none | MCP tool call approval title with the tool name emphasized |
| `composer.mcpToolCallApproval.connectorFallbackName` | Connector | none | Fallback connector name shown when an MCP tool call approval cannot be matched to connector metadata |
| `composer.mcpToolCallApproval.connectorLogoAlt` | {name} logo | none | Alt text for connector logos in MCP tool call approvals |
| `composer.mcpToolCallApproval.elevatedRiskLabel` | Elevated Risk | none | Header label for elevated-risk MCP approval requests |
| `composer.mcpToolCallApproval.toolParam.showDetails` | Show details | none | Button label to expand the full arguments for an MCP tool call approval |
| `composer.mcpToolCallApproval.toolParam.hideDetails` | Hide details | none | Button label to collapse the full arguments for an MCP tool call approval |
| `composer.mcpToolCallApproval.toolParam.more` | Show {count} more items | none | Button label to reveal additional MCP tool call parameters in the compact approval UI |
| `composer.mcpToolCallApproval.toolParam.less` | Show fewer items | none | Button label to collapse additional MCP tool call parameters in the compact approval UI |
| `composer.mcpToolCallApproval.toolParam.expand.label` / `.short` | Expand {label} / Expand | none | Accessible and short labels for expanding one parameter value |
| `composer.mcpToolCallApproval.toolParam.collapse.label` / `.short` | Collapse {label} / Collapse | none | Accessible and short labels for collapsing one parameter value |

**Ten ids from the per-tool approval group.** Each is one connector tool, written as a question with the connector named and the arguments folded in through select and plural rules. The group is large; this is a sample.

| Id | Default | Plural or select |
|---|---|---|
| `localConversation.mcpToolApproval.gmail.send_email.fallback` | Allow Gmail to send an email? | none |
| `localConversation.mcpToolApproval.gmail.delete_emails.count` | Allow Gmail to delete {itemCount, plural, one {# email} other {# emails}}? | plural on itemCount |
| `localConversation.mcpToolApproval.slack.send_message.itemNameAndConversation` | Allow Slack to send "{itemName}" to {conversationName}? | none |
| `localConversation.mcpToolApproval.slack.create_conversation.privateChannel` | Allow Slack to create the private channel, followed by a hash and {itemName}? | none |
| `localConversation.mcpToolApproval.googleDrive.delete_file.fallback` | Allow Google Drive to delete a file? | none |
| `localConversation.mcpToolApproval.googleCalendar.create_event.context` | Allow Google Calendar to create an event, with an optional title, localized start and end dates and times, and attendees | select on hasTitle, hasStartTime, hasEndTime, hasAttendees; medium date and short time formats |
| `localConversation.mcpToolApproval.github.create_pull_request.context_v3` | Allow GitHub to create a pull request, with optional draft status, title or source issue number, repository, head repository and branch, and base branch | select on draft, hasTitle, hasSourceIssueNumber, hasRepository, pullRequestSourceContext, hasBaseBranch |
| `localConversation.mcpToolApproval.linear.save_issue.v2` | Allow Linear to create, update or save an issue, with optional title, project change and assignee change | select on action, hasTitle, projectChange, assigneeChange |
| `localConversation.mcpToolApproval.notion.update_page.context` | Allow Notion to update a page, with the operation, optional replacement content, new title, verification status and expiry, cover, icon and content-deletion permission | select on command, hasNewContent, hasNewTitle, verificationStatus, coverAction, iconAction, contentDeletionPermission; plural on verificationExpiryDays |
| `localConversation.mcpToolApproval.figma.create_new_file.context` | Allow Figma to create a design file, a FigJam board, a slide deck or a file, with an optional name | select on editorType and hasFileName |

## Table 3. OMP event per state in Reeve

Read from the transcript components, the extension dialogs and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Command approval | none in the transcript. The approval decision is a session setting instead: an approval-mode selector in the composer writes tools.approvalMode, with the values always-ask, write and yolo | no source. No per-command approval request reaches the browser |
| Command approval, details hidden | none | no source |
| Network approval | none | no source |
| File change approval | none. A file change appears only after it happened, in a tool row with a diff | no source |
| Permission approval | none | no source |
| MCP tool approval | none. An MCP tool call runs or is refused by configuration; project trust decides whether MCP loads at all | no source |
| Awaiting approval status | none | no source |
| Auto-review states, all six | none. There is no reviewer agent | no source |
| Auto-review denial detail and its one-retry approval | none | no source |
| Auto-review nudge | none | no source |
| Turn ended by Auto-review | none | no source |
| Request for user input | Question request panel, pinned above the composer: one question at a time, a numbered position with previous and next controls, arrow-key movement between questions and options, a free-form field, a minimize control that parks the panel and a continue-question control that restores it | `extension_ui_request` with method ask. The answer is returned as `extension_ui_response` |
| Question timeout | Countdown from an expiry timestamp on the request, re-read every 250 ms, with the skip label showing the remaining seconds under 20; at expiry the panel answers by itself with the fallback answers, 100 ms before the deadline | the expiry timestamp on the same `extension_ui_request` |
| Option picker | The same question panel. Options are radio or checkbox depending on whether the question is multi-select, a recommended option is marked, and a custom answer is optional | `extension_ui_request` with method ask |
| Plan summary | none as a card. A plan is a markdown body inside the plan dialog | no source for a persistent plan card |
| Implement this plan? | Plan approval dialog: the plan title, its file path, the rendered plan, an optional feedback field, then continue planning and approve and implement. Neither Escape nor the backdrop closes it, because a plan needs an explicit decision | `extension_ui_request` with method plan_review. The response is a serialized approve or refine action with the feedback text |
| MCP server elicitation | none | no source. Reeve has no elicitation path; an extension would have to raise a dialog instead |
| MCP elicitation outcome labels | none | no source |
| Generic agent question, confirm, input, editor and custom panel (no reference equivalent on this surface) | Extension dialogs: select, confirm, input, editor, and a custom terminal panel that keeps every key, including Escape | `extension_ui_request` with those methods; `extension_ui_input` carries keystrokes to a custom panel |
| Blocking request needs attention | The select, confirm, input, editor and custom methods are treated as blocking and raise an attention notification; a sound plays once per dialog id | the same event, classified locally |

## Parity checklist

**Matches**

- Both interrupt the turn with a single pending request and both return the answer over one round trip.
- Both support a multi-question ask with options and a free-form alternative, and both let the user skip.
- Both bind the answer to a keyboard path: the reference uses Enter and Escape on the approval card, Reeve uses Enter to submit a custom answer and Escape to dismiss the question panel.
- Both require an explicit decision on a plan and offer a second path that returns to planning rather than implementing.
- Both name the tool or connector in the request rather than showing a bare argument blob.

**Lacks**

- No approval request of any kind. Commands, file changes, permissions and connector tools never ask in the transcript, so the whole first group of reference states has no surface. Reeve decides up front with an approval mode and then lets the run proceed.
- No approval scope. There is nothing equivalent to allow once, allow this conversation, allow similar commands by prefix, or allow all edits.
- No reviewer agent, so no auto-review titles, summaries, action summaries, denial rationale, one-retry approval, denied-action count or turn interruption after repeated denials.
- No auto-review nudge, and no offer to move from manual approvals to automatic ones.
- No MCP server elicitation, so a connector cannot ask the user for structured data.
- No awaiting-approval status row in the transcript, because nothing waits there.
- No persistent record of a question and its answers in the transcript. The reference keeps an asked-N-questions summary with each answer and a no-answer placeholder; Reeve's panel disappears when answered.
- No plan summary card, no plan download and no side panel.

**Differs**

- The reference resolves competing requests with a fixed priority and shows one; Reeve shows at most one dialog because only one extension request is held in state, with no ordering rule.
- The reference's approval chords are rebindable application commands with suppression rules for focused inputs, dialogs and activated controls; Reeve's key handling is local to the panel and is not user-configurable.
- Reeve's question panel can be minimized and resumed; the reference's pending request cannot be parked.
- Reeve's question timeout answers on the user's behalf with fallback answers; the reference's approval card has no timeout, and only the reviewer agent times out.
- The reference's plan decision sits inline in the composer as an option picker and dismissing it changes the collaboration mode for the next turn; Reeve's plan decision is a modal that cannot be dismissed at all.
- Reeve's approval mode has three values; the reference's permission modes are a separate dropdown with default, full access, guardian approval, custom and a managed variant, and the approval card can change scope per request.
- The reference records a denial permanently and lets the user authorize exactly one retry without running the action; Reeve has no notion of a recorded denial.

## What only a live run can settle

- How many manual approvals trigger the auto-review nudge, whether the count is per conversation or per account, and whether keeping manual approvals suppresses it everywhere.
- Whether the approval card's split approve button defaults to allow once, and which scopes appear for a command, a file change, a permission and a connector tool.
- What the transcript shows in the moment after each answer: whether the card animates out, whether a denied command leaves a visible row, and what replaces the awaiting-approval status.
- Whether an approval is remembered across turns for a command prefix, and what happens to that memory on a fork.
- The exact sequence when auto-review denies mid-turn: whether the command row appears before the denial, and whether approving the retry re-runs it immediately or waits for the model.
- How many denials count as too many before the turn is ended, and whether that threshold is per turn or per conversation.
- Whether the interruption guidance tooltip opens on hover, on focus, or both.
- Whether an MCP elicitation form blocks the composer the way an approval does, and what a skipped form returns to the server.
- Whether the plan card's side panel and download are available while the plan is still being written.
- How the reference behaves when two requests arrive together, since the priority rule is visible but the queueing behaviour is not.

