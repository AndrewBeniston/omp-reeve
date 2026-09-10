# 03: Settings dialog chrome in Autospawn Sans

**What to build:** The settings dialog nav, its search field, and its Close control render in Autospawn Sans. Value cells, path cells, and code samples stay monospace. Decided by Andrew on 2026-09-02: the chrome follows the app face, the values keep the mono face.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test reads the settings dialog module and asserts the nav, search, and Close rules use the sans token and not the mono token.
- [ ] The same test asserts at least one value or path rule still uses the mono token.
- [ ] The test fails before the change and passes after.
- [ ] Typecheck and the touched test file pass. Existing settings tests still pass.

