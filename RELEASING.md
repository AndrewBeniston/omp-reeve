# Releasing Reeve

This is the full release procedure. `AGENTS.md` points here. ADR-0006 holds the decisions.

> Each platform reads its own feed, so one platform can ship alone. ADR-0013
> holds the decision. The step is "Publish the feed" below.

## Before every release

1. Every user-visible change has an entry under `## [Unreleased]` in `CHANGELOG.md`.
   Use the Keep a Changelog headings: Added, Changed, Fixed, Removed, Known limits.
2. `main` is green: `bun test`, `bun run typecheck`, `bun run lint`, `bun run release:check`.
3. The working tree is clean and you are on `main`.

## Cut the release

```bash
bun run release --dry-run      # shows the proposed version and the entries
bun run release                # asks for a yes, then commits and tags
bun run release --support      # same, and the first launch shows the support page
bun run release --minor        # force a minor bump
bun run release --version 0.5.0   # set the version by hand
git push origin main --follow-tags
```

The script picks patch when `Unreleased` holds only Fixed entries. It picks minor when any Added,
Changed, or Removed entry exists. It never picks major. It refuses an empty `Unreleased`.

Pushing the tag does not start a build. Packages are built on the maintainer's own machines
(below). The GitHub workflow is a manual fallback only, because macOS and Windows runners bill
at 10x and 2x clock time.

## Build the packages

Each package is built on a machine with that operating system, from a clean checkout of the tag.
The command is the same on every machine. Bun 1.4.0 must match the lockfile.

**Build from the neutral path, not from your home directory.** Next.js writes the
project directory into the server bundle, so a package built from `/Users/you/...`
ships that path to everyone who downloads it. 0.5.0 shipped a home directory in 159
files this way. `bun run desktop:build` refuses a personal path, and
`desktop:verify-package` refuses a package that contains one.

| Platform | Build from |
| --- | --- |
| macOS and Linux | `/tmp/reeve/build` |
| Windows | `C:\Projects\git\omp-reeve-build` |

For a local build you do not intend to ship, set `REEVE_ALLOW_PERSONAL_BUILD_PATH=1`.

```bash
mkdir -p /tmp/reeve && cd /tmp/reeve
git clone --branch v<version> git@github.com:AndrewBeniston/omp-reeve.git build
cd build
bun install --frozen-lockfile
(cd desktop && bun install --frozen-lockfile)
bun run desktop:fetch-bun
OMP_DESKTOP_TARGET=<target> bun run desktop:build
OMP_DESKTOP_TARGET=<target> bun run desktop:verify-package
```

On Windows the same steps run in PowerShell. The build directory sits beside the
repository, never inside it.

```powershell
git clone --branch v<version> https://github.com/AndrewBeniston/omp-reeve.git C:\Projects\git\omp-reeve-build
cd C:\Projects\git\omp-reeve-build
bun install --frozen-lockfile
cd desktop; bun install --frozen-lockfile; cd ..
bun run desktop:fetch-bun
$env:OMP_DESKTOP_TARGET = "win32-x64"
bun run desktop:build
bun run desktop:verify-package
```

| Target | Machine | Extra steps |
| --- | --- | --- |
| `darwin-arm64` | An Apple Silicon Mac | Set `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. The Developer ID identity must be in the login keychain. Run `ulimit -n 65536` first. |
| `darwin-x64` | The same Mac | Same. The verify step cannot run on Apple Silicon; open the app once under Rosetta instead. |
| `win32-x64` | A Windows machine, or the Linux build machine through Wine 10 with `wine32:i386` | Windows ships unsigned at 0.5.0. On Windows call `bun.cmd` if PowerShell blocks `bun.ps1`. Install the MSVC Spectre-mitigated libraries from the Visual Studio Installer, because `node-pty` cannot compile without them. Close Reeve before a rebuild, because a running copy locks `desktop/dist`. Test the installer on Windows either way. |
| `linux-x64` | The Linux build machine | On a machine with no display and no FUSE, verify with `xvfb-run` and `APPIMAGE_EXTRACT_AND_RUN=1`. |

Machines are named by role here and in issues. Never by hostname or owner.

Output lands in `desktop/dist`. Each build writes its own `latest*.yml`. When both macOS
packages come from one `desktop/dist`, the second build overwrites `latest-mac.yml`. Merge the
two `files` lists into one file with all four macOS entries before upload. electron-updater picks
the arm64 entries by the word `arm64` in the file name.

## Publish the packages

A release may carry one platform or every platform. Upload only the packages
you built. Collect every `.dmg`, `.zip`, `.exe`, `.AppImage`, `.blockmap`, and
`latest*.yml` for those platforms in one folder, then:

```bash
bun scripts/release-notes.mjs v<version> > release-notes.md
gh release create v<version> --title "Reeve v<version>" --notes-file release-notes.md --draft <files...>
```

Open the draft, check the file list, then publish it.

Delete `desktop/dist` after upload. Two macOS packages are about 2 GB.

## Publish the feed

An installed Reeve reads its Platform feed, not the release. Until this step
runs, nobody is offered the new version. Run it once per platform you built,
on the machine that built it, with the same target:

```bash
OMP_DESKTOP_TARGET=<target> bun run desktop:update-feed --tag v<version>
```

It reads the channel file from `desktop/dist`, names every package by its full
address in the release, and writes `docs/updates/<platform>/`. Commit that file
to `main` through a pull request. GitHub Pages serves `docs/`, so the merge is
the publication.

Publishing one platform leaves the other feeds untouched, which is the point.
A macOS user is not offered a Windows-only release and reports no error.

Check the feed answers before you tell anyone:

```bash
curl -sS https://andrewbeniston.github.io/omp-reeve/updates/win32/latest.yml
```

## Fallback: the GitHub workflow

`.github/workflows/publish-desktop-electron.yml` does the same build on GitHub runners. It runs
only when started by hand from the Actions tab with the tag as input. Use it for a clean-room
build or when no local machine for a target is available. Its macOS jobs cost about 400 billed
minutes per run.

## Who does what

A release starts when Andrew says "release". An agent may propose one when `Unreleased` has grown.
The confirm prompt in `bun run release` is the gate. An agent never starts the GitHub workflow
without Andrew's explicit approval for that run.

## Secrets the workflow needs

| Secret | Purpose | Source |
| --- | --- | --- |
| `MACOS_CSC_LINK` | Developer ID Application certificate, base64 `.p12` | `scripts/release-setup.sh` stage 3 |
| `MACOS_CSC_KEY_PASSWORD` | Password of that `.p12` | same |
| `APPLE_API_KEY` | App Store Connect key, `.p8` contents | stage 4 |
| `APPLE_API_KEY_ID` | Key ID | stage 4 |
| `APPLE_API_ISSUER` | Issuer ID | stage 4 |

Windows ships unsigned at 0.5.0. Add a Windows signing step in the workflow and in the local
procedure when a certificate exists.

The macOS certificate must stay on one Apple team. electron-updater rejects an update signed by a
different certificate than the installed copy. Renew on the same team.

## After publishing

1. Open the release page and check that every platform file and the `latest*.yml` files are present.
2. Install one package on a clean machine. Confirm the What's New dialog opens.
3. On the next release, confirm the update card appears in an installed copy.

## First-time setup

`bash scripts/release-setup.sh` walks through the Apple certificate, the notarization key, the Ko-fi page,
the switch to a public repository, and branch protection. Re-run it for a certificate renewal.
