# Adversarial audit of the Composer and model selector

Research for [#340](https://github.com/AndrewBeniston/omp-reeve/issues/340) and Epic [#261](https://github.com/AndrewBeniston/omp-reeve/issues/261).

## Result

The audit maps all 31 reference capability groups to 25 child tickets.

The child tickets contain 249 acceptance criteria.

Thirteen capability groups have complete ticket contracts.

Eighteen capability groups need at least one correction.

The audit found 22 confirmed gaps.

Five tickets exceed one 200,000-token worker context.

Epic #261 must not start until #221 records its twelve missing values.

Epic #261 also needs the issue changes listed in this report.

## Sources checked

- Audit map #332, ticket #340, Epic #261, and all 25 child issue bodies.
- Native blocker lists for all 25 child issues.
- External blockers #205, #221, #225, #260, and #321.
- Goal Epic #318 and Goal tickets #319 to #331.
- Map #194, including the Composer correction comment.
- `docs/research/session-11-model-selector.md`.
- `docs/research/session-12-composer-audit.md`.
- `docs/research/session-9-goal-pill.md`.
- The unsupported-input report on draft PR #317.
- The current Composer orchestrator handoff.
- Reeve at `origin/main`, commit `2920ac0`.
- OMP 18.1.6 source, matching `bun.lock`.
- ADR-0001, ADR-0015, `CONTEXT.md`, and repository instructions.

The GitNexus query covered attachments, worktrees, Session creation, reload, reconnect, mobile layouts, and zoom.

## Continuation completion

| Required item | Completed in |
|---:|---|
| 1. External blocker bodies | External blocker findings |
| 2. OMP file mentions | OMP file-mention verification and G16 |
| 3. Worktree operations and dirty state | G17 |
| 4. Browser upload contract | G18 |
| 5. Working-directory and new-Session behavior | G19 |
| 6. Goal continuation messages | G20 |
| 7. Unresolved #221 values | G15 |
| 8. Mobile, zoom, reload, reconnect, and Sessions | G21 and the state table |
| 9. Ticket size limit | Ticket-size audit and G22 |
| 10. Complete traceability | Both traceability tables |

## Verified gaps

### G1. OMP has no Ultra thinking level

OMP 18.1.6 ends its effort list at `max`.

Epic #261 and several child tickets allow an OMP-backed `ultra` level.

That state cannot exist through the current OMP type.

**Required edit:** Remove OMP-backed Ultra criteria from #261, #262, #264, #266, and #277.

Create an OMP ticket first if parity still requires Ultra.

### G2. The selector identifier omits the provider

Ticket #262 joins the model slug and effort with a colon.

OMP identifies a model with `provider/modelId`.

Different providers can expose the same model id.

**Required edit:** Use `provider/modelId:effort` in #262 and #267.

Add a collision test with two providers that expose the same model id.

### G3. Ticket #262 names an OMP level that does not exist

Ticket #262 says `auto` produces no slider step.

OMP 18.1.6 has no `auto` member in `ThinkingLevel` or `Effort`.

**Required edit:** Remove `auto` from the OMP level description and acceptance criteria.

### G4. Dictation has a current OMP source

OMP exports speech capture, model download, transcription, cancellation, and submit-trigger settings.

Ticket #271 proposes a separate Reeve handler across twelve interface states.

That design can duplicate OMP state and model downloads.

**Required change:** Split #271 into an OMP speech bridge and a Composer rendering ticket.

The bridge must use OMP speech settings and services.

The rendering ticket must map OMP events onto the seven reference states.

### G5. Voice chat now has an OMP source

OMP 18.1.6 includes `/live` and a realtime voice controller.

The controller owns capture, output, transcripts, mute, delegation, and cleanup.

Epic #261 and #205 still classify voice chat as unsupported.

The controller lacks a stable Reeve SDK or RPC boundary.

**Required change:** Add an OMP live-controller bridge ticket.

Keep the Composer control disabled until the bridge exists.

### G6. Full Access already maps to OMP

Reeve maps OMP `yolo` to Full Access.

Ticket #312 correctly uses that source.

Epic #261 and #277 still ask whether OMP has this mode.

**Required edit:** Remove the conditional research from #261 and #277.

Make #277 verify #312.

### G7. Required evidence is absent from `main`

Issue #316 closed after its report was posted.

The report remains on draft PR #317.

The handoff tells workers to read evidence from `main`.

**Required change:** Merge PR #317 before Epic #261 starts.

Name `docs/research/session-unsupported-inputs.md` in the handoff.

### G8. The Add menu promises undecided work

Ticket #309 shows remote files, Sketch, and appshot as disabled with “Coming soon”.

Decision #205 has not approved those delivery promises.

Sketch and appshot can use OMP image content.

OMP also has partial SSH file support.

**Required edit:** Block #309 on #205.

Use “Unavailable” with a reason until #205 approves a ticket.

### G9. The mention ticket duplicates OMP concepts

Ticket #310 proposes separate Apps and ChatGPT conversation sections.

OMP already exposes connected services through Plugins and MCP servers.

Reeve already owns Sessions.

**Required edit:** Map Apps to Plugins and MCP servers.

Replace ChatGPT conversations with bounded Session transcript context.

### G10. Ticket #273 has inconsistent blockers

The #273 body names only #262.

Its native blocker list also contains #307.

The file-picker shortcut requires #307.

**Required edit:** Add #307 to the body blocker list.

### G11. Ticket #270 contradicts its blocker

Ticket #270 reserves the Goal slot and returns no Goal placeholder.

The ticket still blocks on #321, which creates Goal mode.

The reserved implementation does not need #321.

**Required edit:** Remove #321 while the slot remains reserved.

Alternatively, add the real Goal placeholder and keep #321.

### G12. Acceptance #277 contains a broken count

Ticket #277 lists twelve comparison groups.

One criterion requires “each of the seven groups above”.

**Required edit:** Replace “seven” with “twelve”.

Add one evidence row for every numbered group.

### G13. Acceptance #277 exceeds one worker context

Ticket #277 combines integration, security, accessibility, desktop comparison, persistence, and cleanup.

It also verifies 24 feature tickets.

**Required change:** Split #277 into four acceptance tickets.

1. Verify the selector, keyboard access, motion, and model persistence.
2. Verify attachments, upload security, drafts, queues, edits, and cleanup.
3. Verify Composer controls, responsive layouts, zoom, and accessibility.
4. Run integration checks and compare the desktop surface with the reference.

Make the final ticket depend on the first three.

### G14. Changelog work occurs too late

Ticket #277 adds every changelog entry after implementation.

Repository rules require each user-visible pull request to add its own entry.

**Required edit:** Make every feature ticket own its changelog entry.

Make #277 audit those entries only.

### G15. Ticket #221 has no reference values

Ticket #221 has no comments and no recorded results.

Twelve values remain unresolved.

They cover footer order, radius changes, menu behavior, search limits, placeholders, queues, dictation, paste, drop, theme, and scrolling.

**Required change:** Complete #221 before dispatching #271, #272, #274, #275, #310, #311, or #314.

Add native #221 blockers to #271, #272, #274, and #275.

### G16. OMP mentions cannot carry every promised path

OMP accepts unquoted, single-quoted, or double-quoted `@path` text.

The parser has no quote escape syntax.

A path containing both quote types cannot round-trip through this grammar.

OMP silently ignores an unresolved mention.

**Required change:** Split #307 into attachment state and OMP transport work.

The transport must accept a structured path list or add a tested escape grammar.

Do not promise arbitrary quoted paths through prompt text.

### G17. Ticket #275 exceeds the worktree API

`GET /api/worktrees` lists worktrees.

`POST /api/worktrees` creates or reuses a branch in a new worktree.

`DELETE /api/worktrees` removes a worktree.

The API cannot list all local branches, checkout a branch, count dirty files, commit, or switch.

Its dirty response applies only when worktree removal fails.

The API also reuses an existing branch, contrary to #275's required error.

**Required change:** Decide whether the control switches worktrees or checks out branches.

For the current architecture, make the control select or create a worktree.

Create a separate API ticket if branch checkout and commit remain required.

### G18. Ticket #308 lacks a complete upload contract

Ticket #308 names a per-Session private store but does not define its schema.

It defines one file-size limit but no Session or global quota.

It does not define retry idempotency or partial-upload cleanup.

It depends on draft expiry, but `lib/draft-store.ts` has no expiry.

Reeve can run without a password, so “authenticated request” needs an exact policy.

The ticket does not define when Session deletion removes retained uploads.

**Required change:** Split #308 into upload transport and upload lifecycle tickets.

The transport ticket must define authentication, opaque capabilities, quotas, retries, and Session binding.

The lifecycle ticket must define drafts, saved references, expiry, deletion, crashes, and garbage collection.

### G19. Ticket #311 does not choose a Session rule

OMP binds a new Session to the `cwd` supplied to `SessionManager.create`.

OMP `/move` can relocate an existing Session through `SessionManager.moveTo`.

Reeve creates a new Session through `/api/agent/new` and a selected `cwd`.

Ticket #311 says a control “updates the Session” without choosing either path.

The choice affects history, project settings, tools, trust, unsent input, and Session files.

**Required change:** Split #311 into new-Session workspace controls and existing-Session relocation.

The first ticket must create a new Session from the selected Project or Worktree.

The second ticket must bridge OMP `/move` if existing-Session relocation remains required.

### G20. Goal continuation is missing from Composer dependencies

Ticket #276 excludes the “Continuing goal…” blocked-submit reason.

Goal ticket #326 implements that exact state and submission block.

Ticket #277 does not depend on Goal acceptance #331.

**Required edit:** Add #326 as a blocker of #276.

Move the Goal continuation reason into #276 after #326.

Add #331 as a blocker of the final Composer acceptance ticket.

### G21. Resilience coverage is incomplete

The current Session hook reconnects SSE and rejects stale run responses.

It reconciles after visibility and online events.

The Composer tickets do not preserve all new states through these paths.

Only #315 checks 200 percent zoom and a narrow layout.

No ticket tests selector, attachment, upload, workspace, or blocked-send states at that zoom.

No ticket tests those states while two Sessions run concurrently.

**Required change:** Add a Composer resilience ticket.

It must cover mobile, 200 percent zoom, reload, reconnect, and two running Sessions.

It must test pending uploads, model changes, drafts, and workspace controls.

### G22. Four more feature tickets exceed one worker context

Tickets #271, #307, #308, and #311 cross independent backend and interface seams.

Each ticket also requires separate failure and persistence checks.

**Required change:** Apply the splits in G4, G16, G18, and G19.

Together with #277, five tickets require splits.

## External blocker findings

| Blocker | Verified contract | Audit result |
|---|---|---|
| #205 | Decide rows without an OMP source | Empty decision record. It must block #309 and #310. |
| #221 | Record unresolved live Composer values | No values exist. Seven child tickets need its evidence. |
| #225 | Supply the four-mode follow reducer | Correct dependency for #313. |
| #260 | Render the transcript from Turn data | Correct dependency for #313. |
| #321 | Create Goal mode | It conflicts with #270's reserved-only scope. |
| #326 | Render Goal continuation and block submission | Missing dependency for #276. |
| #331 | Accept the complete Goal epic | Missing dependency for final Composer acceptance. |

## OMP file-mention verification

| Input | OMP 18.1.6 behavior | #307 result |
|---|---|---|
| Text and source | Reads up to 5 MB, then applies output truncation | Covered after limits are explicit. |
| Directory | Produces a sorted, non-recursive listing of 500 entries | Covered after the limit is explicit. |
| Image | Embeds image content up to 25 MB and can resize it | Covered. |
| Video | Probes metadata and embeds a preview contact sheet | Covered. |
| Binary | Keeps the path and marks automatic reading as skipped | Covered for tool access. |
| Missing path | Produces no file-mention message | #307 needs a preflight error. |
| Path with both quotes | Cannot survive the mention grammar | #307 needs structured transport. |

Evidence appears in OMP `utils/file-mentions.ts` and `session/agent-session.ts`.

## Capability traceability

| Epic capability | Ticket | Status | Gap |
|---|---:|---|---|
| 1. Footer model and effort label | #263 | Complete after shared state fixes | G1 |
| 2. Model-change spinner | #263 | Complete | None |
| 3. Power slider | #264 | Correction required | G1 |
| 4. Dots and thumb | #264 | Correction required | G1 |
| 5. Slider keyboard control | #265 | Complete | None |
| 6. Slider screen-reader announcement | #265 | Complete | None |
| 7. Top-step usage warning | #266 | Correction required | G1 |
| 8. Reset to default | #266 | Complete | None |
| 9. Select-model action | #264, #267 | Complete | None |
| 10. Default row | #267 | Correction required | G2 |
| 11. Current check and clipped name | #267 | Correction required | G2 |
| 12. Bounded model list | #267 | Complete | None |
| 13. Selector transitions | #268 | Complete | None |
| 14. Mid-conversation warning | #269 | Complete | None |
| 15. Model and reasoning commands | #269 | Complete | None |
| 16. Placeholder order | #270 | Correction required | G11, G20 |
| 17. Dictation | #271 | Split required | G4, G15, G22 |
| 18. Local files and folders | #307 | Split required | G16, G22 |
| 19. Browser uploads | #308 | Split required | G18, G22 |
| 20. Paste and drop | #272 | Evidence required | G15 |
| 21. Composer keyboard commands | #273 | Blocker edit required | G10 |
| 22. Composer geometry | #274 | Evidence and resilience required | G15, G21 |
| 23. Branch control | #275 | Redesign required | G17 |
| 24. Blocked-submit reasons | #276 | Goal dependency required | G20 |
| 25. Add menu | #309 | Decision required | G8 |
| 26. Mention and slash search | #310 | Source correction required | G9, G15 |
| 27. Project and environment controls | #311 | Split required | G19, G22 |
| 28. Full Access warning | #312 | Complete ticket, stale epic | G6 |
| 29. Latest Turn preview | #313 | Complete | None |
| 30. Composer preferences | #314 | Evidence required | G15 |
| 31. Question window | #315 | Complete | None |

## Acceptance-criterion traceability

This table accounts for all 249 child acceptance criteria.

`C1` means the first checkbox in that issue body.

| Ticket | Criteria | Result | Criteria that need a change |
|---:|---:|---|---|
| #262 | 16 | Four criteria use stale or ambiguous state | C3, C5, C6, C8 |
| #263 | 11 | Valid after #262 correction | None |
| #264 | 9 | Ultra criterion cannot pass | C8 |
| #265 | 9 | Valid after #262 correction | None |
| #266 | 10 | Ultra branch cannot pass | C10 |
| #267 | 11 | Current selection can collide across providers | C4, C5 |
| #268 | 11 | Valid | None |
| #269 | 10 | Valid | None |
| #270 | 8 | Criteria fit reserved scope, but blocker conflicts | Dependency only |
| #271 | 12 | Separate handler conflicts with OMP ownership | C1 to C12 |
| #272 | 11 | Threshold and overlay values are absent | C2, C6, C7, C8 |
| #273 | 11 | File-picker criterion lacks its written blocker | C1 |
| #274 | 12 | Radius transition and responsive limits are absent | C3, C4, C12 |
| #275 | 12 | Current API cannot satisfy branch and dirty-state work | C5 to C11 |
| #276 | 11 | Goal continuation is wrongly excluded | C1, C11 |
| #277 | 18 | Stale facts, missing states, and excessive scope remain | C1 to C18 |
| #307 | 9 | Mention grammar and persistence need separate contracts | C3 to C6, C8 |
| #308 | 9 | Security and lifecycle contracts are incomplete | C2 to C8 |
| #309 | 7 | “Coming soon” lacks a decision | C5 |
| #310 | 7 | Sources and live values remain unresolved | C1, C2, C3, C6 |
| #311 | 7 | Session behavior and live values remain unresolved | C1 to C5, C7 |
| #312 | 7 | Valid | None |
| #313 | 6 | Valid | None |
| #314 | 6 | Values and storage ownership remain unresolved | C1 to C4 |
| #315 | 9 | Valid | None |

## Ticket-size audit

| Ticket class | Tickets | Result |
|---|---|---|
| Fits one worker | #262 to #270, #272 to #276, #309, #310, #312 to #315 | 20 tickets fit. |
| Must split | #271, #277, #307, #308, #311 | Five tickets exceed the limit. |

The size decision uses scope, seams, failure paths, and verification work.

Checkbox count alone did not decide ticket size.

## Mobile, zoom, reload, reconnect, and Session isolation

| State | Current source behavior | Ticket coverage | Result |
|---|---|---|---|
| Mobile | `useIsMobile` uses 640 px and coarse pointer. Composer controls move between toolbar rows. | #315 checks only the Question window. | Add resilience coverage. |
| Zoom | The Composer uses responsive CSS and visual viewport height. | #315 checks only 200 percent Question zoom. | Add selector and attachment checks. |
| Reload | The Session hook reloads persisted Session state. Drafts remain in an in-memory map. | No attachment ticket defines process reload. | Define persistence before implementation. |
| Reconnect | EventSource reconnects and state polling repairs missed terminal events. | New Composer states lack reconciliation tests. | Add state-specific reconnect tests. |
| Multiple Sessions | Run ids and Session ids reject stale agent state. | Uploads test cross-Session ids only. | Add concurrent Session tests. |

## Exact issue changes

No issue was edited during this audit.

| Issue | Exact change |
|---:|---|
| #205 | Record a decision for every listed row. Replace stale voice and file conclusions with current OMP findings. |
| #221 | Post all twelve live values from `session-12-composer-audit.md`. |
| #261 | Remove Ultra and conditional Full Access text. Add corrected dependencies and split tickets. |
| #262 | Remove `auto` and Ultra. Use `provider/modelId:effort`. |
| #264 | Remove the Ultra-only criterion. Draw only OMP-provided steps. |
| #266 | Put the warning on the actual top OMP step. |
| #267 | Match rows with `provider/modelId:effort`. Add a provider-collision test. |
| #270 | Remove #321, or implement the Goal placeholder and retain #321. |
| #271 | Split OMP speech integration from visible dictation states. Add #221 as a blocker. |
| #272 | Add #221 as a blocker. Use its paste threshold and overlay extent. |
| #273 | Add #307 to the written blocker list. |
| #274 | Add #221 as a blocker. Define the radius transition width. |
| #275 | Add #221. Define worktree selection instead of unsupported branch checkout. |
| #276 | Add #326. Include “Continuing goal…” after that ticket completes. |
| #277 | Replace it with four acceptance tickets. Add #331 to final acceptance. |
| #307 | Split attachment state from OMP path transport. Remove the impossible quote promise. |
| #308 | Split upload transport from upload lifecycle and garbage collection. |
| #309 | Add #205. Replace promises with decision-based disabled reasons. |
| #310 | Use Plugins, MCP servers, and Sessions. Keep #221 and add #205. |
| #311 | Split new-Session workspace selection from existing-Session relocation. |
| #312 | Keep the ticket. Remove stale conditional text from its parent and acceptance ticket. |
| #314 | Keep #221. State that these are Browser settings or OMP settings. |
| Every feature ticket | Add its own `CHANGELOG.md` requirement. |

## New tickets

### OMP live-controller bridge

Expose OMP realtime voice through a stable SDK or RPC boundary.

Cover microphone state, output, transcripts, mute, delegation, failure, and cleanup.

### OMP attachment path transport

Accept structured local paths without parsing quoted prompt text.

Cover spaces, both quote types, Unicode, missing paths, directories, images, video, and binary files.

### Worktree selection API

List selectable worktrees and their branches.

Return dirty status without using removal errors.

Keep branch checkout and commit outside this ticket unless explicitly approved.

### Browser upload transport

Define the opaque-id schema, Session binding, authentication, per-file limits, Session quotas, and global quotas.

Define retry idempotency, partial-write cleanup, and crash recovery.

### Browser upload lifecycle

Define draft ownership, saved Session references, expiry, deletion, and garbage collection.

Prove that one Session cannot read or delete another Session's upload.

### Existing-Session relocation

Bridge OMP `/move` only if product behavior requires an existing Session to change Project.

Reconcile settings, tools, trust, Session paths, wrappers, and unsent input.

### Composer resilience

Test mobile layout, 200 percent zoom, reload, reconnect, and two concurrent Sessions.

Cover selector changes, uploads, attachments, drafts, workspace controls, and blocked-send messages.

## Audit conclusion

The ticket graph covers every reference capability by name.

The graph does not yet provide an implementable contract for 18 capability groups.

The main blockers are missing reference values, stale OMP assumptions, and mixed Session semantics.

Apply the listed issue changes before dispatching Epic #261.
