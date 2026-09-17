# Adversarial audit of Models settings

Research for [#341](https://github.com/AndrewBeniston/omp-reeve/issues/341), under [#332](https://github.com/AndrewBeniston/omp-reeve/issues/332).

## Result

This audit checked 64 capability groups. Nine groups have complete ticket coverage.

Fifty-five groups need a correction or maintainer decision.

The epic has 17 children and 95 checkbox criteria. Seven current tickets require planned splits.

Issue #288 also requires an ownership split. The corrected Models epic has 33 children.

One additional Composer ticket belongs under Epic #261.

## Evidence

- Epic #290 and its 17 children.
- The native blocker graph for every child.
- Issues #285, #305, #332, and #341.
- Composer Epic #261 and its model-selector children.
- Both Models research documents.
- The Models orchestrator handoff.
- Reeve at commit `2920ac0`.
- OMP 18.1.6.
- The OpenCodex GUI at public commit `3f0481937a6f7856c8a35de99b459078ed9b9e1e`.

The first audit verified ten current OMP contracts. This report preserves those findings.

## Verified gaps

G1. OMP now persists `disabledProviders`. Add a scoped provider switch and define role behavior after disabling.

G2. `models.yml` accepts `auth: apiKey | none | oauth`. Add this field to editing and validation.

G3. Built-in provider descriptors supply `defaultModel`. Add a built-in Default flag and decide custom-provider behavior.

G4. OMP usage support exists. Compare `omp usage --provider <id>` and Session `/usage` separately.

G5. OMP exposes credential-row APIs. Active OAuth and key rows are Session-specific.

G6. The API-key POST replaces the complete credential array. Define row-specific route semantics.

G7. Current provider config contains more fields than Reeve types. Preserve every unknown field.

G8. Issue #288 assigns Composer work to Epic #290. Epic #261 owns those controls.

G9. The native graph blocks #295 on #288. The #295 body omits this blocker.

G10. The #305 body omits #288 and #306. Its native blockers contain both tickets.

G11. The map comment says 15 children. The epic and handoff correctly say 17.

G12. The reference inventory omitted provider search, facets, sorting, grouped counts, and empty onboarding.

G13. The reference inventory omitted the aggregate overview, connection tests, auth summaries, and provider notes.

G14. The reference inventory omitted model copy feedback and raw-config editing.

G15. Table 4 misread the reference CSS. The rail status dot is 8 px.

G16. The 6 px dot belongs to the active-filter marker.

G17. Table 4 misread the 230 px value. It belongs to the filter menu.

G18. Auth rows use 6 px by 8 px padding and `--radius-xs`.

G19. The reference uses a 240 to 280 px rail and a 960 px detail maximum.

G20. The reference changes layouts at 920, 680, 768, and 360 px.

G21. The rebuild drops current model creation, editing, discovery, testing, and deletion.

G22. Issue #297 has no provider-specific model-inventory contract.

G23. Issue #297 omits Default, Selected, Copy ID, and clipboard failure.

G24. Issue #302 promises groups and preset fields that OMP descriptors do not supply.

G25. Issue #302 omits OAuth completion, cancellation, timeout, device instructions, and manual input.

G26. Issue #304 names an `enabledModels` write path that Reeve does not have.

G27. The full-file models-config PUT has no revision check. A stale editor can replace newer changes.

G28. A YAML parse failure becomes an empty provider list. A later save can replace the damaged file.

G29. Provider loading and auth-list loading have no failure or retry contract.

G30. Accounts and API Keys lack complete loading, empty, failure, retry, and cancellation contracts.

G31. Login SSE cancellation works on disconnect. No ticket proves reload, recovery, or stale-token cleanup.

G32. Remove provider does not define all stored-data and active-Session effects.

G33. Dialog focus, Escape, focus restoration, labels, live regions, and reduced motion are absent.

G34. Mobile, 200 percent zoom, coarse pointers, and narrow Settings layouts are absent.

G35. Reload, reconnect, offline recovery, and simultaneous Sessions are absent.

G36. Issue #305 says “six-tab”. A provider has five tabs, with one dynamic auth label.

G37. Issue #305 combines four acceptance disciplines. It exceeds one worker context.

G38. Worker goals use 150,000 tokens but require a 200,000-token stop. Use a 200,000-token budget.

G39. Epic #290 publishes a private reference path. Remove that path from the public issue.

## Final feature-to-ticket matrix

`OK` means the current ticket fully covers the group. `Fix` means a correction or decision remains.

New ticket labels `N1` to `N16` refer to the ticket plan below. `C1` refers to the Composer ticket.

### Provider data and rail

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 1 | Provider configuration load | Loads one full draft | Reeve audit, Tables 1 and 2 | #295, N7 | `GET /api/models-config` | Fix. Separate loading, success, parse failure, and retry. |
| 2 | Load failure and retry | Failure becomes a general modal error | Reeve audit, Table 1 | N7, #295 | `ModelsConfig` load path | Fix. Preserve the last good view and offer Retry. |
| 3 | Normalized provider identity | Three source lists remain distinct | Reeve audit, Bug 4 | #294 | Native #294 scope | Fix. Merge one capability record before rendering. |
| 4 | Custom-provider source filter | The filter compares impossible origins | Reeve audit, Bug 1 | #291 | OMP credential-origin values | Fix. Use config membership, not every `config` origin. |
| 5 | API and subscription provider labels | Friendly names hide the payment route | #288 evidence | #288 | Reproduced OpenAI routes | Fix. Keep provider labels and logout errors in Models. |
| 6 | Composer route identity | The menu and selected control hide the route | #288 evidence | C1 under #261 | Epic #261 owns both controls | Fix. Move this work from #288 to C1. |
| 7 | Provider status semantics | No exact source rules exist | Reference Table 1 | N1, #295 | OMP availability and auth state | Fix. Define disabled, ready, and needs-setup precedence. |
| 8 | Enabled provider switch | No control exists | First audit, G1 | N1 | OMP `disabledProviders` | Fix. Add scoped persistence and role behavior. |
| 9 | Local and Free classification | No stable adapter exists | Reference Table 1 | N9, #295 | OMP descriptors lack complete tiers | Fix. Map only values OMP supplies. |
| 10 | Provider model count | #295 requires the count | Epic story 4 | #295 | Explicit acceptance criterion | OK. Keep the criterion and fixture proof. |
| 11 | Provider search and facets | No rail search exists | Reference source verification | N2 | Reference rail controls | Fix. Add search, facets, sorting, groups, and no-result state. |
| 12 | Rail keyboard and focus | The new rail has no contract | Map check 3 | N2, N15 | Existing tree behavior is not the new rail | Fix. Define arrows, Home, End, selection, and focus. |
| 13 | Empty onboarding and aggregate overview | No ticket owns either surface | Reference source verification | N2 | Reference empty and overview states | Fix. Add first-provider action and aggregate rows. |

### Detail panel and overview

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 14 | Detail header and back action | No rebuilt header exists | Reference Table 1 | #296, #301 | Reference header controls | Fix. Add Back, provider identity, status, switch, and Remove. |
| 15 | Dynamic tab set and order | #296 omits Usage | Reference Table 1 | #296, #306 | Five-tab reference order | Fix. Use Overview, Models, Usage, auth, Settings. |
| 16 | Tab keyboard | #296 names arrows, Home, and End | #296 | #296 | Explicit acceptance criterion | OK. Preserve focus without activating unrelated controls. |
| 17 | Overview summary | #296 covers only three values | Reference source verification | #296, N2 | Reference overview | Fix. Define provider details and aggregate links. |
| 18 | Rate limits and recent use | No ticket owns these rows | Reference source verification | N2, #306 | Reference aggregate overview | Fix. Use OMP usage data or record an omission decision. |
| 19 | Provider connection test | Current testing is model-specific | Reeve audit, Table 2 | N4 | `/api/models-config/test` | Fix. Preserve connection testing in the rebuild. |
| 20 | Authentication summary | Auth lives in separate legacy details | Reference source verification | #298, #299 | Reference overview summary | Fix. Define connected, needs setup, and failed states. |
| 21 | Usage links and provider notes | No ticket owns these controls | Reference source verification | #296, N2 | Reference overview actions | Fix. Add supported links and decide unsupported notes. |

### Models tab and model management

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 22 | Provider model inventory route | No route serves this tab contract | First audit, G3 | N3 | Registry and descriptor APIs | Fix. Return models, provenance, defaults, and enabled selection. |
| 23 | Model search and count | #297 names both without data provenance | #297 | N3, #297 | Ticket body | Fix. Bind both values to N3 results. |
| 24 | Model-list virtualisation | #297 defines threshold and overscan | Reference Table 1 | #297 | More than 40 rows, 36 px, overscan 12 | OK. Preserve the exact fixture criteria. |
| 25 | Model-list non-default states | #297 covers all four states | #297 | #297 | Loading, failure, empty, no match | OK. Keep Retry and state-specific semantics. |
| 26 | Built-in Default flag | The epic wrongly omits it | First audit, G3 | N3, #297 | OMP descriptor `defaultModel` | Fix. Show built-in defaults and decide custom behavior. |
| 27 | Enabled-scope Selected flag | No row projection exists | Reeve audit, Table 4 | N11, #297 | OMP `enabledModels` resolver | Fix. Project resolved selection onto each model row. |
| 28 | Copy ID and feedback | No ticket covers copying | Reference Table 1 | #297 | Reference model rows | Fix. Add success feedback and clipboard failure. |
| 29 | Model add, edit, and remove | The rebuild drops current controls | Reeve audit, Table 1 | N4 | Existing `ModelDetail` | Fix. Preserve all three operations. |
| 30 | Model discovery and full results | Current UI truncates at 300 | Reeve audit, Bug 5 | N4 | Hard `slice(0, 300)` | Fix. Preserve complete results, cancellation, and errors. |
| 31 | Catalog lookup | The rebuild has no owner | Reeve audit, Table 2 | N4 | `/api/models-config/catalog` | Fix. Preserve lookup and failure behavior. |
| 32 | Model testing and advanced fields | The rebuild has no owner | Reeve audit, Tables 1 and 3 | N4 | Existing test route and model schema | Fix. Preserve testing and every supported model field. |

### Usage

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 33 | Usage reports route | No browser route exists | First audit, G4 | N12 | OMP `fetchUsageReports()` | Fix. Return redacted per-credential reports. |
| 34 | Usage totals and limits | No Usage tab exists | Reference Table 1 | #306 | OMP `UsageReport` and `UsageLimit` | Fix. Bind the interface to N12. |
| 35 | Usage states | #306 names loading, failure, Retry, and no data | #306 | #306 | Explicit acceptance criteria | Fix. Add stale data and unsupported-provider semantics. |
| 36 | Usage identity and command parity | Ticket uses a nonexistent command | First audit, G4 | N12, #306 | Current OMP CLI and Session command | Fix. Compare CLI and Session output separately. |

### OAuth accounts

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 37 | OAuth credential-row routes | Routes expose one provider slot | First audit, G5 | N5 | OMP credential-row APIs | Fix. Add list, append, reauth, remove-one, and select. |
| 38 | Account list and row rendering | Legacy UI shows one account | Reeve audit, Table 4 | #298 | OMP credential arrays | Fix. Bind #298 to N5 and add all row states. |
| 39 | Session-specific active account | #298 claims a global Active row | First audit, G5 | N5, #298 | OMP requires a Session | Fix. Require a Session or omit Active. |
| 40 | Account switch, remove, and reauth | One ticket mixes backend and interface | #298 | N5, #298 | Current ticket scope | Fix. Split route contracts from interface work. |
| 41 | Login wait and reopen | #298 covers both behaviors | Reference Table 1 | #298 | Explicit acceptance criteria | OK. Keep URL lifetime and reopen proof. |
| 42 | Manual login input | #298 covers separate busy and error state | Reference Table 1 | #298 | Explicit acceptance criterion | OK. Keep it separate from login wait. |
| 43 | Device instructions and recovery | Coverage stops at the normal flow | First audit, G2 and G25 | #293, N5, #298 | Real `onAuth` payload and SSE lifecycle | Fix. Add cancel, reload, reconnect, and stale-token cleanup. |

### API keys

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 44 | API-key credential-row routes | POST replaces every row | First audit, G6 | N6 | `AuthStorage.set()` semantics | Fix. Add list, append, remove-one, and select. |
| 45 | Key list, masking, and secrecy | Legacy UI supports one masked key | Reeve audit, Table 4 | #299 | OMP credential arrays | Fix. Add loading, empty, failure, and retry. |
| 46 | Add and remove one key | Current routes replace or remove all | #299 | N6, #299 | Existing route behavior | Fix. Preserve every unrelated row. |
| 47 | Session-specific active key | #299 implies a global Active badge | First audit, G5 | N6, #299 | OMP active credential needs a Session | Fix. Require a Session or omit Active. |
| 48 | Mixed credentials and concurrent writes | No contract exists | First audit, G6 | N6 | OMP stores mixed row types | Fix. Define conflicts, validation, and atomicity. |

### Provider settings and persistence

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 49 | Common provider fields | Current form edits a narrow subset | Reeve audit, Table 1 | #300 | Existing form | Fix. Keep name, base URL, API kind, key, and headers. |
| 50 | Provider authentication mode | Reeve types omit the field | First audit, G2 | #300 | OMP `auth` values | Fix. Edit and validate only the exact OMP values. |
| 51 | Advanced provider settings | Reeve omits current OMP fields | First audit, G7 | N8 | Current OMP provider schema | Fix. Add supported fields with exact validation. |
| 52 | Unknown-field preservation | Provider edits can replace unknown data | First audit, G7 | N7, N8 | Narrow typed draft | Fix. Prove lossless round trips. |
| 53 | Parse, revision, and conflict safety | Full-file PUT has no revision | G27 and G28 | N7 | Current route behavior | Fix. Surface parse errors and return 409 conflicts. |
| 54 | Unsaved guard and save states | #300 covers only discard confirmation | #300 | N7, #300 | Ticket criteria | Fix. Add saving, failure, retry, and conflict resolution. |

### Add and remove provider

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 55 | Provider catalog adapter | OMP descriptors lack promised tiers | G24 | N9 | Descriptor shape | Fix. Define labels, ordering, auth kind, and supported groups. |
| 56 | Preset and custom forms | #302 promises unsupported prefill values | #302 | N9, #302 | OMP descriptor limits | Fix. Prefill only sourced values and record decisions. |
| 57 | OAuth during Add provider | #302 omits the complete lifecycle | G25 | N10 | Current SSE and reference flow | Fix. Add device, manual, cancel, timeout, and reconnect. |
| 58 | Add-provider validation | #302 blocks requests for missing fields | #302 | #302 | Explicit acceptance criterion | OK. Preserve no-request proof. |
| 59 | Add-provider save failure | #302 defines server and fallback errors | #302 | #302 | Explicit acceptance criterion | OK. Preserve both error forms. |
| 60 | Remove provider and side effects | #301 defines only the provider record | G32 | N7, #301 | Roles, scope, credentials, Sessions | Fix. Define all effects and alert-dialog behavior. |

### OMP controls and cross-cutting proof

| # | Capability group | Current Reeve state | Research location | Ticket or decision | Evidence | Result and exact correction |
|---:|---|---|---|---|---|---|
| 61 | Roles restyle | #304 preserves every existing role control | #304 | #304 | Explicit acceptance criteria | OK. Keep this ticket focused on presentation. |
| 62 | Enabled-model scope | No route or panel exists | G26 | N11 | Resolver exists without a write surface | Fix. Add scoped read, write, diagnostics, and reload proof. |
| 63 | Geometry and responsive behavior | #303 contains wrong values and no breakpoints | G15 to G20 | #303, N16 | Current reference CSS | Fix. Correct values and prove mobile, zoom, and pointers. |
| 64 | Accessibility, recovery, concurrency, and final proof | #305 combines all disciplines | G30 to G38 | N13 to N16, #305 | Ticket size and missing states | Fix. Separate backend, accessibility, recovery, and visual acceptance. |

## Ticket size and split plan

Tickets #291, #292, #293, #294, #295, #296, #297, #301, and #303 fit one goal.

Each goal must have a 200,000-token budget and an aim near 150,000 tokens.

Seven current tickets require these splits.

| Current ticket | Resulting tickets | Order |
|---|---|---|
| #298 Accounts | N5 OAuth credential-row routes, then #298 Accounts interface | N5 blocks #298. |
| #299 API Keys | N6 API-key credential-row routes, then #299 API Keys interface | N6 blocks #299. |
| #300 Settings | N7 safe persistence, #300 common settings, then N8 advanced settings | N7 blocks #300. #300 and N7 block N8. |
| #302 Add provider | N9 catalog adapter, #302 catalog and forms, then N10 Add-provider OAuth | N9 blocks #302. #302, #293, and N5 block N10. |
| #304 Roles and scope | #304 Roles restyle and N11 enabled-model-scope API and panel | Both follow #296. N11 also blocks #297. |
| #305 Acceptance | N14 backend, N15 accessibility, N16 responsive recovery, then #305 visual parity | N14, N15, and N16 block #305. |
| #306 Usage | N12 usage reports route, then #306 Usage interface | N12 blocks #306. |

## Issue #288 ownership split

Keep #288 under Epic #290 with a new title.

Use **Models: distinguish API and subscription providers and report logout failures**.

Keep these requirements in #288:

- Show distinct provider labels in Models settings.
- Keep API and subscription provider records separate.
- Report a failed Disconnect request without returning silently to idle.
- Add Models-settings regression tests for duplicate display names.

Move these requirements to C1 under Epic #261:

- Distinguish the routes in the Composer model menu.
- Distinguish the route in the selected-model control.
- Preserve the exact provider during selection.
- Exclude unavailable subscription variants.
- Test duplicate model names across providers.

C1 is **Composer: distinguish API and subscription routes in model controls**.

C1 is blocked by #262. C1 blocks #263, #267, #269, and #277.

## New Epic #290 tickets

Create these 16 children. Each ticket uses the epic review contract.

Each ticket uses a 200,000-token goal and aims near 150,000 tokens.

### N1. Models: add scoped provider state and the enabled switch

Read and write `disabledProviders`. Define global and Project scope.

Define role fallback, enabled-scope effects, active Session effects, errors, reload, and concurrent writes.

Blocked by #294. Blocks #295, #301, N13, N14, N15, N16, and #305.

### N2. Models: add rail search, filters, sorting, groups, and overview

Add every reference empty state, keyboard path, count, and aggregate overview row.

Use only OMP-backed rate-limit and recent-use values. Record a maintainer decision for unsupported values.

Blocked by N1, #295, and #306. Blocks #303, N15, N16, and #305.

### N3. Models: expose a provider model inventory route

Return available models, loading provenance, built-in default IDs, and enabled-scope selection.

Return no credential data. Define loading, stale, failure, empty, and retry responses.

Blocked by #294 and N1. Blocks #297, N4, N14, and #305.

### N4. Models: preserve model management

Preserve add, edit, remove, discovery, catalog lookup, connection testing, and advanced model fields.

Preserve failures, cancellation, and every discovery result.

Blocked by N3, N7, and #300. Blocks #303, N13, N14, N15, N16, and #305.

### N5. Models: add OAuth credential-row routes

List, append, reauthenticate, remove one, and select an account for a specified Session.

Define mixed credentials, revision conflicts, cancellation, and response secrecy.

Blocked by #293. Blocks #298, N10, N12, N13, N14, and #305.

### N6. Models: add API-key credential-row routes

List masked rows, append, remove one, and select a key for a specified Session.

Preserve unrelated rows. Define mixed credentials, revision conflicts, secrecy, and concurrent writes.

Blocked by #292. Blocks #299, N13, N14, and #305.

### N7. Models: make models.yml mutation conflict-safe

Surface parse errors. Preserve unknown fields. Add revisions and 409 conflicts.

Prevent stale full-file replacement. Define atomic saves and post-write readback.

No blocker. Blocks #300, #301, #302, N4, N8, N13, N14, and #305.

### N8. Models: edit advanced OMP provider settings

Cover discovery, overrides, strict tools, guardrails, metadata, transport, headers, and exact validation.

Prove unknown-field preservation through every edit.

Blocked by N7 and #300. Blocks N13, N14, N15, N16, and #305.

### N9. Models: build the OMP provider-catalog adapter

Define labels, ordering, auth kind, local status, and supported grouping.

Do not invent paid or free tiers. Record explicit maintainer decisions for missing classifications.

Blocked by #294. Blocks #302, N14, and #305.

### N10. Models: complete OAuth inside Add provider

Cover browser launch, device instructions, manual input, cancellation, timeout, and reconnect.

Retain existing credentials after failure or cancellation.

Blocked by #293, N5, and #302. Blocks N13, N14, N15, N16, and #305.

### N11. Models: add the enabled-model-scope API and panel

Read and write global or Project `enabledModels`. Show resolver warnings.

Prove persistence, reload, and Session startup behavior.

Blocked by #296. Blocks #297, #304, N13, N14, N15, N16, and #305.

### N12. Models: expose OMP usage reports

Return per-credential reports with stable redacted identifiers. Return reasons for unsupported providers.

Define CLI and Session comparison commands. Return no credential values.

Blocked by N5. Blocks #306, N2, N13, N14, and #305.

### N13. Models: preserve state through reload and concurrency

Cover offline recovery, stale responses, two Settings windows, and two Sessions.

Cover provider edits, credentials, usage, enabled state, enabled scope, and OAuth.

Blocked by N1, N4, N5, N6, N7, N8, N10, N11, N12, #301, #302, and #306.

Blocks N14, N16, and #305.

### N14. Models acceptance: backend and persistence

Exercise every Models route over a disposable agent directory.

Inspect `models.yml`, `config.yml`, and credential rows after every mutation.

Blocked by #288, #291, #292, #293, #294, #295, #296, #297, #298, #299, #300, #301, and #302.

Also blocked by #304, #306, N1, N3, N4, N5, N6, N7, N8, N9, N10, N11, N12, and N13.

Blocks #305.

### N15. Models acceptance: keyboard, focus, and accessibility

Cover the rail, tabs, forms, dialogs, live regions, errors, Escape, and focus restoration.

Cover reduced motion and every destructive action.

Blocked by #295, #296, #297, #298, #299, #300, #301, #302, #303, #304, and #306.

Also blocked by N1, N2, N4, N8, N10, and N11.

Blocks #305.

### N16. Models acceptance: responsive and recovery

Cover mobile, coarse pointers, 200 percent zoom, reload, reconnect, and offline recovery.

Cover two simultaneous Sessions and two Settings windows.

Blocked by #295, #296, #297, #298, #299, #300, #301, #302, #303, #304, and #306.

Also blocked by N1, N2, N4, N8, N10, N11, and N13.

Blocks #305.

## Exact edits to current issues

### Epic and map

- #290: replace every stale no-source claim with G1 to G7.
- #290: add all 16 new Models tickets to the Solution and execution graph.
- #290: remove the private reference path.
- #290: change every worker goal to 200,000 tokens, with an aim near 150,000.
- #290: state that five tabs exist and the auth label changes by provider.
- #285: replace the 15-ticket comment with the final 33-child graph.

### Existing Models tickets

- #288: apply the ownership split above.
- #291: identify `models.yml` providers from config membership.
- #291: do not treat every `config` credential origin as a custom provider.
- #292: add request security, content type, post-write readback, and stale-runtime criteria.
- #293: add device instructions, cancellation, disconnect cleanup, and reload behavior.
- #294: require one merged record with capabilities, auth kinds, status, source, and model count.
- #295: add #288 and N1 as written blockers. Define exact status precedence.
- #296: add Usage to the tab order. Add Back, header actions, and focus restoration.
- #296: define when the dynamic auth tab is absent.
- #297: add N3 and N11 as blockers. Add Default, Selected, Copy ID, and clipboard failure.
- #298: retain the Accounts interface. Add N5 as a blocker. Remove every global Active claim.
- #299: retain the API Keys interface. Add N6 as a blocker. Remove every global Active claim.
- #300: retain common fields and unsaved-state behavior. Add N7 as a blocker.
- #301: add N1 and N7 as blockers. Define every deletion side effect from G32.
- #301: add alert-dialog keyboard, failure, and recovery criteria.
- #302: retain catalog presentation and common forms. Add N7 and N9 as blockers.
- #303: replace 6 px with 8 px for rail dots. Remove the 230 px auth-row claim.
- #303: add the rail width, detail maximum, auth padding, auth radius, and responsive values.
- #304: retain only Roles restyling. Move enabled-model scope to N11.
- #305: retain only final visual reference parity and changelog review.
- #305: add N14, N15, N16, and every feature ticket as blockers.
- #305: replace “six-tab” with the dynamic five-tab contract.
- #306: retain the Usage interface. Add N12 as a blocker.
- #306: compare `omp usage --provider <id>` and Session `/usage` separately.

### Acceptance criteria

- N14 proves backend behavior and persistence.
- N15 proves keyboard and accessibility behavior.
- N16 proves responsive and recovery behavior.
- #305 proves visible reference parity.
- #305 records supported differences and maintainer decisions.
- No acceptance ticket can use a passing test as visible proof.

### Native blockers

Keep every current native dependency unless this report replaces it.

Add #288 to #295. Add #288 and #306 to #305.

Add every dependency named in the split plan and new-ticket plan.

After each dependency write, re-read the native graph before the next dispatch.

### Orchestrator handoff

- Change 17 children to 33 children.
- Replace the old frontier with the corrected native graph.
- Change every worker goal to a 200,000-token budget.
- Keep the aim near 150,000 tokens.
- Remove the instruction to request or publish a private path.
- Refer to a maintainer-supplied reference location only when research lacks a value.
- Update the kick-off block with the 33-child count and split ownership.
- Keep the implementation branch and worktree instructions unchanged.

## Final counts

| Measure | Count |
|---|---:|
| Capability groups audited | 64 |
| Complete groups | 9 |
| Groups requiring correction or decision | 55 |
| Current Epic #290 children | 17 |
| New Epic #290 children | 16 |
| Corrected Epic #290 children | 33 |
| New Epic #261 children | 1 |
| Current tickets requiring a split | 7 |
| Current tickets requiring an ownership split | 1 |

No issue was edited during this audit.
