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

Evidence pending.

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

