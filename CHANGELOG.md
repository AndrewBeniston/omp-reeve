# Changelog

All notable changes to Reeve are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

A version header may carry `support: true`. On the first launch of that version
the What's New dialog adds a second page that invites support.

## [Unreleased]

### Changed

- The tab strip beside a Session announces itself as "Open tabs" rather than
  "Open files", and the name is translated. It is about to carry more than
  files.

### Added

- A Browser tab. The tab strip beside a Session can now hold a web page as well
  as a file, opened from a new control at the end of the strip. Type an address
  and press Enter to go somewhere; the tab takes the page's own name, and
  follows the page as you navigate. Every browser tab shares one signed-in
  browsing session, so a login is still there in the next tab and after a
  restart. Desktop application only.

### Fixed

- The panel beside a Session no longer stops widening part-way across a wide
  display. It now grows to the room available, less a reserve for the chat.

- The panel beside a Session is no longer empty when nothing is open. It lists
  what it can hold — Review, Terminal, Browser, Files and Side chat — each with
  its keyboard shortcut, and says which are not built yet. It used to say "No
  file open", which told you nothing.

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
