# Changelog

All notable changes to Reeve are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

A version header may carry `support: true`. On the first launch of that version
the What's New dialog adds a second page that invites support.

## [Unreleased]

### Added
- A control in Settings under Access that lets the agent drive Reeve's browser
  tabs. It is off, and turning it on takes effect when you next start Reeve,
  because the door can only be opened as the application launches. The panel
  shows the address to give the agent, which changes every time Reeve starts,
  and it is blunt about what you are granting: the whole application window,
  not only your browsing, to anything on this computer that can reach it.
  Desktop application only.
- A Terminal tab. The panel beside a Session can now hold a real shell, opened
  from the panel's own launcher or the plus control at the end of the strip. It
  starts your own login shell in the project's directory, so your aliases,
  path and prompt are the ones you already have. Control keys reach the shell,
  the shell is told when you resize the panel, and closing the tab ends it.
  Several can run at once. A project you have not trusted is refused a shell.
  Desktop application only.
- A Browser tab. The tab strip beside a Session can now hold a web page as well
  as a file, opened from a new control at the end of the strip. Type an address
  and press Enter to go somewhere; the tab takes the page's own name, and
  follows the page as you navigate. Every browser tab shares one signed-in
  browsing session, so a login is still there in the next tab and after a
  restart. Desktop application only.

### Changed
- The Windows and Linux window draws its own title bar. The native caption
  strip and the File / Edit / View / Window strip are gone, so the application
  starts at the top of the window and the close, minimise, and maximise buttons
  sit on Reeve's own colour.
- Windows and Linux draw one menu bar above the application. It carries File,
  Edit, View and Help, the sidebar toggle, the history arrows, and the window
  buttons. Each name opens its menu.
- The main surface on Windows and Linux rounds its top left corner, where it
  meets the sidebar under the menu bar.
- The divider between the sidebar and the main surface follows that corner on
  Windows and Linux. It curves with the surface and fades where it meets the
  top edge.
- The desktop window shows Reeve's own page when it cannot load the
  application. The window showed the browser's "This page couldn't load"
  screen before. The new page names the error and offers Try again.
- A desktop build refuses to stage from a directory inside a home directory.
  Next records the build directory inside the server bundle, so such a build
  would carry the name of the person who made it. The message names a neutral
  path to build from, and names the override for a machine that has no other
  choice.
- A browser tab is now drawn by the application itself rather than embedded in
  the interface. Nothing changes in how it looks or behaves, but the agent can
  now see the page: with a debugging port open, OMP's browser tool finds the tab
  you are looking at instead of finding Reeve's own window. Browser tabs also no
  longer run as embedded guests, so the interface can no longer create one at
  all.
- The tab strip beside a Session announces itself as "Open tabs" rather than
  "Open files", and the name is translated. It is about to carry more than
  files.

### Fixed
- The test that checks the agent browser grant no longer fails on Windows.
  Windows does not carry POSIX mode bits, so the permission check ran there
  and could never pass.
- Windows no longer draws two sidebar toggles. One toggle sits on the menu bar,
  at every sidebar state.
- File, Edit, View and Help return on Windows and Linux. The keyboard shortcuts
  they carry work again, because the menu is hidden and never removed.
- The sidebar drag handle lightens the border instead of painting an accent
  line. The mark no longer stays after you release the pointer.
- Opening a drive from the Windows drive picker works. The file browser
  answered an error before, because the resolved path lost the separator
  after the drive letter.
- Windows groups the worktrees of one repository together again. Git prints a
  path with forward slashes, and Reeve compared it to a backslash path, so
  every worktree on Windows lost its identity.
- A path written with forward slashes now resolves its parent correctly on
  Windows.
- The panel beside a Session no longer stops widening part-way across a wide
  display. It now grows to the room available, less a reserve for the chat.
- The panel beside a Session is no longer empty when nothing is open. It lists
  what it can hold, which is Review, Terminal, Browser, Files and Side chat,
  each with its keyboard shortcut, and says which are not built yet. It used to
  say "No file open", which told you nothing.

### Security
- The desktop window can now host a web page guest, in preparation for a
  Browser tab. The window keeps context isolation, renderer sandboxing and
  disabled renderer Node access unchanged. Every guest has its privileges
  forced by the main process and its own requested settings discarded, so a
  page cannot ask for more than it is given, cannot nest another guest, and
  cannot choose which browsing session it reads.


## [0.5.0] - 2026-09-08 support: true

### Summary
The first public release of Reeve. Reeve is a desktop workspace for the OMP
coding agent, with the Codex desktop look, Autospawn Sans, and one shared
`~/.omp/agent` directory with the `omp` command.

### Added
- Reeve updates itself from GitHub Releases. A card in the sidebar shows the
  download and offers Restart now when the update is ready.
- A What's New dialog opens on the first launch after an update and lists every
  version since the last one you saw.
- macOS builds are signed with a Developer ID certificate and notarized by Apple.
- A Ko-fi support page and a GitHub Sponsor button on the repository.
- Settings > About shows the version, the update state, and the support links.

### Changed
- The product, package, and application identifier are Reeve and
  `com.andrewbeniston.reeve`.
- The repository is public under the MIT licence, with the upstream omp-web
  notice kept.

### Known limits
- The Windows installer is unsigned. Windows shows a SmartScreen warning on first
  run. Choose "More info" and then "Run anyway". A signing certificate follows in
  a later release.
- The Linux AppImage needs FUSE. On a machine without it, run with
  `APPIMAGE_EXTRACT_AND_RUN=1`.
- macOS Apple Silicon and Intel packages are signed and notarized.
