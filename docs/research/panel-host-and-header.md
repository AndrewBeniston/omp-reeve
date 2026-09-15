# The panel host and its header, measured against the reference

Research for [#102](https://github.com/AndrewBeniston/omp-reeve/issues/102), on
[the panel map](https://github.com/AndrewBeniston/omp-reeve/issues/61).
Read on 2026-09-15.

## Sources

ADR-0001 governs sourcing: a shipped value is authoritative, and a runtime check
validates it rather than replacing it. The two references are cited separately.

- **The installed application.** `/Applications/ChatGPT.app`, version
  `26.908.40834` from its `Info.plist`. Its `app.asar` was searched in place,
  read-only. It names the same web-view bundle file that the extracted copy
  holds, and it independently contains the command identifiers, the chords and
  the drag-cue message identifiers recorded below.
- **The extracted bundle.** The same version's web-view asset directory, read
  under a temporary directory outside this repository. Every value in the tables
  below was read there and then confirmed against the installed application.
- **Reeve.** This checkout's own source: the shell layout, the panel resizer,
  the Tab strip, the Launcher, the panel action table and the desktop menu.

**Nothing here was observed at runtime.** The reference application was not run,
and Reeve's desktop build was not run against a Fixture for this ticket. No row
is marked runtime-verified, and the rows that shipped code cannot settle are
named in "What is still unverified" at the end.

No reference code, markup, class name or asset byte is reproduced here. What is
recorded is values: chords, orders, enumerated states, geometry numbers and the
shape of what is remembered.

## The host in one paragraph

The reference has one Tab machine and two places to put it. Every Tab carries a
placement, right or bottom, and the two placements share one controller
interface, one drag system, one persistence record and one focus model. A Tab
kind declares what it allows: where it may be dropped, whether it survives a
restart, whether closing it can be undone, whether it may move to another chat
or another window, and how it behaves when the panel goes full width. Reeve has
the right placement only, and its Tab kinds declare none of that.

## What the workspace remembers, per Session

One record, schema version 1, written per conversation and restored on open.
It holds:

- an ordered route per open Tab, each carrying its kind, its own parameters and
  its own payload version, so a kind can change its stored shape without
  invalidating the whole record;
- for each placement: whether it is open, which Tab is active, and the Tab order;
- which area has focus, one of `main`, `right-panel`, `bottom-panel`;
- the layout mode, `full` or `split`, optional;
- whether the right panel is full width;
- whether the Tab strip is hidden, optional.

The rules around it, all read from shipped code:

- A placement is recorded open only when it actually holds Tabs. Full width is
  recorded only when the right placement holds Tabs.
- Focus is corrected on the way in and on the way out. A record naming a
  placement that has no Tabs is restored as `main`, and the same correction runs
  when the record is written.
- Nothing is written at all when there are no routes, the layout is not `full`
  and the strip is not hidden. An untouched Session leaves no record.
- On restore, Tabs are reopened per placement in their stored order, each
  inserted after the previous one that survived, so a kind that declines to
  restore does not shuffle the rest. The active Tab is the stored one if it came
  back, else the current one, else the first.
- On restore both panels open without animation, and the layout mode defaults
  from the full-width flag when it is absent: `full` if full width, else `split`.
- A Tab whose route cannot be restored is not dropped silently. It comes back as
  a placeholder Tab that says the Tab is unavailable.
- Adding a Tab to a placement opens that placement, activates the new Tab and
  moves focus there. Adding to the right placement also clears the hidden-strip
  state; adding to the bottom leaves it alone.

Reeve remembers none of this. It remembers Browser tab addresses and their order
per Project, through its own registry, and deliberately never remembers a
Terminal. Panel open, width, full width, focus and active Tab all die with the
window.

## What a Tab kind declares

This is the reference's Tab union contract, and the single largest structural
gap. Each kind supplies:

| Declared | Meaning | Values seen |
| --- | --- | --- |
| Drop destinations | Which placements will accept this kind by drag | `left`, `right`, `bottom` for the general kinds; `right` only for the document kind |
| Shown in the Launcher | Whether the kind is offered in the new-Tab list | false for the Browser and document kinds, which have their own openers |
| Durable route | Restore, serialise, a per-kind decision whether to persist at all, and a payload version | per kind |
| Undo close | Whether closing this kind enters the reopen stack | per kind; some kinds decline outright |
| Window transfer | Whether the Tab may be dragged out into its own window | per kind |
| Conversation transfer | Whether the Tab may be moved to another chat | per kind |
| Exit full width on close | Whether closing the last of this kind leaves full width | true for the preview kind |
| Hide sidebar in full width | Whether full width also hides the navigation column | true for the preview kind |
| Show composer in full width | Whether the chat composer stays visible in full width | true for the preview and document kinds |
| On entering full width | A hook the kind runs when the panel expands | per kind |
| Context menu items | Extra items merged into the strip's own menu | Browser adds mute and unmute |
| Thumbnail and snapshot | How the kind draws itself in the full view | per kind |
| Title, icon, id, availability | Per kind, with a separate desktop-only availability | per kind |

Reeve's Tab union is four plain data shapes — file, sources, browser, terminal —
with a label and an id. Every behaviour above is either absent or hard-coded in
the shell rather than declared by the kind.

## The controller each placement exposes

Both placements are driven by the same interface. Read from shipped code, it
offers: open a Tab, open a pending Tab, activate a Tab, activate the adjacent
Tab, close a Tab, close the active Tab, close the other Tabs, close the Tabs to
the right, reorder a Tab, move a Tab to the other placement, move a Tab to
another conversation, ask whether that move is allowed, detach a Tab for
transfer, receive a moved Tab, record that a Tab moved, pin a Tab, update a Tab,
update a Tab's own state, and a horizontal scroll position for the strip.

Reeve has: open, close, close others, activate, step, reopen the last closed.
Ordering is the array order and cannot be changed by the human.

## Geometry, as values

| Thing | Reference | Reeve today |
| --- | --- | --- |
| Bottom panel default height | 280px | no bottom panel |
| Bottom panel minimum height | 160px | — |
| Bottom panel maximum height | half the main content height | — |
| Dragging the bottom panel below its minimum | closes the panel | — |
| Bottom panel height storage | one value, application-wide, not per Session | — |
| Right panel floor | 320px | 320px, already matched |
| Right panel ceiling | reserve 352px for the chat | 1200px |
| Browser pane opening width | 16:10 against the shell height, else a 640px fallback, each capped by a chat reserve of 500px and 352px | matched in the panel layout module |
| Sidebar width | 275px | 275px |
| Splitter | one control, labelled as resizing the workspace panes | one handle per panel, titled per panel |
| Strip overflow | horizontal scroll, position kept per placement | horizontal scroll, position not kept |

The panel header height, corner radius, hover treatment and internal spacing are
expressed in the reference as utility classes rather than named tokens. Reading
them would mean copying class names, which this ticket forbids, so they are left
for a rendered measurement against a Fixture rather than reported as tokens.

## Drag, and what is dropped where

The reference's drag cues name every destination, and they are the inventory:
move to the left pane, move to the right pane, move to the bottom panel, pin the
Tab, move to a chat, move to a new chat, and release to open in a new window. A
Tab dragged out becomes a detached window that can be pinned to the front and
can focus its source chat; the strip keeps a placeholder saying the Tab is open
in a separate window, offering to show that window or restore the Tab, and it
reports a failure to restore rather than losing the Tab.

Moving the last Tab out of the right placement closes that placement, records
full width for the next open, and sends focus to `main`. Moving the last Tab out
of the bottom placement closes the bottom panel. Both are read from shipped code.

Reeve has no Tab drag at all.

## Closing, focus and restoration

- Closing a Tab restores focus to the neighbouring Tab, but only when focus was
  inside the closing Tab, the placement still owns focus, and the neighbour does
  not declare that something outside the document holds its focus. A kind can
  supply its own focus restoration, and a guest that owns input declares it, so
  the host does not steal focus back from a page or a shell.
- Closing the last Tab in a placement closes that placement and returns focus to
  `main`.
- The reopen stack is per kind by declaration, not by hard-coded list.
- A single-Tab placement has no strip; its close control reads as closing the
  panel rather than the Tab.
- A window resize that closes the right panel is treated differently from a
  human closing it: the host records what was showing, and re-opens to the same
  thing when the room comes back.

Reeve's close keeps a ten-deep stack in a ref, filtered by a hard-coded list of
reopenable kinds, and does nothing about focus.

## The measured gap

Mechanical means the reference already decided it. Decision means Reeve cannot
copy the answer. The seam is where it lands in Reeve today.

| Row | Reference value | Reeve today | Kind | Seam |
| --- | --- | --- | --- | --- |
| Toggle the right panel | `Cmd+Alt+B`, shipped under the menu title "Toggle Review Panel" | absent | mechanical | application menu |
| Toggle the bottom panel | `Cmd+J`, desktop-only | absent | decision, #68 | new: a placement in the Tab host |
| Toggle the panel full width | no chord ships; a header control labelled "Enter full screen" and "Exit full screen" | `Ctrl+]` on a width toggle | decision | new: layout mode, not width |
| Full width restores the previous layout | closing remembers full width and restores it on the next open; a kind may declare that closing it exits full width | a remembered pixel width, cleared by any drag | mechanical | panel resizer |
| Full width hides the sidebar | declared per Tab kind | never | mechanical | Tab union |
| Composer visible in full width | declared per Tab kind | not applicable yet | decision | Tab union |
| Show or hide the Tab strip | `Cmd+Shift+B`, described as showing or hiding content tabs without changing the layout | absent | mechanical | Tab strip |
| Full view | `Cmd+Shift+F`, toggles full and split view and creates a Tab if none exists | absent | decision, #70 | new: layout mode |
| Focus area | three areas, corrected to `main` whenever the named placement is empty | no focus model | mechanical | new: workspace store |
| Focus while a guest owns input | a Tab declares external focus and its own restoration; the host does not steal it back | no handling | mechanical | Tab union |
| Move a Tab between placements | drag, with named cues for left, right and bottom | absent | mechanical | Tab strip |
| Reorder a Tab by drag | supported in both placements | absent | mechanical | Tab strip |
| Detach a Tab to its own window | supported, with a placeholder, restore, show-window and a failure message | absent | decision | new: desktop windows |
| Move a Tab to another chat | supported, gated per kind | absent | decision | Tab union |
| Pin a Tab | supported, with a drag cue and strip menu items | absent | decision | Tab strip |
| Tab strip context menu | pin or unpin, close, close other tabs, close tabs to the right, plus per-kind items | close and close others only | mechanical | Tab strip |
| Strip overflow | horizontal scroll, position kept per placement | horizontal scroll, position not kept | mechanical | Tab strip |
| Reopen the closed Tab | `Cmd+Shift+T`, per-kind opt-out | `Cmd+Shift+T`, hard-coded kind list, ten deep, per window | mechanical | Tab union |
| Closed-Tab titles and Project isolation | restored from the kind's own serialised route | Browser addresses only, per Project, through a server registry | decision | Tab union |
| What survives a restart | the whole per-Session record above | Browser addresses and order, per Project | mechanical | new: workspace store |
| Unrestorable Tab | comes back as a placeholder saying the Tab is unavailable | not applicable | mechanical | Tab union |
| Pinned summary | its own toggle in the panels group; no chord ships | Reeve has a summary panel of its own | decision | application menu |
| Share | lives in the chat header menu, not the panel header | absent | decision | new: Session header |
| The header overflow menu | the chat header's "Chat actions": copy the working directory, copy a deeplink, copy the conversation as Markdown, new side chat, new chat in this worktree, fork in three destinations, continue in three destinations, open in a new window, rename, archive, share | absent | decision | new: Session header |
| Find in the current surface | `Cmd+F`, described as searching the current chat | absent | mechanical | application menu |
| Back and forward | `Cmd+[` and `Cmd+]`, and the mouse back and forward buttons, over a navigation history that is neither per Tab nor per placement but the application's own | absent | decision | application menu |
| File navigation back and forward | `Control+-` and `Control+Shift+-`, a separate stack from the one above | absent | decision, #69 | Tab union |
| Go to line | `Cmd+L` in a file Tab, sharing its chord with the browser address bar | `Cmd+L` goes to the address bar | decision, #69 | application menu |
| Go to definition | `Ctrl+]` and `Cmd+]` | absent, and `Ctrl+]` is taken | decision, #69 | application menu |
| Toggle the file tree | `Cmd+Shift+E`, desktop-only | absent | decision, #69 | Launcher |
| Open the current chat as a side chat | `Cmd+Alt+S`, plus a "New side chat" item in the chat header | absent | decision, #67 | Launcher |
| Focus main chat, focus side chat | command menu only, no chords | absent | decision, #67 | application menu |
| The empty Launcher | the panel opens empty when toggled with no Tabs | Reeve already opens the Launcher as the empty state, with all five kinds and the reference chords | shipped | Launcher |
| The Add menu | the reference has no panel-level add menu; the strip's plus opens the same list as the empty state | matched | shipped | Launcher |

## Four corrections to the map's table

These matter because the map's host epic is built from that table.

1. **Maximise the panel is not `Ctrl+]` in the reference.** The reference's
   expand-or-restore command ships with no default chord at all. `Ctrl+]` and
   `Cmd+]` are Go to definition, and `Cmd+]` is also Forward. Reeve's
   `Ctrl+]` is Reeve's own invention and collides with two reference commands.
2. **`Cmd+1` to `Cmd+9` are Go to Chat in the reference**, part of the left
   navigation the map puts out of scope. The reference's recent-chat chords are
   `Cmd+Alt+1` to `Cmd+Alt+6`. Reeve has bound `Cmd+1` to `Cmd+9` to focusing
   Tabs, so the map's "Focus tab 1 to 9, shipped, audit pending" row is a
   divergence rather than a match, and the audit should settle it deliberately.
3. **`Cmd+Shift+B` and `Cmd+Shift+F` are not "step layout" and "tab view".**
   The first shows or hides the content tabs without changing the layout. The
   second is Full view, which toggles full and split and creates a Tab if there
   is none.
4. **`Cmd+Alt+B` ships as "Toggle Review Panel"**, and the sidebar toggle
   carries two chords: `Cmd+B` on the desktop and `Cmd+Shift+S` in the browser.

## Parity checklist

The acceptance sweep reuses these lines. Each is checked in both placements
unless it names one.

- [ ] The right panel toggles with `Cmd+Alt+B` and opens empty on the Launcher.
- [ ] The bottom panel toggles with `Cmd+J`, opens at 280px, clamps to 160px and
      to half the main content height, and closes when dragged below 160px.
- [ ] The bottom panel height is remembered once, not per Session.
- [ ] Full width is a layout mode, not a width: entering it records `full`,
      leaving it records `split`.
- [ ] Closing the right panel from full width restores full width on the next
      open, and a window resize that closes it restores what was showing.
- [ ] A Tab kind that declares it exits full width on close does so.
- [ ] A Tab kind that declares it hides the sidebar in full width does so.
- [ ] `Cmd+Shift+B` hides and shows the Tab strip without changing the layout.
- [ ] Adding a Tab to the right placement clears the hidden strip; adding one to
      the bottom does not.
- [ ] `Cmd+Shift+F` toggles full and split, creating a Tab if none exists.
- [ ] Focus lands in the placement a new Tab opened in.
- [ ] A restored record naming an empty placement lands focus on the Session.
- [ ] Focus is not stolen from a Browser page or a Terminal that owns input.
- [ ] Closing a Tab restores focus to its neighbour only when focus was inside it.
- [ ] Closing the last Tab closes its placement and returns focus to the Session.
- [ ] A Tab drags between the two placements, with a cue naming the destination.
- [ ] A Tab reorders by drag within a placement.
- [ ] A drag that empties the right placement closes it and records full width.
- [ ] The strip's context menu offers close, close other tabs and close tabs to
      the right, in that order, with per-kind items merged in.
- [ ] The strip scrolls horizontally and keeps its scroll position per placement.
- [ ] A single-Tab placement shows no strip and its close control closes the panel.
- [ ] `Cmd+Shift+T` reopens the last closed Tab of any kind that allows it, with
      its title, and does not cross Projects.
- [ ] Every open Tab, its placement, its order, the active Tab, the open state,
      the layout mode, the full-width state, the hidden strip and the focus area
      survive a restart, per Session.
- [ ] A Session that was never touched writes no record.
- [ ] A Tab whose route cannot be restored returns as a placeholder that says so.
- [ ] `Cmd+F` finds in the current surface.
- [ ] `Cmd+[` and `Cmd+]` and the mouse back and forward buttons move through
      the navigation history, at the scope Reeve settles on.
- [ ] The panel header's controls and its overflow menu match the agreed list,
      each item enabled only when it can act.

## What is still unverified

- **Runtime behaviour.** Nothing was observed live, on either side. Animation
  timings, hover and resize feel, and the enabled state of each header item as
  the user meets it all need a Fixture check.
- **Panel header geometry.** Header height, corner radius, hover treatment and
  internal spacing are utility classes in the reference rather than named
  tokens. Reporting them would mean copying class names. They need a rendered
  measurement, not a code read.
- **The navigation stack's scope.** Shipped code shows one application-level
  history behind `Cmd+[` and `Cmd+]`, separate from the file stack, but not
  whether it is keyed per window or per chat. The map's open question stands.
- **Which Tab kinds set which of the three full-width flags.** The flags were
  read on the kinds that live in the eagerly loaded bundles. The Review,
  Terminal and side-chat kinds load from their own chunks and were not traced
  to a flag value.
- **The pinned summary's contents and its enabled state.** Only its toggle, its
  group and the absence of a chord were read.
