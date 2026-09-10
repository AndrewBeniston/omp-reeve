# 08: Two-state chat gutter from the transcript scrollbar gutter

**What to build:** In a pane wider than the shared column maximum, the chat text and the composer share edges. In a narrower pane, the transcript scroller reserves a stable scrollbar gutter on both edges, so the text sits `15px` inside the composer on each side. One token names that gutter. The flat `16px` inset at every width is removed. See DESIGN.md 6.1 for the measured Codex values, and the ripple list in 7.5.1.

**Blocked by:** 07 (completion sound). Both edit the composer tests.

**Status:** ready-for-agent

- [ ] A test reads the token sheet and asserts the inset token is `15px` and is documented as the scrollbar gutter.
- [ ] A test reads the chat window module and asserts the transcript scroller reserves a stable scrollbar gutter on both edges and that the transcript gutter padding no longer adds the inset to the pane gap.
- [ ] A test asserts the transcript content maximum equals the composer maximum, so the two columns share edges in a wide pane.
- [ ] The three existing tests that asserted the flat inset are updated to the two states, not deleted.
- [ ] The tests fail before the change and pass after.
- [ ] Typecheck, the touched test files, and every composer, clearance, mobile layout, and style boundary test pass.

