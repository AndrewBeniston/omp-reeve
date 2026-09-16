# Side chat in the reference, and Quick chat in Reeve

Research for [#104](https://github.com/AndrewBeniston/omp-reeve/issues/104), which
gates the decision in [#67](https://github.com/AndrewBeniston/omp-reeve/issues/67).
Read on 2026-09-15.

## Sources

ADR-0001 governs sourcing: a shipped value is authoritative, a runtime check
validates it and never supplants it. Two sources were read, separately:

- **The installed application**, ChatGPT 26.908.40834, whose version string and
  packaged archive were read in place under `/Applications`. It supplied the
  version this research is pinned to.
- **The extracted bundle** of the same version, read read-only from a temporary
  directory outside this repository on 2026-09-15. Every value below comes from
  its shipped web assets: the command registry, the side-chat module, the panel
  launcher, and the message catalogue.

Nothing was copied. No code, markup, class name, selector or asset byte from
either source is reproduced here or committed anywhere in this repository. What
follows is values, chords, orders, states and behaviour, in this repository's
own words. Where the reference's own user-visible strings are quoted they are
quoted as values, because a label is what a human reads and a parity checklist
needs it.

Reeve's side is measured from this checkout: `components/chat/QuickChat.tsx`,
`components/chat/quick-chat.module.css`, `components/AppShell.tsx`,
`components/TabBar.tsx`, `lib/panel-actions.ts`, `lib/rpc-manager.ts` and
`desktop/desktop-runtime.cjs`. No running desktop build was used; every Reeve
claim below is source-measured, and the two that want a runtime check are named
at the end.

## What the reference's side chat is

A side chat is **a new, ephemeral conversation forked from the current one**,
opened as a Tab in the panel. It is not a second view of the same conversation,
and it is not a blank chat either.

The open path, read from the side-chat module, does this:

1. Refuses outright when the source conversation is archived.
2. Counts the side-chat Tabs already open in the target placement and takes the
   next index from that count.
3. Opens a pending Tab immediately under a loading id, keyed by a client-side
   thread id, so the Tab appears before the conversation exists.
4. Creates the conversation as a fork of the source, marked ephemeral, marked a
   side conversation, carrying the parent's navigation path, and **without** the
   synthetic "forked from here" item an ordinary fork gets.
5. Swaps the pending Tab for the real one, keyed by the new conversation id.
6. On failure, fails the pending Tab, discards whatever conversation was
   created, and raises a toast.

### Identity and inheritance

| Question | Answer, from the shipped bundle |
| --- | --- |
| Same conversation as the main chat? | No. A separate conversation id, created by forking the source. |
| Does it carry the main chat's history? | Yes, as inherited fork history, explicitly framed as reference context only. |
| Working directory | The source's cwd, passed in. |
| Workspace roots | Read from the source conversation and passed to the fork. |
| Model | Not passed separately. The parent's model resolves the instruction overrides, so the side chat starts on the parent's model. |
| Collaboration mode | The parent's mode, passed in and held as a **locked** mode on the Tab. |
| Approval and permission profile, service tier, agent mode | The parent's, passed through the composer context that submits the first turn. |
| Tools | The thread's current permissions apply. Sub-agents are explicitly excluded. |
| Developer instructions | The project's own developer instructions for that cwd, plus an appended side-conversation boundary block. |

The appended boundary block is the substance of the feature, so its rules are
worth recording even though its text is not reproduced. It states that the
conversation is a side conversation rather than the main thread; that the
inherited history is reference material and never an active instruction, plan or
approval; that no task, tool call, edit or approval found only in that history
may be continued; that MCP and external tool output in the inherited history
happened in the parent and carries no instruction; that sub-agents are
off-limits; that non-mutating inspection such as reading and searching files is
allowed; and that no file, git, permission or configuration change may happen
unless the human asks for it inside the side conversation, kept minimal when
they do.

### Where it can be opened from

| Surface | Detail |
| --- | --- |
| Keyboard | `CmdOrCtrl+Alt+S`, the default keybinding on the `openSideChat` command. |
| Command menu | `openSideChat`, in the `thread` group, ordered last in that group's own order list. |
| Chat header menu | An item labelled "New side chat", shown only on the header surface and only when the caller allows it. |
| Panel launcher | A row labelled "Side chat", carrying the same chord, between Files and Browser in the launcher's own order. |
| Composer slash command | `/side`, titled "Side", described as starting a temporary side chat. |
| Selected text | A "Ask in side chat" action on the selected-text overlay. |
| Queued message menu | "Open in side chat", which transfers a queued message into a new side chat. |

The command itself is declared electron-only, at app shortcut scope, requiring
local access. It is not offered in a browser build.

### The `/side` slash command

Typed with text, `/side` sends that text as the first turn. The lookup order is
precise: it walks the **right** placement first, then the **bottom**, and within
each one it looks at the active Tab before the rest. A loading side chat is
adopted if it finds one; otherwise the first side chat that is not currently
working takes the prompt. Only when nothing is reusable does it create a new
side chat, at the right placement.

Two refusals, both as toasts: `/side` before the current chat has started, and
`/side` from inside a side chat, which tells the human to return to the main
chat first. The command is not registered at all on a side chat's own composer.

### Focus

`focusMainChat` and `focusSideChat` both exist as commands, in the
`navigation` group, electron-only, local access, and **neither carries a
default keybinding**. They are command-menu items only. Both are registered by
one component, and its logic is explicit.

`focusMainChat` is enabled only when the current route is a local chat in the
main area. It does three things in order: sets the workspace layout mode to
**split**, runs the layout step that mode implies, and focuses the main chat.
Focusing the main chat therefore also changes the layout, which is worth knowing
before Reeve copies the label.

`focusSideChat` is enabled when a main local chat exists **and** at least one
Tab whose id carries the side-chat prefix is open in either panel controller. It
reports an active state, so the command menu can show whether a side chat is
there to focus. Its choice of side chat is ordered: the **active Tab** of a
placement, if that active Tab is a side chat, wins; otherwise the **first**
side-chat Tab found while scanning the placements. It then reveals that panel,
activates the Tab and focuses that conversation.

### The Tab itself

| Element | Value |
| --- | --- |
| Tab id | `sidechat:<conversation id>`, and `sidechat-loading:<client thread id>` before the conversation exists. |
| First title | "Side chat". |
| Later titles | "Side chat 2", "Side chat 3", from a numbered-title message with an index. |
| Numbering | The count of side-chat Tabs, loading ones included, in that placement, plus one. |
| Title after a first turn | Replaced by a display title derived from the opening prompt when the caller supplies one. |
| Icon, working | A spinner while the side chat is responding. |
| Icon, unread | A badged icon, with an accessible status reading "Unread response". |
| Body | The same local conversation view and composer as a main chat, with the collaboration mode locked and `/side` withheld. |

Side chats are excluded from the chat list: the listing filter drops any
conversation marked ephemeral or marked a side conversation. They exist only as
Tabs. A separate "Side chats" section exists in the chat summary side panel.

### Closing, and expiry

Closing is destructive and says so. A confirmation dialog titled "Close side
chat?" warns that the side chat will be gone and cannot be recovered, offers
Cancel and a destructive "Close side chat", and carries a "Don't ask again"
checkbox backed by a stored preference. The confirmation is skipped when that
preference is set, and also when the side chat has no turns yet.

On confirm, the close path stops any voice session bound to that conversation
first, waiting up to 30 seconds and failing the close if voice will not stop,
then forgets the ephemeral voice history and discards the conversation from its
cache. If the discard fails, the Tab is reopened rather than silently lost.

Separately, a side chat can **expire**: an empty state titled "Side chat
expired" explains that the temporary side chat is no longer available and offers
"Start new side chat", with its own failure message. The empty state of a live
side chat says that side chats are temporary and disappear when the application
is closed. What triggers expiry short of quitting was not determined from the
bundle; it is runtime behaviour and is marked unverified.

### Placement

The open path takes a target placement, defaults it to **right**, and falls back
to right when the requested placement is not among the Tab kind's declared drop
destinations. The panel host's own default drop destinations are **left and
right**; a kind that can be hosted below declares bottom explicitly, as the
terminal kind does.

The side-chat kind registers under `local-side-chat`, with a second id for its
loading state, and it passes **no** drop destinations. The registration helper
substitutes the default when a kind omits them, so the side chat takes left and
right. In 26.908.40834 a side chat cannot be opened into, or dragged to, the
bottom placement.

Two things nearby look like evidence to the contrary and are not. The `/side`
reuse walk visits the bottom placement as well as the right, and the
`focusSideChat` availability check scans both panel controllers for side-chat
Tabs. Both are generic walks over every placement, written without reference to
what this kind allows. The Tab's own move handler rewrites its target panel, so
the machinery for a cross-placement drag is present and only the kind's
declaration withholds it.

Opening a side chat is gated on the current view being a local chat **in the
main area**. From a chat already hosted in the panel, the action is not offered.

### The reference keeps Quick chat as well

The reference has its own quick chat, separate from the side chat, with its own
capability name, its own command, its own place in the command order list, and
its own selected-text action beside the side-chat one. The two are not
alternatives to each other there. That is direct evidence for #67, and it does
not by itself settle Reeve's answer, because Reeve's Quick chat is a different
thing from the reference's.

## What Reeve's Quick chat already does

Measured from source, against the same list.

| Question | Reeve's Quick chat |
| --- | --- |
| What opens | A floating panel over the whole application, not a Tab. Fixed position, centred, 560x640 default, resizable by the human, minimising to a 44px bar in the bottom-right corner. |
| Chord | `Cmd/Ctrl+Alt+N`, handled in the renderer, plus a sidebar control and a command-palette entry under Quick actions. |
| Same conversation or new | A new, independent Session. It inherits nothing from the main Session: not history, not model, not cwd. |
| Working directory | The dated default chat directory from `POST /api/default-cwd`, never the main Session's Project. It presents as projectless, labelled "Chats". |
| Model, tools, approval | Whatever the Composer resolves for a new Session. No inheritance and no locking. |
| Persistence | A durable Session. Its `.jsonl` is written like any other, and it appears in the navigation tree. Nothing is ephemeral, nothing expires. |
| Closing | Immediate, silent, non-destructive. No confirmation, because nothing is lost. |
| Header | The Session name or "New chat", then New Quick chat, Open in main chat, Minimise/Restore, and Close. |
| Empty state | "Recent chats": the three most recent Sessions, expandable to all. Choosing the Session already open in the main view opens it there instead of duplicating it. |
| Composer | The full Composer, with its own draft key, re-keyed to the Session once created. It deliberately does not register the global abort. |
| Focus | Focuses the Composer on open, including through a mutation observer while the view mounts; restores the previously focused element on close; stops Escape at the panel edge. |
| Focus commands | None. No focus-main and no focus-side command exists. |
| Project trust | Available: the trust dialog can be opened from inside Quick chat, and granting trust re-keys the chat. |
| Two views of one Session | Forbidden. If the Quick chat Session becomes the selected main Session, Quick chat closes itself. |
| Placement | None. It is not in the Tab strip, so it has no placement, no drag, no reorder and no restore. |

Reeve already reserves the side-chat row: `lib/panel-actions.ts` carries the id
`side-chat` with `CmdOrCtrl+Alt+S`, the launcher lists it disabled with the
reason "not yet built", and `desktop/desktop-runtime.cjs` carries the matching
menu item with no action bound. The Tab union in `components/TabBar.tsx` has
four kinds and no side-chat kind, so the comment in `lib/panel-actions.ts`
saying Review and Side chat are "declared in the Tab union" is out of date.

## The measured gap

**Mechanical** means the reference decided it and Reeve only has to match it.
**Decision** means Reeve cannot copy the answer, because Reeve does not have the
thing the behaviour acts on, or already has a different thing in its place.

| # | Behaviour | Kind | Reeve seam |
| --- | --- | --- | --- |
| 1 | Side chat is a Tab in the panel | decision, #67 | `Tab` union in `components/TabBar.tsx`; the Tab host in `components/AppShell.tsx` |
| 2 | `Cmd+Alt+S` opens it | mechanical once #67 lands | `lib/panel-actions.ts` and `desktop/desktop-runtime.cjs`, both already carrying the id and the chord |
| 3 | It is a new conversation forked from the current one | decision, #67 | the fork path in `lib/rpc-manager.ts` (`createBranchedSession`) |
| 4 | It is ephemeral: absent from the navigation tree, gone when closed or when the application exits | decision, #67 | `listAllSessions()` in `lib/rpc-manager.ts` and the listing in `lib/session-reader.ts`; OMP writes a fork to disk at once, so ephemerality is Reeve's own bookkeeping, as Project trust and archiving already are |
| 5 | A side-conversation boundary instruction, on top of the project's own developer instructions | mechanical once #67 lands | `lib/session-system-prompt.ts`, through `appendSystemPrompt` on the session options |
| 6 | Inherits cwd, workspace roots, model, collaboration mode, approval and permission profile from the parent | mechanical | the options built in `startRpcSession()` |
| 7 | Collaboration mode is locked for the life of the Tab | decision | Reeve's Approval selector sits in the Composer and is not lockable per surface |
| 8 | Titles "Side chat", then "Side chat 2", numbered per placement | mechanical | Tab `label` in `components/TabBar.tsx` |
| 9 | Title becomes the opening prompt's derived title | mechanical | the existing Session title path, `lib/session-title.ts` |
| 10 | Working spinner and unread badge on the Tab icon, with an accessible status | mechanical | Tab icon rendering in `components/TabBar.tsx` |
| 11 | Close confirmation, destructive wording, "Don't ask again" preference, skipped when there are no turns | mechanical | a Browser setting for the preference; the dialog beside `components/ProjectTrustDialog.tsx` |
| 12 | Closing discards the conversation | follows 4 | the existing `DELETE /api/sessions/[id]` |
| 13 | Expired state with "Start new side chat" | decision | no Reeve equivalent: an OMP Session on disk does not expire. Whether Reeve needs the state at all depends on 4 |
| 14 | `/side`, with first-turn text | mechanical once #67 lands | the browser-native slash command list in `lib/rpc-manager.ts` |
| 15 | `/side` reuses an idle side chat before creating one, right placement first, active Tab first | mechanical | the Tab host's ordering in `components/AppShell.tsx` |
| 16 | `/side` refused inside a side chat, and before the chat has started | mechanical | same |
| 17 | Refused for an archived source Session | mechanical | Reeve's own archived-Session registry |
| 18 | Offered only from a Session in the main area, never from a panel-hosted one | mechanical | the Launcher's availability in `components/AppShell.tsx` |
| 19 | `focusMainChat` and `focusSideChat`, command menu only, no chord | mechanical | `components/navigation/CommandPalette.tsx`. Note that focusing the main chat also forces the split layout in the reference |
| 20 | The side chat kind is hosted right, never bottom | mechanical | nothing to build here: Reeve has one placement today, and the reference withholds the bottom one from this kind |
| 21 | "Ask in side chat" from selected text | decision | Reeve has no selected-text overlay. Out of this ticket's route |
| 22 | "Open in side chat" from a queued message | decision | Reeve's queued-message surface was not measured against this. Out of this ticket's route |
| 23 | Quick chat and side chat coexist as separate concepts | decision, #67 | the whole of `components/chat/QuickChat.tsx` |

## What this hands #67

The three options in #67 are not equal once the reference is measured.

Reeve's Quick chat and the reference's side chat share a silhouette and almost
nothing else. Quick chat is a durable, independent, projectless Session in a
floating window. A side chat is an ephemeral fork of the Session you are looking
at, in the panel, inheriting that Session's directory, model and permissions,
and fenced by an instruction that forbids it from acting on the history it
inherited. Binding `Cmd+Alt+S` to Quick chat as it stands would put the
reference's chord on a surface that answers a different question, and the row
would be done in name only.

The reference itself keeps both. That is evidence, not an instruction: its quick
chat is not Reeve's Quick chat.

The cost of the two remaining options differs in one place. Making Quick chat a
Tab kind keeps one concept but has to add fork-from-current, inheritance,
ephemerality and destructive close to a surface whose whole current behaviour is
the opposite of each. Adding a Side chat Tab beside Quick chat keeps two
concepts in the vocabulary, at the price of a `CONTEXT.md` entry that has to
say plainly what separates them.

Either way, items 4 and 13 are the ones that need the maintainer, because
ephemerality is the one behaviour OMP does not give Reeve for free.

## Parity checklist

A side chat in Reeve is finished when every line is true and directly verified
against a Fixture.

- [ ] `Cmd+Alt+S` opens a side chat from a Session in the main area, through the application menu.
- [ ] The Launcher row and the Tab strip's plus control open the same thing, with the same chord printed.
- [ ] The command palette offers it, in the same group as the other Session commands.
- [ ] The Tab appears immediately, before the conversation exists, and replaces itself when it does.
- [ ] The side chat is a fork of the current Session, carrying its history as reference.
- [ ] It runs in the parent's working directory, on the parent's model, with the parent's approval mode.
- [ ] The boundary instruction is present, and the agent does not continue the parent's task when asked a bare question.
- [ ] It does not appear in the navigation tree.
- [ ] The first Tab reads "Side chat"; a second reads "Side chat 2".
- [ ] The Tab shows a working state while it responds, and an unread mark when a reply lands on an inactive Tab.
- [ ] The unread mark carries an accessible status.
- [ ] Closing a side chat with turns asks first, in destructive wording.
- [ ] "Don't ask again" is honoured, and is a Browser setting.
- [ ] Closing an empty side chat does not ask.
- [ ] After closing, the Session is gone from disk and from the tree.
- [ ] `/side` opens one; `/side <text>` sends that text as the first turn.
- [ ] `/side` reuses an idle side chat rather than opening a second.
- [ ] `/side` inside a side chat refuses, and says to return to the main chat.
- [ ] The action is refused for an archived Session, and absent from a panel-hosted Session.
- [ ] Focus main chat and focus side chat exist in the command palette, with no chord.
- [ ] The side chat's own Composer is the ordinary Composer, minus `/side`.
- [ ] Quick chat and Side chat are both reachable, and `CONTEXT.md` says what separates them.

## Not verified

- **What expires a side chat short of quitting the application.** The expired
  state exists in the shipped strings; its trigger does not appear in the values
  read.
- **The side chat's in-view header.** The Tab strip entry is fully recorded
  above, and the body is the ordinary conversation view and Composer. The
  conversation header renders a title-with-rename block and a unified actions
  block, and both are suppressed under a condition this reading could not tie
  to the side chat specifically. One look at a running side chat settles which
  header controls survive in the panel. This was not done, because opening a
  side chat in the reference would create a conversation on a real account.
- **Reeve's Quick chat at runtime.** Everything above is source-measured. Two
  claims would be worth confirming against a running desktop build on a Fixture:
  that focus returns to the previously focused element on close, and that Escape
  inside Quick chat does not reach the main view.

## Main-process addendum (2026-09-15)

The reference's main-process build was not read for the original pass. It is
readable, and it settles several of the items left open above. Three sources are
cited separately, per ADR-0001:

- **The installed application.** ChatGPT 26.908.40834. Every value below was
  confirmed present in its packaged archive, searched in place, read-only.
- **The extracted web bundle.** The same version's web-view assets, read
  read-only outside this repository.
- **The extracted main process.** The same version's Electron main-process and
  shared-chunk build, beside that bundle, read read-only outside this repository.

Still a shipped-code read on the reference side: nothing here was observed at
runtime. No code, markup, class name or asset byte was copied. Values only.
### Settled: what makes a side chat temporary, and what expires it

The fork that creates a side chat is marked two ways in the main process: the
new thread is **ephemeral**, and it is a **side conversation**. Each flag does
different work, and together they answer the expiry question.

- The fork request excludes the parent's turns from the new thread record, and
  the boundary instruction is injected into the new thread as an item after it
  is created, not written into its developer instructions.
- An ephemeral thread is created already in a resumed state and is given **no
  resume parameters at all**. Every other fork carries the parameters needed to
  bring it back; this one is explicitly excluded from that path.
- An ephemeral thread is kept out of the recent-conversation list and out of the
  thread summaries, and a side conversation is filtered out separately as well.
  Nothing writes it anywhere the application could find it again.

So a side chat is not durable state that later expires. It is live state that
cannot be rebuilt: once the application no longer holds the thread — after the
application or its agent process restarts, or the thread is dropped from the
conversation store — nothing can resume it, and the Tab has only the expired
state left to show.

The web bundle renders that in two shapes, and both carry the same action:

- A **full-page** empty state, when the Tab's conversation cannot be loaded.
- A **banner** above a still-mounted side chat, when the open conversation
  reports itself expired.

"Start new side chat" re-forks from the source conversation, carrying its
working directory, its host, the parent's collaboration mode and the Tab's
current display title, and raises a failure toast if that fork fails.

**No timer, no lifetime, no eviction.** The main process holds no expiry clock
for an ephemeral conversation. Nothing short of losing the live thread expires a
side chat, on the evidence of this read.

One related value: ephemeral voice history is marked per conversation and
forgotten on close, which matches the close path recorded above.

### Still open after this read

- **The side chat's in-view conversation header.** The main process carries no
  conversation-header state, so the condition that suppresses the title and
  actions blocks is still a web-layer question. One look at a running side chat
  settles it.
- **Reeve's Quick chat at runtime**, unchanged: focus restoration on close, and
  whether Escape reaches the main view.

