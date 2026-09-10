# 05: Self-update off by default in the fork

**What to build:** When the launcher starts the server, the update indicator reports that it cannot install and shows the manual command only. An operator who sets the self-update environment variable to another value gets the old behaviour. See DESIGN.md 15.1 and AGENTS.md "Install this fork globally".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A launcher test asserts the spawned server environment carries `OMP_WEB_DISABLE_SELF_UPDATE=1` when the caller did not set it, and carries the caller's value when set. The launcher is CommonJS in bin on purpose; test the environment builder as a unit, extract one if needed, and keep the launcher runnable under Node and Bun.
- [ ] A test asserts the update plan reports `canInstall: false` and reason `disabled` under that default. The existing disabled-plan test may be extended.
- [ ] The tests fail before the change and pass after.
- [ ] Typecheck, the touched test files, and the existing update tests pass.

