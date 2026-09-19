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

Evidence pending.

### Instructions and permissions

Evidence pending.

### Failure and unavailable states

Evidence pending.

## Sub-agents

Evidence pending.

### Registration and discovery

Evidence pending.

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

