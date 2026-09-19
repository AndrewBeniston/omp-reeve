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

The renderer builds one Desktop tool set for each task.

That builder places the lifecycle tools in the `codex_app` namespace.

A separate thread tool group supplies the lifecycle tools.

A feature override named thread tools gates the whole group.

The application must also run as a desktop client.

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `create_thread` | The thread tool group adds it to `codex_app`. | Its schema explains targets, prompts, and returned identity. |
| `fork_thread` | The thread tool group adds it to `codex_app`. | Its schema explains source selection and fork history. |
| `list_threads` | The thread tool group adds it to `codex_app`. | Its schema explains pinned order and recency order. |
| `list_archived_threads` | The thread tool group adds it to `codex_app`. | Its schema explains paging and restoration. |
| `read_thread` | The thread tool group adds it to `codex_app`. | Its schema explains turn reading without opening. |
| `wait_threads` | The thread tool group adds it to `codex_app`. | Its schema explains cursors, timeouts, and wake conditions. |
| `send_message_to_thread` | The thread tool group adds it to `codex_app`. | Its schema explains follow-up prompts. |
| `handoff_thread` | The thread tool group adds it to `codex_app`. | Its schema explains checkout and worktree movement. |
| `get_handoff_status` | The thread tool group adds it to `codex_app`. | Its schema explains revision polling. |
| `set_thread_archived` | The thread tool group adds it to `codex_app`. | Its schema explains background archive and restore. |
| `set_thread_title` | The thread tool group adds it to `codex_app`. | Its schema explains background renaming. |
| `set_thread_pinned` | The thread tool group adds it to `codex_app`. | Its schema explains background pinning. |
| `list_projects` | The thread tool group adds it to `codex_app`. | Its schema explains project selection before creation. |
| `share_thread` | The Desktop tool builder adds it to `codex_app`. | Its schema explains the immutable share link. |
| `navigate_to_codex_page` | The Desktop tool builder adds it to `codex_app`. | Its schema explains window navigation. |

The builder marks a tool for deferred loading when the tool is not eager.

The agent then loads the schema when the schema becomes necessary.

`navigate_to_codex_page` is an eager tool.

The thread lifecycle tools are deferred tools.

Four separate switches change the registered set.

A fork switch removes `fork_thread` for an unsupported history mode.

A sharing switch adds `share_thread`.

A navigation switch adds `navigate_to_codex_page` on a local desktop host.

A sidebar sections switch replaces `set_thread_pinned` with the sidebar section tools.

A cross host switch adds the destination host property to `handoff_thread`.

The handoff schema then lists each available host by display name and identifier.

The create and message schemas list the models of the calling host.

The create schema also states that a destination host validates its own models.

### Creation

`create_thread` accepts a prompt, a target, an optional title, a model, and a reasoning effort.

The target is a project, a projectless task, or a ChatGPT Work cloud task.

A project target needs a project identifier and an environment.

The environment is local or worktree.

A worktree environment accepts an optional starting state.

The starting state is the working tree or a named branch.

A missing branch produces an error unless the request asks for branch creation.

The application rejects a ChatGPT project identifier for a local or worktree target.

The application rejects a local project identifier for a cloud target.

The application rejects a model or a reasoning effort for a cloud target.

The application validates the model against the destination host model list.

A created thread returns a thread identifier and a host identifier.

A projectless creation also returns its output directory.

A pending worktree creation returns a client thread identifier instead.

The schema forbids the use of a client thread identifier where a thread identifier is required.

Creation does not block the calling turn.

The application applies the supplied title at creation and skips automatic title generation.

### Navigation and focus

`navigate_to_codex_page` shows one thread or chat.

The tool first resolves the thread kind as a Codex thread or a ChatGPT chat.

The tool then runs a show thread action in the primary window.

The action targets the current window.

The result reports only that navigation happened.

The tool returns no tab identifier and no window identifier.

`read_thread` reads another thread without opening it.

`read_thread` returns recent status and turn summaries.

`read_thread` accepts a cursor, a turn limit, and an output character limit.

`wait_threads` waits for up to eight threads.

`wait_threads` rejects the calling thread as a target.

`wait_threads` rejects a duplicate thread and host pair.

A completed turn in the calling thread cancels the wait.

New human input in the calling thread also ends the wait.

The tool then reports that new input interrupted the wait.

### Archive and unarchive

`set_thread_archived` archives or restores one thread.

An omitted thread identifier targets the calling thread.

The application resolves the owning host before the change.

An archive hydrates the background thread first.

An archive records a dynamic tool source.

The tool returns the thread identifier and the archive state.

The application also queues a pending archive record for the host.

That record carries the working directory and a worktree cleanup flag.

A successful handoff archives the source thread without worktree cleanup.

`list_archived_threads` lists one page of archived tasks from one host.

Its schema names `set_thread_archived` with a false value as the restore path.

### Fork

`fork_thread` forks the calling thread or a named thread.

A same directory fork returns a child thread identifier immediately.

That result reports a created status and a synchronization state.

An incomplete synchronization returns a continuation warning.

The warning tells the agent not to fork again and not to send a follow-up.

A worktree fork returns a queued status and a client thread identifier.

That result carries a null thread identifier.

A worktree fork needs a current directory on the source thread.

A fork copies completed history only.

An active turn and an unfinished response are not copied.

The fork records a thread source value for an agent fork.

### Handoff

`handoff_thread` moves another thread between its checkout and its Codex worktree.

The calling thread cannot hand itself off.

A cloud thread cannot be handed off.

The tool interrupts a running thread before the move.

The tool resumes the conversation before the move.

The tool transfers the browser state of the thread.

A cross host move needs the cross host switch and an available host.

The tool returns an operation identifier and a revision.

The operation identifier is the tool call identifier.

A repeated call with the same call identifier returns the existing progress.

`get_handoff_status` reads that operation by its identifier.

`get_handoff_status` accepts a revision and a wait time up to 60000 milliseconds.

A successful handoff creates a destination conversation.

The destination conversation has a new thread identifier.

The application then archives the source thread.

An optional follow-up prompt goes to the destination thread.

A destination thread identifier equal to the source identifier reports a creation failure.

### Title

`set_thread_title` renames the calling thread or a named thread.

The application resolves the owning host before the change.

The title change requires an acknowledgement from the host.

The application then refreshes the thread description.

The tool returns the thread identifier and the title.

`create_thread` can also set the initial title.

That title receives the same normalization as a generated title.

### Share

`share_thread` creates an immutable share link.

An omitted thread identifier targets the calling thread.

A separate sharing switch must be active.

The tool reads the account policy and the current permissions.

A workspace account produces a workspace audience.

Another account produces a public audience.

A permissive sandbox or an approval policy other than never needs human approval.

The tool then requests approval before it creates the link.

The tool reads the target thread name for that approval when the target differs.

The tool returns the audience and the share link.

A completed turn in the calling thread cancels the share request.

### Identity and survival

A Codex thread identity is a thread identifier plus a host identifier.

Every lifecycle tool accepts the host identifier as an optional value.

An omitted host identifier resolves to the calling task host.

The tools return the identity as plain text in a tool result.

The text content is a serialized result object.

A pending worktree thread has a client thread identifier instead.

The main process stores a client thread identifier under a durable storage key.

That key carries a version marker and a local prefix.

The main process also stores thread tab routes under a separate versioned key.

The main process stores a workspace state under a third versioned key.

I infer that these keys let the identity survive an application restart.

A handoff does not preserve the thread identifier.

A handoff creates a new destination thread and archives the source thread.

A share link holds a separate immutable copy.

The share link does not track later thread changes.

### Transcript rendering and human access

The transcript stores a lifecycle tool call as a dynamic tool call item.

The transcript adapter converts that item into a generic dynamic tool activity.

The activity carries the namespace, the tool name, the arguments, and a completion flag.

Two tools receive extra transcript data.

`create_thread` and `handoff_thread` also carry their content items and their success flag.

Therefore, those two activities can show their own result content.

The transcript also carries a handoff progress item with step states.

The step states are running, failed, and success.

The instructions ask the agent to emit a created thread directive after a creation.

That directive carries the thread identifier or the client thread identifier.

The markdown renderer produces no inline content for that directive.

I infer that a separate handler turns the directive into an openable task item.

The transcript also defines archive thread and unarchive thread directives.

`navigate_to_codex_page` is the only tool that opens a thread in the window.

No lifecycle tool result carries a tab identifier.

### Instructions and permissions

The `create_thread` schema restricts creation to an explicit human request.

The schema states that the prompt appears as a human visible message.

The coordinator instructions add a delegation policy.

That policy sends slow or multi-step work to another thread.

That policy keeps a human choice in the calling thread.

That policy requires a return report instruction in every worker prompt.

That policy prefers `wait_threads` snapshots over repeated `read_thread` calls.

The `list_threads` schema marks returned titles and summaries as untrusted data.

The `list_archived_threads` schema repeats that warning.

The `create_project` schema restricts project creation to an explicit request.

The `share_thread` flow is the only lifecycle flow with a human approval step.

An automation task and a pull request fix automation cannot request that approval.

Archive, title, pin, fork, and handoff need no separate approval.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Inactive thread tools switch | The lifecycle tools are absent. |
| Unsupported history mode | `fork_thread` is absent. |
| Inactive sharing switch | `share_thread` is absent or reports that sharing is unavailable. |
| Non local host | `navigate_to_codex_page` is absent. |
| Invalid arguments | The tool returns an unsuccessful result with the failed fields. |
| Missing calling thread identity | `fork_thread` and `set_thread_archived` report the missing identity. |
| Unknown project identifier | `create_thread` asks the agent to call `list_projects`. |
| ChatGPT project with a local target | `create_thread` reports the wrong target type. |
| Local project with a cloud target | `create_thread` reports the wrong target type. |
| Model override on a cloud target | `create_thread` rejects the override. |
| Unsupported model or effort | `create_thread` reports the unsupported combination. |
| Incomplete fork setup | The result warns against another fork and a follow-up. |
| Worktree fork without a directory | `fork_thread` reports the missing directory. |
| Self handoff | `handoff_thread` rejects the request. |
| Unavailable destination host | `handoff_thread` reports the unavailable host. |
| Disabled cross host handoff | `handoff_thread` reports the disabled capability. |
| Blocked detached window | `handoff_thread` reports a localized block reason. |
| Failed destination creation | The handoff item reports that the destination thread failed. |
| Failed source archive after handoff | The application logs a warning and keeps the handoff. |
| Unknown operation identifier | `get_handoff_status` reports no matching operation. |
| Wait on the calling thread | `wait_threads` rejects the target. |
| Duplicate wait target | `wait_threads` rejects the duplicate pair. |
| New human input during a wait | `wait_threads` reports an interrupted wait. |
| Undetermined account policy | `share_thread` reports the undetermined policy. |
| Approval unavailable for sharing | `share_thread` reports the unavailable approval. |
| Denied share approval | `share_thread` reports the denied approval. |
| Aborted share | `share_thread` reports the cancellation. |
| Failed share | `share_thread` reports the failure message. |
| Failed navigation | `navigate_to_codex_page` reports the failure. |
| Unknown thread for navigation | The tool tries the ChatGPT path and then fails. |
| Unsupported dynamic tool | The dispatcher reports an unsupported tool. |
| Unsupported namespace | The dispatcher reports an unsupported namespace. |

## Open questions

I did not verify the live rendering of the created thread directive.

I did not verify the visible handoff progress item in the running application.

I did not verify the pinned tool behaviour with the sidebar sections switch active.

I did not verify the goal view scope contents.

I did not verify the core goal tool implementation because the archive does not contain it.
