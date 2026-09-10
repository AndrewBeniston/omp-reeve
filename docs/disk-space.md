# Disk space

A desktop build writes about 2.6 GB and nothing removes the previous one. This
page names every directory involved, what recreates it, and what a release
machine must keep.

`bun run clean` removes the build output. `bun run clean --dry-run` reports the
size first. `bun run clean --deps` adds both `node_modules` trees.

## What a build leaves in the repository

The measurements come from one `win32-x64` build on a Windows 11 machine.
A macOS or Linux build produces a similar weight for its own target.

| Directory | Size | What recreates it | Removed by |
| --- | --- | --- | --- |
| `desktop/dist` | 1655 MB | `bun run desktop:build` | `bun run clean` |
| `desktop/server` | 968 MB | `bun run desktop:build` | `bun run clean` |
| `desktop/server.staging` | 2 MB | `bun run desktop:build` | `bun run clean` |
| `desktop/server.previous` | varies | a repeat build | `bun run clean` |
| `.next` | varies | `bun run dev` | `bun run clean` |
| `node_modules` | 1676 MB | `bun install` | `bun run clean --deps` |
| `desktop/node_modules` | 2 MB | `cd desktop && bun install --frozen-lockfile` | `bun run clean --deps` |
| `desktop/resources` | 85 MB | `bun run desktop:fetch-bun` | never |

`desktop/dist/win-unpacked` holds 1336 MB of that first row. The installer
beside it is 319 MB. Both come back from one build.

`desktop/resources` holds the pinned Bun runtime for each target. `bun run clean`
leaves it alone: it is a download, not build output, and `desktop:build` refuses
to start without it.

## What lives outside the repository

Never remove either of these. Every repository on the machine shares them, and
removing one costs a long download the next time any of them builds.

| Path | Size seen | What it serves |
| --- | --- | --- |
| `~/.bun/install/cache` | 2022 MB | every `bun install` on the machine |
| `%LOCALAPPDATA%/electron/Cache` | 151 MB | every Electron download |
| `%LOCALAPPDATA%/electron-builder/Cache` | 15 MB | NSIS and 7-Zip for packaging |

On macOS and Linux the two Electron caches sit under `~/Library/Caches` and
`~/.cache` instead.

## The installed application keeps one copy per version

`prepareWritableNext` in `desktop/desktop-runtime.cjs` copies the packaged
`.next` into `<userData>/runtime/<version>/server` before startup, because Next
writes runtime caches and the signed application resources are read-only.

The path carries the version, so each installed version leaves its own copy.
Nothing removes an old one today. On Windows that directory is
`%APPDATA%/omp-desktop/runtime`. One version measured 30 MB there.

## A release machine

`RELEASING.md` builds each package from a clean checkout of the tag, so a
release machine starts empty every time. Run `bun run clean` after you upload a
package, before you build the next target on the same machine.

