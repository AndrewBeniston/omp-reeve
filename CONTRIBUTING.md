# Contributing to Reeve

Thank you for your interest. Reeve is a small project with one maintainer, so please keep changes focused.

## Before you start

- Open an issue first for anything larger than a fix. Say what you want to change and why.
- Read `AGENTS.md`. It holds the repository rules and the file map.
- Read `DESIGN.md` before you touch the interface. The look is measured from the Codex desktop app.

## Make a change

```bash
bun install
bun run dev        # http://127.0.0.1:30141
bun test
bun run typecheck
bun run lint
```

- Branch from `main`. Open a pull request against `main`.
- Add an entry under `## [Unreleased]` in `CHANGELOG.md` for any user-visible change.
- Add or update a test when behaviour changes.
- Keep commits small. Use a short imperative subject: `fix: ...`, `feat: ...`, `docs: ...`.
- Do not add a `Co-Authored-By` line.

## What is out of scope

- Replacing the OMP engine. See ADR-0003.
- A different font. Autospawn Sans is a decision, not a default.
- Telemetry or analytics of any kind.

## Licence

By contributing you agree that your work is released under the MIT licence in `LICENSE`.
