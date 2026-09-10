# 07: Completion sound row in the OMP Interaction tab

**What to build:** The completion sound toggle appears in the Settings dialog, Interaction tab, Notifications group, beside OMP's own Completion Notification row. The Session menu on the context donut no longer holds it. The toggle still drives the same browser preference the audio hook owns, so the tone plays or stays silent exactly as before. See DESIGN.md 7.6.

**Blocked by:** 06 (composer footer). Both edit the composer container and its menu tests.

**Status:** ready-for-agent

- [ ] A test renders the settings dialog with a fixture settings response and asserts a Completion sound row in the Interaction tab, Notifications group, that reflects the audio preference and toggles it.
- [ ] A test asserts the settings API includes the web-only field with tab `interaction` and group `Notifications`, under a path that does not collide with OMP's schema, and that a PATCH to that path does not write OMP's config file.
- [ ] A test renders the Session menu and asserts it holds the token counts, cost, and Compact, and no sound item.
- [ ] The audio hook keeps its storage key and gesture unlock. Its tests still pass.
- [ ] The two unused sound keys in the message files are removed or used as the row description, in both languages.
- [ ] The tests fail before the change and pass after.
- [ ] Typecheck, the touched test files, and every settings, composer menu, and audio test pass.

