---
name: release-reeve
description: Release Reeve for one platform or for several. Use when the user asks to release, ship, or publish a version, names a platform to release, or asks what a release still needs.
---

# Release Reeve

A release may carry one platform or every platform. Each platform reads its own
feed, so Windows can ship while macOS stays where it is. ADR-0013 holds that
decision.

RELEASING.md holds every command. Read it and follow it. This skill holds the
order, the gates, and the two steps a person keeps.

## The gate

A release starts when the maintainer says release. Propose one when Unreleased
has grown, then wait for the word.

## Step 1. Name the platforms

Ask which platforms this release carries. Accept one. A release of Windows
alone is ordinary now.

Map each answer to a target:

| The user says | Target |
| --- | --- |
| Windows | `win32-x64` |
| Mac, macOS, Apple Silicon | `darwin-arm64` |
| Mac Intel | `darwin-x64` |
| Linux | `linux-x64` |

Done when every target is named and the user has agreed the list.

## Step 2. Check main is ready

Run the four checks in the "Before every release" section of RELEASING.md.

Done when all four pass, the tree is clean, and you are on `main`. A failure here
stops the release. Fix it first, through a pull request.

## Step 3. Cut the tag

Only `bun run release` writes a version number or a tag. Run the dry run first
and show the user the proposed version.

Done when the tag exists on `main` and is pushed.

## Step 4. Build each target

Each target builds on a machine of that kind, from a clean checkout of the tag,
in the neutral path. RELEASING.md names the machine and the path for each one.

You can build a target only on the machine you are running on. For any other
target, say plainly which machine must do it, and hand that part over. A macOS
package also needs the signing identity and the notarization keys, which live
on that Mac.

Done when `desktop:verify-package` passes for every target in the list.

## Step 5. Upload the packages

Upload only the packages this release carries. Follow "Publish the packages".

Done when the release page lists every file you built, and you have read the
list once as a stranger.

## Step 6. Publish the feed

This step is the one that is silent when it is missed. The release page can look
complete while every installed Reeve still sees the old version.

Run `desktop:update-feed` once per target, on the machine that built it, then
open a pull request with the file it writes. Merging it is the publication.

Done when the feed for every target in the list names the new version on `main`.

## Step 7. Confirm the feed answers

Read each feed back over the network. A feed that 404s shows an error in the
update card on every machine.

Done when every feed you changed returns the new version. Tell the user the
version, the platforms, and the feed addresses you checked.

## What a person keeps

Two things stay with the maintainer, and saying so early saves a wait.

A macOS package needs the maintainer's Mac, its Developer ID identity, and the
notarization keys. Ask the maintainer to run step 4 for a `darwin` target.

The GitHub workflow is a paid fallback. Ask for approval for that run before you
start it, every time. GitHub bills macOS runners at ten times clock time.

## Two traps worth naming

The first release after a platform feed lands must carry every platform. An
installed 0.5.0 reads the old feed and learns the new address only by updating
once.

Both macOS packages write one channel file into one `desktop/dist`. The second
build replaces the first. Merge the two file lists before you upload, as
RELEASING.md describes.
