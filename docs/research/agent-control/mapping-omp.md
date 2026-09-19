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

## Goal state

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Create a goal with an objective | The goal tool creates a goal with an objective | equivalent | src/goals/tools/goal-tool.ts | source-verified |
| Set a token budget on the goal | The goal tool accepts a positive whole token budget | equivalent | src/goals/tools/goal-tool.ts | source-verified |
| Refuse a second unfinished goal | OMP holds one goal record for the session | equivalent | src/goals/state.ts | source-verified |
| Read the status, the budget, and the token use | The goal tool returns the status, the used tokens, and the remaining tokens | equivalent | src/goals/tools/goal-tool.ts | source-verified |
| Report the elapsed time of the goal | The goal record stores the used time in seconds | equivalent | src/goals/state.ts | source-verified |
| Set the complete status | The goal tool completes the goal and returns a budget report | equivalent | src/goals/tools/goal-tool.ts | source-verified |
| Set the paused status | OMP has a paused status, and the tool resumes a goal | partial | src/goals/state.ts | source-verified |
| Set the blocked status | none. OMP has no blocked status | none | - | source-verified |
| Budget limited status set by the system | OMP has a budget limited status | equivalent | src/goals/state.ts | source-verified |
| Usage limited status set by the system | none | none | - | source-verified |
| Clear or drop the goal | The goal tool drops the goal | equivalent | src/goals/tools/goal-tool.ts | source-verified |
| Show the objective as a completed turn | A terminal status block and a goal update event only | partial | src/goals/runtime.ts | source-verified |
| Ask the agent to continue the goal | The runtime emits a goal continuation request with a prompt | equivalent | src/goals/state.ts | source-verified |
| Attach pasted text or an image to the objective | none | none | - | source-verified |
| Move a long objective into a file | none | none | - | source-verified |
| Gate the whole feature behind a setting | A goal setting and the goal mode state control the tool | equivalent | src/tools/index.ts | source-verified |

## Session lifecycle

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Agent tool that creates another task | none. The host creates a session | partial | src/session/session-manager.ts | source-verified |
| Agent tool that forks a task | none. The host forks a session from a chosen entry | partial | src/session/session-manager.ts | source-verified |
| Agent tool that lists tasks | none. The host lists sessions across project directories | partial | src/session/session-manager.ts | source-verified |
| Agent tool that reads another task | An internal transcript address reads another agent transcript | partial | src/internal-urls/history-protocol.ts | source-verified |
| Agent tool that waits for other tasks | The hub tool waits for sub-agent jobs and peer messages | partial | src/tools/hub/jobs.ts | source-verified |
| Agent tool that sends a follow-up to another task | The hub tool sends a message to a peer agent | partial | src/tools/hub/messaging.ts | source-verified |
| Agent tool that renames a task | none. The host sets the session name | partial | src/session/session-manager.ts | source-verified |
| Automatic title generation | OMP generates a session title | equivalent | src/session/session-title-slot.ts | source-verified |
| Archive and restore a task | none. OMP has no archive state | none | - | source-verified |
| Pin a task in a list | OMP stores pinned session identifiers and sorts them first | partial | src/session/session-pins.ts | source-verified |
| Move a task between a checkout and a worktree | none. OMP creates a session worktree at the start | partial | src/session/session-worktree.ts | source-verified |
| Report the progress of a move operation | none | none | - | source-verified |
| Create a share link for a task | The host creates an encrypted share link for a session | partial | src/export/share.ts | source-verified |
| Navigate a window to a task | none | none | - | source-verified |
| Create a managed worktree and attach it | The host creates a session worktree, and the task tool isolates a spawn | partial | src/session/session-worktree.ts | source-verified |
| Sidebar sections, order, and task emoji | none | none | - | source-verified |

## Visualizations

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Skill that teaches the model to build a visualization | OMP loads a skill file and sends its whole body to the model | equivalent | src/extensibility/skills.ts | source-verified |
| Detect a written fragment and render it | none. OMP has no visualization content type | none | - | source-verified |
| Grant a temporary writable root for the turn | none | none | - | source-verified |
| Host a fragment in an isolated browsing context | none. OMP defines no frame and no content policy | none | - | source-verified |
| Measure the fragment and set its height | none | none | - | source-verified |
| Store and restore a widget state | none | none | - | source-verified |
| Send a follow-up turn from the fragment | none | none | - | source-verified |
| Rich block inside the transcript | A widget accepts text lines in RPC mode, and a terminal component in interactive mode | partial | src/modes/rpc/rpc-mode.ts | source-verified |
| Export the result as a standalone document | OMP exports a whole session as an HTML document | partial | src/export/html | source-verified |

The earlier note is correct. I verified each part of it in this session.

OMP has no visualization concept.

OMP widget content accepts text lines or a terminal component factory only.

RPC mode ignores a terminal component factory.

## Capture

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Capture the foreground window as an image | The computer tool captures screenshots of the host desktop | equivalent | src/tools/computer.ts | source-verified |
| Read the accessibility text of that window | The computer tool reads accessibility information | equivalent | src/tools/computer.ts | source-verified |
| Inspect without changing anything | A read-only mode blocks every input and every mutation | equivalent | src/tools/computer.ts | source-verified |
| Report the application page and panel state | none. OMP has no application state to report | none | - | source-verified |
| Restrict the capture to an active voice session | none. OMP applies approval tiers instead | none | - | source-verified |
| Report the capture permission state | The tool result reports the capture, input, and accessibility permissions | equivalent | src/tools/computer.ts | source-verified |
| Human capture through a global hotkey | none | none | - | source-verified |

## Remaining registered services

| Codex Desktop capability | OMP equivalent or none | Verdict | OMP source anchor | Evidence |
| --- | --- | --- | --- | --- |
| Install, remove, and check plugins | OMP has a plugin manager, an installer, a marketplace, and a check command | equivalent | src/extensibility/plugins/manager.ts | source-verified |
| Load and list skills | OMP loads skills from several sources and lists them for the model | equivalent | src/extensibility/skills.ts | source-verified |
| Create or delete a managed skill | A skill management tool creates, updates, and deletes a managed skill | equivalent | src/tools/manage-skill.ts | source-verified |
| Send a desktop notification | The user interface context sends a notification, and RPC forwards it | equivalent | src/modes/rpc/rpc-mode.ts | source-verified |
| Update a short running status | The user interface context sets a status line entry | equivalent | src/modes/rpc/rpc-mode.ts | source-verified |
| Attach or list a pull request artifact | The github tool reads and writes pull request data | partial | src/tools/gh.ts | source-verified |
| Store large tool output as an artifact | OMP stores session artifacts and returns an address for each one | equivalent | src/session/artifacts.ts | source-verified |
| Read usage limits for the account | OMP records session statistics and costs | partial | src/stats/activity-client.ts | source-verified |
| Redeem a usage reset credit | none | none | - | source-verified |
| Create and schedule an automation | none for a user automation. OMP schedules only a marketplace update | none | - | source-verified |
| Report bundled runtime paths | none | none | - | source-verified |
| List hosts and create a project | none | none | - | source-verified |
| Open a path in an external application | none | none | - | source-verified |
| Onboarding question tools and setup steps | none. The ask tool serves any question | none | - | source-verified |
| Confetti in the focused window | none | none | - | source-verified |
| Voice session control and voice history | OMP has speech input, speech output, and a live voice mode | partial | src/live | source-verified |

## Capabilities with no OMP source

Each capability below needs a maintainer decision.

Reeve would have to build the whole capability, because OMP supplies nothing for it.

1. Every panel host, Tab identity, Tab order, Tab movement, and maximise state.
2. Opening a workspace file in a Tab at a line and a column.
3. A durable Tab layout record that survives a reload or a task transfer.
4. A Review panel, its four views, and a stored base revision for a repository.
5. Inline review comments stored against a task and moved on a handoff.
6. A side chat boundary that marks inherited history as reference context only.
7. An ephemeral thread that never enters the session list.
8. Closing and reopening one sub-agent that has already finished.
9. An agent tool that reads or writes application settings.
10. A sandbox mode, a writable root grant, and a network access switch.
11. A managed policy that locks a configuration key.
12. A secret answer for a question.
13. Answering one question from any window that shows the thread.
14. The blocked goal status and the usage limited goal status.
15. Goal attachments and a long objective moved into a file.
16. Archiving and restoring a task.
17. Moving a task between a checkout, a worktree, and another host.
18. Navigating a window to a named task.
19. Every part of the visualization lifecycle after the skill text.
20. Reporting the application page and panel state to the agent.
21. A human capture hotkey that feeds the composer.
22. User automations, usage reset credits, and bundled runtime reporting.
23. Sidebar sections, task emoji, and confetti.

## Items that I could not verify

I did not run OMP and I did not run Codex Desktop.

I did not inspect the Codex Desktop archive. I used the seven surface reports as evidence.

I did not verify the OMP language service tool file, because I read its registration only.

I did not verify the exact count of OMP settings keys.

I did not verify OMP behaviour under a host other than RPC mode, except the agent protocol elicitation path.
