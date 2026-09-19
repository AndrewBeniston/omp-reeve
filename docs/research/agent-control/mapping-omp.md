# OMP mapping for the Codex Desktop agent control surface

## Status

This report answers item 10 of the research ticket for every surface.

It states whether current OMP has an equivalent, a partial equivalent, or nothing.

It does not name any Reeve ticket. Another worker owns ticket ownership.

## Scope

This report maps the capabilities that the seven surface reports recorded.

It covers Terminal, Files, Review, Side chat, Sub-agents, and Panel placement.

It also covers Settings and approval state, Questions and option pickers, and Goal state.

It also covers Session lifecycle, Visualizations, Capture, and the remaining registered services.

It excludes Browser control. An earlier research ticket settled that surface.

## Evidence method

The Codex Desktop evidence comes from the seven surface reports in this directory.

The Terminal evidence comes from the capability inventory of the parent report.

The visualization evidence comes from the session visualization report on its own branch.

Seven different workers wrote those reports from the installed Codex Desktop archive.

The OMP evidence comes from the installed OMP package source, version 18.1.6.

I read that source in this session. I did not answer from memory.

I did not run OMP and I did not run Codex Desktop.

Therefore every OMP finding is a source finding, not a live observation.

## Verdict key

| Verdict | Meaning |
| --- | --- |
| equivalent | OMP gives the agent the same behaviour and the same value. |
| partial | OMP gives part of the behaviour, or gives it to the host and not to the agent. |
| none | OMP supplies nothing for the capability. |

Each row carries one evidence label.

A source-verified row comes from a file that I read in this session.

An inference row comes from an absence, or from a behaviour that I could not read directly.

Each OMP source anchor is a path inside the OMP package source tree.

A dash in the anchor column means that no OMP source exists for the row.

## The RPC limit

Reeve runs OMP through RPC mode. The RPC limit therefore decides each verdict.

RPC mode implements a reduced user interface context.

RPC mode supports a selector, a confirmation, a text input, a notification, and a status line.

RPC mode accepts widget content as text lines only.

RPC mode ignores a terminal component factory for a widget, a footer, and a header.

RPC mode returns nothing for a custom interactive component.

Source anchor: src/modes/rpc/rpc-mode.ts. Evidence label: source-verified.

Interactive mode adds a rich question dialogue and custom terminal components.

Reeve cannot use those paths through RPC mode.

## Summary

OMP covers the agent work and not the application control.

OMP has strong equivalents for command execution, sub-agent control, questions, and goal state.

OMP has partial equivalents for file change, review findings, session lifecycle, and capture.

OMP has nothing for panel placement, Tab identity, visualizations, and application settings tools.

Every panel, Tab, and window capability needs a complete Reeve implementation.

## Terminal

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Start a command and return a process session | The bash tool runs a command with an optional pseudo terminal and an optional background mode | partial | src/tools/bash.ts | source-verified |
| Send input to a running process | The hub tool sends text, an Enter key, terminal keys, or a signal to a named process | partial | src/tools/hub/index.ts | source-verified |
| Poll a running process for output | The hub tool reads process output with a cursor and a follow mode | equivalent | src/tools/hub/launch.ts | source-verified |
| Keep a long process alive beyond one call | The hub tool starts a supervised process with a name, a readiness test, and a restart policy | equivalent | src/tools/hub/launch.ts | source-verified |
| Open an application Terminal Tab | none | none | - | source-verified |
| Read the current application Terminal snapshot | none. OMP has no application Terminal | none | - | source-verified |
| Terminal Tab identity built from a session identifier | A supervised process carries a stable project scoped name | partial | src/tools/hub/launch.ts | source-verified |
| Terminal session bound to one window and one task | A supervised process records an owner session and can outlive it | partial | src/tools/hub/launch.ts | source-verified |
| Transfer a terminal session to another task | none | none | - | inference from the absence of a transfer operation |
| Command activity with state, duration, output, and exit code | The bash tool result carries an exit code, a wall time, a timeout state, and output metadata | equivalent | src/tools/bash.ts | source-verified |
| Approval before a command runs | OMP approval tiers, an approval mode, per tool policies, and ordered command match rules | equivalent | src/config/settings-schema.ts | source-verified |
| Sandbox policy that limits a command | none. OMP defines no read-only, workspace-write, or full-access mode | none | - | source-verified |

## Files

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Open one workspace file in a panel Tab | none | none | - | source-verified |
| Open a file at a line and a column | none | none | - | source-verified |
| Change a file through a patch tool | The edit tool, the write tool, and the syntax tree edit tool change a file | equivalent | src/tools/write.ts | source-verified |
| Read a file with a line range | The read tool reads a file, an archive, a document, and a database | equivalent | src/tools/read.ts | source-verified |
| List one directory under a workspace root | The glob tool and the grep tool find files, and the system prompt carries a workspace tree | partial | src/workspace-tree.ts | source-verified |
| Go to definition through a language service | The language service tool supplies definitions, references, and diagnostics | equivalent | src/tools/index.ts | source-verified |
| File change items with a change kind and a move path | Tool result renderers show each edit as a difference block | partial | src/tools/renderers.ts | source-verified |
| One turn difference at the end of a turn | The checkpoint tool and the rewind tool save and restore a working tree state | partial | src/tools/checkpoint.ts | source-verified |
| Automatic preview of a produced document | none | none | - | source-verified |
| Writable root grant during an approval | none. OMP has no writable root model | none | - | source-verified |
| Durable file Tab route that survives a reload | none | none | - | source-verified |

## Review

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Open a Review panel with a named view | none | none | - | source-verified |
| Compare a branch against a base revision | The github tool reads a pull request difference, and the bash tool runs git | partial | src/tools/gh-pr-diff.ts | source-verified |
| Show staged, unstaged, or last turn changes | The bash tool runs git. OMP has no review view state | partial | src/tools/bash.ts | inference from the absence of a review view |
| Record an inline code comment from the model | The yield tool records findings with a title, a body, a priority, a file path, and a line range | equivalent | src/tools/review.ts | source-verified |
| Four comment priority values | OMP findings carry four priority values | equivalent | src/tools/review.ts | source-verified |
| Store comments per task and move them on a handoff | none | none | - | source-verified |
| Open a pull request file and line from the transcript | The github tool opens pull request content as text | partial | src/tools/gh-view.ts | source-verified |
| Review Tab identity that survives a reload | none | none | - | source-verified |

## Side chat

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Create a temporary thread beside the main thread | The session manager forks a session from a chosen point | partial | src/session/session-manager.ts | source-verified |
| Exclude parent turns and pass them as reference context | A fork copies the parent entries. OMP has no reference-only mode | none | - | source-verified |
| Inject a boundary message as the first item | The host can send any first message. OMP defines no boundary concept | partial | src/session/messages.ts | inference from the message API |
| Append a side conversation developer instruction | OMP appends a custom system prompt for a session | equivalent | src/system-prompt.ts | source-verified |
| Mark a thread ephemeral and hide it from the list | none. Every OMP session writes a session file | none | - | source-verified |
| Forbid sub-agent use inside the side conversation | A spawn policy and a depth cap can remove the spawn tool | partial | src/task/spawn-policy.ts | source-verified |
| Show a running and an unread indicator on the parent | none | none | - | source-verified |
| Close the side chat and discard the conversation | The host can delete a session file. OMP has no discard operation | partial | src/session/session-manager.ts | inference from the session storage API |
