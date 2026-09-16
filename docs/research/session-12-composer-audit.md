# Session 12. The Composer, measured against the reference

Research for [#208](https://github.com/AndrewBeniston/omp-reeve/issues/208), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the whole `composer` string namespace, the placeholder selection function, the footer control targets, the add menu, the slash command menu, the mention list, the attachment rows, the permissions dropdown, the run location and worktree controls, and the composer CSS custom properties. Every string, state and size below comes from here unless stated otherwise.
- **The extracted main-process build.** Carries the composer command registry and four composer settings keys. It carries no composer message strings. It is the source for the keyboard chords and for `composerEnterBehavior`, `composerPlainTextMode`, `composerAttachmentLayout` and `composerTopInsetPx`.
- **The installed application** (version 26.908.40834). Holds the same asset set. Neither extract contradicts it.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Namespace size

The `composer` namespace holds **897 unique string ids**. Session 11 owns 38 of them: the model picker, the model settings, the model and reasoning slash commands, the mid-conversation warning, the model display name and the model upgrade banner. This document covers the remaining 859.

## Table 1. States for this surface

### Placeholder states

The placeholder function takes eight inputs. It returns the first match in this fixed order.

| Order | State | Condition |
|---|---|---|
| 1 | Working | The composer is the compact floating composer and a response is in progress |
| 2 | Goal | Goal mode is active |
| 3 | Plan | Plan mode is active |
| 4 | Caller override | The caller passes a placeholder string |
| 5 | Product mode fallback | No override. A switch on product mode: chat, codex or work |

The product mode fallback splits again. In `chat` mode the agent name decides. No name gives the ChatGPT conversation placeholder. A name gives the Workspace Agent placeholder. In `codex` mode the home page placeholder shows. In `work` mode the Work placeholder shows.

The function also accepts a follow-up type, a composer mode, a cloud starting state and a background subagents flag. None of the four changes the returned placeholder. The caller that computes the override consumes them.

### Footer controls

The footer is a horizontal scroll area. Its accessible name is "Composer utility bar". Nine navigation targets exist. Each one is a footer control.

| Target | Control |
|---|---|
| `add-context` | The add menu trigger, labelled "Add files and more", with the keyboard equivalent "@" in its tooltip |
| `workspace-project` | The project selector |
| `branch` | The git branch switcher |
| `environment` | The worktree or cloud environment selector |
| `run-location` | Local, remote, worktree or cloud |
| `starting-state` | The follow-up starting point |
| `permissions` | The approval mode dropdown |
| `reasoning` | The model chip and its effort stage, which Session 11 owns |
| `plugins` | The Work plugins control |

The bundle does not state the left-to-right order as a list. Several chunks build the bar. The order is a live-run item below.

### Submit control states

The submit control has five accessible labels. The run state and the follow-up preference select one.

| State | Label |
|---|---|
| Idle | Send |
| Streaming | Stop |
| Follow-up, queue preference | Queue |
| Follow-up, steer preference | Steer |
| Interrupted task | Resume |

Twenty-four conditions block submission. Each one supplies its own message. They cover an empty message, a missing project, a missing working directory, a restorable worktree, an unreadable worktree, a disconnected or unauthenticated remote, a changed remote project folder set, a missing remote project path, a missing cloud environment, a missing cloud turn, an unavailable permission mode, uploads in flight, unsupported image inputs, a missing or stale Windows sandbox, a task handoff and a goal continuation.

### Dictation states

| State | Control shown |
|---|---|
| Idle | Microphone, "Dictate" |
| Starting | "Starting dictation…". A click cancels the startup |
| Recording | Stop control, "Stop dictation" |
| Finishing | "Finishing dictation" |
| Transcribing | "Transcribing", with a cancel control |
| Failed | "Retry dictation" and "View recording" |
| Unsupported | A toast. No control |
| Microphone denied | A toast with an action that opens the operating system microphone settings |

A first-use nudge offers a global dictation shortcut after the first successful in-app dictation.

### Attachment states

Six attachment kinds render in the composer: a file or folder, an image, a large pasted text block, a pull request, a shared chat, and a browser annotation selection. A large paste becomes a file attachment named "Pasted text.txt". The user can restore it into the editor. A local file copied to a remote host shows "Uploading…". It fails with a message that names the size limit in megabytes. A folder cannot attach to a remote conversation.

### Drag and drop states

Two overlays exist. "Drop to attach" shows for a file. "Drop to reference chat" shows for a previous chat.

### Keyboard chords

From the extracted main-process build. Four commands carry a default keybinding.

| Command | Title | Default keybinding |
|---|---|---|
| `composer.addFiles` | Attach files and folders | Cmd or Ctrl + U |
| `composer.openModelPicker` | Open model picker | Ctrl + Shift + M |
| `composer.startDictation` | Start dictation | Ctrl + Shift + D |
| `composer.startVoiceMode` | Toggle voice chat | Ctrl + Shift + V on macOS only |
| `composer.addPhotos` | Add photos | none. Electron only |
| `composer.captureAppshot` | Capture appshot | none |
| `composer.clear` | Clear prompt | none |
| `composer.submit` | Send message | none |
| `composer.submitInBackground` | Send message in background | none |
| `composer.steer` | Steer prompt | none |
| `composer.queue` | Queue prompt | none |
| `composer.increaseReasoningEffort` | Increase reasoning effort | none |
| `composer.decreaseReasoningEffort` | Decrease reasoning effort | none |
| `composer.cycleReasoningEffort` | Cycle reasoning effort | none |
| `composer.togglePlanMode` | Toggle plan mode | none |
| `composer.toggleFastMode` | Toggle Fast mode | none |
| `composer.toggleWorktreeMode` | Toggle Local/Worktree | none |
| `composer.toggleWorkRunLocation` | Toggle Cloud/Local | none |
| `composer.openProjectPicker` | Open project picker | none |

Enter is a setting, not a fixed chord. `composerEnterBehavior` defaults to `enter`. It accepts `enter`, `cmdIfMultiline` and `cmdAlways`. The settings row is labelled "Send shortcut".

### Frame sizes and radii

The composer CSS custom properties give these values. The spacing unit is 0.25rem. That is 4 px at the default root size.

| Property | Value |
|---|---|
| Frame radius, single line | 22 px |
| Frame radius, other variants | 28 px, the 3xl radius token (20 px or 24 px by theme base), or the lg radius token (8 px or 10 px) |
| Frame radius, flush variant | 0 px |
| Editor minimum height | 44 px, or one editor line height |
| Editor line height | 20 px, or the chat font size times the relaxed leading |
| Editor padding | 15 px top, 18 px inline, 16 px bottom. The compact variant uses 0 and 12 px |
| Placeholder opacity | 0.5. One variant raises it to 1 |
| Attachment inset | 8 px |
| Attachment radius | The frame radius less the inset, clamped at 0 |
| Footer control size token | 28 px or 36 px by theme base |
| Top tray padding | 14 px top, 12 px inline |
| Suggestion overhang | 24 px |
| Rail tuck | 0 px or 4 px. Rail overlap 0 px or 12 px |
| Elevation | A 1 px hairline ring at 4 percent black, a 2 px by 8 px shadow at 4 percent black, and a 40 px or 80 px spread at 2 percent black. The dark theme adds a 1 px inset white highlight at 20 percent |
| Rail transition | The relaxed transition duration. Reduced motion forces 0 s |

## Table 2. Shipped strings per state

This table gives the full text for every user-visible row and placeholder in the named groups. The sub-group inventory below gives the counts for the rest.

### Placeholders

| Id | Default | Description shipped with the string |
|---|---|---|
| `composer.placeholder.working` | Working… | Placeholder text for the compact floating composer while the current turn is in progress |
| `composer.placeholder.goal` | Describe your goal, define measurable outcomes for best results | Composer placeholder text when the user is setting a Codex thread goal |
| `composer.placeholder.plan` | Describe your task to generate a plan... | Composer placeholder text when Plan mode is selected |
| `composer.placeholder.workWithChatGPT` | Work with ChatGPT | Placeholder for the composer in Work mode |
| `composer.placeholder.newTask.doAnything` | Ask Codex to do anything | Message shown in the Codex onboarding slide |
| `homePage.composer.placeholder.askAnything.v2` | Do anything | The `codex` product mode placeholder. Outside the `composer` namespace |
| `chatgptConversations.composer.placeholder` | Message ChatGPT | The `chat` product mode placeholder with no agent name |
| `workspaceAgents.detail.composerPlaceholder` | Ask {agentName} | The `chat` product mode placeholder with an agent name |

### Submit and stop

| Id | Default |
|---|---|
| `composer.submitButtonTooltip.send` | Send |
| `composer.submitButtonTooltip.stop` | Stop |
| `composer.submitButtonTooltip.queue` | Queue |
| `composer.submitButtonTooltip.steer` | Steer |
| `composer.submitButtonTooltip.resume` | Resume |
| `composer.submit.blockedDialogTitle` | Unable to send message |
| `composer.submit.blockedDialogOk` | OK |
| `composer.submit.emptyMessage` | We couldn't find a message to send. Try again. |
| `composer.submit.noWorkspace.desktop` | Select a project to continue |
| `composer.submit.missingWorkingDirectory` | This chat's working directory no longer exists |
| `composer.submit.restorableWorkingDirectory` | Restore the worktree to continue |
| `composer.submit.workspaceStatusUnavailable` | Couldn't check worktree status |
| `composer.submit.permissionModeUnavailable` | Permission mode is unavailable |
| `composer.submit.imageInputsUnsupported` | Remove images or switch models to send this message |
| `composer.submit.waitForImageUploads` | Images uploading… |
| `composer.submit.waitForFileUploads` | Files uploading… |
| `composer.submit.attachmentsUnavailable` | Attachments are unavailable for this target |
| `composer.submit.threadHandoff` | Sending messages is disabled during task handoff |
| `composer.submit.threadGoalContinuation` | Continuing goal… |
| `composer.submit.loadingLocalConfig` | Loading… |
| `composer.submitToast.missingWorkingDirectory` | The worktree no longer exists |
| `composer.pausedQueueSubmit.title` | Send message? |
| `composer.pausedQueueSubmit.description` | You are about to send a message. Do you want to clear the {count, plural, one {# message} other {# messages}} previously queued? |
| `composer.pausedQueueSubmit.clear` | Clear queue |
| `composer.pausedQueueSubmit.send` | Send message |

Nine further blocked-submit strings cover remote targets, cloud targets and the Windows sandbox.

### The add menu and the @ mention list

| Id | Default |
|---|---|
| `composer.contextButton.tooltip` | Add files and more |
| `composer.contextButton.ariaLabel` | Add files and more |
| `composer.contextButton.keyboardEquivalent` | @ |
| `composer.atMentionList.contextActions` | Add |
| `composer.addPhotos` | Add photos |
| `composer.addRemoteFiles` | Add remote files |
| `composer.sketch.title` | Sketch |
| `composer.sketch.description` | Draw a sketch |
| `composer.appshotCapture.attach` | Attach appshot |
| `composer.appshotCapture.attachApp` | Attach {appName} |
| `composer.filePicker.selectFiles` | Select files |
| `composer.filePicker.selectFolder` | Select folder |

The @ mention list has fourteen section headers. Each one has its own loading row: Files, Chats, Files and chats, Results, Tabs, Skills, Plugins, Apps, Agents, Custom agents, Live agents, MCP servers, Sites and ChatGPT conversations. Its empty states are "Type to search for files", "Type to search files or chats" and "No results". A plugin row shows "Tab for more".

### Slash commands

The menu title is "Slash commands". Its description is "Search and run slash commands". Its input placeholder is "Search". Its empty state is "No commands". It has one group heading, "Skills".

Twenty-six slash commands ship. Their titles are Archive, Approve, Chat, Compact, Feedback, Fork chat, Goal, New, Resume, IDE context, Init, MCP, Memories, New chat, Pet, Plan mode, Work in a project, Rename, Side, Status, Model, Cloud environment, Pin chat, Usage, Worktree and a service tier command. The compact command carries a second description that appends the current context usage percent.

### Approval and permission modes

| Id | Default |
|---|---|
| `composer.permissionsDropdown.title.chatgptDesktop` | How should ChatGPT actions be approved? |
| `composer.permissionsDropdown.trigger.tooltip` | Change permissions |
| `composer.permissionsDropdown.default.approvalOptionLabel` | Ask for approval |
| `composer.permissionsDropdown.default.description` | Always ask to edit external files and use the internet |
| `composer.permissionsDropdown.guardianApproval.optionLabel` | Approve for me |
| `composer.permissionsDropdown.guardianApproval.description` | Only ask for actions detected as potentially unsafe |
| `composer.permissionsDropdown.fullAccess.optionLabel` | Full access |
| `composer.permissionsDropdown.fullAccess.description` | Unrestricted access to the internet and any file on your computer |
| `composer.permissionsDropdown.custom.optionLabel` | Custom (config.toml) |
| `composer.permissionsDropdown.custom.description` | Uses permissions defined in config.toml |
| `composer.permissionsDropdown.managed.optionLabel` | Managed |
| `composer.permissionsDropdown.managed.tooltip` | Managed by enterprise policy |
| `composer.permissionsDropdown.learnMore` | Learn more |
| `composer.permissionsDropdown.loading.shortLabel` | Permissions |
| `composer.fullAccessWarning.title` | Full access is on |
| `composer.fullAccessWarning.dismissForThirtyDays` | Don't show again |
| `composer.mode.agentMode.fullAccessConfirm.warningTitle` | Turn on Full Access? |
| `composer.mode.agentMode.fullAccessConfirm.files.title` | Files and folders |
| `composer.mode.agentMode.fullAccessConfirm.terminal.title` | Terminal commands |
| `composer.mode.agentMode.fullAccessConfirm.internet.title` | Internet and connected apps |

### Dictation

| Id | Default |
|---|---|
| `composer.dictation.tooltip` | Dictate |
| `composer.dictation.starting.tooltip` | Starting dictation… |
| `composer.dictation.cancel.tooltip` | Stop dictation |
| `composer.dictation.finishing` | Finishing dictation |
| `composer.dictation.transcribing` | Transcribing |
| `composer.dictation.abortTranscription` | Cancel transcription |
| `composer.dictation.retry.tooltip` | Retry dictation |
| `composer.dictation.transcriptionError.viewRecording` | View recording |
| `composer.dictation.startError` | Unable to start dictation |
| `composer.dictation.transcribeError` | Unable to transcribe audio |
| `composer.dictation.unsupported` | Dictation is not available on this device |
| `composer.globalDictationFirstUseNudge.title` | Dictate anywhere |
| `composer.globalDictationFirstUseNudge.cta` | Set up shortcut |

### Attachments, drag and drop, paste

| Id | Default |
|---|---|
| `composer.dropOverlay.dropToAttach` | Drop to attach |
| `composer.dropOverlay.dropToReferenceChat` | Drop to reference chat |
| `composer.pastedTextAttachment.title` | Pasted text |
| `composer.pastedTextAttachment.adding` | Adding pasted text… |
| `composer.pastedTextAttachment.showInTextField` | Show in text field |
| `composer.pastedTextAttachment.removeAriaLabel` | Remove pasted text attachment |
| `composer.fileAttachment.pastedTextLabel` | Pasted text.txt |
| `composer.fileAttachment.uploading` | Uploading… |
| `composer.fileAttachment.uploadError.fileTooLarge` | File is too large to upload (maximum {maximumFileSize, number} MB) |
| `composer.fileAttachment.remoteFolderUnsupported` | Folders can only be attached to local conversations |
| `composer.imageInputsUnsupported` | This model does not support image inputs. Try a different model |
| `composer.imageUploadFailed` | Failed to upload image |
| `composer.pullRequestAttachment.label` | PR {identity} |
| `composer.sharedThreadAttachment.identity` | Shared chat |

### The working state and the turn status

| Id | Default |
|---|---|
| `composer.latestTurn` | Latest turn |
| `composer.latestTurn.working` | Working |
| `composer.contextUsageIndicator.ariaLabel` | Context usage: {percent}% |
| `composer.contextWindowUsageTooltip` | {usedTokens}k / {contextWindow}k tokens used |
| `composer.contextWindowUsageStatusFull` | {usage}% full |
| `composer.contextWindowUsageStatusLeft` | {usage}% used ({remaining}% left) |
| `composer.planModeIndicator` | Plan |
| `composer.planModeIndicator.tooltipText` | Create a plan |
| `composer.goalModeIndicator` | Goal |
| `composer.goalModeIndicator.tooltip` | Clear goal |
| `composer.startOutcomeUnknown` | The send is not yet confirmed. Do not send it again while Codex checks its outcome |

### Branch and directory controls

| Id | Default |
|---|---|
| `composer.footer.branchSwitch.tooltip` | Switch branch |
| `composer.footer.branchSwitch.loading` | Loading branch… |
| `composer.footer.branchSwitch.detachedHead` | Detached HEAD |
| `composer.footer.branchSwitch.createAndCheckout` | Create and checkout new branch… |
| `composer.footer.branchSwitch.createDialog.title` | Create and checkout branch |
| `composer.footer.branchSwitch.createDialog.placeholder` | new-branch |
| `composer.footer.branchSwitch.createDialog.branchExistsError` | Branch already exists. |
| `composer.footer.branchSwitch.uncommittedDialog.title` | Commit changes to switch branch |
| `composer.footer.branchSwitch.uncommittedDialog.commit` | Commit and switch branch… |
| `composer.footer.branchSwitch.uncommittedSummaryPrefix` | Uncommitted: {fileCount, plural, one {# file} other {# files}} |
| `composer.localCwdDropdown.tooltip` | Select project |
| `composer.localCwdDropdown.searchPlaceholder` | Search projects |
| `composer.localCwdDropdown.chooseProject` | Choose project |
| `composer.localCwdDropdown.noProjectsFound` | No projects found |
| `composer.localCwdDropdown.clearProject` | Don't work in a project |
| `composer.localCwdDropdown.addWorkspaceRoot` | Add new project |
| `composer.worktreeEnvironment.title` | Environment |
| `composer.worktreeEnvironment.noEnvironmentOption` | Work without environment |
| `composer.worktreeEnvironment.settings` | Environment settings |
| `composer.runLocation.title.question` | Where should this chat run? |
| `composer.runLocation.local.optionLabel` | On your computer |
| `composer.runLocation.local.description` | Read and edit local files with permission |
| `composer.runLocation.cloud` | In the cloud |
| `composer.runLocation.cloud.description` | Can't access local files unless attached |
| `composer.mode.startTask.header` | Work in |
| `composer.mode.local` | Work locally |
| `composer.mode.worktree` | New worktree |
| `composer.mode.worktree.submoduleWarning` | This repo has git submodules. Worktree creation may fail |
| `composer.existingWorkspace.label` | Existing workspace |
| `composer.existingWorktree.label` | Existing worktree · {worktree} |

### Sub-group inventory

Unique id counts per sub-group, outside Session 11's groups. 859 ids in total.

| Sub-group | Count | Sub-group | Count | Sub-group | Count |
|---|---|---|---|---|---|
| mode | 90 | realtime | 37 | threadGoal | 36 |
| atMentionList | 36 | statusPlain | 27 | submit | 26 |
| footer | 25 | permissionsDropdown | 24 | queuedMessage | 20 |
| dictation | 19 | memoriesSlashCommand | 16 | localCwdDropdown | 16 |
| globalDictationFirstUseNudge | 15 | remote | 14 | home | 14 |
| reviewMode | 13 | richLinkPopover | 12 | mcpToolCallApproval | 12 |
| workMode | 11 | openAIForm | 11 | connectorAuth | 11 |
| backgroundSubagents | 11 | worktreeEnvironment | 10 | toolSuggestion | 10 |
| runLocation | 10 | forkSlashCommand | 10 | mcpStatus | 9 |
| legacyWslMigrationBanner | 9 | slashCommands | 8 | fileAttachment | 8 |
| browserWebsiteAccess | 8 | newTask | 7 | intelligenceDropdown | 7 |
| autoReviewDenialsSlashCommand | 7 | appshotCapture | 7 | intelligencePicker | 6 |
| hotkeyWindow | 6 | worktreeOnboardingBanner | 5 | submitButtonTooltip | 5 |
| sideSlashCommand | 5 | remoteFilePicker | 5 | remoteConnectionBanner | 5 |
| pullRequestAttachment | 5 | projectSlashCommand | 5 | placeholder | 5 |
| pastedTextAttachment | 5 | mcpAppModelContext | 5 | ideContextIndicator | 5 |
| environmentSelector | 5 | codeBlock | 5 | annotationEditor | 5 |

Fifty further sub-groups hold four ids or fewer. Forty-five of those hold exactly one.

## Table 3. Reeve or OMP source per state

Read from the Composer components and the model and role plumbing on this branch.

| Reference state | Reeve's source | Verdict |
|---|---|---|
| Placeholder, default | `chat.messagePlaceholder`: "Message… Type / for commands, @ for files and more" | differs. One placeholder, no state switch |
| Placeholder, working | `chat.agentPlaceholder`: "Agent is running…" is in the string table. No component reads it | no source at the render seam |
| Placeholder, steer or queue | `chat.steerPlaceholder`: "Steer now / queue follow-up..." is in the string table. No component reads it | no source at the render seam |
| Placeholder, plan | none | no source. OMP has no plan mode flag on the composer |
| Placeholder, goal | none | no source. OMP has no thread goal |
| Placeholder, work with ChatGPT | none | out of scope. Reeve has one product mode |
| Add menu trigger | `ComposerAddMenu` with `composer.autocomplete.addFilesAndMore`: "Add files and more" | matches |
| Add menu rows | Add, Files and folders, Attach image, Commands, Plugins, Skills, Live agents, More commands | matches in kind. The list is shorter |
| @ mention list | `ComposerAutocomplete` with the sections Files, Commands, Slash commands, Plugins, Skills and Live agents, and the empty states "No results", "No commands" and "Type to search for files" | matches six of fourteen sections |
| Mention icons | `ComposerMentionIcon` covers command, skill, file and plugin | matches four kinds |
| Slash command menu | The `composer.autocomplete.slashCommands` label and the `composer.autocomplete.noCommands` empty state | matches. The search is the editor text, not a separate input |
| Slash command list | OMP's own command set and skills, driven by `get_tools` and the skills loader | differs. The reference ships 26 product commands |
| Approval selector | `ApprovalModeSelector` with "How should Reeve actions be approved?", "Ask for approval", "Approve for me", "Full access", the same three descriptions, "Change permissions" and "Learn more" | matches word for word for three of five modes |
| Approval, custom and managed modes | none | no source. OMP has no `config.toml` custom mode and no enterprise policy |
| Full access confirmation and banner | none | no source |
| Model chip and effort | The model and role selector in `ChatInput`, backed by `modelRoles`, `enabledModels` and the thinking level | Session 11 owns the detail |
| Submit, send | `chat.send`: "Send" | matches |
| Submit, stop | `chat.stop`, `chat.stopAgent` and `chat.stopCompaction` | matches, with one extra state for compaction |
| Submit, queue and steer | `chat.queueMessage`, `chat.steerMessage`, `chat.queue` and `chat.steer` | matches |
| Submit, resume | `chat.queueResume`: "Resume", on the paused queue header, not on the submit control | differs |
| Blocked submit reasons | none as a labelled set. The control is disabled | no source for 24 distinct messages |
| Paused queue dialog | `PausedQueueSubmitDialog` with "Send message?", "Clear queue", "Send message" and the same count sentence | matches |
| Queued message rows | `QueuedMessageList` with delete, edit, reorder, steer, queue on, queue off, the image label and the paused header | matches, and adds reorder |
| Dictation | A microphone button in `ComposerFrame` labelled "Dictate". It has no click handler, and `ChatInput` never sets `dictationAvailable`, so the control is always hidden | lacks. The control is a placeholder |
| Voice chat | none | no source |
| Attachments, images | Image previews with a remove control in `ComposerFrame` | matches for images only |
| Attachments, files and folders | The add menu opens a file picker. `composer.filesAndFolders` labels the row | partial |
| Attachments, pasted text | `onPasteImages` handles pasted images only | no source for a large text paste |
| Attachments, pull request, shared chat, annotations | none | no source |
| Drag and drop | `useDragDrop` accepts a drop only when the drag carries an image type. The overlay is an icon with three ripples and no text | differs. Images only, and no label |
| Context usage | `composer.contextDonutAria`: "Context donut: {percent}%" | matches in kind |
| Turn status | `ComposerTurnStatus` with step progress and a changed-file count | no reference equivalent on this surface |
| Project control | `ProjectContextBar`, on the empty-chat home only, with a project search, "Choose project", "No projects found" and a project environment row | partial. It is not in the Session footer |
| Branch control | The sidebar creates, switches and removes worktrees. The composer footer has no branch control | no source in the composer |
| Run location, environment, starting state and plugins targets | none | no source |
| Keyboard, Enter to send | Enter sends. Shift and Enter insert a line | matches the reference default |
| Keyboard, Escape | Escape aborts a run, cancels a queued-message edit and closes the autocomplete | differs. The reference registry has no Escape command |
| Keyboard, input history | ArrowUp on an empty composer opens the input history. Tab or Enter accepts a row | no reference equivalent |
| Keyboard, other chords | none of the nineteen reference commands is bound | lacks |
| Frame radius | 24 px, and 30 px for the squircle variant | differs. The reference uses 22 px on a single line |
| Frame minimum height | 98 px | differs. The reference editor minimum is 44 px |
| Footer control size | 28 px | matches one of the reference's two theme bases |
| Footer inset | 8 px | comparable |
| Maximum width and height | 810 px wide, 25 dvh tall | the reference bundle does not state an equivalent |

## Parity checklist

**Matches**

- The approval selector carries the reference's title, its three shipped mode labels and its three descriptions, word for word.
- The paused queue dialog carries the reference's title, body and both button labels.
- The queued message row carries the reference's action set, and adds reorder.
- The submit control changes between send, stop, queue and steer on the same conditions.
- The add menu trigger carries the reference's label, "Add files and more".
- The @ mention list carries six of the reference's fourteen sections with the same headers.
- The slash command menu carries the reference's empty state, "No commands".
- Enter sends. That is the reference default.
- The footer control height, 28 px, equals one of the reference's two theme bases.
- A context usage indicator exists and reads a percent.

**Lacks**

- No placeholder state machine. Reeve has one placeholder. Two more strings exist in the table, but no component reads them.
- No dictation. The microphone control has no handler, and it is hidden in every case.
- No voice chat.
- No blocked-submit messages. The reference names 24 reasons. Reeve only disables the control.
- No large pasted text attachment, and no restore into the editor.
- No pull request, shared chat or annotation attachment.
- No branch switcher, run location control, environment selector or starting-state control in the composer footer.
- No project selector in the Session composer. Reeve has one on the empty-chat home only.
- No keyboard chord registry. None of the reference's nineteen composer commands is bound, and there is no Send shortcut setting.
- No plan mode indicator, no goal mode indicator and no goal.
- No full access confirmation dialog, and no full access banner.
- No custom permission mode and no managed permission mode.
- No "Latest turn" preview above the composer.

**Differs**

- Reeve's drop target accepts an image only, and it shows an icon with no text. The reference accepts any file and a chat, and it labels both.
- Reeve's frame is 98 px tall at minimum with a 24 px radius. The reference editor starts at 44 px with a 22 px radius on a single line.
- Reeve's paste path handles images. The reference turns a large text paste into a named file attachment.
- Reeve puts "Resume" on the paused queue header. The reference also uses it as a submit control label.
- Reeve binds Escape to abort. The reference registry has no such command.
- Reeve adds input history on ArrowUp, and a compaction stop state. The reference has neither.
- Reeve's slash commands come from OMP's tool set and skill set. The reference ships a fixed list of 26.

## What only a live run can settle

- The left-to-right order of the nine footer controls, and which of them move into the scroll overflow at a narrow width.
- Which composer variant uses each of the four frame radii, and the width at which the single-line radius changes.
- Whether the add menu and the @ mention list are the same menu at runtime, because both use the `atMentionList` context action section.
- The order of the sections in the @ mention list, and whether an empty section hides or shows its loading row.
- The debounce and the result limit of the @ mention search and of the slash command search.
- Whether the placeholder animates between states, and what it shows in the first frame of a plan turn or a goal turn.
- Whether the submit control shows Queue or Steer by default for a first follow-up, and where that preference is stored.
- The dictation timings. How long "Starting dictation…" holds, and whether "Finishing dictation" has a timeout.
- The size limit that turns a paste into an attachment. The bundle does not state it as a number.
- Whether the drop overlay covers the composer only, or the whole transcript.
- The resolved theme base, because two sets ship and the application selects one at runtime.
- Whether the footer scroll area shows a fade or a scrollbar, and whether it answers a horizontal wheel.

