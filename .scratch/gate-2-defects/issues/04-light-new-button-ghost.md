# 04: Sidebar New button is a ghost control

**What to build:** The sidebar `New` button has no fill and no border at rest, shows the row hover wash on hover, and uses the muted text colour. In light mode it no longer reads as a dark pill. This follows the header action rule in DESIGN.md 7.3.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test reads the navigation module and asserts the New button rule has a transparent background and no border at rest, and a hover rule with the row hover token.
- [ ] The test fails before the change and passes after.
- [ ] The disabled state keeps its dim text and not-allowed cursor.
- [ ] The Refresh control beside it keeps its current look unless it shares the same class.
- [ ] Typecheck, the touched test file, and the existing sidebar tests pass.

