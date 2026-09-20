---
status: proposed
---

# One Tab model for two placements

Reeve's panel gains a second placement beneath the Session, matching the
reference application. A Tab must be able to live in either placement and move
between them by drag. This records the shape of the model before the bottom
placement is built, because a second placement bolted onto a right-only model
is a rewrite the first time a Tab is dragged.

Source: the reference's shipped workspace state and Tab contract, read from its
web bundle and main process on 2026-09-15 and recorded as values in
`docs/research/panel-host-and-header.md`. Nothing here is copied from it.

## The rule

**Placement is a property of the Tab, not of the host.** There is one Tab
machine, one drag system, one persistence record and one focus model, and two
places to draw them. A host is a filter over the Tab list by placement, never a
second list.

**A Tab kind declares what it allows.** The Tab union stops being four plain
data shapes with a label. Each kind states: which placements accept it by drag;
whether it is offered in the Launcher; whether and how its route is restored
after a restart, with its own payload version; whether closing it enters the
reopen stack; whether it may move to another Session or window; how it behaves
when the panel goes full width (exit on close, hide the navigation column, keep
the Composer visible); and any items it merges into the strip's context menu.
Behaviour the shell hard-codes today moves into these declarations.

**The workspace remembers one record per Session.** It holds the ordered route
of every open Tab with its kind and payload; per placement, whether it is open,
which Tab is active and the order; the focus area (`main`, `right-panel`,
`bottom-panel`); the layout mode (`full` or `split`); whether the right
placement is full width; and whether the strip is hidden. A placement is
recorded open only when it holds Tabs. An untouched Session writes nothing. A
route that cannot be restored comes back as a placeholder Tab, never silently
dropped.

**The bottom placement's height is one application-wide value**, not per
Session: 280px by default, 160px floor, half the main content height as ceiling,
and a drag below the floor closes the placement.

## What this settles that was previously Reeve's own

- The subagent panel, which has no counterpart in the reference and occupies
  the slot the bottom placement needs, becomes a Tab kind hosted in either
  placement. Its state moves into the record like any other kind's.
- Reeve's Browser-tab registry, which remembers addresses per Project, is
  subsumed by the per-Session record. Terminals declare that they do not restore.
- The side chat kind declares the right placement only, as the reference's does.
- Review state, already required by its own epic to be placement-agnostic,
  becomes one more kind's payload with no migration.

## Considered and rejected

- **Two hosts with two lists**, the right one as today and a new bottom one.
  Simplest to start, and it is where the first drag between them breaks: every
  operation (close others, reopen, reorder, focus) has to be taught about the
  other list.
- **Placement on the host, Tabs unaware.** Fails the same way from the other
  side: a kind cannot refuse a placement, and the reference's kinds do.
- **Keeping the subagent panel as a fixed pane above the bottom placement.**
  Keeps a Reeve-only slot in a layout the reference does not have, and every
  geometry rule above then needs a Reeve-only exception.

## Consequences

- The Tab union change is a prefactor and lands before any placement work, as
  the tab strip prefactor did before the Browser tab.
- `CONTEXT.md` gains **Placement** and **Bottom panel**; **Right panel** is
  narrowed to one placement of the panel rather than the panel itself.
- Keyboard chords that act on "the panel" act on the focused placement.
- A future Tab kind that must not be draggable, restorable or reopenable says so
  in its declaration rather than in the shell.

