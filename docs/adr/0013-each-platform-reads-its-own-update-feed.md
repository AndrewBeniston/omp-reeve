---
status: accepted
---

# Each platform reads its own update feed

Reeve cannot release one platform without releasing the others. ADR-0006 chose
GitHub Releases as the update feed, and that choice tied the three platforms
together. This records how they come apart, and why the packages stay where
they are.

This replaces one point of ADR-0006, which is point 8, and only the provider
named there. The rest of point 8 still holds: one stable channel, a check on
launch and every four hours, a background download, and the sidebar card.

Every claim below was read from the shipped `electron-updater` in
`desktop/node_modules`, or measured by running it, on 2026-09-11.

## The problem

There is one shelf and every platform reaches into it.

Reeve sets `allowPrerelease = false`. The GitHub provider then asks GitHub for
the single latest release, and looks inside that release for its own channel
file. Windows wants `latest.yml`, macOS wants `latest-mac.yml`, Linux wants
`latest-linux.yml`. A missing file raises `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`.

So a Windows-only release does not simply skip the other two. It breaks their
update check, because they still read the newest release and find nothing for
themselves.

Marking the release as a pre-release does not help. GitHub excludes a
pre-release from the latest release, so no platform is offered it, including
the one the release was for.

## The decision

**Reeve serves one update feed per platform from GitHub Pages. The packages
stay in GitHub Releases, named by their full address inside the feed.**

Three parts make this work.

1. `publish` moves into the `win`, `mac` and `linux` blocks of the
   electron-builder configuration. `PlatformSpecificBuildOptions` carries
   `publish`, and `WindowsConfiguration`, `MacConfiguration` and
   `LinuxConfiguration` all extend it. Each platform names the `generic`
   provider and its own address.
2. The generic provider reads its channel file from its own address and asks
   GitHub nothing. `GenericProvider.getLatestVersion` fetches exactly one file
   from exactly one base address. There is no shared latest release to collide
   over.
3. The channel file names each package by its full address in a GitHub
   Release. `resolveFiles` passes the recorded address through
   `newUrlFromBase`, which is `new URL(pathname, baseUrl)`, so a full address
   wins over the base.

### The shape

```
https://andrewbeniston.github.io/omp-reeve/updates/win32-x64/latest.yml
https://andrewbeniston.github.io/omp-reeve/updates/darwin/latest-mac.yml
https://andrewbeniston.github.io/omp-reeve/updates/linux-x64/latest-linux.yml
```

Each file is a few hundred bytes. Each one points at a package in a release:

```
https://github.com/AndrewBeniston/omp-reeve/releases/download/v0.6.0/Reeve-Setup-0.6.0.exe
```

Publishing Windows means writing one small file. The macOS file is untouched
and the Mac keeps its own version until you say otherwise.

## What was measured, not assumed

Three behaviours decide whether this is sound. Each one was run.

**A full address inside the feed is honoured.** `resolveFiles` was called with
a base address on Pages and a package address on GitHub. It returned the GitHub
address unchanged. A relative name in the same call resolved against Pages, as
expected. Some public advice says a full address is ignored. That is not true
of the version Reeve ships.

**The differential update still works.** `getBlockMapFiles` resolves both block
maps against the package address, not the feed address. Given a 0.6.0 package
in the v0.6.0 release and an installed 0.5.0, it produced the two correct
GitHub addresses, rewriting both the tag and the file name. So an installed
Reeve keeps downloading only the changed parts.

**A stale feed cannot be served.** `isAddNoCacheQuery` returns true when no
request headers are set, which is Reeve's case. The generic provider appends a
changing query to the channel file address, so a cache in front of Pages cannot
answer with yesterday's file.

## Considered and rejected

**Keep GitHub Releases and build every platform each time.** This is the
current rule and it is the reason for this record. It makes the slowest machine
the release schedule for all three. A Windows fix waits for a Mac to be free.

**Host the packages on Pages as well.** A published Pages site may be no larger
than one gigabyte, a single file is refused above one hundred megabytes, and
the monthly bandwidth is limited. The Windows installer alone is 328 megabytes.
This is not possible, and it would also lose the download counts on the release
page.

**Run a small update server.** It would work and it would cost money, a domain,
and a thing that can be down. Pages is already part of the repository and
serves a static file, which is all a feed is.

**One permanent release per platform, holding the newest package.** It keeps
everything on GitHub with no Pages. It also destroys the differential update,
because the previous package must stay at its own address for its block map to
be readable.

## Consequences

The release procedure gains one step. After a package is built and uploaded,
a script rewrites the generated channel file to use full addresses and commits
it under `docs/updates/`. Pages serves the repository, so the commit is the
publication.

A release stops meaning all platforms. `CONTEXT.md` changes with this record.
A Release is now one tag that carries the packages built for it, which may be
one platform. A Platform feed is the file that decides what an installed Reeve
on that platform sees.

The first release after this change must still be complete. An installed 0.5.0
reads the old GitHub feed and knows nothing about Pages. It learns the new
address only by installing a version that carries it. Until every user has
moved past that version, both feeds must agree.

The feed is public and permanent. It names version numbers and file hashes and
nothing else. It must never name a machine, a path, or a person.

Pages must stay enabled on this repository. If somebody disables it, every
installed Reeve reports that it cannot reach its update feed. That is a louder
failure than the one it replaces, and it is worth knowing before it happens.
