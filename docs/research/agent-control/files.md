# Files, file tree, and file Tabs

## Status

This report contains evidence only.

I completed the Files surface for ticket 444.

## Scope

This report covers Files, the file tree, and file Tabs.

This report contains evidence only.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected the main process bundle, the renderer bundle, and the panel command chunk.

I read the Desktop tool schemas, the Tab registrations, the host service registry, and the transcript adapters.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Capability inventory

### Registration and discovery

Codex Desktop gives the agent one file presentation tool.

Codex Desktop gives the agent no file tree tool and no file listing tool.

The agent changes a file through a core patch tool, not through a Desktop tool.

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema lists a workspace file as the first panel target. |
| `windows.tabs.open` | `open_in_codex` queues this application command. | The agent learns only the enclosing `open_in_codex` tool. |
| `apply_patch` | The app server registers this core Session tool. | The Session tool schema explains freeform patch editing. |
| `workspaceFiles` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `lsp` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `fileAttachments` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `fileDrags` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `libraryFiles` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `hostedThreadFiles` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| `contentTabs` | Each desktop window registers this host service. | The agent does not receive this service directly. |
| Text file editor Tab | The renderer registers this Tab kind. | The agent does not name the Tab kind. |
| `file.goToDefinition` | The renderer registers this application command. | The agent does not receive application commands. |

The `codex_app` namespace can defer the `open_in_codex` schema.

The agent loads the deferred schema when it needs the tool.

The tool builder filters the panel targets by availability.

The file target and the browser target skip that filter.

Therefore, the file target is always present in the schema.

The `apply_patch` schema is not present in the desktop bundles.

The renderer only records the patch result and the patch approval action.

Therefore, the core patch registration point is an inference from those records.

The main process registers one language server service for each window.

That service supports definition, implementation, references, type definition, and hover.

No agent tool schema in the bundles exposes that service.

Therefore, the agent cannot call Go to definition.

### Actions and identity

`open_in_codex` with a file target opens one workspace file in a panel Tab.

The request accepts a path and an optional positive line number.

The request also accepts an optional placement and an optional thread identifier.

The command selects a viewer in a fixed order.

The order is artifact viewer, extension file viewer, text file editor, an already open file Tab, artifact viewer, and review file source viewer.

The command skips the text file editor when the caller supplies an end line.

The result returns the thread identifier, the target type, the placement, the status, and the viewer name.

The status is `opened` or `existing`.

The viewer name is `artifact`, `mcpExtensionFileViewer`, `textFileEditor`, or `reviewFileSource`.

The file result returns no Tab identifier.

The terminal, browser, and review results each return a Tab identifier.

Each file viewer builds its own Tab identifier from the host and the path.

| Viewer | Tab identifier value |
| --- | --- |
| Text file editor | `text-editor:<hostId>:<path>` |
| Review file source | `file:<hostId>:<path>` |
| Review file source with an environment | `file:<hostId>:<environmentId>:<path>` |
| Extension file viewer | `mcp-extension:file-viewer:file:<hostId>:<path>` |
| Artifact viewer | `artifact:<hostId>:<path>` |

A second call for the same host and path finds the same Tab.

That call returns the status `existing`.

Each file Tab stores a durable route with payload version 1.

The text file editor route stores the host, the path, the line, the column, and the workspace root.

The review file source route also stores the end line, the title, and the environment.

After a renderer reload, the renderer reopens the file from that stored route.

The renderer rejects a stored payload with another version number.

The renderer also rejects a payload that fails parameter validation.

The renderer keeps the Tab but opens no file while the host is disconnected.

The review file source Tab records no durable route when the caller supplies a custom icon or a close callback.

The renderer reports the open file Tab list for each conversation to the main process.

The main process watches those files and reports a change to the conversation.

The renderer can copy a complete panel Tab set from one task to another task.

The copy keeps each file Tab, its path, its panel, and its active state.

The copy builds a new Tab identifier from the target host and the copied path.

A worktree copy also rebases each path from the source workspace root to the target workspace root.

A path outside the source workspace root keeps its original value.

A copied terminal Tab receives a new terminal session identifier.

Therefore, a file Tab transfers by path, and a terminal Tab transfers by session.

The file Tab contains its own workspace file navigation.

That navigation lists one directory at a time under a workspace root.

The service rejects a directory path outside the workspace root.

The service also rejects a symbolic link directory.

The service can hide entries that start with a period.

The agent receives no tool for that navigation service.

The agent changes a file with the core patch tool.

The renderer records each change as a file change item with a path and a change kind.

The change kind can rename a file through a move path.

### Placement and human access

`open_in_codex` accepts the placement `right` or `bottom`.

A file target uses `right` when the caller supplies no placement.

An already open file Tab keeps its current placement.

The result reports that current placement.

The command searches the requested placement first for an open file Tab.

The command then searches the other placements.

The command pins and activates the Tab that it finds.

The command also focuses the panel that holds the Tab.

A new file Tab opens revealed and focused.

A copied file Tab opens without reveal and without focus.

The transcript records the edited file path for each completed file change.

Codex can open a preview Tab for an edited file without a human action.

That automatic open applies only to a slide file, a document file, a spreadsheet file, or a portable document file.

That automatic open needs an enabled experiment setting.

That automatic open needs an idle task and a current turn.

That automatic open rejects a file larger than 41,943,040 bytes.

Codex marks that open with the source value `auto_open`.

Codex marks a human open with the source value `manual`.

Assistant text can contain a file citation with a path and a line range.

The renderer parses that citation and records the path as a referenced path or an output path.

I did not verify that a click on that citation opens a file Tab.

### Transcript rendering

Evidence pending.

### Instructions and permissions

Evidence pending.

### Failure and unavailable states

Evidence pending.

