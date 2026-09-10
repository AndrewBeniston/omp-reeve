# Changelog

All notable changes to Reeve are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

A version header may carry `support: true`. On the first launch of that version
the What's New dialog adds a second page that invites support.

## [Unreleased]

### Changed
- Opening a drive from the Windows drive picker works. The file browser
  answered an error before, because the resolved path lost the separator
  after the drive letter.
- The desktop window shows Reeve's own page when it cannot load the
  application. The window showed the browser's "This page couldn't load"
  screen before. The new page names the error and offers Try again.
- A desktop build refuses to stage from a directory inside a home directory.
  Next records the build directory inside the server bundle, so such a build
  would carry the name of the person who made it. The message names a neutral
  path to build from, and names the override for a machine that has no other
  choice.
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

### Fixed
- Windows no longer draws two sidebar toggles. One toggle sits on the menu bar,
  at every sidebar state.
- File, Edit, View and Help return on Windows and Linux. The keyboard shortcuts
  they carry work again, because the menu is hidden and never removed.
- The sidebar drag handle lightens the border instead of painting an accent
  line. The mark no longer stays after you release the pointer.
- Windows groups the worktrees of one repository together again. Git prints a
  path with forward slashes, and Reeve compared it to a backslash path, so
  every worktree on Windows lost its identity.
- A path written with forward slashes now resolves its parent correctly on
  Windows.

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
