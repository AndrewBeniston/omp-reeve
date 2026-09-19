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

Evidence pending.

### Resume, transfer, and lifetime

Evidence pending.

### Transcript rendering and human access

Evidence pending.

### Instructions and permissions

Evidence pending.

### Failure and unavailable states

Evidence pending.

