---
status: accepted
---

# Publish Reeve as an open-source desktop application with in-app updates

Andrew confirmed these decisions on 2026-09-06 after a four-round grill. The repository was private with a tag-driven publish workflow, no releases, no signing secrets, no updater, and no changelog. The goal is an application that a person downloads, installs, and updates from inside the application, with the source open and support through donations.

## Decision

1. Repository. This repository, `AndrewBeniston/omp-reeve`, ships Reeve. The second-stage desktop in ADR-0003 receives the release, signing, and updater files later.
2. Public at `0.5.0`. The public repository starts from one clean squash commit. The private history stays as an archive. `main` is protected: every change lands through a pull request with green CI.
3. Removed before the squash: `docs/design/reference/codex/` (an extract of the OpenAI Codex bundle), `inbox/`, and every personal path. `docs/adr`, `CONTEXT.md`, and `DESIGN.md` stay public.
4. Licence. MIT. The upstream ddallabenetta notice stays in `LICENSE`. A second copyright line names Andrew Beniston for the Reeve changes.
5. Font. Autospawn Sans stays. The font file declares SIL OFL 1.1, derived from DM Sans, with embedding flag 0. Verified from the file on 2026-09-06. `public/fonts/OFL.txt` must carry the full OFL text and must not claim the binaries are absent.
6. Targets. macOS arm64 and macOS x64 as two packages, Windows x64, Linux x64 AppImage. The universal macOS merge walks the 800 MB server tree single-threaded and took 40 minutes on the runner, so 0.5.0 ships two macOS packages. Linux arm64 and `.deb` are deferred. electron-updater cannot update a `.deb` in place.
7. Signing. macOS is signed and notarized with a Developer ID certificate on the HelpSelf Apple team. electron-updater rejects an unsigned macOS update and a certificate change between releases, so this team is permanent. Windows ships unsigned with a SmartScreen note in the README. Windows signing is deferred.
8. Updates. electron-updater with the GitHub Releases provider. Check on launch and every four hours. Download in the background. Show the sidebar card from DESIGN.md 15.1 with `Restart now`. One stable channel.
9. What's New. `CHANGELOG.md` in Keep a Changelog format is bundled into the application at build time. On the first launch after a version change, the application shows every version section newer than the last seen version. A `support: true` flag on a version header adds a second page, Support Reeve, with Ko-fi and Star on GitHub. No social page.
10. Release procedure. A release starts when Andrew says "release". An agent may propose one. A release script reads `Unreleased`, proposes patch for fixes only and minor for any added feature, waits for confirmation, then bumps `package.json` and `desktop/package.json`, writes the changelog header, commits, and tags `v<version>`. CI fails when the two versions disagree, when the tag does not match, or when `Unreleased` is empty at tag time. `RELEASING.md` holds the procedure. `AGENTS.md` holds a short public-repository rule and the pointer.
11. Funding. Ko-fi only, in `.github/FUNDING.yml`, the README, the support page, and Settings > About. GitHub Sponsors is deferred.
12. GitHub page. The README is the page at `0.5.0`: hero image, three download buttons to the latest release, feature list. A domain and site are a future ticket. `SECURITY.md`, `CONTRIBUTING.md`, an issue template, and a pull request template ship at `0.5.0`.
13. Where packages are built (added 2026-09-09). Packages are built on Andrew's own machines: the Mac for both macOS targets, VP-0 for Windows, the Tower for Linux. `gh release` uploads them. The GitHub workflow stays as a manual fallback and never starts on a tag push. Reason: GitHub bills macOS runners at 10x and Windows at 2x clock time. Six failed runs on 2026-09-09 cost about 2000 minutes for a build that takes 13 minutes and nothing on the Mac. An agent never starts the workflow without explicit approval for that run.

## Considered options

Wait for the second-stage repository. Rejected. It delays users by months for no user benefit.

Rewrite the private history. Rejected. Another agent was editing `main`, and a squash gives the same clean result.

GPL-3.0, as Vorssaint uses. Rejected. Upstream is MIT, the second stage vendors MIT code, and MIT gives nothing to police.

Buy Me a Coffee. Rejected on fee: 5% per tip against 0% on Ko-fi. GitHub Sponsors deferred on setup cost.

A fresh open font. Rejected once the font file proved OFL 1.1.

## Not yet verified

Which Apple team holds the paid membership. Two teams existed at decision time, one from HelpSelf and one from an older local certificate. Check on developer.apple.com before the first tag. The GitHub Sponsors fee and the Apple Developer Program price were not verified this session.

## Consequences

Self-update returns. ADR-0004 is superseded by this record.
DESIGN.md 15.1 item 4 moves from "out of scope" to "in scope" for `0.5.0`.
The Apple signing team cannot change after `0.5.0` without breaking updates for every installed copy.
