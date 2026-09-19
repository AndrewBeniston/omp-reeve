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


## Actions and identity

The agent opens a panel Tab with open_in_codex.

The tool accepts an optional task identifier, a target, and an optional placement.

The placement accepts only the value "right" or the value "bottom".

The tool schema defines no other placement value.

The tool schema defines no ordering, move, close, resize, or maximise field.

The target accepts a file, a browser tab, a terminal, or a review view.

The tool call does not run inside the window.

The tool queues an application command for the target task.

The tool result to the agent contains the queued status and the task identifier.

The tool result to the agent contains no Tab identifier and no placement.

The window computes a fuller record when the queued command runs.

That record contains the task identifier, the target type, the placement, the status, and the Tab identifier.

The window does not return that record to the agent.

The status value in that record is "opened" or "existing".

| Target type | Tab identity value |
| --- | --- |
| terminal | The prefix "terminal:" followed by the terminal session identifier. |
| review | One fixed review Tab identifier for the task. |
| browser | The browser tab identifier. |
| file | An identifier that the file Tab type derives from the file path. |

The placement in that record is the host that holds the Tab after the call.

An existing Tab keeps its current host.

A placement request cannot move an existing Tab.

A missing placement uses "right" for a file, a browser tab, and a review view.

A missing placement for a terminal uses the task setting for the default terminal location.

That terminal setting falls back to "right" when its feature gate is off.

Each Tab type declares its permitted destinations.

The default permitted destination set is "left" and "right".

A terminal Tab permits "left", "right", and "bottom".

A browser Tab permits "left" and "right".

Several ChatGPT Tab types permit "right" only.

The destination "left" is a main area content side, not a panel host.

The agent cannot request the destination "left".

A request for "bottom" opens in the right host when the Tab type forbids "bottom".

The window owns every panel host.

One main window shows one task at a time.

A panel host belongs to the window, and its content belongs to the visible task.

