# Codex Desktop panel placement, layout, and Tab movement

## Status

This report contains evidence only.

The mapping worker will complete the mapping sections of the parent report.

## Scope

This report covers panel placement, the two panel hosts, and layout persistence.

This report also covers Tab movement between hosts, Tab ordering, and maximise.

This report records every placement value that the agent can request.

This report excludes Browser control.

Ticket 440 covers Browser control.

Another worker covers each other surface.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected the main process bundle, the renderer bundle, and the panel command chunk.

I inspected the Desktop tool schemas, the panel host registrations, and the layout record schema.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Registration and discovery

Codex Desktop uses two panel hosts.

The hosts have the identifiers "right" and "bottom".

The application shell registers both hosts as tab controllers.

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| open_in_codex | The Desktop tool builder adds it to the codex_app namespace. | Its schema names the placement values and the panel targets. |
| windows.tabs.open | The renderer registers this application command. | The agent learns only the enclosing open_in_codex tool. |
| right | The application shell registers this panel host. | The agent does not receive this host directly. |
| bottom | The application shell registers this panel host. | The agent does not receive this host directly. |
| toggleSidePanel | The command registry registers this human command. | The agent does not receive this command. |
| toggleMaximizeSidePanel | The command registry registers this human command. | The agent does not receive this command. |
| openReviewTab | The command registry registers this human command. | The agent does not receive this command. |
| toggleReviewTab | The command registry registers this human command. | The agent does not receive this command. |

The codex_app namespace can defer the open_in_codex tool.

The agent loads a deferred tool when its schema becomes necessary.

The four human commands belong to one command menu group for panels.

Two of those commands carry a default keyboard shortcut.

The maximise command carries no default keyboard shortcut.

Each panel host exposes open, activate, close, move, reorder, and pin operations.

These host operations are not direct agent tools.

The agent reaches a panel host only through open_in_codex.

