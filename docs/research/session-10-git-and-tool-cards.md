# Session 10. Git, pull request and tool card rows

Research for [#204](https://github.com/AndrewBeniston/omp-reeve/issues/204), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries all ten string groups and all of the behaviour recorded below. The git action menu, the branch setup modal, the pull request check summary, the review comment card, the agent activity row and the workspace open menu each sit in their own chunk of this bundle. Every threshold, order and state value below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Carries the same 130 string ids in the same ten groups. A direct comparison of the two id sets shows no difference. It also carries the translated tables for the same ids.
- **The extracted main-process build.** Searched for all ten groups. No match. These rows are renderer-side only. The main process contributes nothing to this surface.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Group sizes

The ten groups hold 130 string ids in total.

| Group | Ids |
|---|---:|
| `gitActions` | 5 |
| `pullRequest` | 24 |
| `reviewComments` | 4 |
| `worktreeBranchSetup` | 10 |
| `codexTool` | 67 |
| `dynamicToolCall` | 4 |
| `chromeExtensionToolCall` | 6 |
| `appControlToolCall` | 6 |
| `settingsToolCall` | 1 |
| `openTarget` | 3 |

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Git action menu, idle | The review toolbar shows a git action control | The menu button carries the accessible label `gitActions.moreActions` |
| Create branch item | The task has no branch yet, or the branch is not set for this worktree | A create-branch menu item renders in place of the commit items |
| Creating branch | A branch creation runs | A pending flag on the git action |
| Generating messages | The commit message generator runs | A pending flag on the git action |
| Cancel git action | A git action is active and can be stopped | The active flag plus a cancel handler. The cancel label replaces the action label |
| Branch setup modal, "Work here" | The user starts work in a worktree that has no branch | The worktree branch setup modal opens |
| Branch already exists | The typed branch name matches an existing branch | Validation on the branch name field |
| Branch already checked out | The chosen branch is checked out at another location | A checkout-disabled tooltip that names the location |
| Branch setup failure | Check out or branch creation fails | Three separate toast titles: check out failure, set-branch failure, and a fallback title |
| Pull request checks, passing | The pull request has checks and all of them pass | Check aggregate status `passing` |
| Pull request checks, failing | At least one check fails | Check aggregate status `failing` |
| Pull request checks, pending | Checks run and none fail | Check aggregate status `pending` |
| Pull request, no CI checks | The pull request has no checks | Check aggregate status `none` |
| Per-check tooltip | The pointer rests on one check in the summary | Six per-check statuses: passed, failed, pending, neutral, skipped, unknown |
| Per-check action | One check fails and can be acted on | Two labels: fix that check, or remove that check from the task |
| Fix disabled, seven reasons | The Fix action cannot run | Seven separate tooltips: no active chat, unparsable pull request information, missing head or base branch, branch mismatch, closed pull request, unavailable automations, unsupported automation host |
| Review comments disabled, two reasons | The comment action cannot run | Two tooltips: no active chat, unparsable pull request information |
| Review comment attach and remove | A review comment shows in the comment flyout or on a diff | Two labels: add the comment to the chat, remove an attached comment |
| Review comment card | A turn ends and the model wrote code review comments | The card title is a comment count |
| Review comment card, collapsed | The card holds more than three comments | The first three comments render. The rest sit behind a show-more control |
| Review comment card, expanded | The user opens the hidden comments | A collapse control replaces the show-more control |
| Codex tool row, six states | A named Codex tool call renders in the activity list | One select string per tool with six branches: active, completed, following, failed, failedFollowing and other |
| Settings write, waiting for approval | A settings write tool call is not complete and its arguments parse | The label replaces the ordinary active label for that one tool |
| Dynamic tool row | A tool call has no specialised renderer | The row falls back to the tool name |
| Chrome tab read row, four states | The agent reads a Chrome tab | In progress and completed, each with and without a page title, plus two non-leading forms |
| Created chat card | A tool call creates a Codex task | A card with a title, an open control and an accessible open label |
| Worktree chat card | The created task is backed by a worktree | A separate card title |
| Created chat list, collapsed | More created chats exist than the card shows | A show-more control with a count, and a show-fewer control |
| Open target menu, discovery failed | The application list cannot load | A disabled menu item |
| Open target menu, stale list | The native menu is open while the list changes | An explanation item that asks the user to reopen the menu |
| Open target failure | Opening a file or a website outside the application fails | A danger toast |

### Recorded values

**Review comment card.** Three comments render before the card collapses the rest. The show-more count is the remainder. The collapse control renders only when the total is above three. The comment tooltip opens on the top side, with a 600 ms delay, a 12 px side offset, a maximum height of 420 px, and a width clamped to the trigger width minus 64 px. A comment title can start with a priority marker in square brackets, in the form of the letter p and one digit, optionally wrapped in a subscript tag. The renderer removes the marker from the title, changes it to upper case, and shows it separately.

**Pull request check summary.** The summary draws a ring. The radius is 5.75 units and the stroke width is 1.5 units. The ring segments follow a fixed order: passing, failing, pending, then one combined segment for neutral, skipped and unknown. A segment with a count of zero is dropped. Segment colours come from the chart token set: green for passing, red for failing, yellow for pending, and the description colour for the combined segment. When the check list is empty, one status icon renders instead. The aggregate status selects the icon.

**Codex tool state.** The state value comes from the tool call. A row that does not lead the activity summary changes the value. A failed call becomes the failed-following branch. Every other value becomes the following branch. The following branches are lower case and read as a continuation of the previous row.

**Git action menu.** The menu mixes these ten groups with the neighbouring review namespace. That namespace supplies the commit, push and pull request items and their disabled reasons. Those ids are recorded here by name only, so a later search does not mistake them for this group: commit disabled while committing, commit disabled while the diff loads, commit disabled with no changes, commit unavailable, commit failure, check out branch failure, create branch failure, commit message generation failure, empty commit message response, two commit success toasts, and two combined commit and pull request generation failures.

## Table 2. Shipped strings per state

All ids sit in the local-conversation namespace. The table removes that prefix for width. Defaults are the shipped English source text.

| Id | Default | Description shipped with the string |
|---|---|---|
| `appControlToolCall.openCreatedThread` | Open chat | Accessible label for opening a newly created Codex task. |
| `appControlToolCall.openThread` | Open chat | Button label for opening a newly created Codex task. |
| `appControlToolCall.showFewerCreatedTasks` | Show fewer chats | Button label that collapses tasks created from an assistant response |
| `appControlToolCall.showMoreCreatedTasks` | {count, plural, one {Show # more chat} other {Show # more chats}} | Button label that reveals additional tasks created from an assistant response |
| `appControlToolCall.threadCreated` | Created chat | Title for a card shown after a Codex task is created. |
| `appControlToolCall.worktreeChat` | Worktree chat | Title for a card linking to a worktree-backed Codex task. |
| `chromeExtensionToolCall.getTabContext.activeWithTitle` | Reading "{title}" | In-progress label for reading the contents of a Chrome tab with a known page title. |
| `chromeExtensionToolCall.getTabContext.active` | Reading tab | In-progress label for reading the contents of a Chrome tab. |
| `chromeExtensionToolCall.getTabContext.completed.following` | read tab | Non-leading completed label for reading the contents of a Chrome tab in an agent activity summary |
| `chromeExtensionToolCall.getTabContext.completedWithTitle.following` | read "{title}" | Non-leading completed label for reading the contents of a Chrome tab with a known page title in an agent activity summary |
| `chromeExtensionToolCall.getTabContext.completedWithTitle` | Read "{title}" | Completed label for reading the contents of a Chrome tab with a known page title. |
| `chromeExtensionToolCall.getTabContext.completed` | Read tab | Completed label for reading the contents of a Chrome tab. |
| `codexTool.attach_artifact.state` | {state, select, active{Attaching artifact} completed{Attached artifact} following{attached artifact} failed{Couldn’t attach artifact} failedFollowing{couldn’t attach artifact} other{Attach artifact}} | Activity for the Codex tool action: Attach artifact. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.automation_delete.state` | {state, select, active{Deleting scheduled chat} completed{Deleted scheduled chat} following{deleted scheduled chat} failed{Couldn’t delete scheduled chat} failedFollowing{couldn’t delete scheduled chat} other{Delete scheduled chat}} | Activity for the Codex tool action: Delete scheduled chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.automation_mode_update.state` | {state, select, active{Updating scheduled chat} completed{Updated scheduled chat} following{updated scheduled chat} failed{Couldn’t update scheduled chat} failedFollowing{couldn’t update scheduled chat} other{Update scheduled chat}} | Activity for the Codex tool action: Update scheduled chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.automation_suggested_create.state` | {state, select, active{Proposing scheduled chat} completed{Proposed scheduled chat} following{proposed scheduled chat} failed{Couldn’t propose scheduled chat} failedFollowing{couldn’t propose scheduled chat} other{Propose scheduled chat}} | Activity for the Codex tool action: Propose scheduled chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.automation_update.state` | {state, select, active{Creating scheduled chat} completed{Created scheduled chat} following{created scheduled chat} failed{Couldn’t create scheduled chat} failedFollowing{couldn’t create scheduled chat} other{Create scheduled chat}} | Activity for the Codex tool action: Create scheduled chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.automation_view.state` | {state, select, active{Reading scheduled chat} completed{Read scheduled chat} following{read scheduled chat} failed{Couldn’t read scheduled chat} failedFollowing{couldn’t read scheduled chat} other{Read scheduled chat}} | Activity for the Codex tool action: Read scheduled chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.capture_screen_context.state` | {state, select, active{Reading screen context} completed{Read screen context} following{read screen context} failed{Couldn’t read screen context} failedFollowing{couldn’t read screen context} other{Read screen context}} | Activity for the Codex tool action: Read screen context. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.cloudCreatePartial` | {state, select, following{created {started} of {total} cloud chats} other{Created {started} of {total} cloud chats}} | Activity for a partially successful batch of cloud chat creations. Started is the number started; total is the number requested. Following appears after another action in a summary. |
| `codexTool.cloud_threads.attach.state` | {state, select, active{Attaching cloud chats} completed{Attached cloud chats} following{attached cloud chats} failed{Couldn’t attach cloud chats} failedFollowing{couldn’t attach cloud chats} other{Attach cloud chats}} | Activity for the Codex tool action: Attach cloud chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.cloud_threads.create.state` | {state, select, active{Creating cloud chats} completed{Created cloud chats} following{created cloud chats} failed{Couldn’t create cloud chats} failedFollowing{couldn’t create cloud chats} other{Create cloud chats}} | Activity for the Codex tool action: Create cloud chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.cloud_threads.list.state` | {state, select, active{Listing cloud chats} completed{Listed cloud chats} following{listed cloud chats} failed{Couldn’t list cloud chats} failedFollowing{couldn’t list cloud chats} other{List cloud chats}} | Activity for the Codex tool action: List cloud chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.cloud_threads.read.state` | {state, select, active{Reading cloud chat turn} completed{Read cloud chat turn} following{read cloud chat turn} failed{Couldn’t read cloud chat turn} failedFollowing{couldn’t read cloud chat turn} other{Read cloud chat turn}} | Activity for the Codex tool action: Read cloud chat turn. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.cloud_threads.send_message.state` | {state, select, active{Sending message to cloud chat} completed{Sent message to cloud chat} following{sent message to cloud chat} failed{Couldn’t send message to cloud chat} failedFollowing{couldn’t send message to cloud chat} other{Send message to cloud chat}} | Activity for the Codex tool action: Send message to cloud chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.complete_conversational_onboarding_task.state` | {state, select, active{Recording setup result} completed{Recorded setup result} following{recorded setup result} failed{Couldn’t record setup result} failedFollowing{couldn’t record setup result} other{Record setup result}} | Activity for the Codex tool action: Record setup result. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.complete_sidebar_onboarding_checklist_task.state` | {state, select, active{Updating setup checklist} completed{Updated setup checklist} following{updated setup checklist} failed{Couldn’t update setup checklist} failedFollowing{couldn’t update setup checklist} other{Update setup checklist}} | Activity for the Codex tool action: Update setup checklist. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.consume_usage_reset.state` | {state, select, active{Requesting usage reset} completed{Requested usage reset} following{requested usage reset} failed{Couldn’t request usage reset} failedFollowing{couldn’t request usage reset} other{Request usage reset}} | Activity for the Codex tool action: Request usage reset. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.create_project.state` | {state, select, active{Creating project} completed{Created project} following{created project} failed{Couldn’t create project} failedFollowing{couldn’t create project} other{Create project}} | Activity for the Codex tool action: Create project. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.create_sidebar_section.state` | {state, select, active{Creating section} completed{Created section} following{created section} failed{Couldn’t create section} failedFollowing{couldn’t create section} other{Create section}} | Activity for the Codex tool action: Create section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.create_thread.state` | {state, select, active{Creating chat} completed{Created chat} following{created chat} failed{Couldn’t create chat} failedFollowing{couldn’t create chat} other{Create chat}} | Activity for the Codex tool action: Create chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.delete_sidebar_section.state` | {state, select, active{Deleting section} completed{Deleted section} following{deleted section} failed{Couldn’t delete section} failedFollowing{couldn’t delete section} other{Delete section}} | Activity for the Codex tool action: Delete section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.draw_screen_stroke.state` | {state, select, active{Drawing annotations} completed{Drew annotations} following{drew annotations} failed{Couldn’t draw annotations} failedFollowing{couldn’t draw annotations} other{Draw annotations}} | Activity for the Codex tool action: Draw annotations. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.end_realtime_voice_call.state` | {state, select, active{Ending voice chat} completed{Ended voice chat} following{ended voice chat} failed{Couldn’t end voice chat} failedFollowing{couldn’t end voice chat} other{End voice chat}} | Activity for the Codex tool action: End voice chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.erase_screen_strokes.state` | {state, select, active{Erasing annotations} completed{Erased annotations} following{erased annotations} failed{Couldn’t erase annotations} failedFollowing{couldn’t erase annotations} other{Erase annotations}} | Activity for the Codex tool action: Erase annotations. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.fire_confetti.state` | {state, select, active{Requesting confetti} completed{Requested confetti} following{requested confetti} failed{Couldn’t request confetti} failedFollowing{couldn’t request confetti} other{Request confetti}} | Activity for the Codex tool action: Request confetti. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.fork_thread.state` | {state, select, active{Forking chat} completed{Forked chat} following{forked chat} failed{Couldn’t fork chat} failedFollowing{couldn’t fork chat} other{Fork chat}} | Activity for the Codex tool action: Fork chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.get_handoff_status.state` | {state, select, active{Checking handoff status} completed{Checked handoff status} following{checked handoff status} failed{Couldn’t check handoff status} failedFollowing{couldn’t check handoff status} other{Check handoff status}} | Activity for the Codex tool action: Check handoff status. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.get_screen_annotations.state` | {state, select, active{Reading annotations} completed{Read annotations} following{read annotations} failed{Couldn’t read annotations} failedFollowing{couldn’t read annotations} other{Read annotations}} | Activity for the Codex tool action: Read annotations. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.get_usage_limits.state` | {state, select, active{Checking usage} completed{Checked usage} following{checked usage} failed{Couldn’t check usage} failedFollowing{couldn’t check usage} other{Check usage}} | Activity for the Codex tool action: Check usage. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.handoff_thread.state` | {state, select, active{Requesting chat handoff} completed{Requested chat handoff} following{requested chat handoff} failed{Couldn’t request chat handoff} failedFollowing{couldn’t request chat handoff} other{Request chat handoff}} | Activity for the Codex tool action: Request chat handoff. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.list_archived_threads.state` | {state, select, active{Listing archived chats} completed{Listed archived chats} following{listed archived chats} failed{Couldn’t list archived chats} failedFollowing{couldn’t list archived chats} other{List archived chats}} | Activity for the Codex tool action: List archived chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.list_artifacts.state` | {state, select, active{Listing attached artifacts} completed{Listed attached artifacts} following{listed attached artifacts} failed{Couldn’t list attached artifacts} failedFollowing{couldn’t list attached artifacts} other{List attached artifacts}} | Activity for the Codex tool action: List attached artifacts. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.list_hosts.state` | {state, select, active{Listing computers} completed{Listed computers} following{listed computers} failed{Couldn’t list computers} failedFollowing{couldn’t list computers} other{List computers}} | Activity for the Codex tool action: List computers. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.list_projects.state` | {state, select, active{Listing projects} completed{Listed projects} following{listed projects} failed{Couldn’t list projects} failedFollowing{couldn’t list projects} other{List projects}} | Activity for the Codex tool action: List projects. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.list_threads.state` | {state, select, active{Listing chats} completed{Listed chats} following{listed chats} failed{Couldn’t list chats} failedFollowing{couldn’t list chats} other{List chats}} | Activity for the Codex tool action: List chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.load_workspace_dependencies.state` | {state, select, active{Loading workspace dependencies} completed{Loaded workspace dependencies} following{loaded workspace dependencies} failed{Couldn’t load workspace dependencies} failedFollowing{couldn’t load workspace dependencies} other{Load workspace dependencies}} | Activity for the Codex tool action: Load workspace dependencies. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.move_project_to_sidebar_section.state` | {state, select, active{Moving project to section} completed{Moved project to section} following{moved project to section} failed{Couldn’t move project to section} failedFollowing{couldn’t move project to section} other{Move project to section}} | Activity for the Codex tool action: Move project to section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.move_thread_to_sidebar_section.state` | {state, select, active{Moving chat to section} completed{Moved chat to section} following{moved chat to section} failed{Couldn’t move chat to section} failedFollowing{couldn’t move chat to section} other{Move chat to section}} | Activity for the Codex tool action: Move chat to section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.navigate_to_codex_page.state` | {state, select, active{Opening chat} completed{Opened chat} following{opened chat} failed{Couldn’t open chat} failedFollowing{couldn’t open chat} other{Open chat}} | Activity for the Codex tool action: Open chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.open_browser.state` | {state, select, active{Opening browser} completed{Opened browser} following{opened browser} failed{Couldn’t open browser} failedFollowing{couldn’t open browser} other{Open browser}} | Activity for the Codex tool action: Open browser. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.open_in_codex.state` | {state, select, active{Opening file} completed{Opened file} following{opened file} failed{Couldn’t open file} failedFollowing{couldn’t open file} other{Open file}} | Activity for the Codex tool action: Open file. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.open_review.state` | {state, select, active{Opening review} completed{Opened review} following{opened review} failed{Couldn’t open review} failedFollowing{couldn’t open review} other{Open review}} | Activity for the Codex tool action: Open review. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.open_terminal.state` | {state, select, active{Opening terminal} completed{Opened terminal} following{opened terminal} failed{Couldn’t open terminal} failedFollowing{couldn’t open terminal} other{Open terminal}} | Activity for the Codex tool action: Open terminal. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.pin_chat.state` | {state, select, active{Pinning chat} completed{Pinned chat} following{pinned chat} failed{Couldn’t pin chat} failedFollowing{couldn’t pin chat} other{Pin chat}} | Activity for the Codex tool action: Pin chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.pin_project.state` | {state, select, active{Pinning project} completed{Pinned project} following{pinned project} failed{Couldn’t pin project} failedFollowing{couldn’t pin project} other{Pin project}} | Activity for the Codex tool action: Pin project. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.read_settings.state` | {state, select, active{Reading settings} completed{Read settings} following{read settings} failed{Couldn’t read settings} failedFollowing{couldn’t read settings} other{Read settings}} | Activity for the Codex tool action: Read settings. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.read_thread.state` | {state, select, active{Reading chat} completed{Read chat} following{read chat} failed{Couldn’t read chat} failedFollowing{couldn’t read chat} other{Read chat}} | Activity for the Codex tool action: Read chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.read_thread_terminal.state` | {state, select, active{Reading terminal} completed{Read terminal} following{read terminal} failed{Couldn’t read terminal} failedFollowing{couldn’t read terminal} other{Read terminal}} | Activity for the Codex tool action: Read terminal. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.remove_artifact.state` | {state, select, active{Detaching artifact} completed{Detached artifact} following{detached artifact} failed{Couldn’t detach artifact} failedFollowing{couldn’t detach artifact} other{Detach artifact}} | Activity for the Codex tool action: Detach artifact. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.rename_sidebar_section.state` | {state, select, active{Renaming section} completed{Renamed section} following{renamed section} failed{Couldn’t rename section} failedFollowing{couldn’t rename section} other{Rename section}} | Activity for the Codex tool action: Rename section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.reorder_section.state` | {state, select, active{Reordering section} completed{Reordered section} following{reordered section} failed{Couldn’t reorder section} failedFollowing{couldn’t reorder section} other{Reorder section}} | Activity for the Codex tool action: Reorder section. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.reorder_sidebar_projects.state` | {state, select, active{Reordering projects} completed{Reordered projects} following{reordered projects} failed{Couldn’t reorder projects} failedFollowing{couldn’t reorder projects} other{Reorder projects}} | Activity for the Codex tool action: Reorder projects. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.reorder_sidebar_sections.state` | {state, select, active{Reordering sections} completed{Reordered sections} following{reordered sections} failed{Couldn’t reorder sections} failedFollowing{couldn’t reorder sections} other{Reorder sections}} | Activity for the Codex tool action: Reorder sections. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.request_onboarding_input.state` | {state, select, active{Requesting setup information} completed{Requested setup information} following{requested setup information} failed{Couldn’t request setup information} failedFollowing{couldn’t request setup information} other{Request setup information}} | Activity for the Codex tool action: Request setup information. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.request_option_picker.state` | {state, select, active{Requesting option selection} completed{Requested option selection} following{requested option selection} failed{Couldn’t request option selection} failedFollowing{couldn’t request option selection} other{Request option selection}} | Activity for the Codex tool action: Request option selection. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.restore_chat.state` | {state, select, active{Restoring chat} completed{Restored chat} following{restored chat} failed{Couldn’t restore chat} failedFollowing{couldn’t restore chat} other{Restore chat}} | Activity for the Codex tool action: Restore chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.send_message_to_thread.state` | {state, select, active{Sending message to chat} completed{Sent message to chat} following{sent message to chat} failed{Couldn’t send message to chat} failedFollowing{couldn’t send message to chat} other{Send message to chat}} | Activity for the Codex tool action: Send message to chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.set_thread_archived.state` | {state, select, active{Archiving chat} completed{Archived chat} following{archived chat} failed{Couldn’t archive chat} failedFollowing{couldn’t archive chat} other{Archive chat}} | Activity for the Codex tool action: Archive chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.set_thread_pinned.state` | {state, select, active{Pinning chat} completed{Pinned chat} following{pinned chat} failed{Couldn’t pin chat} failedFollowing{couldn’t pin chat} other{Pin chat}} | Activity for the Codex tool action: Pin chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.set_thread_title.state` | {state, select, active{Renaming chat} completed{Renamed chat} following{renamed chat} failed{Couldn’t rename chat} failedFollowing{couldn’t rename chat} other{Rename chat}} | Activity for the Codex tool action: Rename chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.setup_codex_step.state` | {state, select, active{Opening setup step} completed{Opened setup step} following{opened setup step} failed{Couldn’t open setup step} failedFollowing{couldn’t open setup step} other{Open setup step}} | Activity for the Codex tool action: Open setup step. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.share_thread.state` | {state, select, active{Creating share link} completed{Created share link} following{created share link} failed{Couldn’t create share link} failedFollowing{couldn’t create share link} other{Create share link}} | Activity for the Codex tool action: Create share link. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.transfer_voice_call.state` | {state, select, active{Transferring voice chat} completed{Transferred voice chat} following{transferred voice chat} failed{Couldn’t transfer voice chat} failedFollowing{couldn’t transfer voice chat} other{Transfer voice chat}} | Activity for the Codex tool action: Transfer voice chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.uninstall_plugin.state` | {state, select, active{Uninstalling plugin} completed{Uninstalled plugin} following{uninstalled plugin} failed{Couldn’t uninstall plugin} failedFollowing{couldn’t uninstall plugin} other{Uninstall plugin}} | Activity for the Codex tool action: Uninstall plugin. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.unpin_chat.state` | {state, select, active{Unpinning chat} completed{Unpinned chat} following{unpinned chat} failed{Couldn’t unpin chat} failedFollowing{couldn’t unpin chat} other{Unpin chat}} | Activity for the Codex tool action: Unpin chat. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.unpin_project.state` | {state, select, active{Unpinning project} completed{Unpinned project} following{unpinned project} failed{Couldn’t unpin project} failedFollowing{couldn’t unpin project} other{Unpin project}} | Activity for the Codex tool action: Unpin project. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.wait_threads.state` | {state, select, active{Waiting for chats} completed{Waited for chats} following{waited for chats} failed{Couldn’t wait for chats} failedFollowing{couldn’t wait for chats} other{Wait for chats}} | Activity for the Codex tool action: Wait for chats. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `codexTool.write_settings.state` | {state, select, active{Updating settings} completed{Updated settings} following{updated settings} failed{Couldn’t update settings} failedFollowing{couldn’t update settings} other{Update settings}} | Activity for the Codex tool action: Update settings. Completed describes the tool call, not the status of a chat. Following variants appear after another action in a summary. |
| `dynamicToolCall.readTaskTerminal.completed.following` | read chat terminal | Non-leading completed label for reading a Codex task terminal in an agent activity summary |
| `dynamicToolCall.readTaskTerminal.completed` | Read chat terminal | Completed label for reading a Codex task terminal. |
| `dynamicToolCall.readTaskTerminal.inProgress` | Reading chat terminal | In-progress label for reading a Codex task terminal. |
| `dynamicToolCall` | {toolName} | Synthetic item shown for a dynamic tool call without a specialized renderer. |
| `gitActions.cancel` | Cancel git action | Accessible label for canceling an active git action |
| `gitActions.createBranch` | Create branch | Label for the create branch action in the git actions dropdown |
| `gitActions.creatingBranch` | Creating branch… | Label for a git action while creating a branch |
| `gitActions.generatingMessages` | Generating messages… | Label for a git action while generating messages |
| `gitActions.moreActions` | More Git actions | Accessible label for the Review toolbar Git action menu |
| `openTarget.discoveryFailed` | Unable to load apps. Reopen menu to retry | Disabled workspace menu item after application discovery failed |
| `openTarget.error` | Unable to open item | Toast shown when opening a file or website externally fails |
| `openTarget.reopenMenu` | Reopen this menu to see available apps | Explains that the native menu cannot update its application list while open |
| `pullRequest.actions.checks.fix` | Fix | Per-check action label for fixing a single failing pull request check |
| `pullRequest.actions.checks.remove` | Remove | Per-check action label for removing a failing pull request check from the task |
| `pullRequest.actions.checks.tooltip.failed` | Failed test | Tooltip shown for an individual failed pull request check |
| `pullRequest.actions.checks.tooltip.neutral` | Neutral test | Tooltip shown for an individual neutral pull request check |
| `pullRequest.actions.checks.tooltip.passed` | Passed test | Tooltip shown for an individual passed pull request check |
| `pullRequest.actions.checks.tooltip.pending` | Pending test | Tooltip shown for an individual pending pull request check |
| `pullRequest.actions.checks.tooltip.skipped` | Skipped test | Tooltip shown for an individual skipped pull request check |
| `pullRequest.actions.checks.tooltip.unknown` | Unknown test status | Tooltip shown for an individual pull request check with unknown status |
| `pullRequest.actions.checksFailing` | Checks failing | Status row shown when pull request checks are failing |
| `pullRequest.actions.checksPending` | Checks pending | Status row shown when pull request checks are still pending |
| `pullRequest.actions.checksSuccessful` | Checks successful | Status row shown when pull request checks are passing |
| `pullRequest.actions.comments.address` | Add to chat | Action button shown on an individual review comment in the comments flyout |
| `pullRequest.actions.comments.remove` | Remove | Action button shown on an attached pull request comment in a diff |
| `pullRequest.actions.noCiChecks` | No CI checks | Status row shown when the pull request currently has no CI checks |
| `pullRequest.comments.missingConversation` | Addressing PR comments is only available in an active chat | Tooltip shown when the PR comments action is disabled because there is no active conversation |
| `pullRequest.comments.missingPullRequestInfo` | Failed to parse the pull request info needed to address comments | Tooltip shown when the PR comments action is disabled because required pull request information is unavailable |
| `pullRequest.fix.automationsUnavailable` | Automatic fixes are unavailable right now | Tooltip shown when pull request fix automations cannot be loaded |
| `pullRequest.fix.branchMismatch` | Switch back to the chat branch to use Fix | Tooltip shown when Fix is disabled because the checked out branch differs from the task branch |
| `pullRequest.fix.closedPullRequest` | Fix is only available for open pull requests | Tooltip shown when Fix is disabled because the pull request is closed |
| `pullRequest.fix.missingBranchInfo` | Fix requires both the head and base branch | Tooltip shown when Fix is disabled because the pull request branch metadata is unavailable |
| `pullRequest.fix.missingConversation` | Fix is only available in an active chat | Tooltip shown when Fix is disabled because there is no active conversation |
| `pullRequest.fix.missingPullRequestInfo` | Failed to parse the pull request info needed for Fix | Tooltip shown when Fix is disabled because required pull request information is unavailable |
| `pullRequest.fix.pullRequestClosed` | Automatic fixes are unavailable for closed pull requests | Tooltip shown when automatic pull request fixes are disabled because the pull request is closed |
| `pullRequest.fix.unsupportedAutomationHost` | Automatic fixes are available for local projects in the desktop app | Tooltip shown when pull request fix automations are unavailable for the current host |
| `reviewComments.collapse` | Collapse comments | Button label that collapses expanded model-authored code review comments |
| `reviewComments.count` | {count, plural, one {# comment} other {# comments}} | Title for the turn-end card summarizing model-authored code review comments |
| `reviewComments.openComment` | View {title} in {location} | Accessible label for opening one model-authored code review comment from a conversation turn |
| `reviewComments.showMore` | {count, plural, one {Show # more comment} other {Show # more comments}} | Button label that expands hidden model-authored code review comments |
| `settingsToolCall.write.waitingForApproval` | Waiting for approval | In-progress label while a Codex configuration change is waiting for user approval. |
| `worktreeBranchSetup.action.create` | Create | Primary action label when creating a new branch |
| `worktreeBranchSetup.branchAriaLabel` | Branch name | Aria label for branch selection input in the sync setup modal |
| `worktreeBranchSetup.branchExistsError` | Branch already exists | Validation message shown in the worktree branch setup modal when the entered branch already exists |
| `worktreeBranchSetup.branchPlaceholder.new` | Create a new branch | Placeholder for new branch name input in the sync setup modal |
| `worktreeBranchSetup.checkoutDisabled` | This branch is already checked out at {location} | Tooltip shown when checkout is disabled because the branch is already checked out |
| `worktreeBranchSetup.checkoutErrorTitle` | Failed to check out branch | Title for the terminal toast shown when Codex failed to checkout a git branch |
| `worktreeBranchSetup.createBranchErrorTitle` | Failed to set branch | Title for the terminal toast shown when Codex failed to make a git branch |
| `worktreeBranchSetup.errorTitle` | Something went wrong | Title for the fallback terminal toast for branch setup failures |
| `worktreeBranchSetup.subtitle` | Create a branch to commit changes, push, and create a PR from this worktree. <a>Learn more</a> | Subtitle for the worktree branch setup modal |
| `worktreeBranchSetup.title` | Work here | Title for the worktree branch setup modal |

## Table 3. OMP event per state in Reeve

Read from Reeve's transcript components, its tool icon set, its git endpoints and its session hook on this branch. A search of the whole application for pull request code, review comment code and CI check code returns nothing, so every row in those three areas reads "no source".

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Git action menu and its items | none in the transcript. Reeve reads git through its own status and diff endpoints, and shows the current branch in the project context bar | no source. The git data is read by request, not carried by an event |
| Create branch, creating branch | Sidebar worktree creation, with a branch name field and a new-worktree item | no source. The worktree endpoint performs it. Nothing reports it into the transcript |
| Generating messages | none. Reeve does not generate commit messages | no source |
| Cancel git action | none | no source |
| Branch setup modal, "Work here" | Sidebar worktree creation. It creates the worktree and the branch in one step, with no modal in the transcript | no source |
| Branch already exists, branch already checked out | none. The worktree endpoint reuses an existing branch instead of reporting a conflict | no source |
| Branch setup failure toasts | The worktree endpoint returns an error, which the sidebar shows in place | no source |
| Pull request checks, four aggregate states | none | no source |
| Per-check tooltips and per-check actions | none | no source |
| Fix disabled, seven reasons | none | no source |
| Review comment card, count, show more, collapse | none | no source |
| Review comment attach and remove | none | no source |
| Codex tool row, six states | Tool activity card. The header shows the raw tool name, a preview of the input, a diff count, a duration in seconds and a chevron | `tool_execution_start` and `tool_execution_end`, plus the tool call and tool result blocks in the message stream |
| Codex tool row, active against completed | Tool card state. It is `running` with no result, `success` with a result, and `error` when the result is an error | the presence of the tool result, delivered by `tool_execution_end` |
| Codex tool row, following form | none. Every Reeve row is a leading row | no source. Nothing distinguishes a leading row from a following row |
| Settings write, waiting for approval | The approval request panel, which is a separate row | `confirm` and `ask`, which raise an approval request. The state is not attached to the tool row |
| Dynamic tool row fallback | The same tool activity card. Reeve always shows the raw tool name, so every tool is the fallback case | `tool_execution_start` |
| Chrome tab read row, four states | The browser tool renders as an ordinary tool card with the browser icon | `tool_execution_start` and `tool_execution_end` |
| Created chat card, worktree chat card, open control | none. Reeve creates no tasks from a tool call | no source |
| Created chat list, show more and show fewer | none | no source |
| Open target menu and its two notes | File tabs. Reeve opens a file in its own tab through the file endpoint, with no external application menu | no source |
| Open target failure toast | none | no source |
| Turn-level progress, which the reference does not show on this surface | Composer turn status. It shows step progress and a changed-file count | the todo tool call and the written-file tool results inside the active turn |

**Reeve's tool icon set.** Twelve kinds: read, write, glob, grep, edit, bash, todo, eval, task, browser, image and generic. Three statuses: running, success and error. The todo tool renders no card. A command-style tool renders a terminal view instead of a tool card.

## Parity checklist

**Matches**

- Both show one row per tool call, with an icon, a name and a completion state.
- Both carry three visual tool states that agree in meaning: in progress, complete and failed.
- Both show a duration on a completed tool row.
- Both show an added and removed line count for a tool that changes a file.
- Both hide the detail behind a control and open it on demand.
- Both show the current branch somewhere in the session surface.
- Both can create a worktree with a new branch.

**Lacks**

- No git action row in the transcript. Reeve has no commit, no push, no pull request creation and no branch creation from the transcript.
- No pull request card. Reeve has no pull request state, no check summary ring, no aggregate status row and no per-check tooltip.
- No Fix action, and none of its seven disabled reasons.
- No review comment card. Reeve has no comment count title, no three-comment threshold, no show-more control and no priority marker parsing.
- No branch setup modal, and none of its validation or failure states.
- No named verb for a tool. Reeve shows the raw tool name where the reference ships one select string for each of 67 Codex tools.
- No following form. Reeve cannot join two rows into one summary sentence.
- No waiting-for-approval label on the tool row.
- No created chat card, no worktree chat card and no collapsed list of created tasks.
- No open target menu, and no failure toast for an external open.

**Differs**

- The reference names the action ("Creating chat", "Read settings"). Reeve names the tool. The reference string set is the vocabulary that Reeve does not have.
- The reference chooses the tool label by tool identity through a table of 67 ids. Reeve chooses an icon by tool kind through a table of twelve kinds, and leaves the words to the raw name.
- The reference shows an approval wait inside the tool row. Reeve shows approval as its own row.
- Reeve shows git state in the project context bar and the file explorer. The reference shows git state in the transcript and in a review toolbar.
- Reeve creates a worktree from the sidebar. The reference creates it from a modal that the conversation opens.
- Reeve's tool card opens by default for an edit tool. The reference collapses by rule, not by tool kind.

## What only a live run can settle

- Whether the git action menu changes its item set while a commit runs, and whether the cancel label replaces the item label in place or adds a second control.
- The order of the items in the git action menu, and which items the menu hides instead of disabling.
- Whether the check summary ring animates when a check result arrives, and how it renders a very large check count.
- How the review comment card behaves when a comment has no title, and how the priority marker renders beside a long title.
- Whether the created chat card collapses at a fixed count or at a measured height.
- Whether a following row ever renders in a single-tool turn, which would show that the leading test is positional and not count-based.
- The timing of the branch setup modal, and whether it blocks the composer while it is open.
- Whether the settings approval label replaces or accompanies the ordinary active label in the rendered row.
