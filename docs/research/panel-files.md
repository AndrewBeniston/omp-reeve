# The Files surface, measured against the reference

Research for [Panel 2. Inventory the Files surface](https://github.com/AndrewBeniston/omp-reeve/issues/103),
part of [the panel map](https://github.com/AndrewBeniston/omp-reeve/issues/61).
Read on 2026-09-15.

## Sources

Per [ADR-0001](../adr/0001-shipped-codex-tokens-supersede-screenshot-measurements.md),
shipped values are authoritative and a runtime check validates rather than
replaces them. Two sources were read, separately and read-only:

| Source | What it is | Version |
|---|---|---|
| Installed application | The reference application installed on this machine, its packaged archive read in place | `26.908.40834` |
| Extracted bundle | A separate read-only extraction of the same release's web assets | `26.908.40834` |

Both carry the same release, so every value below was found in the extracted
bundle and confirmed present in the installed archive. No code, markup, class
name or asset byte was copied into this repository. Nothing here was observed at
runtime: **the whole reference half is a shipped-code read, not a live check.**

Reeve's half is measured from this worktree at `b638472`.

## What "Files" is

The reference's Launcher is one action list parameterised by placement. It is
built once with a surface of `panel-launcher` and a target of `right` or
`bottom`, so the same five kinds are offered below as beside. A second surface
value, `new-tab`, drives the fuller New tab page that the unified tab strip
shows; it adds Recents, Suggested, More tools and a Plugins and MCPs group that
the panel launcher does not have.

The launcher's order is Files, Side chat, Browser, Review, MCP-provided tools,
Terminal. Each row prints a chord that belongs to a command, and the Files row
prints `Cmd+P`, which is `searchFiles`. **Selecting the row does not run that
command.** It opens a file browser Tab: one singleton Tab per host, in the
launcher's own placement, created with no path.

So the three things the ticket asks about relate like this:

- **The file browser Tab** is the Files entry. It is a Tab, not a dock, and it
  is placement-agnostic by construction.
- **`Cmd+Shift+E`** (`toggleFileTreePanel`) opens the same Tab. It is bound in
  the application menu only: it carries a menu title and an accelerator, no
  command-menu title, so it never appears in the command menu. It is gated on
  local access, on the workspace being ready, on a non-remote chat, and on a
  workspace root existing.
- **`Cmd+P`** (`searchFiles`) is a different surface: the command menu in file
  search mode. It is also menu-only, also local-only. It is the Files row's
  printed chord, which is why the row reads as "search" while it opens a tree.

The Files row is offered only when the chat has a workspace root and is not a
projectless chat.

## The file browser Tab

Read from the shipped workspace browser and the tree it shares with Review.

| Behaviour | Reference value |
|---|---|
| Tab identity | singleton per host, keyed by host |
| Placement | opens in the launcher's placement, right or bottom |
| Loading | directory entries are fetched per directory, with a loading state |
| Empty directory | its own empty state, distinct from a filter miss |
| Root | a chooser selects which workspace root the tree shows |
| Filter | an input above the tree, with a clear control |
| Filter mode | non-matching rows are hidden rather than dimmed |
| Search results | a flat list, with empty directories flattened away |
| Search states | searching, and no matching files, are separate states |
| Folders while scrolling | folder rows stick |
| Git decoration | **none.** The tree takes a Git-status input, and the workspace browser does not pass it. Review's changed-files tree does |
| Context menu | enabled only when no remote environment is attached |
| Persisted per Tab | expanded paths, scroll position, filter query, selected path |

The context menu, shared with Review's tree: Save as…, Copy path, Add to chat,
Open in <preferred app>, and an Open in… submenu that lists apps. Review's
variant of the same menu labels the submenu Open with. App options load
asynchronously and the menu says so while they do.

Drag was not found. The tree component in the shipped bundle exposes no drag
handler and no drop target, so moving a file by drag, and dragging a file into
the composer, are **unverified and probably absent**. A runtime check would
settle it; none was run.

## Opening a file

Selection and activation differ, in the way an editor's preview tab does:

| Gesture | Result |
|---|---|
| Select a row, or select a search result | opens as a **preview** Tab |
| Double-click a row or a search result | opens as a **pinned** Tab |

The open-a-path router chooses a viewer by a fixed order. Recorded as values:

1. **artifact** — when an artifact navigation target or an attachment preview is
   asked for.
2. **MCP extension file viewer** — only when neither a line nor an end line was
   requested.
3. **text file editor** — only when no end line was requested. Tab key is
   host plus path.
4. **an already-open Tab** — searched in the requested placement first, then in
   the other placements in turn. A hit is activated, and pinned unless the open
   was a preview. This is the only step that crosses placements.
5. **artifact**, again, for a path that resolves to one.
6. **review file source** — the fallback, and the ordinary case.

The router's inputs include the target placement, which defaults to right; a
line and an end line; a preview flag; a host; a workspace root; a title and an
icon; and a close callback. Asking for a line or an end line resets the Tab's
stored state, so a second jump into an open file re-anchors it.

A separate viewer-kind resolver names five outcomes: an external file manager,
a rich preview, an artifact renderer, plain text, and an unsupported-file
message.

The text file editor Tab reuses the same editor layer Review's diffs use, and
carries the wrap toggle and the find bar that the rest of the application uses.

## The file context menu

One builder serves a file everywhere it appears, and an open-mode input tells it
whether the file came from the workspace browser or from a reference elsewhere.
The order, as shipped:

1. **Open file** when the open is destined for the panel, or **View in browser**
   for a local HTML file when the in-app browser is available. Not both.
2. **Open in <preferred app>**, with an **Open with** submenu listing the apps
   that can take the file. In workspace mode only the submenu form is used.
3. **Open in GitHub**, only when the path and line resolve to a GitHub link.
4. A separator, present only when step 2 or step 3 produced something.
5. **Save as…** — suppressed in workspace mode, and only when the host offers
   to save a copy.
6. **Copy path** — always.
7. **Copy file contents** — suppressed in workspace mode.
8. **Reveal in Finder** on macOS, **Open in Explorer** on Windows, **Open in
   File Manager** elsewhere. Suppressed for a remote host.

Workspace mode therefore shows a shorter menu than a file reference does: no
Save as…, no Copy file contents, no View in browser.

## The file Tab's own commands

Every value below is from the shipped command registry. The map's table carries
two of these wrongly, corrected here.

| Command | macOS chord | Other platforms | Availability |
|---|---|---|---|
| `goToLine` | `Cmd+L` | `Cmd/Ctrl+L` | desktop only, app scope, in the command menu, navigation group |
| `file.goToDefinition` | **`Control+]`** | `Cmd/Ctrl+]` | desktop only, app scope, **not** in the command menu |
| `file.navigateBack` | `Control+-` | **none bound** | desktop only, app scope, not in the command menu |
| `file.navigateForward` | `Control+Shift+-` | **none bound** | desktop only, app scope, not in the command menu |
| `navigateBack` | `Cmd+[`, mouse back | same | application-wide back, in the command menu |
| `navigateForward` | `Cmd+]`, mouse forward | same | application-wide forward, in the command menu |

Two corrections to the map:

- Go to definition is **`Control+]`** on macOS, not `Cmd+]`. `Cmd+]` is the
  application-wide forward.
- File history back and forward are **macOS-only**. The registry binds nothing
  for them elsewhere.

The registry also declares its own conflict pairs. Two of them are ours:
`goToLine` against `focusBrowserAddressBar` — both `Cmd+L`, resolved by scope —
and `file.goToDefinition` against `navigateForward`.

The three file-language commands sit behind one flag. When it is off, all three
are filtered out of the shortcut surfaces together; Go to line is not behind it.
The flag's value is supplied to the web layer from outside it, so **its default
could not be read from the bundle.**

Go to line is a small overlay, not a palette: a labelled line field, a stated
valid range from one to the file's line count, a whole-number validation
message, and a close control.

## What Reeve has today

| Piece | Reeve | File |
|---|---|---|
| File tree | in the sidebar, not a Tab | `components/FileExplorer.tsx` |
| Tree persistence | one open/closed flag in local storage | `lib/file-explorer-state.ts` |
| Git decoration | **yes** — a per-file status badge, a changed-files section, and added/deleted line counts | `components/FileExplorer.tsx` |
| Directory listing | directories first, then name order | `app/api/files/[...path]/route.ts` |
| File search | the command palette, over a fuzzy index | `components/navigation/CommandPalette.tsx`, `app/api/file-index/route.ts` |
| Search ranking | the TUI's ladder: exact 100, prefix 80, substring 50, path substring below that | `lib/file-fuzzy.ts` |
| Search scope | Git-tracked files when the Project is a repository, otherwise a depth-8 walk with a skip list | `app/api/file-index/route.ts` |
| Launcher Files row | opens the command palette in file-search mode | `components/AppShell.tsx`, `lib/panel-actions.ts` |
| File Tab | a Tab kind, opened from the explorer and from links | `components/TabBar.tsx`, `components/FileViewer.tsx` |
| Viewer modes | source, preview, diff — preview auto-selected for Markdown and HTML, diff when opened from Changes | `components/FileViewer.tsx` |
| Wrap toggle | yes | `components/FileViewer.tsx` |
| Find in file | no | — |
| Go to line | no | — |
| Go to definition | no | — |
| File history | no | — |
| Preview versus pinned Tabs | no distinction | `components/TabBar.tsx` |
| Tab context menu | none for a file Tab | — |
| Placement | right only | `lib/panel-layout.ts` |

Reeve's Files row already prints `Cmd+P` and already means search by it, which
is the reference's printed chord and not the reference's behaviour.

## The measured gap

**Mechanical** means the reference decided it and Reeve has only to match.
**Decision** means Reeve cannot copy the answer.

| Gap | Kind | Reeve seam |
|---|---|---|
| The Files row opens a file browser Tab, not a search palette | decision — Reeve's explorer is a sidebar, and two file trees is one too many | `lib/panel-actions.ts`, `components/AppShell.tsx` |
| A `files` Tab kind in the Tab union | mechanical, once the row's decision lands | `components/TabBar.tsx` |
| Singleton per host, opened with no path | mechanical | `components/TabBar.tsx` |
| `Cmd+Shift+E` opens the same Tab, menu-only, local-only | mechanical | `lib/panel-actions.ts`, `desktop/desktop-runtime.cjs` |
| `Cmd+P` stays the file search, on the command menu | already matched | `components/AppShell.tsx` |
| Tree filter input, hide non-matches, clear control | mechanical | `components/FileExplorer.tsx` |
| Flat search results, empty directories flattened | mechanical | `components/FileExplorer.tsx` |
| Sticky folder rows | mechanical | `components/FileExplorer.tsx` |
| Per-directory lazy load with its own loading state | mechanical | `app/api/files/[...path]/route.ts` |
| Separate empty-folder and no-match states | mechanical | `components/FileExplorer.tsx` |
| Root chooser when a Project has more than one root | decision — Reeve's worktree grouping is not the reference's root list | `lib/worktree.ts`, `components/FileExplorer.tsx` |
| No Git decoration in the file browser | decision — Reeve's decoration is better, and dropping it to match would be a loss | `components/FileExplorer.tsx` |
| Tree context menu: Save as…, Copy path, Add to chat, Open in…, Open with | mechanical, with Add to chat mapping to Reeve's @ mention | `components/FileExplorer.tsx` |
| File context-menu order, and what workspace mode drops from it | mechanical | `components/FileViewer.tsx`, `components/FileExplorer.tsx` |
| Reveal in Finder, named per platform | decision — a browser tab cannot reveal anything, so this is a desktop-shell action | `desktop/main.cjs` |
| Context menu suppressed for a remote environment | decision — Reeve has no remote environment; the nearest thing is an untrusted Project | `lib/project-trust.ts` |
| Preview versus pinned Tabs, select against double-click | mechanical | `components/TabBar.tsx`, `components/FileExplorer.tsx` |
| Cross-placement reuse of an already-open file Tab | mechanical, and blocked on two placements existing | `lib/panel-layout.ts` |
| Viewer order and the five viewer kinds | decision — three of the five have no OMP counterpart | `components/FileViewer.tsx` |
| Opening at a line resets the Tab's stored state | mechanical | `components/FileViewer.tsx` |
| Find in the file Tab | mechanical, and the same seam as the panel-wide `Cmd+F` | `components/FileViewer.tsx` |
| Go to line, `Cmd+L`, with the range and whole-number rules | mechanical | `components/FileViewer.tsx` |
| Go to definition, `Control+]` on macOS, behind a flag | decision — Reeve has no language intelligence | #69 |
| File history, macOS-only chords | decision — needs a per-Tab navigation stack Reeve does not have | #69 |
| Tree drag and drop | research, and **unverified in the reference** | — |
| Expanded paths, scroll and filter persisted per Tab | mechanical | `lib/file-explorer-state.ts` |

## Parity checklist

- [ ] The Launcher's Files row opens a file browser Tab in its own placement.
- [ ] That Tab is one per host, and selecting Files again activates it.
- [ ] `Cmd+Shift+E` opens the same Tab, from the application menu, on a local
      Project with a workspace root.
- [ ] `Cmd+P` opens the file search, unchanged.
- [ ] The tree loads a directory at a time and says so while it loads.
- [ ] An empty folder and a filter with no matches read differently.
- [ ] The filter hides non-matching rows and has a clear control.
- [ ] A filter query turns the tree into a flat result list.
- [ ] Folder rows stick while the tree scrolls.
- [ ] Selecting a row opens a preview Tab; double-clicking pins it.
- [ ] Opening a file already open in another placement activates the existing
      Tab rather than opening a second one.
- [ ] Opening at a line re-anchors an already-open file.
- [ ] The tree's context menu carries Copy path, Add to chat, Save as… and
      Open in….
- [ ] A file Tab's own context menu follows the shipped order, and Reveal in
      Finder names itself per platform.
- [ ] Find works inside a file Tab.
- [ ] `Cmd+L` goes to a line, refuses a non-whole number, and states the range.
- [ ] Expanded paths, scroll position and filter survive a Tab switch and a
      restart.
- [ ] Every one of the above works in the bottom placement as well as the right.

## What could not be verified

- The default of the flag gating Go to definition and file history. It reaches
  the web layer from outside the bundle.
- The ranking used by the reference's file search, in either surface. The
  shipped code hands the query to the host and renders what comes back.
- Drag and drop in the tree. Nothing in the shipped tree suggests it exists,
  which is weaker evidence than a runtime check.
- Every runtime behaviour. No live comparison was run for this ticket.
