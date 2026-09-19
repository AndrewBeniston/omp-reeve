# Codex Desktop agent goal state and session lifecycle

## Status

This report contains evidence only.

The mapping worker will complete the mapping sections.

## Scope

This report covers two surfaces of the Codex Desktop application control layer.

The first surface is goal state.

The second surface is session lifecycle.

Goal state includes goal creation, budgets, status changes, and goal presentation.

Session lifecycle includes creation, navigation, archive, unarchive, fork, handoff, title, and share.

This report excludes every other surface.

Other workers cover the other surfaces.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected its main process bundle, its renderer bundle, and its feature chunks.

I inspected tool schemas, tool instructions, service registrations, and transcript adapters.

I also inspected the Session tool catalog that the running application supplied to this task.

I did not perform a live application test.

Every finding below is source-verified unless I label it as an inference.

## Goal state

### Registration and discovery

The agent receives three goal tools.

The application archive does not define any of them.

Therefore, the core agent server registers the goal tools.

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `create_goal` | The core agent server registers this Session tool. | The tool schema explains when a goal may start. |
| `update_goal` | The core agent server registers this Session tool. | The tool schema explains each permitted status change. |
| `get_goal` | The core agent server registers this Session tool. | The tool schema explains goal status and budget reading. |
| `thread/goal/set` | The application client sends this thread request. | The agent does not receive this request directly. |
| `thread/goal/get` | The application client sends this thread request. | The agent does not receive this request directly. |
| `thread/goal/clear` | The application client sends this thread request. | The agent does not receive this request directly. |
| `/goal` | The composer registers this slash command. | The human starts a goal with this command. |

The application listens for two goal notifications.

The first notification reports a goal update.

The second notification reports a goal clear.

### Actions and identity

`create_goal` accepts an objective and an optional token budget.

`create_goal` fails when an unfinished goal exists.

`update_goal` changes only the status.

`get_goal` returns the status, the budgets, the token use, the elapsed time, and the remaining budget.

The goal result identifies the thread that owns the goal.

The goal result also carries a creation time and an update time.

The goal has no separate goal identifier in the application state.

The creation time acts as the goal identity in the application.

The application compares that creation time to detect a replaced goal.

The application stores one goal for each conversation.

A conversation holds at most one goal at a time.

### Budgets

The token budget is a property of the core goal tool.

The application goal request carries an objective and a status only.

Therefore, the application does not set or read the token budget.

The token budget depends on a history notes extension.

The application marks a conversation as a token budget conversation in local storage.

That mark is stored for each host.

A continuation or a fork of a token budget task needs a compatible app server version.

An incompatible app server version shows a version error.

The error asks the human to update the app server.

### Status changes

The goal status has six values.

The values are active, paused, blocked, complete, budgetLimited, and usageLimited.

The agent may set complete, blocked, and paused.

The agent may not set budgetLimited or usageLimited.

The application treats paused, blocked, and usageLimited as states that need a resume.

The application treats active, budgetLimited, and complete as states that need no resume.

The human control toggles active to paused.

The human control toggles paused, blocked, and usageLimited to active.

The human control offers no toggle for budgetLimited or complete.

A system interrupt pauses an active goal before the interrupt runs.

A human stop also pauses an active goal before the interrupt runs.

That pause request uses critical priority and a 500 millisecond timeout.

A failed pause reports a goal pause error with the interrupted turn identifier.

A descendant cleanup pauses the goal after the interrupt instead.

A goal update to complete triggers an automatic clear request.

The clear request only runs when the update time differs from the recorded completed goal.

A clear request also runs from the human control.

A conditional clear runs only while the goal is active and the thread source matches.

### Presentation and transcript rendering

The application shows the goal objective as a synthetic completed turn.

That turn holds the objective as its only text input.

That turn holds no items and no diff.

That turn records minimal effort and no summary.

That turn uses the goal update time as its start time.

The application suppresses a duplicate when an identical turn already exists.

The goal state also drives a dedicated goal view scope.

The transcript records no separate item for a status change.

A status change updates the stored goal and the goal presentation only.

Goal failures report through toast messages.

The toasts are "Failed to set goal", "Failed to update goal", and "Failed to clear goal".

The composer reports a message blocked reason named thread goal continuation.

I infer that this reason blocks submission during a goal continuation.

### Instructions and permissions

The `create_goal` schema restricts goal creation to an explicit request.

The schema tells the agent not to infer a goal from an ordinary task.

The schema restricts the token budget to an explicit budget request.

The `update_goal` schema restricts paused to an explicit human request.

The schema restricts complete to an achieved objective.

The schema restricts blocked to a condition repeated over three consecutive goal turns.

The schema forbids resume, budget limited, and usage limited from the agent.

The schema requires a final token report for a budgeted goal.

A goal needs no separate approval dialogue.

A goal turn inherits the approval policy, the approvals reviewer, and the sandbox policy.

The goal objective accepts pasted text attachments and image attachments.

A durable host inlines the pasted text into the objective.

Another host writes each attachment into a goal attachment directory.

The objective then references each written file path.

An objective longer than 4000 characters moves into a file.

The objective then holds a pointer to that file.

A failed materialization removes the attachment directory.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Existing unfinished goal | `create_goal` fails. |
| Empty objective and no attachment | The application rejects the goal. |
| Uploaded pasted text without a cloud task | The application reports that a cloud task is necessary. |
| Restricted account attachment | The application reports that goal attachments are unavailable. |
| Unknown attachment directory | The application reports an unknown goal attachment directory. |
| Invalid attachment directory | The application reports an invalid goal attachment directory. |
| Missing history notes support | The application asks for an app server update. |
| Failed goal set request | The application shows a set failure toast. |
| Failed goal status request | The application shows an update failure toast. |
| Failed goal clear request | The application shows a clear failure toast. |
| Failed pause before a human stop | The application reports a goal pause error. |
| Failed goal hydration after resume | The application keeps the previous goal and logs a warning. |
| Unavailable conversation owner | The application resumes the conversation before the goal set. |
| Not ready conversation | The goal set request fails. |

## Session lifecycle

### Registration and discovery

Evidence pending.

### Creation

Evidence pending.

### Navigation and focus

Evidence pending.

### Archive and unarchive

Evidence pending.

### Fork

Evidence pending.

### Handoff

Evidence pending.

### Title

Evidence pending.

### Share

Evidence pending.

### Identity and survival

Evidence pending.

### Transcript rendering and human access

Evidence pending.

### Instructions and permissions

Evidence pending.

### Failure and unavailable states

Evidence pending.

## Open questions

Evidence pending.
