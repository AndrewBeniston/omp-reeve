# 01: File viewer copy button says Copy

**What to build:** The copy button in the file viewer toolbar shows "Copy", and "Copied" after a click, in every language. Today it shows a missing key.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test renders the file viewer toolbar and asserts the label and title resolve to the existing "Copy" translation, not a key name.
- [ ] The test fails before the change and passes after.
- [ ] No new i18n key is added. The unused key is not added either.
- [ ] Typecheck and the touched test file pass.

