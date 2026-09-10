# Reeve release policy

Reeve is a public open-source project. The full procedure is in `RELEASING.md`. This file holds the short rules.

The repository does not publish an npm package.

The desktop workflow attaches signed packages to a GitHub release when a `v*` tag is pushed.

Build the desktop application in a separate worktree.

Use `OMP_WEB_DIST_DIR` for every production Next.js build.

Run these checks before a release.

```bash
bun test
bun run typecheck
bun run lint
bun run desktop:build
bun run desktop:verify-package
```

The product name is Reeve.

The macOS package is `Reeve.app`.

The Windows package is `Reeve.exe`.

The application updates itself from GitHub Releases through electron-updater. See ADR-0006.
