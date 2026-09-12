# Update feeds

Each file here is a Platform feed. An installed Reeve on that platform reads
its own feed and nothing else, so one platform can ship alone. See ADR-0013.

| Platform | Feed |
| --- | --- |
| Windows | `updates/win32/latest.yml` |
| macOS | `updates/darwin/latest-mac.yml` |
| Linux | `updates/linux/latest-linux.yml` |

A feed is small. It names a version, a file hash, and the full address of each
Package. The Packages stay in a GitHub Release, because GitHub Pages refuses a
file above one hundred megabytes.

Do not edit a feed by hand. `bun run desktop:update-feed --tag v<version>`
writes it from the file the build produced.
