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


## Placement and layout persistence

The renderer stores one layout record for each local task.

The record has a version number, a route list, and a topology.

The renderer writes the record to a client side key value store.

The store key uses the task route, so the record survives a renderer reload.

| Record field | Stored value |
| --- | --- |
| routes | One entry for each restorable Tab. |
| routes entry | The Tab kind, the Tab identifier, a payload version, and the Tab parameters. |
| topology.right | The right host state. |
| topology.bottom | The bottom host state. |
| topology.focusArea | The value "right-panel", "bottom-panel", or "main". |
| topology.layoutMode | The value "full" or "split". |
| topology.rightPanelFullWidth | The maximise state of the right host. |
| topology.tabsHidden | The hidden state of the Tab strips. |
| version | The value 1. |

Each host state holds an open flag, an ordered Tab identifier list, and the active Tab identifier.

The ordered list holds the Tab order for that host.

The layout record therefore persists placement, order, activation, and maximise together.

A Tab type can refuse persistence for one Tab.

A preview Tab does not persist.

A restore checks the stored payload version against the current Tab type version.

A restore also checks that the Tab type is available for the task route.

A restore stops when the version differs or the Tab type is unavailable.

A Tab close removes the route and removes the identifier from the host list.

A Tab close also clears the maximise flag when the right host becomes empty.

A Tab close moves the focus area to the other host or to the main area.

A task transfer uses a separate layout snapshot.

The snapshot holds each Tab, its host, its active flag, and its kind specific payload.

The snapshot also holds the two panel open flags, the maximise flag, and the focus area.

The transfer target reopens each Tab in the recorded host.

The transfer target then restores the panel open flags and the focus area.

The same snapshot serves a same directory transfer and a pending worktree transfer.

A cancelled worktree transfer discards the pending snapshot.


## Tab movement and ordering

The agent cannot move a Tab between the two hosts.

The agent cannot reorder, pin, close, or hide a Tab.

The open_in_codex schema exposes no field for those actions.

A human moves a Tab by a drag between the Tab strips.

A human can also move a Tab through a Tab action.

A move checks four conditions before it starts.

| Condition | Result when the condition fails |
| --- | --- |
| The target host differs from the source host. | The move stops. |
| The target host does not already hold the Tab. | The move stops. |
| The Tab type permits the target host. | The move stops. |
| The Tab is not in a transfer. | The move stops. |

A move to the bottom host activates the Tab when the bottom host already holds it.

A move of the last right host Tab to the bottom host closes the right panel.

That move also records the previous focus area for a later restore.

A move to the right host closes the bottom panel when the bottom host becomes empty.

A terminal Tab move rebinds the Tab to the new host.

The terminal Tab keeps its terminal session identifier through that move.

The new host receives a new action for a further terminal Tab.

A single Tab host closes its current Tab before it accepts a moved Tab.

A move can also send a Tab to another task.

That task move uses an admission step, a start step, and a source detach step.

The task move cancels when any step fails.

An open can request an insert position after a named Tab.

The agent schema does not expose that insert position.

A human reorder moves one Tab identifier to another index in the same host list.

A reorder stops for a Tab that is in a transfer.

A drag computes an insertion before or after the Tab under the pointer.

A cancelled drag restores the original index and the original active Tab.

## Maximise

The right host supports a maximise state.

The state name in the layout record is the right panel full width flag.

The bottom host has no maximise state.

A human toggles maximise with a command in the panels command group.

That command has an application shortcut scope and no default keyboard shortcut.

The command registry marks that command as not available in the command menu.

The maximise state persists in the task layout record.

The maximise state clears when the right host holds no Tab.

An entry into maximise can hide the sidebar when the active Tab type permits it.

An entry into maximise calls a Tab type hook for full width content.

Each Tab type declares its own pane transition for entry and exit.

The agent has no maximise tool and no maximise field.

