# 06: Composer footer in the Codex groups with a hidden Dictate control

**What to build:** The desktop composer footer renders two groups in the Codex order. Left: Attach, then the Mode pill when the project is not trusted, at a `5px` gap. Right, justified to the end: a model area with the context donut and the model pill at a `4px` gap, then a trailing cluster with a Dictate control and Send at an `8px` gap. Dictate is a `28px` round ghost control with a `16px` microphone icon. It carries the `hidden` attribute unless a new `dictationAvailable` prop is true, and no caller passes that prop. The Send fill, the footer centre line, the `98px` empty frame, and the mobile collapse with its `more` control all stay as they are. See DESIGN.md 7.5 and 7.5.1 and the live Codex values in docs/design/reference/codex/README.md.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test renders the composer with a fake trusted and untrusted project and asserts the DOM order: Attach, Mode pill, context donut, model pill, Dictate, Send.
- [ ] A test asserts Dictate has the `hidden` attribute and the Dictate accessible name by default, and no `hidden` when `dictationAvailable` is true.
- [ ] A test reads the composer module and asserts the three gaps: `5px` left, `4px` model area, `8px` trailing cluster.
- [ ] The existing five-control assertion counts visible controls only and still passes.
- [ ] New i18n keys for Dictate exist in both message files.
- [ ] The tests fail before the change and pass after.
- [ ] Typecheck, the touched test files, and every composer, clearance, and mobile layout test pass.

