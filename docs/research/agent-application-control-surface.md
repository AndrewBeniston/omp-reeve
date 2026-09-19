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

The result returns the task identifier, placement, status, and Terminal Tab identifier.

The Terminal Tab identifier has the value `terminal:<sessionId>`.

The status is `opened` or `existing`.

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

The `open_in_codex` call directly reveals and focuses the Terminal Tab.

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
| Terminal registration failure | `open_in_codex` reports that the Tab could not open. |
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

Evidence pending.

### Side chat

Evidence pending.

### Sub-agents

Evidence pending.

### Panel placement and Tab movement

Evidence pending.

### Settings and approval state

Evidence pending.

### Questions and option pickers

Evidence pending.

### Goal state

Evidence pending.

### Session lifecycle

Evidence pending.

### Visualizations

Evidence pending.

### Capture and screenshots

Evidence pending.

### Remaining registered services

Evidence pending.

## Reference-to-OMP mapping

Reserved for the mapping worker.

## Reeve ownership table

Reserved for the mapping worker.

## Unowned-capability list

Reserved for the mapping worker.
