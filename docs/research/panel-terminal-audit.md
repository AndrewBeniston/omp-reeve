# Panel 5. The Terminal tab, measured against the reference

Research for [#106](https://github.com/AndrewBeniston/omp-reeve/issues/106), part of
[the panel map](https://github.com/AndrewBeniston/omp-reeve/issues/61). Written 2026-09-15.

## Sources

Per ADR-0001 the shipped value is the authority and a runtime observation only validates it.
Two reference copies were read, separately, and they agree:

- **The installed application.** Codex Desktop `26.908.40834`, read read-only from its
  packaged archive inside `/Applications/ChatGPT.app`. Used to confirm the terminal command
  entry, the default terminal location, and the tab-title message.
- **The extracted bundle.** A read-only extraction of the same version's webview assets,
  outside this repository. Used for the terminal panel, the terminal tab shell, the terminal
  stylesheet, the workspace-tab runtime, and the settings schema.

Nothing from either copy is reproduced here. Only values, chords, orders, states and token
meanings are recorded. Rows marked **runtime only** were not observed at all: no live
reference session and no running Reeve desktop build were used for this pass.

Reeve's side is measured from this checkout: `desktop/terminal-host.cjs`,
`desktop/main.cjs`, `desktop/preload.cjs`, `components/terminal/TerminalTabs.tsx`,
`components/terminal/terminal.module.css`, `components/AppShell.tsx`,
`lib/panel-actions.ts`, `lib/browser-tab-store.ts` and `desktop/desktop-runtime.cjs`.
No Fixture run was performed; every Reeve row below is a source reading.

## What the reference does

### The command, and what the chord means

The command id is `toggleTerminal`, in the `panels` command group, with the application-menu
title **Open Terminal**, the command-menu title **Open terminal**, and one default keybinding,
`Control+backtick`. It requires local access. (Installed application and extracted bundle.)

The chord is a real toggle, and it is placement-aware:

1. It reads the **Default terminal location** setting, which is `bottom` or `right` and
   defaults to `bottom`.
2. If the panel in that placement is open and its active Tab is already a Terminal, the chord
   hides that panel.
3. Otherwise it opens the panel there and **reveals an existing Terminal** for the chat if one
   exists in that placement — the active terminal session first, then the first one found.
   Only when none exists does it create a session.

A new Terminal, rather than a revealed one, comes from the Launcher row and from the
new-terminal action inside a Terminal.

### Several Terminals, one chat

Terminal sessions belong to the chat, not to the Tab. The chat holds a list of session ids, an
active session id, a title per session and a working directory per session. Each session
becomes one Tab in the placement it was opened in, and the Tab id is the session id under a
`terminal:` prefix. No maximum count appears anywhere in the bundle.

Inside a focused Terminal, `Cmd+T` is intercepted by the terminal itself and opens **another
Terminal** in the same placement, rather than the Browser tab that the same chord opens
elsewhere.

The Launcher's Terminal row carries its own options menu whose single item is **Open bottom
terminal**, labelled with the bottom-panel chord.

### The session outlives the view

The terminal view is a client of a session that lives in the application's host service. When
the view unmounts, a session that owns a Tab is **not** closed; only an unowned, transient
terminal is. On re-attach the session replays its buffered output as an init log, and the
alternate-screen state that was preserved at unmount is restored before the replay, so a
full-screen program is still full-screen when the Tab comes back.

Closing a Terminal Tab is **undoable**: the session snapshot is captured on close and re-seeded
if the close is undone. Moving a Tab between the bottom and right placements keeps the same
session. A session can even be transferred to another chat, and the application's own
`open_in_codex` tool addresses a terminal by session id plus a placement of `right` or
`bottom`.

When a session disappears, its Tab closes without recording an undo entry, and when the last
Tab in a placement goes, that panel hides.

### Working directory, worktrees and multi-root

The working directory is the chat's per-session directory, falling back to the session's
workspace binding and then to the chat's own directory. Two behaviours follow:

- **The workspace warning.** When the terminal's bound workspace no longer matches the chat's
  current worktree, a warning banner sits above the terminal: "This terminal's workspace does
  not match this chat's current worktree", with **Dismiss** and **Open new terminal**. The
  dismissal is remembered per session and target.
- **The source-directory hint.** A chat with two or more workspace roots shows, over the
  terminal before the human has typed anything, a numbered list of source directories headed
  "Source directories", with "Press Opt + Number to change directory" on macOS and "Press Alt +
  Number to change directory" elsewhere. Pressing the chord writes a directory-change command
  into the shell, written for the detected shell family: a PowerShell form, a Windows command
  form that is refused when the path contains `%` or `!`, and a POSIX form with single-quote
  escaping. The hint disappears on first interaction.

### Shell and environment

The shell is chosen by the host service, not by the renderer. On Windows a setting,
**Choose which shell opens in the integrated terminal**, offers `powershell`,
`commandPrompt`, `gitBash` and `wsl`, with the last two listed only when present, and
PowerShell as the effective default. No equivalent setting exists on macOS or Linux. Nothing in
the bundle describes the environment the shell inherits; that is host-service work and is
**not verifiable from the webview bundle**.

### Terminal options and typography

The terminal is constructed with transparency allowed, proposed APIs allowed, a blinking bar
cursor, letter spacing 0, line height 1.2, a custom link handler, and a theme derived from the
application's chrome theme. Font size and font family come from the user's code-font settings,
are loaded through a font-face loader, and a change to either re-fits the terminal on the next
frame. A window-zoom module keeps the terminal fitted as the window zoom changes. Scrollback is
left at the library default of 1000 lines.

Three addons are loaded: fit, clipboard, and web links with a custom opener. There is **no
search addon**.

### Keyboard inside the terminal

Handled by the terminal itself, before the shell sees them:

| Chord | Effect | Platform |
| --- | --- | --- |
| `Cmd+T` | Open another Terminal in this placement | all |
| `Ctrl+C` with a selection | Copy | not macOS |
| `Ctrl+Shift+C` | Copy | not macOS |
| `Ctrl+Insert` | Copy | not macOS |
| `Ctrl+V` | Paste | Windows only |
| `Ctrl+Shift+V` | Paste | not macOS |
| `Shift+Insert` | Paste | not macOS |
| `Cmd+Left`, `Cmd+Up` | Send `^A` (start of line) | all |
| `Cmd+Right`, `Cmd+Down` | Send `^E` (end of line) | all |
| `Cmd+Backspace` | Send `^U` (kill to start) | all |
| `Cmd+Delete` | Send `^K` (kill to end) | all |

On macOS the clipboard path is deliberately not installed, because the platform's own
`Cmd+C` / `Cmd+V` already reach the terminal.

A clear action exists on the session interface and clears the terminal only when focus is
inside it. **The chord that raises it was not found in the bundle** and is unverified.

### Output, scrolling and side effects

Output is written through a writer that keeps the view pinned to the bottom only when it was
already at the bottom; otherwise the human's scroll position survives the write. Pressing
Enter, and any write, schedules a workspace refresh 500 ms after the output settles, so file
and git state follow what the human just did in the shell.

The terminal reports its title to the session. The Tab title is then the first of: the
shell-reported title; the working directory's folder name, suffixed with a 1-based index when
the chat has more than one workspace root; "Terminal N" with a 1-based index.

A crash inside the terminal is caught by an error boundary showing "The terminal encountered an
error", "Try reloading the terminal to continue" and a **Reload** action.

### Colour and spacing

The reference maps its terminal colours to chrome tokens: background to the surface colour,
foreground to the text colour, and both the active and inactive selection to the scrim colour.
The terminal itself is painted transparent over that surface. The viewport scrollbar is 10px,
its track and corner take the **terminal background**, its thumb the border colour, and the
thumb and the whole viewport step to the strong border colour on hover and while active. The
terminal's padding is 16px at the start, 8px top, 12px bottom and nothing at the end.

## What Reeve does today

A Terminal tab is a Tab in the Right panel only. `Control+backtick` reaches the application
menu, and every press calls the open action, which mints a new Tab id and a new shell in the
active Project directory. There is no toggle, no reveal and no placement choice.

The desktop process decides everything about the shell: it refuses without a Project, refuses
an untrusted Project by reading the trust store from disk, scrubs every `OMP_WEB_*` and
Electron launch variable, sets `TERM=xterm-256color` and `COLORTERM=truecolor`, and spawns the
human's own login shell — `$SHELL` with `-l`, `/bin/zsh` on macOS and `/bin/bash` on Linux
without it, `COMSPEC` on Windows. A shell belongs to the window that opened it and is killed
when its Tab closes, when the window closes and when the application quits.

The renderer constructs the terminal with transparency allowed, proposed APIs allowed, a
blinking bar cursor, letter spacing 0, line height 1.2, font size **12**, the theme's
`--font-mono` stack and a palette resolved from Reeve's own theme, with the background left
transparent. It loads fit, clipboard and web links. Every Terminal stays mounted while it
exists; a hidden one is hidden, not unmounted. A resize observer re-fits and resizes the shell,
skipping zero-sized hidden Tabs. Becoming active re-fits and takes focus. The shell's own title
renames the Tab; the initial label is "Terminal". A Terminal is excluded from the reopen-closed
list and from the per-Project restore, on purpose: its shell died with the Tab.

## The measured gap

**Mechanical**: the reference decided it, Reeve only has to match it. **Decision**: Reeve
cannot copy the answer, because the thing the behaviour acts on does not exist in Reeve or
already exists differently.

| # | Gap | Kind | Reeve seam |
| --- | --- | --- | --- |
| 1 | A Terminal opens in the bottom placement by default, and the placement is a setting (`bottom` default, `right`) | decision (#68, #107) | Tab host placement, `lib/panel-actions.ts`, Settings |
| 2 | The chord toggles: hide when a Terminal is already the active Tab there, otherwise reveal the chat's existing Terminal | mechanical | `AppShell` panel action, `desktop/desktop-runtime.cjs` menu action |
| 3 | Only the Launcher and the in-terminal action create a **new** Terminal; the chord reuses one | mechanical | `AppShell.handleOpenTerminalTab` |
| 4 | `Cmd+T` inside a focused Terminal opens another Terminal, not a Browser tab | mechanical, constrained | Terminal key handler; the accelerator is owned by the application menu, so the menu must defer while a Terminal has focus |
| 5 | The shell outlives its Tab view: unmount keeps the session, re-attach replays buffered output | mechanical | `desktop/terminal-host.cjs` registry, preload bridge, `TerminalTabs` |
| 6 | Alternate-screen state is preserved across detach and restored before the replay | mechanical | same registry |
| 7 | Closing a Terminal Tab is undoable and restores the session | mechanical | `isReopenableTabKind` in `lib/panel-actions.ts`, plus retention in the registry |
| 8 | A Terminal Tab can be moved between placements keeping its shell | decision (follows #107) | Tab host |
| 9 | Tab title falls back to the folder name, then "Terminal N" with a 1-based index | mechanical | `AppShell.handleTerminalTitle`, `TabBar` label |
| 10 | A banner warns when the Terminal's workspace no longer matches the Session's Worktree, offering Dismiss and Open new terminal | mechanical | `TerminalTabs`, `lib/worktree.ts` |
| 11 | A multi-root chat shows numbered source directories and `Opt/Alt+Number` changes directory with a shell-aware command | decision | none today: an OMP Session has one working directory |
| 12 | In-terminal copy and paste chords: `Ctrl+C` with selection, `Ctrl+Shift+C`, `Ctrl+Insert`, `Ctrl+V` on Windows, `Ctrl+Shift+V`, `Shift+Insert` | mechanical | a custom key handler on the terminal; Reeve installs none |
| 13 | macOS line editing: `Cmd+Left/Up` → `^A`, `Cmd+Right/Down` → `^E`, `Cmd+Backspace` → `^U`, `Cmd+Delete` → `^K` | mechanical, constrained | same handler; Reeve binds `Cmd+Left`/`Cmd+Right` to browser history on the application menu, so those two must defer to a focused Terminal |
| 14 | Clear affects the terminal only when focus is inside it | mechanical, chord unverified | application menu plus a session-level clear |
| 15 | Links open through the application's own opener, by a custom link handler as well as the web-links addon | mechanical | `TerminalTabs` addon configuration |
| 16 | Output preserves the human's scroll position unless the view was already at the bottom | mechanical | `TerminalTabs` write path |
| 17 | Output and Enter schedule a workspace refresh 500 ms after the output settles | mechanical | Reeve's git-change and file state refresh |
| 18 | Font family and size come from a user setting, with re-fit on change and window-zoom tracking | decision | Settings; Reeve hardcodes 12px and `--font-mono` |
| 19 | An error boundary offers Reload when the terminal itself crashes | mechanical | `TerminalTabs` |
| 20 | A Windows shell setting chooses PowerShell, Command Prompt, Git Bash or WSL | decision | Settings; Reeve always opens the login shell |
| 21 | A terminal session can be transferred to another chat, and is addressable by session id and placement from the application's own tool | decision | out of scope until the panel host lands |
| 22 | Scrollbar track and corner take the terminal background, and selection uses the scrim colour | mechanical | `components/terminal/terminal.module.css`: Reeve leaves track and corner transparent and selects with the accent wash |

Matching already, and needing no ticket: the chord itself, the terminal construction options
other than font size, the three addons, transparent painting over the Tab surface, the
16/8/12/0 padding, the 10px scrollbar with a strong-border hover, the resize-and-fit loop, the
focus-on-activate behaviour, and the shell-reported title renaming the Tab.

Reeve keeps two behaviours the reference has no counterpart for, and both should stay: the
Project-trust refusal, and the exit notice that leaves the scrollback readable.

## Where placement already differs from the map

The map records the bottom panel as unbuilt and `Cmd+J` as a decision. This audit adds a
harder fact to that decision: in the reference the bottom panel is where a Terminal goes
**by default**, and the right placement is the opt-in. Row 1 belongs to the bottom-placement
epic, not to a Terminal epic, and rows 2, 3 and 8 cannot be finished before it.

## Not verified

- No live reference session and no running Reeve desktop build were used. Every row is read
  from source on both sides.
- Whether a Terminal survives an application restart. The session lives in the host service and
  the tab state is persisted, but nothing in the webview bundle states the restart behaviour.
- The chord, if any, that raises the reference's clear action.
- Whether Reeve's Edit-menu copy and paste reach a focused terminal at all. The terminal's
  selection is not a document selection, so the menu roles are likely inert inside a Terminal;
  this is the first thing a Fixture pass should check, because it decides whether row 12 is a
  parity gap or a broken basic.
- The environment the reference's shell inherits, and whether it scrubs its own launch
  variables. That decision lives in its host service, outside the bundle.
- Whether the reference caps the number of Terminals per chat. No limit appears in the bundle.

## Parity checklist

Each line is one ticket candidate for the Browser and Terminal parity epic.

- [ ] A Terminal opens in the placement the setting names, defaulting to the bottom panel.
- [ ] `Control+backtick` hides the panel when a Terminal is already active there.
- [ ] `Control+backtick` reveals the Session's existing Terminal rather than opening another.
- [ ] The Launcher row, and only it plus the in-terminal action, creates a new Terminal.
- [ ] The Launcher's Terminal row offers "Open bottom terminal".
- [ ] `Cmd+T` inside a focused Terminal opens another Terminal.
- [ ] A Terminal's shell survives its Tab being hidden, the panel being closed, and the Tab
      being reopened; the scrollback comes back with it.
- [ ] A full-screen program is still full-screen after a detach and re-attach.
- [ ] Reopen closed Tab restores a Terminal with its session.
- [ ] A Terminal Tab moves between placements without losing its shell.
- [ ] An untitled Terminal is named for its folder, then "Terminal N".
- [ ] A Terminal whose Worktree no longer matches the Session warns, and offers Dismiss and
      Open new terminal.
- [ ] Copy and paste work from the keyboard on every platform, by the reference's chords.
- [ ] `Cmd+Left`, `Cmd+Right`, `Cmd+Backspace` and `Cmd+Delete` edit the shell line and do
      not drive the Browser tab while a Terminal has focus.
- [ ] Clear empties the Terminal only when the Terminal has focus.
- [ ] A link in terminal output opens the way every other Reeve link opens.
- [ ] Output does not yank the view to the bottom while the human is reading scrollback.
- [ ] File and git state refresh shortly after a command finishes.
- [ ] The code font and its size follow a setting, and the Terminal re-fits when either changes.
- [ ] A crashed Terminal offers Reload instead of an empty Tab.
- [ ] Windows offers the four shells; macOS and Linux keep the login shell.
- [ ] The scrollbar track, corner and selection use Reeve's equivalents of the reference's
      tokens, checked against the Tier 1 adapter contract in `DESIGN.md` 4.1.
- [ ] The refusals Reeve adds — no Project, untrusted Project, no pty — still read clearly.

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
Four of the five items this document left open are settled here, and the fifth
belongs to Reeve rather than the reference.

### Does a Terminal survive an application restart? No.

Sessions live in one in-memory map in the main process, keyed by session id and
owned by the window that created them. A session is killed when that window is
destroyed, unless it carries a preserve-on-owner-destroy flag, in which case it
is only detached. Every session is disposed when the process goes away, and
nothing writes a session anywhere. What can survive a restart is the Tab record
in the workspace, which opens a new shell.

### The clear chord

`Cmd+K` on macOS, `Ctrl+K` elsewhere, with no Alt and no Shift, and **only while
a terminal holds focus**. The main process reads it out of the window's input
stream and turns it into a clear-the-active-terminal message. It is not in the
command registry, so it appears in neither the command menu nor the shortcut
settings, which is why the earlier read could not find it.

### How `Cmd+T` defers to a focused Terminal

The main process intercepts the window's key events before the menu sees them.
With a terminal focused and the command modifier plus `T` pressed, it looks the
chord up in the command registry: if the match is a web-view command it prevents
the default and re-dispatches it into the web layer, and if the match is an
application-scope command it swallows the chord entirely. Either way the
application menu does not act, and the terminal's own new-terminal handler wins.
The same interception suppresses application undo and redo while a terminal has
focus. This is the mechanism row 4 of the table above asks for.

### The environment the shell inherits

Built in this order, in the main process:

1. The main process's own environment, whole.
2. Plus one variable naming the conversation, `CODEX_APP_TITLE`.
3. For a local session, the worktree's captured shell environment is applied:
   its exclude list deletes names, then its set map assigns them.
4. On macOS and Linux, `TERM` is forced to `xterm-256color`, and `TERMINFO` and
   `TERMINFO_DIRS` are deleted.
5. Then exactly five launch variables are removed, matched without regard to
   case: `BREAKPAD_DUMP_LOCATION`, `CHROME_CRASHPAD_PIPE_NAME`,
   `CRASHPAD_HANDLER_PID`, `ELECTRON_CRASH_REPORTER_PROCESS_TYPE` and
   `__CFBUNDLEIDENTIFIER`.

Nothing else is scrubbed. The Node and Electron launch variables stay. Reeve
scrubs more than the reference does, which is a difference worth keeping
deliberately rather than by accident.

### The shell itself

On macOS and Linux the shell comes from the operating system's own user record,
then `$SHELL`, then `/bin/zsh` on macOS and `/bin/sh` elsewhere — and it is
spawned **with no arguments**. No `-l`, no `-i`. Reeve passes `-l`; that is a
divergence, not a match.

On Windows the preference picks one of four, with a fallback chain: PowerShell
resolves `pwsh.exe` then `powershell.exe`; Command Prompt resolves the comspec
variable, else `cmd.exe`; Git Bash is the only one spawned with arguments,
`--login -i`; WSL is offered only when present. With no preference set, the
resolution is PowerShell, falling back to Command Prompt.

### Is there a cap on Terminals per chat? No.

The session map is unbounded and no per-chat, per-window or per-application
limit appears anywhere in the main process.

### Five more values worth having

- A session created without a size from the view starts at **80x24**.
- The replay buffer is capped at **16,000 characters**, both while a session is
  detached and when it is restarted.
- Restarting a terminal to run an action kills the process tree, keeps the last
  16,000 characters, replays them into the re-attached view, and only then
  writes the directory change and the command, in a form written for the shell.
- A resize to identical dimensions is skipped. A repaint resize goes one column
  narrow, waits **100 ms**, then sets the real size.
- When the requested working directory differs from the process's own, the
  session's first input is a quoted `cd` into it.

### Still open after this read

- Whether Reeve's Edit-menu copy and paste reach a focused Terminal. That is a
  Reeve-side runtime question and the main process cannot answer it.
- The reference's scrollback length stays the library default, per the web
  bundle; the main process holds no scrollback of its own beyond the 16,000
  character replay buffer.

