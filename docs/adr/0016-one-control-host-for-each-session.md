---
status: accepted
---

# One control host for each Session, and one way to register a control

Reeve gives the agent no control of Reeve. The agent runs commands and edits
files, and it cannot read the Terminal tab the human is looking at. Thirteen
groups of application controls are planned. Each group needs a place to
register, a route to the window, and a rule for the case where no window
answers. This records that contract once, so the thirteenth group follows the
same rules as the first.

Every runtime statement below comes from reading the source of OMP 18.1.6 in
the installed package tree.

## The rule

**A control is an ordinary Session tool, registered by one in-process
extension factory that Reeve passes to `createAgentSession`.**

`startSessionControlHost()` builds that factory and the route it needs.
`startRpcSession()` calls it once for each Session and passes the factory in
the `extensions` option. OMP merges inline factories with the extensions it
discovers on disk, so the factory is bound by OMP's own loader, and a control
lands in the tool registry OMP already scopes to one Session.

Three properties follow from that choice, and they are the reason for it.

A control cannot reach another Session, because the registry it lives in
belongs to one Session.

A control can be blocked before it runs. The factory subscribes to OMP's
`tool_call` event, and a handler that returns `{ block: true, reason }` stops
the call and sends the reason to the model as the tool error. The later
sandbox gate needs that path. A mechanism without it would have to be
replaced.

A control is described to the model the way every other tool is, so it needs
no second prompt channel.

**Every control registers on this host. Reeve builds no second tool registry.**
A second registry would give each group its own route and its own failure
rules, and the routes would disagree.

## The names

Every control name starts with `reeve_`, because OMP has no namespace object
for tools. `isAgentControlToolName()` is the one test for that prefix, and the
block path uses it.

The first control is `reeve_read_terminal`. It declares `approval: "read"`, so
no approval interrupts the human, and it sends nothing to a shell.

**The Terminal read takes no arguments.** The reference product takes none
either. The tool registry belongs to one Session, so a Session id could only
name the Session that already owns the call, or be refused.

It declares `loadMode: "essential"`, so it stays in the Session tool schema
from the first turn. OMP defaults an extension tool to `"discoverable"`, which
keeps the schema off the request until the model searches for it. The long
tail of controls will take that default. An eager control costs context in
every request, so each one needs a named reason to be eager.

## The route, and the one bound

**A control call travels on the Session event stream, and the reply travels on
the Session command path.** Reeve adds no second transport.

The server emits `agent_control_request` as a Session event. The window that
shows the Session answers with the `agent_control_response` Session command,
beside `extension_ui_response`. Both paths are already authenticated, both
already reconnect, and both already stop with the Session.

**The host waits 5 seconds.** After that it resolves the call itself. A tool
call that never returns holds the agent turn open, which is worse than a
stated failure. The host also answers every waiting call when the Session
ends.

**A client with no surface for the control stays silent.** More than one
client can show one Session, and the first answer wins. A plain browser tab
owns no shell, so an answer from it would hide the real Terminal of a desktop
window beside it. Silence costs the host its wait and returns `no_window`,
which is true when no desktop window answers.

## Three named reasons, and never an error

**Every expected failure is a value the model reads, never a thrown error.**
An error invites the model to retry a call that cannot succeed.

| Reason | What it means |
| --- | --- |
| `no_window` | No window shows this Session, so nothing answered. |
| `unavailable` | This build has no such surface, or the call named another Session. |
| `absent` | A window shows this Session, and the surface is not open in it. |

These three are the whole list. A later group that needs a fourth reason is
making a decision that belongs in a new ADR.

A call that names another Session returns `unavailable` and emits nothing, so
no window ever sees it. The Terminal read names no Session, so the refusal is
held in the channel for a later control that accepts a task identifier, such
as the Tab open.

## The browser build registers nothing

`startSessionControlHost()` returns nothing unless the desktop launch token is
in the environment. Only the desktop launcher sets it, and the desktop health
route already reads the same marker.

A control acts on a window that only the desktop shell owns. A Terminal tab is
a real shell on the human's machine. A remote browser tab must not drive it,
and the agent must not see a tool it could never satisfy.

## What the Terminal of this Session means here

The specification describes a Terminal that a Session owns. Reeve has no such
object. A Terminal tab belongs to the Right panel of a window, and a window
shows one Session at a time. So the Terminals of a Session are the Terminal
tabs open beside it.

The window picks one of them. It reads the Terminal tab the human has
selected. With no Terminal tab selected, it reads the most recently opened
live shell. A shell that has exited is never read, although its view and its
scrollback stay.

`AppShell` holds what each Terminal tab runs, and it answers the request.
`TerminalTabs` reports the shell, the start directory, and the live state as
the desktop process gives them. The control host keeps no copy.

**The reported directory is the start directory.** The window records the
directory once, when the shell reports it, so it does not follow a later
`cd`. The field is named `startDir` for that reason. A live directory needs
the desktop process to report each change, which is a separate ticket.

## What this does not decide

The control returns no recent output and no truncation value. The retained
output buffer arrives with a separate ticket, and this host will read it
rather than keep a buffer of its own.

The control returns no shell identifier, because no agent control accepts one.

Delivery to a Session that no window shows is not queued. The call returns
`no_window`, and a separate ticket owns queued delivery.

The instruction budget for the whole adopted control set is a separate ticket.
This control's description is 396 characters against a 400 character limit for
one description.

## Consequences

- A new control group adds a `registerTool` call in the host and a branch in
  the window's answer. It adds no registry, no route, and no new reason.
- A control that must be in every request has to say why, because
  `"essential"` costs context in every turn.
- Reeve must keep passing the factory at Session creation. OMP takes inline
  extensions only there, so a control cannot be added to a running Session.
- The desktop launch token is now load-bearing for the agent, not only for the
  server handshake. A build that stops setting it silently removes every
  control.
