# Adversarial audit of the Composer and model selector

Research for [#340](https://github.com/AndrewBeniston/omp-reeve/issues/340) and Epic [#261](https://github.com/AndrewBeniston/omp-reeve/issues/261).

## Audit status

This report is incomplete because the 200,000-token goal reached its hard limit.

The audit checked 24 capabilities and found 14 confirmed gaps.

The report does not resolve #340.

The remaining work appears under **Required continuation**.

## Sources checked

- Audit map #332, ticket #340, Epic #261, and all 25 child issue bodies.
- Native blocker lists for all 25 child issues.
- Acceptance ticket #277 and unsupported-input decision #205.
- Map #194, including the Composer correction comment.
- `docs/research/session-11-model-selector.md`.
- `docs/research/session-12-composer-audit.md`.
- The current unsupported-input report on draft PR #317.
- The current Composer orchestrator handoff.
- Reeve at `origin/main`, commit `2920ac0`.
- OMP 18.1.6 source, matching `bun.lock`.
- ADR-0001, ADR-0015, `CONTEXT.md`, and repository instructions.

The GitNexus index was rebuilt for commit `2920ac0` before source inspection.

## Confirmed corrections

### G1. OMP has no Ultra thinking level

OMP 18.1.6 defines `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.

The OMP effort list ends at `max`.

Epic #261 and #262 describe a model that can carry an `ultra` level.

That state cannot exist through the current OMP type.

**Recommended issue edit:** Remove every OMP-backed Ultra criterion from #261, #262, #263, #264, #266, and #277.

If parity requires Ultra, create an OMP ticket before the selector tickets.

That ticket must add Ultra to the effort type, catalog metadata, providers, persistence, and RPC state.

### G2. The selector identifier omits the provider

Ticket #262 joins the model slug and effort with a colon.

OMP identifies a model with `provider/modelId`.

Different providers can expose the same model id.

**Recommended issue edit:** Use `provider/modelId:effort` as the selector identifier in #262 and #267.

Add a collision test with two providers that expose the same model id.

### G3. Ticket #262 names an OMP level that does not exist

Ticket #262 says OMP includes an `auto` thinking level.

OMP 18.1.6 has no `auto` member in `ThinkingLevel` or `Effort`.

**Recommended issue edit:** Remove `auto` from the OMP level list and its acceptance criterion.

### G4. Dictation has a current OMP source

OMP 18.1.6 exports its speech-to-text module.

It supplies native capture, local model download, streaming transcription, cancellation, and submit-trigger settings.

Its controller exposes idle, recording, and transcribing states.

Ticket #271 asks Reeve to create a separate dictation state machine.

That design can drift from the terminal and duplicate model downloads.

**Recommended correction:** Split #271 into an OMP speech bridge ticket and a Composer rendering ticket.

The bridge must use OMP speech settings and exported speech services.

The rendering ticket must map OMP events onto the reference's seven visible states.

The acceptance must cover first-use download, offline failure, cancellation, permission denial, and model changes.

### G5. Voice chat now has an OMP source

OMP 18.1.6 includes `/live` and a realtime voice controller.

The controller owns microphone capture, output audio, transcripts, mute, delegation, and terminal cleanup.

Epic #261 and #205 still treat voice chat as unsupported.

The current controller is not a documented Reeve RPC surface.

**Recommended correction:** Replace the unsupported conclusion with a new OMP integration decision.

Create a ticket to expose the live controller through a stable SDK or RPC boundary.

Keep the Composer control disabled until that boundary exists.

### G6. Full Access is already a verified OMP mode

Reeve already maps OMP `yolo` to Full Access.

Ticket #312 correctly uses that source.

Epic #261 still conditionally excludes the Full Access banner.

Acceptance #277 still asks whether OMP has the mode.

**Recommended issue edit:** Remove the stale conditional text from #261 and #277.

Acceptance #277 must verify #312 instead of filing another follow-up.

### G7. The unsupported-input report is absent from main

Issue #316 closed after its report was posted.

The matching document remains on draft PR #317.

The Composer handoff tells workers to read evidence on `main`.

They cannot read this required document there.

**Recommended correction:** Merge PR #317 before Epic #261 starts.

Update the handoff to name `docs/research/session-unsupported-inputs.md` as required evidence.

### G8. The Add menu promises unsupported work

Ticket #309 shows remote files, Sketch, and appshot as disabled with “Coming soon”.

The unsupported-input report recommends different outcomes for these actions.

Sketch and appshot can use OMP image content.

Remote files have partial OMP SSH support.

“Coming soon” promises work that decision #205 has not approved.

**Recommended issue edit:** Block #309 on #205.

Use “Unavailable” with a reason until #205 approves a delivery ticket.

Create separate tickets for approved Sketch, appshot, or SSH file actions.

### G9. The mention ticket duplicates OMP concepts

Ticket #310 proposes disabled Apps and ChatGPT conversation sections.

OMP already exposes MCP servers and plugins for connected services.

Reeve already owns Sessions as its conversation source.

The unsupported-input report recommends these native terms.

**Recommended issue edit:** Remove the separate Apps section.

Map connected services to Plugins and MCP servers.

Replace ChatGPT conversations with Sessions and specify bounded transcript context.

### G10. Ticket #273 has inconsistent blockers

The body of #273 names only #262 as its blocker.

The native blocker list also contains #307.

The file-picker shortcut depends on #307, so the native edge is justified.

**Recommended issue edit:** Add #307 to the `Blocked by` section of #273.

### G11. Ticket #270 contradicts its blocker

Ticket #270 reserves the Goal slot and returns no Goal placeholder.

The ticket still has native blocker #321 for Goal creation.

The reserved implementation does not need #321.

**Recommended issue edit:** Choose one scope.

Remove blocker #321 if #270 keeps a reserved slot.

Otherwise, expand #270 to read real Goal state after #321.

### G12. Acceptance #277 contains a broken count

Acceptance #277 lists twelve comparison groups.

One criterion requires “each of the seven groups above”.

This criterion cannot prove complete coverage.

**Recommended issue edit:** Replace “seven” with “twelve”.

Add one checked evidence row for every numbered group.

### G13. Acceptance #277 is too large for one worker

The ticket combines tests, security, accessibility, desktop comparison, motion, persistence, and cleanup.

It also verifies 24 feature tickets.

That scope does not fit one 200,000-token worker.

**Recommended correction:** Split acceptance into four tickets.

1. Verify selector behavior, keyboard access, motion, and model persistence.
2. Verify attachments, upload security, drafts, queues, edits, and cleanup.
3. Verify Composer controls, responsive layouts, zoom, and accessibility.
4. Run integration checks and compare the final desktop surface with the reference.

Make the final ticket depend on the first three.

### G14. Changelog work occurs too late

Acceptance #277 adds every changelog entry after implementation.

Repository instructions require each user-visible change to update the changelog in its pull request.

**Recommended issue edit:** Make every feature ticket own its changelog entry.

Acceptance #277 must only audit those entries.

## Feature-to-ticket traceability

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
|---|---|---|---|---|---|---|
| Selector effort type | Reeve uses OMP levels | Session 11 and OMP source | #262 | OMP ends at `max` | G1 and G3 | Remove Ultra and `auto`, or add an OMP dependency |
| Selector identity | Reeve uses provider-aware model selectors | OMP model plumbing | #262, #267 | OMP models use `provider/modelId` | G2 | Include the provider in the identifier |
| Footer model chip | Existing chip and spinner | Session 11 and Reeve source | #263 | Current `ChatInput` owns the control | None confirmed | Keep #263 after #262 correction |
| Power slider | Current menu uses rows | Session 11 and Reeve source | #264 | Current menu lacks the slider | G1 affects its top step | Remove impossible Ultra states |
| Slider keyboard access | Current menu has no Power slider | Session 11 | #265 | Ticket maps the reference keys | None confirmed | Keep the ticket |
| Reset and usage warning | Current menu lacks reset | Session 11 | #266 | Ticket covers reset and warning | G1 affects warning placement | Define the top OMP step as Max |
| Model list | Current menu has a filter and model rows | Session 11 | #267 | Ticket adds Default and the cap | G2 affects matching | Use provider-aware matching |
| Selector motion | Current motion differs | Session 11 | #268 | Ticket records shipped values | None confirmed | Keep reduced-motion acceptance |
| Model warning and commands | Current menu lacks both commands | Session 11 | #269 | Ticket covers success and errors | None confirmed | Verify commands against current OMP registry |
| Placeholder order | One rendered placeholder | Session 12 | #270 | Two unused strings exist | G11 | Align the Goal scope and blocker |
| Dictation | Control stays hidden | Session 12 and OMP STT source | #271 | OMP exports speech services | G4 | Split the bridge from rendering |
| Live voice | No Reeve control | Unsupported-input report and OMP live source | #205 only | OMP ships `/live` | G5 | Add an SDK or RPC integration ticket |
| Local attachments | Images only as visible rows | Session 12 | #307 | OMP supports file mentions | Not fully audited | Verify media and binary behavior |
| Browser uploads | No general upload path | Session 12 | #308 | Ticket defines opaque ids | Size risk | Consider storage and UI tickets |
| Paste and drop | Images only | Session 12 | #272 | Ticket maps both entry paths | None confirmed | Keep dependencies #307 and #308 |
| Keyboard commands | Local key handling only | Session 12 | #273 | Native blockers include #307 | G10 | Correct the body blocker list |
| Frame geometry | Current values differ | Session 12 | #274 | Ticket records shipped values | None confirmed | Keep responsive acceptance |
| Branch control | Sidebar owns Worktrees | Session 12 | #275 | Composer has no branch control | Not fully audited | Verify API support before implementation |
| Blocked submission | Disabled control has no reason table | Session 12 | #276 | Ticket maps local reasons | Not fully audited | Recheck Goal continuation and current OMP errors |
| Add menu | Reeve has a shorter menu | Session 12 and unsupported inputs | #309, #205 | Decisions remain open | G8 | Block on #205 and avoid promises |
| Mention and slash search | Six sections exist | Session 12 and unsupported inputs | #310, #221 | OMP has Plugins, MCP, and Sessions | G9 | Use OMP vocabulary and sources |
| Project and run controls | Project control exists outside Sessions | Session 12 | #311, #221, #275 | Ticket mixes several concepts | Not fully audited | Verify Session replacement semantics |
| Full Access | OMP `yolo` already works | Reeve source | #312 | Existing selector writes approval mode | G6 | Remove stale conditional research |
| Final acceptance | One large ticket | #277 | #277 | Twelve groups and 25 blockers | G12 to G14 | Split acceptance and audit changelog entries |

## Eight-check status

| Audit check | Status | Evidence |
|---|---|---|
| 1. Reference features map to work or decisions | Partial | The unsupported rows still depend on #205 |
| 2. Current OMP rechecked | Partial | Goal, thinking, speech, live voice, approvals, and SSH were checked |
| 3. Input and output states | Partial | Dictation, uploads, and local attachments need deeper failure-path checks |
| 4. Keyboard, access, persistence, reload, reconnect | Partial | Ticket coverage was read, but runtime source checks remain |
| 5. Cross-epic dependencies and blockers | Partial | G10 and G11 are confirmed; external blocker bodies remain |
| 6. Ticket size | Partial | #271 and #277 are oversized; #308 and #311 need sizing checks |
| 7. Orchestrator handoff | Partial | G7 is confirmed; frontier and selector checks remain |
| 8. Visible and backend acceptance | Failed | #277 is oversized and contains the wrong group count |

## Required continuation

The next audit pass must complete these items before #340 can resolve.

1. Read every external blocker body, including #221, #225, #260, #321, and #205.
2. Verify #307 against OMP file-mention behavior for text, directories, images, videos, and binary files.
3. Verify #275 against the exact `/api/worktrees` operations and dirty-state behavior.
4. Verify #308 storage lifetime, authentication, cleanup, retries, quotas, and multi-Session isolation.
5. Verify #311 against AgentSession working-directory rules and new-Session behavior.
6. Verify Goal continuation messages against #276 and #277.
7. Inspect unresolved reference values listed on #221.
8. Check every mobile, zoom, reload, reconnect, and multi-Session state in source.
9. Check every ticket against the 200,000-token size limit.
10. Finish the traceability table for all reference rows and every child acceptance criterion.

Issue #340 must remain open until this continuation finishes.
