# Reeve ownership of the Codex Desktop agent control surface

## Status

This report answers item 11 of ticket 444.

It names the Reeve epic and the Reeve ticket that owns each capability today.

A sibling worker owns the reference-to-OMP mapping.

This report states no OMP verdict.

## Naming rule

This report names each capability by its behaviour.

It writes no reference identifier, no code, and no class name.

The seven surface reports hold the exact names.

## Evidence method

I read the seven surface reports in this directory.

I read the Terminal capability inventory in the agent application control surface report.

I read the visualization report on the sibling research branch.

I read the open Reeve issues with the command line tool on 2026-09-19.

The repository held 297 open issues on that day.

I read the Session view map, the panel map, and the Browser research ticket.

I read the body of each ticket that I name in the ownership table.

Every ownership row is source-verified against the named issue body.

Every judgement about partial coverage is an inference, and I label it.

## Coverage values

The value owned means that the ticket delivers the capability for Reeve.

The value partial means that the ticket delivers only a part of the capability.

The value none means that no open ticket covers the capability.

## Reeve epics

| Epic | Title | Source |
| --- | --- | --- |
| 80 | Complete Codex Desktop Review parity in the right panel | Panel map |
| 119 | The Side chat, to reference parity | Panel map |
| 129 | The Files surface, to reference parity | Panel map |
| 139 | The bottom placement, on one Tab model | Panel map |
| 148 | The panel host and header, to reference parity | Panel map |
| 158 | Browser tab and Terminal parity | Panel map |
| 223 | Scrolling and the message rows, to reference parity | Session view map |
| 224 | The transcript core, to reference parity | Session view map |
| 261 | The Composer and the model selector, to reference parity | Session view map |
| 290 | The Models settings on OMP, to the OpenCodex Providers page | Models map |
| 318 | Goal mode and token budgets, to reference parity | Session view map |

The Session view map also plans an epic for approvals, git rows, and pull request rows.

That epic has no number yet.

Ticket 205 gates it.

## 1. Ownership table

### Terminal

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent runs a command in a process session | none | none | none |
| Agent sends input to a running process session | none | none | none |
| Agent reads the visible Terminal snapshot of the task | none | none | none |
| Agent opens or reveals a Terminal Tab | none | none | none |
| Agent chooses the Terminal Tab placement | none | none | none |
| Command activity renders in the transcript | 224 | 248. Transcript 7. The Activity classifier | partial |
| Human opens the Terminal Tab from the agent activity | none | none | none |
| Terminal session survives a renderer reload | 158 | 166. Parity 9. Terminal: registry lifetime | owned |
| Terminal session transfers with a task in one window | 148 | 185. Host 5b. Move a Tab to another Session | partial |

### Files

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent opens a workspace file Tab at a line | none | none | none |
| Agent edits a file through a patch | none | none | none |
| File change activity renders in the transcript | 224 | 248. Transcript 7. The Activity classifier | partial |
| Human opens the file Tab from the agent activity | none | none | none |
| File Tab identity survives a reload | 129 | 173. Files 2b. Versioned Files and file Tab payloads | owned |
| Language server definition and hover in a file Tab | 129 | 137. Files 8. Definition and hover in a file Tab | owned |
| Sandbox policy limits a file write | none | none | none |

### Review

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent opens or reveals the Review Tab | none | none | none |
| Agent selects the Review view | none | none | none |
| Agent sets the base revision for the branch view | none | none | none |
| Agent selects one file inside Review | none | none | none |
| Agent writes an inline review comment | 80 | 76. Review: line comments and change requests in the owning OMP Session | partial |
| Agent writes a pull request diff link | 80 | 78. Review: pull-request views and review comments | partial |
| Human opens a pull request from a link preview | 80 | 78. Review: pull-request views and review comments | partial |
| Review Tab identity and durable route record | 80 | 74. Review: open a native tab and inspect scoped Git changes | partial |
| Inline comments move with a task handoff | none | none | none |

### Side chat and sub-agents

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Human opens a side chat | 119 | 120. Side chat 1. Declare the Tab kind and wire entry actions | owned |
| Human moves focus between the main chat and the side chat | 119 | 126. Side chat 6. Focus main chat and focus side chat | owned |
| Side chat boundary instruction for the model | 119 | 122. Side chat 3. The boundary instruction | owned |
| Agent creates a sub-agent | none | none | none |
| Agent sends input or a follow-up task to a sub-agent | none | none | none |
| Agent waits for a sub-agent status | none | none | none |
| Agent interrupts, resumes, or closes a sub-agent | none | none | none |
| Agent lists live sub-agents | none | none | none |
| Sub-agent rows attach to the spawning activity | 224 | 251. Transcript 10. Sub-agent rows attached to the spawning tool call | owned |
| Sub-agent panel as a Tab kind | 139 | 144. Bottom 5. The subagent panel becomes a Tab kind | partial |
| Sub-agent panel restore and missing history | 139 | 430. Bottom 5b. Subagent restoration and missing history | owned |

### Panel placement and layout

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent asks for the right or the bottom placement | none | none | none |
| Agent command waits until the target task is visible | none | none | none |
| Agent receives no error for a failed queued command | none | none | none |
| Workspace record stores and restores every Tab | 139 | 141. Bottom 2. Store and restore one workspace record per Session | owned |
| Human moves a Tab between the two placements | 139 | 181. Bottom 4b. Move a Tab between placements | owned |
| Human maximises the right panel | 148 | 150. Host 2. Full view as a layout mode | owned |
| Human hides the Tab strip | 148 | 149. Host 1. Toggle the right panel, and hide the strip | owned |
| A Tab kind declares its permitted placement | 139 | 140. Bottom 1. Prefactor: a Tab kind declares what it allows | owned |

### Settings and approval state

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent reads settings and setting definitions | none | none | none |
| Agent writes a setting or a task configuration | none | none | none |
| Human confirms an agent configuration write | none | none | none |
| Agent changes the approval policy | none | none | none |
| Agent changes the sandbox mode | none | none | none |
| Agent changes the network access value | none | none | none |
| Agent changes the web search mode | none | none | none |
| A managed or restricted key refuses an agent write | none | none | none |

### Questions and option pickers

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent asks the human one to three questions | 261 | 315. Composer 23. The Question window uses neutral rounded controls | partial |
| Question window renders options and a free text answer | 261 | 315. Composer 23. The Question window uses neutral rounded controls | partial |
| Human skips a question | none | none | none |
| Agent asks for an option choice during onboarding | none | none | none |
| Agent asks for structured onboarding input | none | none | none |
| Agent advances a native setup step | none | none | none |
| Agent requests an environment configuration | none | none | none |
| A connected server asks the human for input | none | none | none |

### Goal state

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent creates a goal with an objective | 318 | 319. Goal 1. Bridge OMP Goal Mode into the Session API | owned |
| Agent creates a goal with a token budget | 318 | 321. Goal 3. Set a goal with an optional token budget | owned |
| Agent reads goal status and remaining budget | 318 | 319. Goal 1. Bridge OMP Goal Mode into the Session API | owned |
| Agent changes the goal status | 318 | 319. Goal 1. Bridge OMP Goal Mode into the Session API | owned |
| Goal tool activation and tool restoration | 318 | 403. Goal 1B. Coordinate Goal tools, settings, and completion cleanup | owned |
| Goal pill and status labels | 318 | 322. Goal 4. Render the Goal pill and OMP status labels | owned |
| Goal markers in the transcript | 318 | 327. Goal 9. Goal transcript markers and completion | owned |
| Goal Tab and inactive Tab preview | 318 | 328. Goal 10. Goal Tab and inactive-Tab preview | owned |
| Goal survives reload and fork | 318 | 329. Goal 11. Goal persistence, reload, fork and recovery | owned |
| Human starts a goal from a command | 318 | 321. Goal 3. Set a goal with an optional token budget | owned |

### Session lifecycle

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent creates another task | none | none | none |
| Agent forks a task | 148 | 154. Host 6. Local Session header actions and Share | partial |
| Agent lists tasks in pinned and recency order | none | none | none |
| Agent lists archived tasks | none | none | none |
| Agent reads the turns of another task | none | none | none |
| Agent waits for other tasks to finish | none | none | none |
| Agent sends a follow-up prompt to another task | none | none | none |
| Agent moves a task between a checkout and a worktree | none | none | none |
| Agent reads the status of a move operation | none | none | none |
| Agent archives or restores a task | none | none | none |
| Agent renames a task | none | none | none |
| Agent pins a task | none | none | none |
| Agent lists projects before creation | none | none | none |
| Agent creates a share link | 148 | 154. Host 6. Local Session header actions and Share | partial |
| Agent navigates the window to a task | none | none | none |
| Human starts a task in a worktree | 261 | 311. Composer workspace. New-Session Project and Worktree controls | owned |
| Archived task card renders in the transcript | 224 | 379. Transcript 16A. Render the archived Session card | owned |

### Capture

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Agent reads the foreground application during a voice session | none | none | none |
| Agent reads the current application page state | none | none | none |
| Human captures a window with a hotkey | none | 205. Rows with no OMP source | partial |
| Capture permission request during setup | none | none | none |

### Visualizations

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Application grants a writable visualization root for a turn | none | none | none |
| Application detects a visualization file write | none | none | none |
| Visualization renders inside an isolated container | none | none | none |
| Visualization sends a follow-up message to the task | none | none | none |
| Visualization reports an error and offers a repair action | none | none | none |
| Human opens the visualization from the activity | none | none | none |

### Remaining registered capabilities

| Capability | Epic | Owning ticket | Coverage |
| --- | --- | --- | --- |
| Session scoped application control service | none | none | none |
| Deferred tool loading inside one namespace | none | none | none |
| Agent creates a managed worktree | 261 | 362. Composer workspace. Worktree selection API | partial |
| Agent attaches a pull request to the task | none | none | none |
| Agent removes an attached pull request | none | none | none |
| Agent lists task attachments | none | none | none |
| Agent updates the short running summary | none | none | none |
| Agent creates or changes a scheduled automation | none | none | none |
| Agent finalizes an environment configuration | none | none | none |
| Agent lists hosts | none | none | none |
| Agent creates a project | none | none | none |
| Agent reads account usage limits | 290 | 306. Models 10b. The Usage tab on OMP's per-provider usage fetchers | partial |
| Agent redeems a usage reset credit | none | none | none |
| Agent reports bundled runtime paths | none | none | none |
| Agent reads or sets the task emoji | none | none | none |
| Agent creates, renames, or deletes a sidebar section | none | none | none |
| Agent moves a task or a project between sidebar sections | none | none | none |
| Agent reorders a sidebar section or the projects | none | none | none |
| Agent reports an onboarding task outcome | none | none | none |
| Agent removes an installed plugin | none | none | none |
| Agent fires a celebration effect in the window | none | none | none |
| Developer instruction text teaches the application tools | none | none | none |


## 2. Capabilities that no ticket owns

Eighty capabilities have no owning ticket.

Two of them need no ticket, because Reeve already runs them through the agent runtime.

I mark those two as delivered, and that mark is an inference.

### Terminal

1. Agent runs a command in a process session. Delivered today through the agent runtime, so no ticket is needed.
2. Agent sends input to a running process session. Delivered today through the agent runtime, so no ticket is needed.
3. Agent reads the visible Terminal snapshot of the task. The agent needs a read of the working directory, the shell, and the recent output.
4. Agent opens or reveals a Terminal Tab. The agent needs one call that creates or reveals the Tab and returns its identity.
5. Agent chooses the Terminal Tab placement. The call needs a right or bottom value, with the task default when the value is absent.
6. Human opens the Terminal Tab from the agent activity. The transcript row needs an action that focuses the exact Tab.

### Files

7. Agent opens a workspace file Tab at a line. The agent needs one call that opens the file and scrolls to the line.
8. Agent edits a file through a patch. Delivered today through the agent runtime, and the rendering belongs to ticket 248.
9. Human opens the file Tab from the agent activity. The file change row needs an action that opens the changed file.
10. Sandbox policy limits a file write. Reeve needs the three policy values to control an agent file write.

### Review

11. Agent opens or reveals the Review Tab. The agent needs one call that opens the Review Tab in the calling task.
12. Agent selects the Review view. The call needs the four scope values of the reference.
13. Agent sets the base revision for the branch view. The call needs a revision that resolves locally to a commit.
14. Agent selects one file inside Review. The call needs a path that selects the file and clears the selected commit.
15. Inline comments move with a task handoff. The comment store needs to follow the task between a checkout, a worktree, and a host.

### Sub-agents

16. Agent creates a sub-agent. Reeve needs a Session scoped record of the new agent and its identity.
17. Agent sends input or a follow-up task to a sub-agent. Reeve needs both delivery shapes, with and without a new turn.
18. Agent waits for a sub-agent status. Reeve needs a blocking wait with a timeout and an interruption result.
19. Agent interrupts, resumes, or closes a sub-agent. Reeve needs the three lifetime controls and the returned previous status.
20. Agent lists live sub-agents. Reeve needs a list of the live agents in the task tree.

### Panel placement

21. Agent asks for the right or the bottom placement. Reeve needs a placement argument on every agent panel call.
22. Agent command waits until the target task is visible. Reeve needs a queue for a command that names a hidden task.
23. Agent receives no error for a failed queued command. Reeve needs the same silent failure rule, or a stated difference.

### Settings and approval state

24. Agent reads settings and setting definitions. Reeve needs a read that returns the value and the accepted values.
25. Agent writes a setting or a task configuration. Reeve needs a write that names the scope and the key.
26. Human confirms an agent configuration write. Reeve needs a confirmation surface, and a refusal path for a second request.
27. Agent changes the approval policy. Reeve needs the two policy values of the reference.
28. Agent changes the sandbox mode. Reeve needs the three sandbox values of the reference.
29. Agent changes the network access value. Reeve needs a boolean control inside the workspace write policy.
30. Agent changes the web search mode. Reeve needs the four search values of the reference.
31. A managed or restricted key refuses an agent write. Reeve needs a refusal that names the key and the restriction.

### Questions and option pickers

32. Human skips a question. Reeve needs a skip path that returns an empty answer to the agent.
33. Agent asks for an option choice during onboarding. Reeve has no onboarding flow, so the need is undecided.
34. Agent asks for structured onboarding input. Reeve has no onboarding flow, so the need is undecided.
35. Agent advances a native setup step. Reeve has no native setup flow, so the need is undecided.
36. Agent requests an environment configuration. Reeve has no cloud environment setup, so the need is undecided.
37. A connected server asks the human for input. Reeve needs a request surface for a connected server prompt.

### Session lifecycle

38. Agent creates another task. Reeve needs a create call with a target, a prompt, and a returned identity.
39. Agent lists tasks in pinned and recency order. Reeve needs a list with a title and a short summary for each task.
40. Agent lists archived tasks. Reeve needs a paged list of archived tasks.
41. Agent reads the turns of another task. Reeve needs a read that returns recent turns without opening the task.
42. Agent waits for other tasks to finish. Reeve needs a bounded wait over several tasks with cursors.
43. Agent sends a follow-up prompt to another task. Reeve needs a send that appears as a human message in that task.
44. Agent moves a task between a checkout and a worktree. Reeve needs a move that carries the git state.
45. Agent reads the status of a move operation. Reeve needs a status read with a revision and a wait value.
46. Agent archives or restores a task. Reeve needs both directions in the background.
47. Agent renames a task. Reeve needs a background rename.
48. Agent pins a task. Reeve needs a background pin and unpin.
49. Agent lists projects before creation. Reeve needs a project list with a repository flag.
50. Agent navigates the window to a task. Reeve needs a navigation call for the most recent window.

### Capture

51. Agent reads the foreground application during a voice session. Reeve has no voice session, so the need is undecided.
52. Agent reads the current application page state. Reeve needs a read of the current page and panel state.
53. Capture permission request during setup. Reeve has no capture onboarding, so the need is undecided.

### Visualizations

54. Application grants a writable visualization root for a turn. Reeve needs a per task directory and a sandbox rule.
55. Application detects a visualization file write. Reeve needs a detector that marks each file as a create or an update.
56. Visualization renders inside an isolated container. Reeve needs an isolated view with a strict content policy.
57. Visualization sends a follow-up message to the task. Reeve needs a confirmed follow-up path from the view.
58. Visualization reports an error and offers a repair action. Reeve needs an error surface with an agent repair action.
59. Human opens the visualization from the activity. Reeve needs an action on the file change row.

### Remaining registered capabilities

60. Session scoped application control service. Reeve needs one service that registers every application control for a Session.
61. Deferred tool loading inside one namespace. Reeve needs a namespace that loads a schema only when the agent needs it.
62. Agent attaches a pull request to the task. Reeve needs an attachment record on the Session.
63. Agent removes an attached pull request. Reeve needs the reverse of the attachment record.
64. Agent lists task attachments. Reeve needs a list of every attachment on the Session.
65. Agent updates the short running summary. Reeve needs a short status value on the activity row.
66. Agent creates or changes a scheduled automation. Reeve has no scheduler, so the need is undecided.
67. Agent finalizes an environment configuration. Reeve has no cloud environment, so the need is undecided.
68. Agent lists hosts. Reeve has one local host today, so the need is undecided.
69. Agent creates a project. Reeve needs a project create call, or a stated omission.
70. Agent redeems a usage reset credit. Reeve has no account credit source, so the need is undecided.
71. Agent reports bundled runtime paths. Reeve has no bundled runtime set, so the need is undecided.
72. Agent reads or sets the task emoji. Reeve has no task emoji, so the need is undecided.
73. Agent creates, renames, or deletes a sidebar section. Reeve has no custom sidebar section, so the need is undecided.
74. Agent moves a task or a project between sidebar sections. The same sidebar decision governs this capability.
75. Agent reorders a sidebar section or the projects. The same sidebar decision governs this capability.
76. Agent reports an onboarding task outcome. Reeve has no onboarding checklist, so the need is undecided.
77. Agent removes an installed plugin. Reeve manages plugins today, and no ticket gives the agent that control.
78. Agent fires a celebration effect in the window. Reeve needs a decision on a non functional effect.
79. Developer instruction text teaches the application tools. Reeve needs instruction text for each control that it adopts.
80. Human captures a window with a hotkey. Ticket 205 records the decision, and no ticket builds the capture.

