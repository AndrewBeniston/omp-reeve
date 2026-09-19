# Codex Desktop agent application control surface

## Status

This report contains evidence only.

The mapping worker will complete the reserved mapping sections.

## Scope

This report inventories Session-scoped application control available to the Codex Desktop agent.

This report excludes Browser control.

Ticket 440 covers Browser control.

## Preserved findings

The previous worker reported these findings before this research started.

- The Codex Desktop reference extract reports version 26.908.40834.
- The archive fallback reports version 26.915.31029.
- The newer archive adds `create_worktree` and a gated `thread_tools` namespace.
- The main process routes dynamic tools through the primary ready renderer.

I independently verified the current archive version and the two newer registrations.

I have not independently verified version 26.908.40834.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected its main process, renderer, tool schemas, service registrations, and transcript adapters.

I also inspected the bundled plugin manifests and skills when a surface used them.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Capability inventory

### Terminal

Codex Desktop exposes two separate terminal systems.

The app Terminal uses a terminal session identifier.

Command execution uses a process session identifier.

The identifiers are not interchangeable.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `exec_command` | The app server registers this core Session tool. | The Session tool schema explains process creation and continuation. |
| `write_stdin` | The app server registers this core Session tool. | The Session tool schema explains process input and polling. |
| `terminal` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `read_thread_terminal` | The Desktop tool builder adds it to `codex_app`. | Its schema teaches the agent to read the current app Terminal. |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema lists Terminal as a supported panel target. |
| `windows.tabs.open` | `open_in_codex` queues this application command. | The agent learns only the enclosing `open_in_codex` tool. |

The `codex_app` namespace can defer both Desktop tools.

The agent loads a deferred tool when its schema becomes necessary.

The app Terminal service supports `create`, `attach`, `attachExisting`, `write`, `runAction`, `resize`, and `close`.

The service also supports `getThreadSnapshot` and `transferSessionOwnership`.

These service commands are not direct agent tools.

#### Actions and identity

`exec_command` starts a command and can return a process session identifier.

`write_stdin` sends text or control input to that process session.

`write_stdin` can also poll the process without sending text.

Command execution does not create an app Terminal Tab.

`open_in_codex` opens a new or existing app Terminal Tab.

The request can supply a terminal session identifier.

An omitted identifier creates a terminal session for the visible task.

The tool result to the agent returns the queued status and the task identifier only.

The tool result to the agent returns no placement and no Terminal Tab identifier.

The window computes the placement and the Terminal Tab identifier when the queued command runs.

The Terminal Tab identifier inside the window derives from the terminal session identifier.

The status inside that window record is `opened` or `existing`.

An earlier reading of this report stated that the tool result returns the placement and the Tab identifier.

That reading was wrong, and I inspected the panel tool handler to settle it.

The Panel placement subsection records the same correction.

`read_thread_terminal` reads the current task Terminal snapshot.

The snapshot contains the working directory, shell, recent output, and truncation state.

The snapshot does not return the terminal session identifier.

The snapshot retains at most 16,000 output characters.

The renderer serializes the terminal session identifier in the durable Tab record.

After a renderer reload, the renderer asks the main process to attach that identifier again.

Reattachment succeeds only while the main process still owns the matching session.

The main process stores the terminal process and recent output in memory.

The main process binds each terminal session to one window and one task.

The service rejects input from another window.

A same-window task transfer can retain the terminal session identifier and process.

Transfer requires an attached local terminal without a cloud environment.

The source and target tasks must differ.

The source task selects another Terminal Tab when the transferred Tab was active.

#### Placement and human access

`open_in_codex` accepts `right` or `bottom` placement.

Without a placement, it uses the task's configured Terminal location.

An existing Terminal Tab keeps its current placement.

The queued command reveals and focuses the Terminal Tab inside the window.

The transcript activity has no later action for reopening that Terminal Tab.

Command activity expands its output inside the transcript.

Command activity does not open an app Terminal Tab.

#### Transcript rendering

The transcript converts each command execution into an `exec` activity.

The activity includes the command, working directory, state, duration, output, and exit code.

The activity can show `inProgress`, `completed`, `failed`, `declined`, or `interrupted` state.

Terminal interaction events update the related command execution.

`open_in_codex` and `read_thread_terminal` render as `codex_app` tool activity.

Their results remain text content inside the tool activity.

No Terminal-specific presentation metadata accompanies either Desktop tool result.

#### Instructions and permissions

The `exec_command` schema teaches background process continuation through the returned session identifier.

The `write_stdin` schema teaches polling and process input.

The `read_thread_terminal` schema teaches inspection before the next action.

The `open_in_codex` schema teaches when visible Terminal presentation helps the human.

Command execution follows the task's approval policy, sandbox, and network policy.

The app server can request command approval before execution.

The app server can also request approval before process input.

`read_thread_terminal` requires no separate user approval.

`open_in_codex` requires no separate user approval.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Invalid Desktop tool arguments | The tool returns an unsuccessful result. |
| Missing Desktop action host | `open_in_codex` reports that app actions are unavailable. |
| Archived preview | The Tab command reports that panels are unavailable. |
| No visible task | The Tab command rejects the request. |
| Wrong visible task | The Tab command rejects the target task. |
| Non-local task | The Terminal target reports that the Tab is unavailable. |
| Terminal registration failure | The window logs a warning, and the agent receives no error. |
| Hidden target task | The command queues until that task becomes visible in the same window. |
| Missing app Terminal | `read_thread_terminal` reports that no Terminal is attached. |
| Snapshot failure | `read_thread_terminal` reports a read failure. |
| Missing terminal session | The service reports `Session missing`. |
| Different owning window | The service reports `Session owned by another window`. |
| Terminal process error | The Tab shows the error and permits a new Terminal. |
| Changed cloud environment | The Tab reports that the Terminal environment is unavailable. |
| Failed cloud start | The Tab reports the failure and permits a new Terminal. |
| Command approval denied | The command activity records the declined state. |
| Command interruption | The command activity records the interrupted state. |
| Process exit | Later process input cannot continue that process session. |

### Files

Codex Desktop gives the agent one file presentation tool.

Codex Desktop gives the agent no file tree tool and no file listing tool.

The agent changes a file through a core patch tool.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema lists a workspace file as the first panel target. |
| `apply_patch` | The app server registers this core Session tool. | The Session tool schema explains freeform patch editing. |
| `windows.tabs.open` | `open_in_codex` queues this application command. | The agent learns only the enclosing tool. |
| `workspaceFiles` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `lsp` | Each desktop window registers this host service. | The agent does not receive this service directly. |

The tool builder filters the panel targets by availability.

The file target skips that filter and is always present.

The desktop bundles do not contain the core patch schema.

Therefore the core patch registration point is an inference.

Each window registers a language server service for definition and reference lookup.

No agent tool schema exposes that service.

Therefore the agent cannot call a definition lookup.

#### Actions and identity

`open_in_codex` with a file target opens one workspace file in a panel Tab.

The request accepts a path and an optional positive line number.

The command selects a viewer in a fixed order.

The order is artifact viewer, extension file viewer, text file editor, an open file Tab, and review file source viewer.

The command skips the text file editor when the caller supplies an end line.

Each viewer builds its own Tab identifier from the host and the path.

A second call for the same host and path finds the same Tab.

Each file Tab stores a durable route with a payload version.

The route stores the host, the path, the line, the column, and the workspace root.

After a renderer reload, the renderer reopens the file from that stored route.

The renderer rejects a stored payload with another version number.

The renderer keeps the Tab and opens no file while the host is disconnected.

The renderer can copy a complete panel Tab set from one task to another task.

The copy keeps each path and builds a new Tab identifier from the target host.

A worktree copy rebases each path onto the target workspace root.

Therefore a file Tab transfers by path, and a terminal Tab transfers by session.

The file Tab holds its own workspace file navigation for one directory at a time.

That navigation rejects a path outside the workspace root and a symbolic link directory.

The agent receives no tool for that navigation service.

#### Placement and human access

`open_in_codex` accepts `right` or `bottom` placement.

A file target uses `right` when the caller supplies no placement.

An already open file Tab keeps its current placement.

The command searches the requested placement first and then the other placement.

The command pins, activates, and focuses the Tab that it finds.

A new file Tab opens revealed and focused.

A copied file Tab opens without reveal and without focus.

Codex can open a preview Tab for an edited file without a human action.

That automatic open applies only to a slide, document, spreadsheet, or portable document file.

That automatic open needs an enabled experiment setting, an idle task, and a current turn.

That automatic open rejects a file larger than 41,943,040 bytes.

Assistant text can contain a file citation with a path and a line range.

The Files worker did not verify that a click on that citation opens a file Tab.

#### Transcript rendering

The transcript stores each agent file edit as a file change item.

The adapter renders that item as a patch activity.

The patch activity carries the item identifier, the status, the change set, and a success value.

The status can be `inProgress`, `completed`, `failed`, or `declined`.

The change set names each path and each change kind.

A rename shows the move path of the change.

A patch approval request attaches an approval identifier to the same patch activity.

The adapter drops an approval request for an unknown item and records a warning.

The adapter adds one turn diff activity at the end of a turn.

The turn diff joins every completed patch batch into one unified diff.

`open_in_codex` renders as a `codex_app` tool activity.

No file presentation metadata accompanies that result.

#### Instructions and permissions

The `open_in_codex` schema is the only file instruction that the agent receives.

That schema teaches the agent to show a workspace file in a Codex panel.

That schema states that the call opens the user interface only.

That schema tells the agent to use a file tool to inspect or change the content.

That schema tells the agent to call the tool after it creates or edits a file.

The bundles contain no skill and no instruction for the file tree.

Therefore the agent receives no guidance about file navigation. This statement is an inference.

A file change follows the task sandbox policy and the task approval policy.

A read-only sandbox blocks every write.

A workspace write sandbox permits a write inside the writable roots.

A full access sandbox permits a write without a root limit.

The app server can request approval before it applies a patch.

That approval request can name a grant root.

An accepted grant root extends the writable roots. This statement is an inference.

`open_in_codex` needs no separate user approval.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Invalid Desktop tool arguments | The tool returns an unsuccessful result. |
| Missing Desktop action host | `open_in_codex` reports that app actions are unavailable. |
| Archived preview | The Tab command reports that panels are unavailable. |
| No visible task | The Tab command rejects the request. |
| Wrong visible task | The Tab command rejects the target task. |
| File opener returns nothing | `open_in_codex` reports that the file Tab could not open. |
| File type without an editor language | The text file editor declines the file. |
| End line in the request | A source viewer opens the file instead. |
| Stored Tab payload with another version | The renderer does not restore the file Tab. |
| Disconnected host during restore | The renderer keeps the Tab and opens no file. |
| Directory path outside the workspace root | The file navigation service rejects the request. |
| Symbolic link directory | The file navigation service rejects the request. |
| Language server request over 30 seconds | The service reports a request timeout. |
| Patch approval denied | The file change item records the declined status. |
| Patch failure | The file change item records the failed status. |
| Automatic preview over the size limit | The preview does not open. |
| Automatic preview during an active turn | The preview does not open. |

### Review

Codex Desktop exposes one Review panel to the agent.

The agent opens that panel through the same panel tool that opens other Tabs.

The agent creates review comments through a message directive, not through a tool.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema lists review as a supported panel target. |
| `windows.tabs.open` | `open_in_codex` queues this application command. | The agent learns only the enclosing tool. |
| Inline comment directive | The message parser reads the directive from the assistant message. | A developer instruction section teaches the directive. |
| Pull request diff link | The renderer converts the link into a review open action. | A developer instruction section teaches the link format. |

The schema declares two review target shapes.

The first shape names a view value.

The second shape names a base revision for a branch comparison.

The developer instruction text always includes both review sections.

#### Actions and identity

`open_in_codex` opens or reveals the Review panel in the calling task.

The Review panel is one Tab with a fixed identifier for the task.

The tool accepts four review view values.

| View value | Verified effect |
| --- | --- |
| `last-turn` | The panel shows the changes of the most recent turn. |
| `branch` | The panel compares the branch against its base revision. |
| `staged` | The panel shows the staged changes. |
| `unstaged` | The panel shows the unstaged changes. |

A base revision value selects the branch view and is stored for the repository root.

The base revision must resolve locally to a commit.

An optional path value selects one file inside the Review panel.

The panel keeps a separate last explicit view value in durable storage.

That stored value defaults to the branch view.

The agent can also pass a review deep link as a browser target.

A pull request link must carry a pull request address, a file path, and a positive line number.

A pull request link opens the pull request code Tab instead of the local Review Tab.

A task review link opens the local Review Tab with the view and path from the link.

A task review link must name the calling task.

The Review Tab stores a durable route record with a payload version.

The record holds the task, the working directory, the host, the view, and the base revision.

After a reload, the panel restores only when the task, working directory, and host still match.

The inline comments are stored against the task identifier.

A task handoff moves the stored comments with the task.

A task that receives a final identifier keeps its comments and drops duplicates.

#### Placement and human access

`open_in_codex` accepts `right` or `bottom` placement for the Review panel.

The Review panel uses the right placement when the call omits a placement.

An existing Review Tab keeps its current placement.

The queued command reveals and focuses the Review Tab inside the window.

The Review Tab is always available in the panel registry.

A pull request diff link in the transcript is an active link.

The link shows a preview card with the repository, the destination, and the changed file count.

A click on the link opens the pull request code Tab at the named file and line.

An inline comment from the model appears in the Review panel.

A selection of that comment opens the related file and scrolls to the comment.

The human can also open the Review panel without any agent action.

#### Transcript rendering

The Review panel tool call renders as generic `codex_app` tool activity.

The tool result stays text content inside the tool activity.

No review presentation metadata accompanies the result.

The inline comment directive does not render as visible text.

The message renderer removes every directive line from the displayed message.

The comment appears in the Review panel instead.

Each stored comment holds the text, the file path, the line, and the side.

The side value is always the changed side for a model comment.

The application reads the comments only from the last agent message.

The application collects comments only for a local task.

A user message that returns review comments renders a comment count and the comment list.

#### Instructions and permissions

The panel tool description teaches the agent to show a result after it creates an artifact.

The description states that the tool opens application interface only.

The review view field lists the four permitted view values.

The base revision field states that the revision must resolve locally to a commit.

One developer instruction section teaches the pull request diff link format.

That section requires an encoded address, an encoded repository relative path, and a verified line.

That section reserves ordinary file links for workspace code.

A second developer instruction section teaches the inline comment directive.

That section requires a title, a body, and a file for each comment.

That section permits optional start and end line numbers and a priority from 0 to 3.

That section requires no directive when no actionable comment exists.

The application adds both instruction sections to every desktop task.

Neither the panel tool nor the comment directive needs a user approval.

A restricted external resource policy changes the pull request link behaviour.

The link then shows plain text and the click follows the external link confirmation path.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Missing Desktop action host | The panel tool reports that app actions are unavailable. |
| Archived preview | The Tab command reports that panels are unavailable. |
| No visible task | The Tab command rejects the request. |
| Wrong visible task | The Tab command names the visible task and rejects the target. |
| Hidden target task | The command queues until that task becomes visible in the same window. |
| Review Tab registration failure | The command reports that the Review Tab could not open. |
| Incomplete pull request link | The command asks for an address, a path, and a positive line. |
| Review link for another task | The command directs the agent to set the task identifier. |
| Other Codex deep link | The command reports that panel opens do not support the link. |
| Missing account or snapshot | The pull request open reports the unavailable resource. |
| Restored task mismatch | The Review Tab does not return after the reload. |
| Non-local task | The application collects no inline comment from the agent message. |
| Invalid comment attributes | The parser drops that comment. |
| Duplicate comment | The store keeps the first comment only. |

### Side chat

A side chat is a temporary thread beside a main thread.

The human creates a side chat, and the agent does not.

No agent tool creates, opens, focuses, closes, or reads a side chat.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| Open side chat command | The renderer registers this application command. | The agent does not receive this command. |
| Focus side chat command | The renderer registers this application command. | The agent does not receive this command. |
| Focus main chat command | The renderer registers this application command. | The agent does not receive this command. |
| Side chat panel Tab | The side chat feature chunk opens this Tab kind. | The agent does not receive this Tab kind. |
| Side chat menu item | The thread header menu lists this item. | The agent does not receive this menu. |

The panel tool schema does not list a side chat target.

The open command requires local Codex access and the desktop application.

The open command carries a default keyboard shortcut.

#### Actions and identity

The renderer creates the side chat as a fork of one source thread.

The fork excludes the parent turns from the new thread record.

The renderer injects a boundary message as the first user item.

The boundary message states that the inherited history is reference context only.

The boundary message forbids continuation of any earlier instruction, plan, tool call, or edit.

A local side chat passes a thread reference to the parent thread.

A local side chat passes a rendered parent transcript when the reference is unsupported.

A cloud side chat always passes a rendered parent transcript.

The rendered transcript uses at most 50 parent turns and 100 conversation entries.

A cloud side chat reuses the parent environment, permissions, working directory, and workspace roots.

The side chat receives a conversation identifier from the application server.

The panel Tab identifier derives from that conversation identifier.

The side chat thread is marked ephemeral and records a side conversation flag.

The side chat thread records the parent thread as its fork source.

The side chat does not enter the recent thread list or the sidebar.

The memory pipeline and the project assignment do not run for a side chat.

A Tab close discards the conversation from the local cache.

A Tab close also stops an active voice session and removes the ephemeral voice history.

Therefore the side chat is not durable across a close.

#### Placement and human access

The side chat opens in the right panel by default.

The human can move the Tab to another permitted panel.

The human opens a side chat from the thread header menu.

The human can also open it from the command menu or with the keyboard shortcut.

A focus command moves focus to the main chat.

A second focus command moves focus to the side chat.

The focus command prefers an already active side chat Tab.

#### Transcript rendering

The side chat renders in its own panel Tab with its own composer.

The parent thread transcript holds no side chat item.

The parent thread keeps the list of its side chat conversation identifiers.

The parent thread shows a running indicator while a side chat turn is in progress.

The parent thread shows an unread indicator after a completed side chat turn.

The side chat Tab icon becomes a spinner while the turn runs.

The Tab announces an unread response to assistive technology.

#### Instructions and permissions

The renderer appends a side conversation instruction to the developer instructions.

That instruction repeats the boundary rule in the developer channel.

That instruction states that the side conversation is for questions and light exploration.

That instruction permits non-mutating inspection, including file reading and file search.

That instruction forbids workspace mutation unless the user asks for it in the side chat.

That instruction forbids escalated permission requests without such a request.

That instruction forbids every sub-agent interaction inside the side chat.

No skill teaches side chat use.

No agent tool description mentions the side chat.

The human needs no further approval to open a side chat.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Archived source thread | The renderer refuses to create a side chat. |
| Suppressed source thread | The renderer refuses to create a side chat. |
| Cloud parent without an environment | Creation fails and reports the missing environment. |
| Cloud parent without permissions | Creation fails and reports the missing permissions. |
| Cloud parent without workspace roots | Creation fails and reports the missing workspace roots. |
| Creation error | The pending Tab fails and the new conversation is discarded. |
| Failed first turn synchronization | The side chat reports that the first turn did not start. |
| Close with at least one turn | A confirmation dialog asks before the close. |
| Active voice without a voice host | The close reports that the voice host is unavailable. |
| Voice not stopped within 30 seconds | The close reports that voice did not stop. |
| Failed voice stop | The renderer reopens the Tab and keeps the side chat. |
| Failed cache discard | The renderer records a warning and reports the failure. |

### Sub-agents

A sub-agent is a separate agent thread that another agent creates.

The bundled application server provides the sub-agent tools.

The Codex Desktop renderer registers no sub-agent tool.

The renderer displays sub-agent activity and opens a sub-agent thread.

The application server carries two sub-agent tool generations.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `spawn_agent` | The application server registers this tool in both generations. | Its schema explains sub-agent creation and the returned identity. |
| `send_input` | The application server registers this first generation tool. | Its schema explains queued input and immediate redirection. |
| `send_message` | The application server registers this second generation tool. | Its schema explains message delivery without a new turn. |
| `followup_task` | The application server registers this second generation tool. | Its schema explains a new task that triggers a turn. |
| `wait_agent` | The application server registers this tool in both generations. | Its schema explains blocking until a final status or a timeout. |
| `interrupt_agent` | The application server registers this tool in both generations. | Its schema explains turn interruption and the previous status. |
| `resume_agent` | The application server registers this first generation tool. | Its schema explains reopening a closed agent. |
| `close_agent` | The application server registers this first generation tool. | Its schema explains shutdown of an agent and its descendants. |
| `list_agents` | The application server registers this tool in both generations. | Its schema explains listing of live agents in the thread tree. |
| Sub-agents panel Tab | The renderer registers this right side panel Tab. | The agent does not receive this Tab. |

The application server groups the tools under one namespace.

A configuration key can override the namespace name.

A separate configuration section controls the whole feature.

That section sets the concurrency limit, the depth limit, and the job runtime limit.

That section also sets the default sub-agent model and reasoning effort.

The second generation section sets the wait timeout range and can disable the wait tool.

The second generation section can also replace the sub-agent developer instructions.

The code mode runtime does not receive the second generation tools.

#### Actions and identity

`spawn_agent` creates a new agent for one named task.

The request carries a task name and an initial message or structured input list.

The request can override the agent type, the model, and the reasoning effort.

The first generation forks the parent history with a context flag.

The second generation forks the parent history with a turn count value.

The result returns the agent identifier and the thread identifier.

The result also returns the canonical task name and any user-facing nickname.

The canonical task name nests under the parent task path.

A parent can use the relative name, and another branch must use the canonical name.

`send_input` queues a message or interrupts the current task in the first generation.

`send_message` delivers a message in the second generation without a new turn.

`followup_task` starts a turn when the target is idle and refuses a root target.

`wait_agent` returns the final statuses keyed by agent identifier.

The second generation wait returns a summary only and never the agent content.

`interrupt_agent` stops the current turn and returns the previous status.

`close_agent` shuts down one agent and its open descendants.

A completed agent stays open and counts against the concurrency limit until a close.

`resume_agent` reopens a previously closed agent by identifier.

`list_agents` lists the live agents with a canonical task name and a last known status.

A status is waiting, running, completed, interrupted, shut down, errored, or not found.

The thread record stores the parent thread, the agent path, the nickname, and the role.

The root thread tree owns every sub-agent thread.

A spawned agent keeps a durable thread identifier.

The renderer rediscovers the descendant tree after a reload.

The Sub-agents panel Tab stores a durable route with the selected descendant.

#### Placement and human access

The Sub-agents panel Tab opens on the right side.

The panel lists the descendant threads and groups them into active and finished agents.

The panel shows the model, the reasoning effort, and a waiting state for each agent.

The panel offers a back action from a selected agent to the list.

The sub-agent activity item offers an action that opens the sub-agent.

Therefore the human can open the controlled thread from the transcript activity.

#### Transcript rendering

The application server emits paired start and end events for every sub-agent action.

The transcript stores two sub-agent item types.

The first item type is a sub-agent tool call.

That item carries the tool, the status, the sender thread, and the receiver threads.

That item also carries the prompt, the model, the reasoning effort, and a state for each agent.

The second item type is sub-agent activity with a started, interacted, or interrupted kind.

The transcript renders the tool call as a multi-agent action item with one row for each agent.

Each row shows the agent state as waiting, working, done, or failed.

The transcript hides a wait tool call.

The transcript hides both item types when background sub-agents are disabled.

#### Instructions and permissions

The spawn tool description carries the full delegation guidance.

That guidance forbids a spawn unless the user, a project file, or a skill asks for it.

That guidance requires a plan before any delegation.

That guidance requires concrete, bounded, and self-contained subtasks.

That guidance requires a disjoint write scope for each code subtask.

That guidance limits wait calls to a blocked critical path.

That guidance states that the child inherits the parent model.

A separate role instruction describes the agent team and the return channel.

Both role instructions warn that a human can read the messages.

The configuration can add a usage hint for the root agent and for a sub-agent.

The side chat instruction forbids all sub-agent interaction inside a side chat.

The sub-agent tools follow the same approval and sandbox policy as the parent.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Spawn without permission | The guidance forbids the call. |
| Agent depth limit reached | The agent is told to solve the task itself. |
| Unavailable agent type | The tool reports that the agent type is not available. |
| Unresolved child model | The spawn cannot validate the reasoning effort. |
| Missing canonical task name | The spawn reports the missing name. |
| First generation fork flag in the second generation | The tool names the replacement field. |
| Invalid turn count value | The tool requires none, all, or a positive number. |
| Unavailable collaboration manager | The tool reports that the manager is unavailable. |
| Wait timeout | The wait returns a timeout summary with no final status. |
| Wait interrupted by user input | The wait returns an interruption summary. |
| Target not found | The agent state reports not found. |
| Agent error | The agent state reports an error with a message. |
| Tool call failure | The transcript item records the failed status. |
| Background sub-agents disabled | The transcript hides every sub-agent item. |
| Code mode call | The second generation tools are absent from that namespace. |
| Failed panel restore | The renderer reopens the panel without a selection. |
| Unavailable descendant | The panel reports that the sub-agent is unavailable. |

### Panel placement and Tab movement

Codex Desktop uses two panel hosts.

The hosts have the identifiers `right` and `bottom`.

The agent reaches a panel host only through `open_in_codex`.

The agent cannot move, reorder, pin, close, hide, or maximise a Tab.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema names the placement values and the panel targets. |
| `windows.tabs.open` | The renderer registers this application command. | The agent learns only the enclosing tool. |
| `right` | The application shell registers this panel host. | The agent does not receive this host directly. |
| `bottom` | The application shell registers this panel host. | The agent does not receive this host directly. |
| Side panel toggle command | The command registry registers this human command. | The agent does not receive this command. |
| Maximise side panel command | The command registry registers this human command. | The agent does not receive this command. |
| Review Tab commands | The command registry registers two human commands. | The agent does not receive these commands. |

Each panel host exposes open, activate, close, move, reorder, and pin operations.

These host operations are not direct agent tools.

The four human panel commands belong to one command menu group.

#### Actions and identity

The tool accepts an optional task identifier, a target, and an optional placement.

The placement accepts only the value `right` or the value `bottom`.

The schema defines no ordering, move, close, resize, or maximise field.

The target accepts a file, a browser tab, a terminal, or a review view.

The tool call does not run inside the window.

The tool queues an application command for the target task.

The tool result to the agent contains the queued status and the task identifier only.

The tool result to the agent contains no Tab identifier and no placement.

The window computes a fuller record when the queued command runs.

That record contains the task, the target type, the placement, the status, and the Tab identifier.

The window does not return that record to the agent.

The status value in that record is `opened` or `existing`.

| Target type | Tab identity value inside the window |
| --- | --- |
| terminal | A terminal prefix followed by the terminal session identifier. |
| review | One fixed review Tab identifier for the task. |
| browser | The browser tab identifier. |
| file | An identifier that the file Tab type derives from the file path. |

An existing Tab keeps its current host, and a placement request cannot move it.

A missing placement uses `right` for a file, a browser tab, and a review view.

A missing placement for a terminal uses the task setting for the default terminal location.

Each Tab type declares its permitted destinations.

A request for `bottom` opens in the right host when the Tab type forbids `bottom`.

The window owns every panel host, and one main window shows one task at a time.

The renderer stores one layout record for each local task.

The record holds the restorable Tab routes and the topology.

The topology holds each host state, the focus area, the layout mode, and the maximise flag.

Each host state holds an open flag, an ordered Tab list, and the active Tab.

Therefore the layout record persists placement, order, activation, and maximise together.

A restore stops when the payload version differs or the Tab type is unavailable.

A preview Tab does not persist.

A task transfer uses a separate layout snapshot with the same fields.

The transfer target reopens each Tab in the recorded host.

#### Placement and human access

A human moves a Tab by a drag between the Tab strips or through a Tab action.

A move stops when the target host already holds the Tab or forbids the Tab type.

A move stops while the Tab is in a transfer.

A terminal Tab keeps its terminal session identifier through a move.

A move of the last right host Tab to the bottom host closes the right panel.

A human reorder moves one Tab to another index in the same host list.

A cancelled drag restores the original index and the original active Tab.

Only the right host supports a maximise state.

A human toggles maximise with a command that carries no default keyboard shortcut.

The maximise state clears when the right host holds no Tab.

#### Transcript rendering

The transcript renders a Desktop tool call as generic tool activity.

The transcript holds the tool result as text content.

The result text is the queued record in a serial data format.

The transcript carries surface metadata for two tool surfaces only.

Those two surfaces are browser use and computer use.

Therefore the transcript shows no panel name, no host, and no Tab identifier.

The queued command reveals and focuses the Tab inside the window.

That reveal happens when the target task is visible in that window.

The transcript activity offers no later action to open the same Tab.

The last sentence is an inference from the missing surface metadata.

#### Instructions and permissions

The tool description teaches six rules to the model.

The calling task in the calling window receives the Tab by default.

The model sets a task identifier only when the user asks for another task.

A hidden target task returns the queued status.

A queued Tab opens when that task becomes visible in the same window.

The model uses the tool after it creates or edits an artifact.

The tool opens user interface only, and other tools inspect the content.

The description also states that a terminal target needs a local task.

The description text changes with the available targets.

The placement field carries no description text.

No separate skill teaches panel placement.

The tool needs no user approval and no sandbox permission.

#### Correction to the earlier reading

The first Terminal reading stated that the panel tool result returns the placement and the Tab identifier.

That reading was wrong.

I inspected the panel tool handler in the current archive for this point.

The handler queues the application command and then returns a fixed result.

That fixed result carries the queued status and the task identifier only.

The placement worker recorded the correct behaviour, and the Files worker agreed with it.

I corrected the Terminal subsection of this report.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Invalid tool arguments | The tool returns an unsuccessful result. |
| Missing Desktop action host | The tool reports that app actions are unavailable. |
| Unknown target task | The tool reports a failure to open the Codex Tab. |
| Unavailable target type | The tool reports that this target type is unavailable. |
| Hidden target task | The command queues until that task becomes visible in the same window. |
| Queued command failure | The window logs a warning, and the agent receives no error. |
| Missing application view | The command reports that it requires an app view. |
| Archived preview | The command reports that panels are unavailable. |
| No visible task | The command reports that it requires a visible task. |
| Different visible task | The command names the visible task and rejects the request. |
| Remote file link for the local browser | The tool refuses the request. |
| Unsupported Codex deep link | The command reports that panel opens do not support that link. |
| Forbidden host for a Tab type | The open uses the right host instead of the bottom host. |
| Forbidden host for a move | The move stops without an error to the agent. |
| Stored layout with an old payload version | The restore stops for that Tab. |
| Tab type unavailable for the task route | The restore stops for that Tab. |

### Settings and approval state

Codex Desktop gives the agent one settings read tool and one settings write tool.

Both tools also reach the approval, sandbox, network, and web search configuration.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `read_settings` | The Desktop tool builder adds it to `codex_app`. | Its schema teaches settings and configuration inspection. |
| `write_settings` | The Desktop tool builder adds it to `codex_app`. | Its schema teaches settings and configuration updates. |
| Settings read host request | The main process registers this host request. | The agent does not receive this request directly. |
| Settings write host request | The main process registers this host request. | The agent does not receive this request directly. |
| Configuration batch write | The configuration write path sends this app server request. | The agent learns only the enclosing tool. |

A feature gate controls both tools.

The tool builder adds no settings tool when the gate is off.

The tool builder also requires a local desktop host.

`write_settings` also requires a default task mode and a default thread start kind.

Both tools belong to the eager tool set.

Therefore the agent receives both schemas at thread start.

#### Actions and identity

`read_settings` returns the settings file path and the configured values.

It also returns the effective values after defaults and the machine-readable definitions.

Each definition carries a key, a description, a default, a schema, and an agent access level.

The application defines 90 settings in total.

The definition list excludes every hidden setting.

Therefore the agent can inspect 59 settings.

Fifty five of those settings permit a write.

An argument adds the task agent configuration to the read result.

Another argument selects the user scope or the project scope.

The configuration view returns the scope, the file path, and the allowed values.

It also returns the locked keys and a disabled reason.

The effective approval policy is untrusted, on request, or never.

The effective sandbox mode is read only, workspace write, or full access.

The effective web search mode is disabled, cached, indexed, or live.

`write_settings` accepts one settings payload or one configuration payload.

One call cannot carry both payloads.

The configuration payload accepts six keys only.

| Configuration key | Accepted values |
| --- | --- |
| Approval policy | on request or never |
| Sandbox mode | read only, workspace write, or full access |
| Workspace write network access | a boolean |
| Web search | disabled, cached, indexed, or live |
| Model verbosity | low, medium, high, or an empty value |
| Model reasoning summary | auto, concise, detailed, none, or an empty value |

The write tool cannot set the untrusted approval policy.

A settings write rejects any key without write access.

A settings write returns the configured values and the effective values.

A configuration write returns the scope and a flag that a new thread is necessary.

A setting has a stable string key as its identity.

A configuration value has a key path as its identity.

Neither call returns a handle or a session identifier.

The main process owns one settings store for the application.

Therefore every window and every task reads the same values.

Every storage kind survives a renderer reload and a reconnect.

A configuration change applies to new threads only.

Therefore a configuration change does not transfer into the running turn.

#### Placement and human access

The settings tools open no panel and no Tab.

The transcript activity offers no action that opens the Settings screen.

The human must open the Settings screen from the application instead.

A configuration write shows a separate confirmation request to the human.

The human answers that request with an approval or a refusal.

One conversation holds one pending confirmation at a time.

A second request for the same conversation resolves as a refusal.

A window that does not own the request can also answer it. This statement is an inference.

#### Transcript rendering

The adapter converts each settings call into a generic tool activity.

The activity carries the call identifier, the namespace, the tool name, and the arguments.

The adapter attaches result content for two other Desktop tools only.

Therefore the settings result text does not render in the activity.

The adapter defines no settings-specific activity type and no presentation metadata.

The adapter does not hide either settings tool.

#### Instructions and permissions

The read schema teaches inspection before a suggestion or a change.

The write schema teaches the tool instead of a terminal edit for a supported setting.

The write schema teaches that one call cannot carry both payloads.

The write schema teaches a settings read before a write.

The write schema teaches that a configuration change needs user confirmation.

The write schema teaches that a configuration change applies to new threads.

The write schema teaches a short confirmation of the new values and the scope.

An application settings write needs no user approval.

A configuration write always requests a confirmation from the human.

The confirmation needs a loaded task, two default mode values, and a non-automation kind.

Managed policy can lock a configuration key.

The installation can also restrict the allowed approval, sandbox, and web search values.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Non-local task | Both tools report that settings tools support local threads only. |
| Invalid arguments | The tool returns an unsuccessful result and names itself. |
| Settings store unavailable | The host request reports an unavailable settings store. |
| Unknown setting key | The write names the unknown setting. |
| Setting without write access | The write reports that Codex cannot write the setting. |
| Both payloads in one call | The write asks for separate calls. |
| Project configuration write | The write reports that chat cannot change project configuration. |
| Automation task | The write asks the human to make the change from the main chat. |
| Unloaded task state | The write asks the human to open the task in the desktop application. |
| Missing configuration file | The write reports that no configuration exists for the scope. |
| Managed configuration key | The write names the managed key and refuses. |
| Restricted value for a configuration key | The write reports an installation restriction. |
| Refused confirmation | The write reports that the user did not approve the change. |
| Second pending confirmation | The request resolves as a refusal at once. |
| Completed turn during confirmation | The confirmation resolves as a refusal. |
| Aborted tool call | The tool returns no result for that call. |

### Questions and option pickers

Codex Desktop carries one general question tool and three onboarding question tools.

The core app server owns the general question tool.

The Desktop tool builder owns the three onboarding tools.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `request_user_input_async` | The core app server registers this Session tool. | The core tool schema teaches the question call. |
| `request_option_picker` | The Desktop tool builder adds it to a gated onboarding set. | Its schema teaches an option choice in the onboarding flow. |
| `request_onboarding_input` | The same onboarding set. | Its schema teaches one to three structured onboarding questions. |
| `setup_codex_step` | The same onboarding set. | Its schema teaches the three native setup steps. |
| `request_environment_input` | The app server sends it as a tool call. | The agent learns the tool from the environment setup flow. |
| User input client request | The app server sends this client request. | The agent does not receive this request directly. |
| Option picker client request | The app server sends this client request. | The agent does not receive this request directly. |
| MCP elicitation request | An MCP server sends this client request. | The agent learns only the MCP tool. |

The desktop bundle does not define the schema of the core question tool.

Therefore the core app server owns that schema. This statement is an inference.

A feature gate controls the three onboarding tools.

The tool builder removes them for the conversational onboarding kind.

The tool builder also removes them for the environment setup kind.

All three onboarding tools belong to the eager tool set.

#### Actions and identity

The user input request carries a thread identifier, an item identifier, and a turn identifier.

The request carries one or more questions.

Each question carries an identifier, an optional header, and the question text.

Each question carries a free-text flag, a secret flag, and a list of options.

Each option carries a label and an optional description.

The request also carries a blocking flag and an optional auto-resolution window.

The response maps each question identifier to a list of answers.

The client omits a question with no answer from that map.

An empty map means that the human answered nothing.

The option picker request carries one question, a list of options, and two labels.

The picker request also carries a flag that permits more than one selection.

The picker response carries an action, the selected options, and one free-text answer.

A dismissed picker returns an empty selection and no free-text answer.

The onboarding input tool accepts one to three questions with at least two options each.

The dynamic tool path returns the picker response as text.

An async question keeps a stable identity inside the turn.

That identity combines the tool name, the source item identifier, and the question index.

Therefore the identity survives a renderer reload of the same turn.

The app server connection owns the pending question record.

The record is keyed by the conversation, and a second record replaces the first.

Both lookup maps are held in memory only.

Therefore a pending record does not survive an application restart. This statement is an inference.

Each window registers itself with the tracker as a surface.

The tracker holds the focus state of every surface.

Therefore any window that presents the conversation can answer the question.

#### Placement and human access

A user input request renders in the chat surface as a question widget.

An option picker request renders as a separate request surface.

The human answers each surface in place.

The transcript offers no action that reopens an answered question.

The picker offers an explicit skip label for the skip path.

#### Transcript rendering

A user input request renders as a dedicated question activity.

That activity carries the request identifier, the call identifier, and the turn identifier.

It carries the full question list and a completed flag.

An async question renders as one assistant message for each question.

Each of those messages carries the source item identifier and the question index.

A feature flag controls that per-question rendering.

Without that flag the turn renders one ordinary assistant message.

An async question does not count as the final answer of the turn.

An option picker request produces no transcript item.

The widget answer is recorded on the answering message as response metadata.

Telemetry records the shown, dismissed, timed out, and selected events.

#### Instructions and permissions

A setting controls whether Codex can ask a question outside Plan mode.

The default value of that setting permits the question.

The agent can read and write that setting.

The onboarding tool schemas teach their own narrow use.

A question needs no separate user approval.

The tracker can resolve a question without any human answer.

A blocking request is never resolved by the tracker.

A request with an explicit window starts a countdown at once.

That window must be between 5,000 and 300,000 milliseconds.

A request without a window waits 60,000 milliseconds of inactivity first.

The countdown after that period is 90,000 milliseconds.

A conversation with no focused presenting surface starts that countdown at once.

Human activity in the conversation restarts the inactivity period.

A countdown expiry submits an empty answer map for a user input request.

A countdown expiry declines an MCP elicitation request instead.

An automation-owned thread snoozes each non-blocking request without an explicit window.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Missing thread identifier | The client logs an error and drops the request. |
| Wrong request method for an answer | The client logs an error and sends no response. |
| Invalid onboarding tool arguments | The tool returns an unsuccessful result and names itself. |
| Invalid picker arguments | The tool returns an unsuccessful result and names itself. |
| Completion step of the setup tool | The client presents no request surface. |
| Abandoned conversation, user input | The client answers with an empty answer map. |
| Abandoned conversation, option picker | The client answers with a dismiss action. |
| Abandoned conversation, MCP elicitation | The client declines the request. |
| Countdown expiry, user input | The connection answers with an empty answer map. |
| Countdown expiry, MCP elicitation | The connection declines the request. |
| Unsafe MCP elicitation approval | The client raises an error and sends no approval. |
| Context picker request | The client dismisses the request at once. |
| Follower stream role | The client forwards the answer to the owning task. |
| Unknown pending request | The answer path returns without an effect. |

### Goal state

Codex Desktop gives the agent three goal tools.

The application archive defines none of them.

Therefore the core agent server registers the goal tools.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `create_goal` | The core agent server registers this Session tool. | The tool schema explains when a goal may start. |
| `update_goal` | The core agent server registers this Session tool. | The tool schema explains each permitted status change. |
| `get_goal` | The core agent server registers this Session tool. | The tool schema explains goal status and budget reading. |
| Goal set, get, and clear requests | The application client sends these thread requests. | The agent does not receive these requests directly. |
| Goal slash command | The composer registers this human command. | The human starts a goal with this command. |

The application listens for a goal update notification and a goal clear notification.

#### Actions and identity

`create_goal` accepts an objective and an optional token budget.

`create_goal` fails when an unfinished goal exists.

`update_goal` changes only the status.

`get_goal` returns the status, the budgets, the token use, the elapsed time, and the remainder.

The goal result identifies the thread that owns the goal.

The goal result also carries a creation time and an update time.

The goal has no separate goal identifier in the application state.

The creation time acts as the goal identity in the application.

The application stores one goal for each conversation.

The token budget is a property of the core goal tool.

The application goal request carries an objective and a status only.

Therefore the application does not set or read the token budget.

The token budget depends on a history notes extension.

The application marks a token budget conversation in local storage for each host.

A continuation or a fork of a token budget task needs a compatible app server version.

The goal status has six values.

The values are active, paused, blocked, complete, budget limited, and usage limited.

The agent may set complete, blocked, and paused only.

The human control toggles active to paused.

The human control toggles paused, blocked, and usage limited to active.

A system interrupt or a human stop pauses an active goal before the interrupt runs.

A goal update to complete triggers an automatic clear request.

#### Placement and human access

The goal state drives a dedicated goal view scope.

The Goal state worker did not verify the contents of that view.

The human starts a goal with the composer command.

The human changes the status with the goal control.

The goal objective accepts pasted text attachments and image attachments.

A durable host inlines the pasted text into the objective.

Another host writes each attachment into a goal attachment directory.

An objective longer than 4000 characters moves into a file.

#### Transcript rendering

The application shows the goal objective as a synthetic completed turn.

That turn holds the objective as its only text input and holds no items.

That turn uses the goal update time as its start time.

The application suppresses a duplicate when an identical turn already exists.

The transcript records no separate item for a status change.

A status change updates the stored goal and the goal presentation only.

Goal failures report through toast messages.

#### Instructions and permissions

The creation schema restricts goal creation to an explicit request.

The schema tells the agent not to infer a goal from an ordinary task.

The schema restricts the token budget to an explicit budget request.

The update schema restricts the paused status to an explicit human request.

The update schema restricts the complete status to an achieved objective.

The update schema restricts the blocked status to a condition repeated over three goal turns.

The update schema forbids resume, budget limited, and usage limited from the agent.

The update schema requires a final token report for a budgeted goal.

A goal needs no separate approval dialogue.

A goal turn inherits the approval policy, the approvals reviewer, and the sandbox policy.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Existing unfinished goal | The creation call fails. |
| Empty objective and no attachment | The application rejects the goal. |
| Uploaded pasted text without a cloud task | The application reports that a cloud task is necessary. |
| Restricted account attachment | The application reports that goal attachments are unavailable. |
| Unknown attachment directory | The application reports an unknown goal attachment directory. |
| Missing history notes support | The application asks for an app server update. |
| Failed goal set request | The application shows a set failure toast. |
| Failed goal status request | The application shows an update failure toast. |
| Failed goal clear request | The application shows a clear failure toast. |
| Failed pause before a human stop | The application reports a goal pause error. |
| Failed goal hydration after resume | The application keeps the previous goal and logs a warning. |
| Not ready conversation | The goal set request fails. |

### Session lifecycle

Codex Desktop gives the agent a task tool group for the session lifecycle.

A feature override gates the whole group.

The application must also run as a desktop client.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `create_thread` | The task tool group adds it to `codex_app`. | Its schema explains targets, prompts, and returned identity. |
| `fork_thread` | The task tool group adds it to `codex_app`. | Its schema explains source selection and fork history. |
| `list_threads` | The task tool group adds it to `codex_app`. | Its schema explains pinned order and recency order. |
| `list_archived_threads` | The task tool group adds it to `codex_app`. | Its schema explains paging and restoration. |
| `read_thread` | The task tool group adds it to `codex_app`. | Its schema explains turn reading without opening. |
| `wait_threads` | The task tool group adds it to `codex_app`. | Its schema explains cursors, timeouts, and wake conditions. |
| `send_message_to_thread` | The task tool group adds it to `codex_app`. | Its schema explains follow-up prompts. |
| `handoff_thread` | The task tool group adds it to `codex_app`. | Its schema explains checkout and worktree movement. |
| `get_handoff_status` | The task tool group adds it to `codex_app`. | Its schema explains revision polling. |
| `set_thread_archived` | The task tool group adds it to `codex_app`. | Its schema explains background archive and restore. |
| `set_thread_title` | The task tool group adds it to `codex_app`. | Its schema explains background renaming. |
| `set_thread_pinned` | The task tool group adds it to `codex_app`. | Its schema explains background pinning. |
| `list_projects` | The task tool group adds it to `codex_app`. | Its schema explains project selection before creation. |
| `share_thread` | The Desktop tool builder adds it to `codex_app`. | Its schema explains the immutable share link. |
| `navigate_to_codex_page` | The Desktop tool builder adds it to `codex_app`. | Its schema explains window navigation. |

The lifecycle tools load as deferred tools.

The navigation tool is an eager tool.

Four separate switches change the registered set.

A fork switch removes the fork tool for an unsupported history mode.

A sharing switch adds the share tool.

A navigation switch adds the navigation tool on a local desktop host.

A sidebar sections switch replaces the pin tool with the sidebar section tools.

A cross host switch adds the destination host property to the handoff tool.

#### Actions and identity

`create_thread` accepts a prompt, a target, an optional title, a model, and an effort.

The target is a project, a projectless task, or a cloud work task.

A project target needs a project identifier and a local or worktree environment.

A worktree environment accepts the working tree or a named branch as a starting state.

A created thread returns a thread identifier and a host identifier.

A pending worktree creation returns a client thread identifier instead.

The schema forbids a client thread identifier where a thread identifier is required.

Creation does not block the calling turn.

`navigate_to_codex_page` shows one thread or chat in the primary window.

The result reports only that navigation happened.

`read_thread` returns recent status and turn summaries without opening the thread.

`wait_threads` waits for up to eight threads and rejects the calling thread.

New human input in the calling thread ends the wait.

`set_thread_archived` archives or restores one thread and returns the archive state.

`fork_thread` forks the calling thread or a named thread.

A same directory fork returns a child thread identifier immediately.

A worktree fork returns a queued status and a client thread identifier.

A fork copies completed history only.

`handoff_thread` moves another thread between its checkout and its Codex worktree.

The calling thread cannot hand itself off, and a cloud thread cannot move.

The tool interrupts a running thread before the move.

The tool returns an operation identifier and a revision.

A repeated call with the same call identifier returns the existing progress.

A successful handoff creates a destination thread and archives the source thread.

Therefore a handoff does not preserve the thread identifier.

`set_thread_title` renames a thread after an acknowledgement from the host.

`share_thread` creates an immutable share link with a workspace or public audience.

The share link does not track later thread changes.

A Codex thread identity is a thread identifier plus a host identifier.

An omitted host identifier resolves to the calling task host.

The tools return the identity as serialized text in a tool result.

The main process stores the client thread identifier under a durable storage key.

The main process also stores thread tab routes and a workspace state under versioned keys.

These keys let the identity survive an application restart. This statement is an inference.

#### Placement and human access

`navigate_to_codex_page` is the only lifecycle tool that opens a thread in the window.

No lifecycle tool result carries a Tab identifier or a window identifier.

The instructions ask the agent to emit a created thread directive after a creation.

That directive carries the thread identifier or the client thread identifier.

A separate handler turns the directive into an openable task item. This statement is an inference.

The transcript also defines archive and unarchive directives.

#### Transcript rendering

The transcript stores a lifecycle tool call as a dynamic tool call item.

The adapter converts that item into a generic dynamic tool activity.

The transcript index stores each creation call in a separate category.

The creation tool and the handoff tool also carry their content items and success flag.

Therefore those two activities can show their own result content.

The transcript also carries a handoff progress item with running, failed, and success steps.

#### Instructions and permissions

The creation schema restricts creation to an explicit human request.

The schema states that the prompt appears as a human visible message.

The coordinator instructions add a delegation policy.

That policy sends slow or multi-step work to another thread.

That policy keeps a human choice in the calling thread.

That policy requires a return report instruction in every worker prompt.

That policy prefers wait snapshots over repeated read calls.

The listing schemas mark returned titles and summaries as untrusted data.

The share flow is the only lifecycle flow with a human approval step.

A permissive sandbox or an approval policy other than never triggers that approval.

An automation task cannot request that approval.

Archive, title, pin, fork, and handoff need no separate approval.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Inactive task tools switch | The lifecycle tools are absent. |
| Unsupported history mode | The fork tool is absent. |
| Inactive sharing switch | The share tool is absent or reports that sharing is unavailable. |
| Non-local host | The navigation tool is absent. |
| Invalid arguments | The tool returns an unsuccessful result with the failed fields. |
| Missing calling thread identity | The fork and archive tools report the missing identity. |
| Unknown project identifier | The creation tool asks the agent to list the projects. |
| Wrong project type for the target | The creation tool reports the wrong target type. |
| Model override on a cloud target | The creation tool rejects the override. |
| Incomplete fork setup | The result warns against another fork and a follow-up. |
| Worktree fork without a directory | The fork tool reports the missing directory. |
| Self handoff | The handoff tool rejects the request. |
| Unavailable destination host | The handoff tool reports the unavailable host. |
| Failed destination creation | The handoff item reports that the destination thread failed. |
| Failed source archive after handoff | The application logs a warning and keeps the handoff. |
| Unknown operation identifier | The status tool reports no matching operation. |
| Wait on the calling thread | The wait tool rejects the target. |
| New human input during a wait | The wait tool reports an interrupted wait. |
| Denied share approval | The share tool reports the denied approval. |
| Failed navigation | The navigation tool reports the failure. |
| Unsupported dynamic tool or namespace | The dispatcher reports the unsupported name. |

### Visualizations

The agent has no visualization tool.

The agent creates a visualization by writing a page file into a reserved directory.

The agent then names that file in a reference inside its assistant text.

The application detects the write and renders the visualization inside the transcript.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| Visualization host service | The main process registers this window host service. | The agent does not receive this service directly. |
| Visualization activity detection | The transcript adapter inspects each file change. | The agent learns nothing about the detection. |
| Visualization reference | The transcript parser reads the reference from the assistant text. | A bundled skill teaches the reference. |
| Bundled visualization skill | Codex installs the skill into its runtime marketplace. | The skill list reaches the model through the agent server. |

The application asks the agent server to reload the skill list after a marketplace change.

The skill description tells the model to show how something works.

The skill description tells the model to compare options or explore a change.

The skill description tells the model to use standard tools for a static scientific figure.

#### Actions and identity

The application reserves a visualization directory inside the Codex home directory.

The path adds the year, the month, the day, and the task identifier.

The application grants that directory as a writable root for the turn.

It grants the root only when the sandbox policy allows a workspace write.

The reference carries the absolute file path and an optional title.

The reference can also request a wide presentation mode.

The parser hides an incomplete streaming reference until its closing marker arrives.

The file path is the identity, and the path contains the owning task identifier.

Therefore the identity survives a reload because the file stays on disk.

The identity does not transfer to another task.

The transcript records changed visualization paths by file name.

That map lets copied or forked transcript content resolve its source file.

#### Placement and human access

The visualization renders inline inside the assistant message.

The normal mode targets 736 pixels, and the wide mode can reach 1,024 pixels.

The host starts at 240 pixels and then measures the fragment.

The host caches the measured height against the file content and the width.

The action surface supports expansion, an image copy, and a publication path.

Wide content can also open in a full screen preview.

The human can therefore open the visualization from the transcript activity.

The skill exposes a guarded design control helper for a mockup.

The helper registers sliders, colour pickers, toggles, and selects with the host.

The host opens an annotation editor over the visualization.

A submission sends the selected edits and optional text as a follow-up turn.

#### Transcript rendering

The file write renders as a patch activity.

The patch activity carries a list of visualization entries.

Each entry holds the file path and the change kind.

A create result outranks an update result for the same file in one change set.

The renderer reads the referenced file through the visualization host service.

The renderer then starts an isolated sandbox and supplies the fragment to its runtime.

The sandbox keeps context isolation, sandboxing, and web security enabled.

The sandbox denies permissions, blocks downloads, and rejects an unapproved network request.

The content policy permits inline script and style plus seven approved delivery origins.

An external link needs a user gesture and can show a confirmation dialog.

The sandbox measures its content and reports the height to the transcript.

The sandbox can also report a script failure and offer an agent repair action.

#### Instructions and permissions

The bundled skill is the only instruction that teaches visualization use.

The skill asks the model to stay below 1 MB for one fragment.

The renderer rejects a fragment above 5 MB.

The visualization needs no separate user approval.

The write still follows the task sandbox policy.

The skill documents a widget state interface for saved state.

The inspected inline host does not persist a widget state update.

Therefore saved state restoration remains unverified.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Visualization service missing | The sharing path returns no visualization. |
| Missing or unreadable file | The read error produces an inline error. |
| File above the size limit | The application reports the limit and drops the file. |
| Script error in the fragment | The sandbox reports the error and offers a repair action. |
| Sandbox timeout | Codex retries preparation once and then reports a timeout. |
| Sandbox initialization failure | Codex records the failure and shows the error surface. |
| Blocked network request | The isolated session cancels the request. |
| Blocked external link | Codex requires a gesture and can show a confirmation dialog. |
| Sandbox policy without a workspace write | The application grants no temporary visualization root. |
| Stale path | The parser can recover a source path from the file name map. |

The Visualizations worker did not verify every stale path and blocked origin state.

The Visualizations worker did not verify the complete theme token contract.

### Capture and screenshots

Codex Desktop exposes one capture tool to the agent.

The agent cannot start a capture outside a voice chat.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `capture_screen_context` | The Desktop tool builder adds it to `codex_app`. | Its schema teaches the agent to read the foreground application. |
| Capture host service | The main process registers this window host service. | The agent does not receive this service directly. |
| Frontmost window lookup | The renderer requests this lookup before a capture. | The agent does not receive this lookup directly. |
| Application summary command | The capture tool runs this application command. | The agent learns only the enclosing tool. |

The tool builder adds the tool only for a voice thread start kind.

The builder also requires a desktop host and an available capture system.

The tool can arrive as a deferred tool.

Four conditions control availability.

The platform must be macOS or Windows.

A capture feature flag must be active for the account.

The host configuration must permit the capture system.

The user setting for screen context must be on.

Windows also requires a native capture bridge that reports support.

#### Actions and identity

The tool takes no arguments.

The tool first checks the active voice session.

The session must be active for the calling task on the calling host.

The tool then selects one of two routes.

The first route applies when the Codex window is the focused window.

That route returns application state and returns no image.

The state contains the current page kind and the right panel state.

The page kind is a thread, the home page, the settings page, or another page.

For a thread page the state also returns the task identifier and the task title.

The state also returns the right panel Tab list and the focused Tab.

The second route applies when another application is in front.

That route captures a screenshot and the accessibility text of the frontmost window.

The result returns one text item and one image item.

The tool returns no capture identifier and no reusable handle.

Therefore no capture identity survives a reload, a reconnect, or a transfer.

The application stores the accessibility text as a capture context on the composer input.

That context belongs to the pending input and not to a durable record.

Windows uses a different capture sequence and does not capture outside Codex.

#### Placement and human access

The capture tool opens no panel and no Tab.

The result carries no link that opens a capture viewer.

Therefore the human cannot open the captured window from the activity.

The human can start a capture without the agent.

The main process registers a global capture hotkey.

A key press sends a capture message to the primary window.

A destination setting decides between the current task and a new chat.

The capture then becomes a capture context on the composer.

The composer sends the structured text and the screenshot as ordinary input.

Therefore the agent reads a human capture as ordinary input.

#### Transcript rendering

The call enters the transcript as a dynamic tool call item.

The adapter renders it as generic tool activity.

The adapter applies no capture specific presentation and does not hide the tool.

No surface metadata key accompanies the result.

The application logs the dispatch and the delivery of the result.

The logs record only the call identifier, the task identifier, and the elapsed time.

#### Instructions and permissions

The tool schema is the main instruction.

The schema restricts the tool to an active voice chat.

The schema forbids the tool in a normal text conversation.

The schema forbids the tool after a voice chat ends.

The schema orders the model not to guess screen details.

A voice session instruction repeats the rule for the deferred voice tools.

A voice end instruction orders the model to stop loading the tool after the call.

The voice chat settings own the screen context setting.

A voice onboarding step can request the setting and the operating system permission.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Invalid arguments | The tool reports invalid arguments. |
| No active voice session | The tool reports that screen context needs an active voice chat. |
| Voice session for another task | The tool reports the same restriction. |
| Screen context setting off on macOS | The tool asks the user to enable the setting. |
| Another application in front on Windows | The tool reports that outside capture is unsupported. |
| No foreground application found | The tool reports that it could not find an application. |
| Host forbids the capture system | The tool reports that screen context is unavailable. |
| Capture returns no image | The tool reports that it could not capture the application. |
| Capture throws an error | The tool reports the same capture failure. |
| Application state read failure | The tool reports that it could not read the application state. |
| Missing Windows capture bridge | The builder omits the tool. |
| Abandoned capture permission | The onboarding records an abandoned permission result. |

The Capture worker did not verify a capture result on screen.

The Capture worker did not verify the Windows capture path on a Windows computer.

### Remaining registered services

The sweep worker listed every service, tool, namespace, and command that the other subsections omit.

The surface report holds the complete lists, and this subsection holds the summary.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| Window host service registry | The main process builds one host object for each renderer window. | The agent never calls a host service directly. |
| `codex_app` namespace | The Desktop tool builder wraps every Desktop tool. | The Session receives the namespace at thread start. |
| Plugin management namespace | The builder adds it when the matching connector is enabled. | One deferred uninstall tool reaches the agent. |
| Application commands | The renderer registers seven commands. | The agent learns only the enclosing Desktop tool. |

The host registry holds about ninety service keys in the current build.

The renderer calls a host service while it serves an agent tool.

The sweep worker inferred the purpose of each service from its name and constructor.

#### Actions and identity

The sweep worker recorded 35 further Desktop tools beyond the surfaces above.

Those tools cover worktree creation, artifacts, automations, sidebar sections, and usage limits.

Those tools also cover thread emojis, projects, hosts, workspace dependencies, and onboarding steps.

Each tool carries its own gate, and the gate column of the surface report is source-verified.

Four of the seven application commands have no agent path in this build.

Those four commands show the home page and toggle the sidebar, the Terminal, and Review.

The human reaches those four through the command menu or a keyboard shortcut.

Two feature override keys change the Desktop tool set.

One key adds the task tool group, and the other key adds the settings tools.

The application requests the tool set through a thread start event.

The main process routes that request to the primary ready renderer.

The renderer builds the tool set within a five second budget.

A slow lookup falls back to a smaller set, and a build failure returns an empty set.

#### Placement and human access

Most of these tools open no panel and no Tab.

The transcript hides the running summary tool and the workspace dependencies tool.

Three tools receive a special transcript activity.

Those three tools are the automation tool, the creation tool, and the handoff tool.

Every other tool in this group uses the generic tool activity.

Therefore the human cannot open the controlled surface from most of these activities.

#### Transcript rendering

Each call renders as a dynamic tool call activity.

The activity carries the namespace, the tool name, the arguments, and a completion flag.

No surface metadata accompanies these results.

#### Instructions and permissions

Each tool description is the only instruction that teaches the model when to call it.

The plugin namespace tool always loads as a deferred tool.

The confetti tool orders the model to claim success only when the result reports a fired flag.

#### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Inactive gate for a tool | The builder omits the tool from the namespace. |
| Missing Desktop action host | The tool reports that app actions are unavailable. |
| Slow tool set lookup | The application falls back to a smaller tool set. |
| Failed tool set build | The application returns an empty tool set. |
| Unsupported dynamic tool or namespace | The dispatcher reports the unsupported name. |

The sweep worker did not trace the internal behaviour of every host service.

The sweep worker found no agent path for four application commands.

## Reference-to-OMP mapping

This section summarises the OMP mapping file in this repository.

That file records 158 capability rows across 13 surfaces.

The detail stays in that file. This section gives the verdict only.

A verdict of equivalent means that OMP gives the agent the same behaviour and the same value.

A verdict of partial means that OMP gives part of the behaviour, or gives it to the host only.

A verdict of none means that OMP supplies nothing for the capability.

Every verdict is source-verified against the OMP package source, version 18.1.6.

The mapping worker did not run OMP and did not run Codex Desktop.

### Verdict counts by surface

| Surface | Rows | Equivalent | Partial | None |
| --- | --- | --- | --- | --- |
| Terminal | 12 | 4 | 4 | 4 |
| Files | 11 | 3 | 3 | 5 |
| Review | 8 | 2 | 3 | 3 |
| Side chat | 8 | 1 | 4 | 3 |
| Sub-agents | 19 | 12 | 4 | 3 |
| Panel placement and Tab movement | 11 | 0 | 1 | 10 |
| Settings and approval state | 11 | 1 | 3 | 7 |
| Questions and option pickers | 14 | 10 | 2 | 2 |
| Goal state | 16 | 10 | 2 | 4 |
| Session lifecycle | 16 | 1 | 11 | 4 |
| Visualizations | 9 | 1 | 2 | 6 |
| Capture | 7 | 4 | 0 | 3 |
| Remaining registered services | 16 | 6 | 3 | 7 |
| Total | 158 | 55 | 42 | 61 |

### What the counts mean

OMP covers the agent work. OMP does not cover the application control.

OMP has strong equivalents for command execution, sub-agent control, questions, and goal state.

Those four surfaces hold 36 of the 55 equivalent rows.

OMP has partial equivalents for file change, review findings, session lifecycle, and capture.

A session lifecycle row is partial because the host owns the operation, and the agent does not.

OMP has nothing for panel placement, Tab identity, visualizations, and application settings tools.

Reeve must build each of those capabilities from the start.

### The RPC limit

Reeve runs OMP through RPC mode. That mode decides several verdicts.

RPC mode supports a selector, a confirmation, a text input, a notification, and a status line.

RPC mode accepts widget content as text lines only.

RPC mode returns nothing for a custom interactive component.

The richer interactive dialogue of OMP is therefore out of reach for Reeve.

This finding is source-verified.

### Capabilities with no OMP source

The mapping file groups the 61 none rows into 23 capability themes.

Each theme needs a maintainer decision, because OMP supplies no starting point.

1. Every panel host, Tab identity, Tab order, Tab movement, and maximise state.
2. Opening a workspace file in a Tab at a line and a column.
3. A durable Tab layout record that survives a reload or a task transfer.
4. A Review panel, its four views, and a stored base revision for a repository.
5. Inline review comments stored against a task and moved on a handoff.
6. A side chat boundary that marks inherited history as reference context only.
7. An ephemeral thread that never enters the session list.
8. Closing and reopening one sub-agent that has already finished.
9. An agent tool that reads or writes application settings.
10. A sandbox mode, a writable root grant, and a network access switch.
11. A managed policy that locks a configuration key.
12. A secret answer for a question.
13. Answering one question from any window that shows the thread.
14. The blocked goal status and the usage limited goal status.
15. Goal attachments and a long objective moved into a file.
16. Archiving and restoring a task.
17. Moving a task between a checkout, a worktree, and another host.
18. Navigating a window to a named task.
19. Every part of the visualization lifecycle after the skill text.
20. Reporting the application page and panel state to the agent.
21. A human capture hotkey that feeds the composer.
22. User automations, usage reset credits, and bundled runtime reporting.
23. Sidebar sections, task emoji, and confetti.

## Reeve ownership table

Reserved for the mapping worker.

## Unowned-capability list

Reserved for the mapping worker.
