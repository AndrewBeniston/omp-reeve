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
