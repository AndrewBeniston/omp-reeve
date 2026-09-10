---
status: proposed
---

# Reeve Dev carries the debug log, and the log never records chat text

Andrew asked on 2026-09-10 how to see what the application is doing while a
change is under test. ADR-0007 created Reeve Dev for exactly that work. This
records what it logs, where the file lives, and what it must never hold.

## The problem

Reeve already writes a log, through `appendDesktopLog` in `desktop/main.cjs`.
It is not enough for debugging, for three reasons.

It holds the Electron shell only. The renderer and the agent write nowhere, so a
fault in the window leaves no trace.

It lives in the operating system's temporary directory. Windows clears that
directory, so the evidence for a fault can be gone before anyone reads it.

It never rotates. One long session appends without limit.

A maintainer also cannot always see the window. A log file is the one artifact a
tester can hand to someone who cannot look at the screen.

## Decision

1. **Reeve Dev owns the debug log.** It is on by default there, and off by
   default in Reeve. A person debugging a release can turn it on in Settings,
   because a fault that only appears in a release is the one worth catching.
2. **The file lives beside the settings**, in the application's own data
   directory, not the temporary one. ADR-0007 gives Reeve Dev its own directory,
   so the two applications cannot write to one file.
3. **One file holds every part.** The Electron shell, the renderer console, and
   the agent server write to the same file, in time order. A fault that crosses
   two of them is unreadable in two separate files.
4. **The file rotates.** A size cap and a small number of kept files. A log must
   not fill a disk on a machine left running.
5. **Settings gains one control**, which opens the folder that holds the file. A
   tester should not have to be told a path.

## What the log must never hold

**No chat text.** Not a prompt, not a reply, not a file the agent read, not a
command it ran. Andrew confirmed this on 2026-09-10.

This is a hard boundary, not a default. A debug log exists to be sent to another
person, and a Reeve session carries the user's own work. The two cannot mix.

The log records what happened, never what was said. A prompt is recorded as its
length and its session, never its words. A tool call is recorded by name, never
by its arguments or its output.

**No secret.** No API key, no password, no recovery code, no authentication
token. `AuthStorage` holds credentials, and nothing from it reaches the file.

**No personal path.** A path under the user's home directory is recorded
relative to it, so a file sent to another person names no account.

A later decision may add an option that records chat text for one session, for a
fault that cannot be caught otherwise. It is not this decision, and it would
need its own ADR and its own warning in the interface.

## Consequences

A tester can send one file instead of describing a fault in prose.

The file is safe to attach to a public issue, because it holds no chat text, no
secret, and no personal path. That is the whole point of the boundary.

Reeve Dev writes more to disk than Reeve. The rotation cap bounds it.

The renderer must forward its console to the main process, so the same event no
longer appears in two places.

## This is not analytics

A log answers what happened on one machine, while a person is at it. Analytics
answers what many people do over time, from far away.

Issue #7 parks the analytics question, and it needs its own ADR before any code,
because it changes what a local-first tool sends over the network. This decision
does not open that door, and no part of the debug log leaves the machine unless a
person sends it.

