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

## Sub-agents

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Spawn a sub-agent for one named task | The task tool spawns one sub-agent with a name, an agent type, and a task | equivalent | src/task/index.ts | source-verified |
| Spawn several sub-agents in one call | The task tool accepts a batch of items with one shared context | equivalent | src/task/types.ts | source-verified |
| Override the child model and the reasoning effort | The task tool accepts a per spawn effort, and the agent type selects the model | equivalent | src/task/types.ts | source-verified |
| Fork parent history into the child | OMP starts a sub-agent from its agent definition and the given task | partial | src/task/index.ts | source-verified |
| Send a message to a running agent | The hub tool sends a message to one agent identifier or to every agent | equivalent | src/tools/hub/messaging.ts | source-verified |
| Wait for a reply from one agent | The hub tool sends a message and waits for the reply of that agent | equivalent | src/tools/hub/index.ts | source-verified |
| Wait until an agent reaches a final status | The hub tool waits on job identifiers with a timeout in milliseconds | equivalent | src/tools/hub/jobs.ts | source-verified |
| Interrupt the current turn of an agent | The hub tool cancels running job identifiers | partial | src/tools/hub/jobs.ts | source-verified |
| Close an agent and its descendants | none. A job ends, and OMP has no shutdown operation for a kept agent | none | - | source-verified |
| Reopen a closed agent | none for a task sub-agent | none | - | source-verified |
| List the live agents with a status | The hub tool lists peers and filters by running, idle, or parked | equivalent | src/tools/hub/index.ts | source-verified |
| Canonical task path that nests under the parent | An agent registry identifier with a generated name and dot qualified children | partial | src/task/name-generator.ts | source-verified |
| Read the transcript of another agent | An internal transcript address returns an agent index and one agent transcript | equivalent | src/internal-urls/history-protocol.ts | source-verified |
| Read the output of another agent | An internal output address returns the full output and a nested child output | equivalent | src/internal-urls/agent-protocol.ts | source-verified |
| Depth limit and concurrency limit for spawning | A recursion depth cap removes the spawn tool, and a provider concurrency limit applies | equivalent | src/task/types.ts | source-verified |
| Run a sub-agent in an isolated checkout | The task tool runs a spawn in an isolated worktree | equivalent | src/task/worktree.ts | source-verified |
| Panel that lists descendants with live status | A terminal roster and terminal renderers only. RPC receives events without a panel | partial | src/task/renderer.ts | source-verified |
| Open the sub-agent thread from the transcript | none | none | - | source-verified |
| Drive separate command line workers | Five worker tools spawn, send, wait, kill, and list persistent worker sessions | equivalent | src/tools/vibe.ts | source-verified |

## Panel placement, layout, and Tab movement

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Two panel hosts named right and bottom | none. OMP has one terminal surface | none | - | source-verified |
| Request a placement value with a tool | A widget accepts a placement above the editor or below the editor | partial | src/extensibility/extensions/types.ts | source-verified |
| Tab kinds with permitted destinations | none | none | - | source-verified |
| Tab identity for each target type | none | none | - | source-verified |
| Layout record with routes, order, and focus | none | none | - | source-verified |
| Restore a layout after a reload | none | none | - | source-verified |
| Move a Tab between hosts | none | none | - | source-verified |
| Reorder, pin, close, or hide a Tab | none | none | - | source-verified |
| Maximise the right host | none | none | - | source-verified |
| Copy a panel Tab set to another task | none | none | - | source-verified |
| Reveal and focus a Tab from a tool call | none | none | - | source-verified |

OMP supplies one related behaviour only.

An extension can set a widget above or below the editor, and can set a status line.

RPC mode accepts that widget as text lines only.

## Settings and approval state

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Agent tool that reads the settings state | none. OMP registers no settings tool for the agent | none | - | source-verified |
| Agent tool that writes a setting | none | none | - | source-verified |
| Machine readable setting definitions with an access level | A typed settings schema with a description, a default, and allowed values | partial | src/config/settings-schema.ts | source-verified |
| Separate user scope and project scope | OMP settings load from layered configuration files | equivalent | src/config/settings.ts | source-verified |
| Approval policy values for a thread | An approval mode with three values, and per tool allow, prompt, or deny policies | partial | src/config/settings-schema.ts | source-verified |
| Sandbox mode values for a thread | none | none | - | source-verified |
| Network access switch for a thread | none | none | - | source-verified |
| Web search mode values | A web search tool exists. No agent tool changes a search mode | none | - | source-verified |
| Human confirmation before a configuration write | The user interface context shows a confirmation, and RPC supports it | partial | src/modes/rpc/rpc-mode.ts | source-verified |
| Managed policy that locks a key | none | none | - | source-verified |
| Report that a change applies to a new thread only | none | none | - | inference from the absence of a settings tool |

## Questions and option pickers

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Ask one or more questions in one call | The ask tool takes at least one question and returns one result for each question | equivalent | src/tools/ask.ts | source-verified |
| Offer options with a label and a description | An option carries a label, a description, and an optional preview | equivalent | src/tools/ask.ts | source-verified |
| Permit more than one selection | A question carries a multiple selection flag | equivalent | src/tools/ask.ts | source-verified |
| Accept free text beside the options | A reserved option always lets the user type an answer | equivalent | src/tools/ask.ts | source-verified |
| Mark a question answer as secret | none | none | - | source-verified |
| Mark a recommended option | A question carries a recommended index, and OMP adds a suffix to that label | equivalent | src/tools/ask.ts | source-verified |
| Resolve a question automatically after a delay | A dialogue timeout selects the recommended option, and plan mode disables it | equivalent | src/tools/ask.ts | source-verified |
| Skip the question without an answer | The user can cancel, and the tool records an abort | equivalent | src/tools/ask.ts | source-verified |
| Redirect the question into chat | A reserved option returns a chat redirect with the open questions | equivalent | src/tools/ask.ts | source-verified |
| Answer the same question again from history | A persisted question payload reopens the picker and branches the answer | equivalent | src/tools/ask.ts | source-verified |
| Present an option picker in a reduced host | RPC mode sends a selector request and keeps the option descriptions | equivalent | src/modes/rpc/rpc-mode.ts | source-verified |
| Present a rich multiple question dialogue | Interactive mode only. RPC mode implements no rich dialogue | partial | src/modes/rpc/rpc-mode.ts | source-verified |
| Answer a request from any window that shows the thread | none. One RPC host answers one request | none | - | source-verified |
| Serve a server elicitation request | The agent protocol mode serves an elicitation form. RPC mode does not | partial | src/modes/acp/acp-agent.ts | source-verified |
