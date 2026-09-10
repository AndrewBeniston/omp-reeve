# Changelog

All notable changes to Reeve are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

A version header may carry `support: true`. On the first launch of that version
the What's New dialog adds a second page that invites support.

## [Unreleased]

### Changed
- The Windows and Linux window draws its own title bar. The native caption
  strip and the File / Edit / View / Window strip are gone, so the application
  starts at the top of the window and the close, minimise, and maximise buttons
  sit on Reeve's own colour.

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
