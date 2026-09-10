# 02: Page body uses the Autospawn Sans token

**What to build:** Every surface that inherits from the page body renders in Autospawn Sans, with the system stack only as fallback. Today the body rule names the system stack directly and skips the token.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test reads the global stylesheet and asserts the body font-family is the sans token, and that no rule outside the font-face declarations names a system face before the token.
- [ ] The test fails before the change and passes after.
- [ ] No stylesheet or generated CSS contains Inter.
- [ ] Typecheck and the touched test file pass.

