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

## Actions and identity

Evidence pending.

## Placement and human access

Evidence pending.

## Transcript rendering

Evidence pending.

## Instructions and permissions

Evidence pending.

## Failure and unavailable states

Evidence pending.

