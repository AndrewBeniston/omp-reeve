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

Evidence pending.

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
