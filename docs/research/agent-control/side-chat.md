# Codex Desktop side chat and sub-agent control

## Status

This report contains evidence only.

The mapping worker will complete the reserved mapping sections.

## Scope

This report covers side chat and sub-agent control.

This report contains evidence only.

This report excludes Terminal, Files, Review, and Browser control.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected the main process bundle, the renderer bundle, and the side chat feature chunk.

I also inspected the bundled application server program for sub-agent tool schemas.

The bundled application server holds the sub-agent tools.

The renderer holds the side chat feature.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Side chat

A side chat is a temporary thread beside a main thread.

A side chat is a fork of the main thread.

The fork carries the parent history as reference context only.

The agent does not create a side chat.

The human creates a side chat.

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| Open side chat | The renderer registers this application command. | The agent does not receive this command. |
| Focus side chat | The renderer registers this application command. | The agent does not receive this command. |
| Focus main chat | The renderer registers this application command. | The agent does not receive this command. |
| Side chat panel Tab | The side chat feature chunk opens this Tab kind. | The agent does not receive this Tab kind. |
| Side chat menu item | The thread header menu lists this item. | The agent does not receive this menu. |

No agent tool creates, opens, focuses, or closes a side chat.

No agent tool reads a side chat.

The panel target command does not list a side chat target.

The open command requires local Codex access.

The open command is available only in the desktop application.

The open command has the default keyboard shortcut Command or Control, Alt, and S.

The open command appears in the command menu under the thread group.

The focus commands appear in the command menu under the navigation group.

The human opens a side chat from the thread header menu.

### Boundary, identity, and lifetime

A side chat starts from one source thread.

The renderer creates the side chat as a fork of that source thread.

The fork excludes the parent turns from the new thread record.

The renderer then injects a boundary message as the first user item.

The boundary message states that the side conversation boundary starts there.

The boundary message states that everything before it is inherited parent history.

The boundary message states that the inherited history is reference context only.

The boundary message forbids continuation of any earlier instruction, plan, tool call, approval, edit, or request.

The boundary message states that only messages after the boundary are active instructions.

The renderer also appends a side conversation instruction to the developer instructions.

That instruction repeats the boundary rule in the developer channel.

That instruction states that the side conversation is for questions and light exploration.

That instruction forbids presentation of the side chat as the main thread task.

That instruction states that external tool output in the inherited history belongs to the parent thread.

That instruction declares sub-agents off limits inside the side conversation.

That instruction forbids interaction with any existing or new sub-agent.

That instruction permits non-mutating inspection, including file reading and file search.

That instruction forbids workspace mutation unless the user asks for it in the side conversation.

That instruction forbids escalated permission requests unless the user asks for a mutation that needs them.

The renderer reads the normal developer instructions for the working directory first.

The renderer then joins the side conversation instruction after them.

A local side chat passes a thread reference to the parent thread.

A local side chat passes a rendered parent transcript when the thread reference is not supported.

A cloud side chat always passes a rendered parent transcript.

The cloud transcript carries a separate warning that the parent conversation is untrusted reference context.

The rendered transcript uses at most 50 parent turns.

The rendered transcript keeps at most the last 100 conversation entries.

A cloud side chat reuses the parent environment, permissions, working directory, and workspace roots.

The side chat receives a conversation identifier from the application server.

A local side chat also receives a client thread identifier before creation completes.

The panel Tab identifier is the value `sidechat:` plus the conversation identifier.

The loading Tab identifier is the value `sidechat-loading:` plus the source conversation identifier and an index.

The Tab kind is the value `sidechat:` plus the client thread identifier.

The side chat thread is marked ephemeral.

The side chat thread records a side conversation flag.

The side chat thread records the parent navigation path.

The side chat thread records the parent thread as its fork source.

The side chat does not enter the recent thread list.

The side chat does not appear as a sidebar thread summary.

The memory pipeline does not run for a side chat.

Project assignment does not run for a side chat.

The first side chat Tab is titled Side chat.

Each later side chat Tab adds an index to that title.

The Tab index counts the open side chat Tabs in the target panel.

Closing the Tab discards the conversation from the local cache.

Closing the Tab also removes the ephemeral voice history for that conversation.

Closing the Tab stops an active voice session for that conversation first.

The side chat is therefore not durable across a close.

### Transcript rendering and human access

The side chat renders in its own panel Tab.

The side chat Tab holds a complete thread view with its own composer.

The parent thread transcript does not contain a side chat item.

The parent thread keeps a list of its side chat conversation identifiers.

That list drives two parent-level indicators.

The parent thread shows a running indicator when a side chat turn is in progress.

The parent thread shows an unread indicator when a side chat has an unread turn.

The side chat Tab icon becomes a spinner while the side chat turn runs.

The side chat Tab icon carries an unread badge after a completed turn.

The Tab announces an unread response to assistive technology.

The human opens the side chat from the thread header menu.

The human can also open it from the command menu.

The human can also open it with the keyboard shortcut.

The side chat opens in the right panel by default.

The human can move the Tab to another supported panel.

A focus command moves focus to the main chat.

A second focus command moves focus to the side chat.

The focus command prefers an already active side chat Tab.

The focus command otherwise selects the first side chat Tab it finds.

### Instructions and permissions

The side conversation instruction is the only side chat instruction the model receives.

The renderer supplies that instruction at thread creation.

The boundary message repeats the same rule in the user channel.

No skill teaches side chat use.

No agent tool description mentions the side chat.

The side chat inherits the parent permissions in the cloud path.

The side chat resolves its own developer instructions for the working directory in the local path.

The instruction permits read-only inspection without a further request.

The instruction requires an explicit user request before any workspace mutation.

The instruction requires an explicit user request before any permission escalation.

The instruction forbids all sub-agent interaction inside the side chat.

The open command requires local Codex access.

The human needs no further approval to open a side chat.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Archived source thread | The renderer refuses to create a side chat. |
| Suppressed source thread | The renderer refuses to create a side chat. |
| Cloud parent without an environment | Creation fails and reports the missing environment. |
| Cloud parent without permissions | Creation fails and reports the missing permissions. |
| Cloud parent without workspace roots | Creation fails and reports the missing workspace roots. |
| Creation error | The pending Tab fails and the new conversation is discarded. |
| Failed first turn synchronization | The side chat reports that the first turn did not start. |
| Tab replaced during creation | The renderer discards the new conversation and stops. |
| Close with at least one turn | A confirmation dialog asks before the close. |
| Confirmation dismissed | The Tab stays open. |
| Do not ask again selected | Later closes skip the confirmation. |
| Active voice without a voice host | The close reports that the voice host is unavailable. |
| Voice not stopped within 30 seconds | The close reports that voice did not stop. |
| Failed voice stop | The renderer reopens the Tab and keeps the side chat. |
| Failed cache discard | The renderer records a warning and reports the failure. |

## Sub-agents

A sub-agent is a separate agent thread that another agent creates.

The bundled application server provides the sub-agent tools.

The Codex Desktop renderer does not register any sub-agent tool.

The renderer displays sub-agent activity and opens sub-agent threads.

The application server carries two sub-agent tool generations.

Version one and version two expose different tool sets.

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `spawn_agent` | The application server registers this tool in both generations. | Its schema explains sub-agent creation and returns the new identity. |
| `send_input` | The application server registers this version one tool. | Its schema explains queued input and immediate redirection. |
| `send_message` | The application server registers this version two tool. | Its schema explains message delivery without a new turn. |
| `followup_task` | The application server registers this version two tool. | Its schema explains a new task that triggers a turn. |
| `wait_agent` | The application server registers this tool in both generations. | Its schema explains blocking until a final status or a timeout. |
| `interrupt_agent` | The application server registers this tool in both generations. | Its schema explains turn interruption with a returned previous status. |
| `resume_agent` | The application server registers this version one tool. | Its schema explains reopening a closed agent. |
| `close_agent` | The application server registers this version one tool. | Its schema explains shutdown of an agent and its descendants. |
| `list_agents` | The application server registers this tool in both generations. | Its schema explains listing of live agents in the root thread tree. |
| Sub-agent tool namespace | The application server groups the tools under one namespace. | The namespace description states that the tools spawn and manage sub-agents. |
| Sub-agents panel Tab | The renderer registers this right side panel Tab. | The agent does not receive this Tab. |

The version one namespace name is `multi_agent_v1`.

The version two namespace name is `collaboration`.

A configuration key can override the namespace name.

The namespace description reads that the namespace holds tools for spawning and managing sub-agents.

A separate configuration section controls the whole feature.

That section can set the maximum concurrent threads for each session.

That section can set the maximum sub-agent depth.

That section can set the default sub-agent model.

That section can set the default sub-agent reasoning effort.

That section can set the maximum job runtime in seconds.

That section can set the interrupt message.

A version two section can set the minimum, maximum, and default wait timeout.

A version two section can disable the wait tool.

A version two section can restrict the tools to non code mode turns.

A version two section can hide the spawn metadata.

A version two section can expose the picker model overrides to the spawn tool.

A version two section can replace the usage hint text.

A version two section can replace the sub-agent developer instructions.

A version two section can replace the multi-agent mode hint text.

An agent role file can add a description, a configuration file, and nickname candidates.

The code mode runtime does not receive the version two tools.

The version two instruction states that the tools are absent from the code mode tool namespace.

The version two instruction requires direct tool calls for every sub-agent tool.

### Actions, identity, and ownership

`spawn_agent` creates a new agent for one named task.

The request carries a task name in lowercase letters, digits, and underscores.

The request carries an initial plain-text message or a list of structured input items.

A structured input item can be text, an image, a local image, audio, local audio, a skill, or a mention.

A mention can target a connector path or a plugin path.

The request can override the agent type, the model, and the reasoning effort.

Version one forks the parent history with a context flag.

Version two forks the parent history with a turn count value of none, all, or a positive number.

The result returns the agent identifier.

The result returns the thread identifier of the spawned agent.

The result returns the canonical task name.

The result returns the user-facing nickname when one exists.

The canonical task name nests under the parent task path.

A child of the task path `/root/task1` with the name `task_3` becomes `/root/task1/task_3`.

The parent can then use the relative name or the canonical name.

Another branch of the tree must use the canonical name.

The spawned agent receives the same tools as its parent.

The spawned agent can spawn its own sub-agents.

`send_input` queues a message on a target agent in version one.

`send_input` can instead interrupt the current task and handle the message at once.

`send_input` returns a submission identifier for the queued input.

`send_message` delivers a message in version two without a new turn.

`followup_task` sends a new task in version two and starts a turn when the target is idle.

`followup_task` delivers at a message boundary when the target is already running.

`followup_task` refuses a root target.

`wait_agent` in version one waits for one or more agent identifiers.

`wait_agent` returns when the first listed agent reaches a final status.

`wait_agent` returns the final statuses keyed by agent identifier.

`wait_agent` returns an empty status set after a timeout.

`wait_agent` in version two waits for any mailbox update from any live agent.

That wait also ends early when new user input steers the active turn.

That wait returns a summary only and never the agent content.

The timeout has a configured default, minimum, and maximum in milliseconds.

`interrupt_agent` stops the current turn and returns the previous status.

The target stays available for later messages and tasks.

`close_agent` shuts down one agent and its open descendants.

`close_agent` returns the status observed before shutdown.

A completed agent stays open and counts against the concurrency limit until a close.

`list_agents` lists the live agents in the current root thread tree.

Each entry carries the canonical task name, or the agent identifier when no name exists.

Each entry carries the last known status.

An optional task-path prefix filters the list.

An agent status is one of waiting for start, running, completed, interrupted, shut down, errored, or not found.

The thread record of a sub-agent stores the parent thread identifier.

The thread record also stores the agent path, the agent nickname, and the agent role.

The root thread tree owns every sub-agent thread.

The renderer keeps a descendant snapshot for each parent conversation.

The renderer updates the conversation nickname when the thread record changes it.

### Resume, transfer, and lifetime

`resume_agent` reopens a previously closed agent by identifier.

The reopened agent can receive input and wait calls again.

A spawned agent keeps a durable thread identifier.

The renderer resolves that thread identifier to a stored conversation.

The renderer rediscovers the descendant tree after a reload.

The Sub-agents panel Tab stores a durable route.

That route records the selected descendant conversation identifier.

After a restart the Tab reopens and hydrates the selected descendant.

A failed restore records a warning and reopens the panel without a selection.

The renderer hydrates background sub-agent threads on demand.

The renderer can interrupt every descendant of a thread.

The renderer can interrupt descendants in the background.

A sub-agent fork requires a thread spawn thread source.

A sub-agent fork requires a fork mode.

A sub-agent fork requires the parent spawn call identifier.

An agent depth limit ends further spawning.

The session limits the concurrent threads for each session.

### Transcript rendering and human access

The application server emits paired events for every sub-agent action.

The events cover spawn start and end.

The events cover interaction start and end.

The events cover waiting start and end.

The events cover close start and resume start.

The transcript stores two sub-agent item types.

The first item type is a sub-agent tool call.

That item carries the tool, the status, the sender thread, and the receiver threads.

That item also carries the prompt, the model, the reasoning effort, and a state for each agent.

The tool value is one of spawn, send input, resume, wait, or close.

The item status is in progress, completed, or failed.

Each agent state carries a status and an optional message.

The second item type is sub-agent activity.

That item carries an activity kind of started, interacted, or interrupted.

That item also carries the sub-agent thread identifier and the agent path.

The transcript renders the tool call as a multi-agent action item.

The transcript renders the activity as a sub-agent activity item.

The transcript hides a wait tool call.

The transcript hides both item types when background sub-agents are disabled.

The multi-agent action item shows a header for each tool and each status.

The multi-agent action item shows one row for each target agent.

Each row shows the agent state as waiting, working, done, or failed.

The sub-agent activity item shows a summary of started, updated, completed, or interrupted.

The item marks a message sent to an agent and a message sent to a parent.

The item offers an action that opens the sub-agent.

Therefore the human can open the controlled thread from the transcript activity.

The Sub-agents panel Tab lists the descendant threads of the parent thread.

The panel groups the list into active agents and finished agents.

The panel shows the model and the reasoning effort for each agent.

The panel shows a waiting state and an elapsed time since completion.

The panel offers a back action from a selected agent to the list.

The panel reports that no active sub-agent exists when the list is empty.

The Tab thumbnail shows the count of loaded agents.

The thumbnail shows at most four agents.

The thumbnail states each runtime status as working, idle, or failed.

### Instructions and permissions

The spawn tool description carries the full delegation guidance.

That guidance forbids a spawn unless the user or a project file or a skill asks for it.

That guidance states that a request for depth or research is not permission to spawn.

That guidance requires a plan before any delegation.

That guidance keeps blocking work local.

That guidance requires concrete, bounded, and self-contained subtasks.

That guidance requires a disjoint write scope for each code subtask.

That guidance limits wait calls to a blocked critical path.

That guidance requires useful local work while a sub-agent runs.

That guidance describes parallel delegation patterns.

The spawn tool description also states that the child inherits the parent model.

The description tells the model to omit the model field without an explicit user request.

A separate role instruction describes the agent team.

The root role instruction names the primary agent and its message format.

The sub-agent role instruction states that the final channel returns content to the parent.

Both role instructions warn that a human can read the messages.

A separate usage hint can be added to the turn.

The configuration carries a hint for the root agent and a hint for a sub-agent.

The configuration carries separate developer instructions for a sub-agent.

The side chat instruction forbids all sub-agent interaction inside a side chat.

An agent role file can restrict which roles a spawn can select.

The role guidance never authorizes a spawn by itself.

The sub-agent tools follow the same approval and sandbox policy as the parent.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Spawn without permission | The guidance forbids the call. |
| Agent depth limit reached | The agent is told to solve the task itself. |
| Unavailable agent type | The tool reports that the agent type is not available. |
| Unresolved child model | The spawn cannot validate the reasoning effort. |
| Unresolved child service tier | The spawn cannot validate the service tier. |
| Missing canonical task name | The spawn reports the missing name. |
| Version one fork flag in version two | The tool reports that the turn count field replaces it. |
| Invalid turn count value | The tool requires none, all, or a positive number. |
| No loaded model override | The tool reports that no picker model override exists. |
| Unavailable collaboration manager | The tool reports that the manager is unavailable. |
| Wait timeout | The wait returns a timeout summary with no final status. |
| Wait interrupted by user input | The wait returns an interruption summary. |
| Target not found | The agent state reports not found. |
| Agent error | The agent state reports an error with a message. |
| Closed agent | The agent state reports shutdown. |
| Interrupted agent | The agent state reports an interruption. |
| Tool call failure | The transcript item records the failed status. |
| Background sub-agents disabled | The transcript hides every sub-agent item. |
| Code mode call | The version two tools are absent from the code mode namespace. |
| Failed panel restore | The renderer records a warning and reopens the panel without a selection. |
| Unavailable descendant | The panel reports that the sub-agent is unavailable. |

