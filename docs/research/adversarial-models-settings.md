# Adversarial audit of Models settings

Research for [#341](https://github.com/AndrewBeniston/omp-reeve/issues/341), under audit map [#332](https://github.com/AndrewBeniston/omp-reeve/issues/332).

> **Status: incomplete checkpoint.** The audit reached its 200,000-token hard stop during current OMP source verification. This file records only verified findings. It is not the resolution report and must not be posted as one.

## Sources checked

- Epic #290 and all 17 current child issue bodies.
- Native `blockedBy` and `blocking` relationships for all 17 children.
- Acceptance ticket #305, audit map #332, and audit ticket #341.
- Models map #285 and Composer Epic #261.
- The two existing Models research documents.
- The current Models orchestrator handoff.
- Current Reeve source at `origin/main` commit `2920ac0`.
- Current installed OMP packages at version 18.1.6.
- A fresh GitNexus index for commit `2920ac0`.

The OpenCodex reference bundle still requires a value-only pass where the existing research lacks evidence.

## Verified corrections

### 1. The provider enabled-state conclusion is stale

The epic says OMP has no per-provider enabled switch. Current OMP has the persisted `disabledProviders` setting.

`ModelRegistry` excludes disabled providers from discovery and availability. `Settings.setDisabledProviders()` writes the setting.

Recommended correction: add a ticket for the provider enabled switch. The ticket must define persistence, reload, failure, and role-resolution behavior.

### 2. The provider auth-mode conclusion is stale

The research says OMP has no `authMode` field. Current `models.yml` accepts `auth: apiKey | none | oauth`.

Recommended correction: expand #300 and #302 to edit and validate `auth`. Preserve the exact OMP values.

### 3. OMP now supplies built-in provider default models

Every current catalog `ProviderDescriptor` carries `defaultModel`. This source can support a Default flag for built-in providers.

Custom providers still have no equivalent persisted field.

Recommended correction: replace the blanket “no source” decision. Add a scoped Default flag for built-in providers, or record a maintainer decision.

### 4. OMP usage support is confirmed

Current `AuthStorage.fetchUsageReports()` returns per-credential `UsageReport` records. `usageProviderFor()` identifies unsupported providers.

The current CLI command is `omp usage`. The acceptance text uses `/usage show`, which current source does not define.

Recommended correction: update #305 and #306 to compare against `omp usage --provider <id>` and the Session `/usage` output separately.

### 5. Multi-account support has stronger current APIs

Current OMP supplies `listOAuthAccounts()`, `getOAuthAccessAt()`, `getOAuthAccessByCredentialId()`, and `removeCredential()`.

OMP marks an account active only for a specified Session. OMP has no global active account.

Recommended correction: split #298. Define whether Models settings shows the current Session account or no Active badge without Session context.

### 6. Multi-key support needs exact route semantics

OMP stores multiple API-key rows. `listStoredCredentials()` and `removeCredential()` expose row identities.

Current Reeve `POST /api/auth/api-key/[provider]` calls `AuthStorage.set()`. That method replaces the complete provider credential array.

Recommended correction: expand #299 with list, append, remove-one, conflict, mixed-credential, and concurrent-write route contracts.

### 7. The Settings ticket omits current OMP fields

Current persisted provider fields include `auth`, `discovery`, `modelOverrides`, `disableStrictTools`, guardrail fields, `requestMetadata`, and `transport`.

Current Reeve types omit many of these fields. A full-file save can preserve unknown fields until a provider edit replaces its typed object.

Recommended correction: split #300 into common fields and advanced OMP fields. Add round-trip preservation tests for unknown fields.

### 8. The native blocker graph and issue text disagree

Native blockers correctly place #288 before #295. The #295 body lists only #291 and #294.

Map #285 still says 15 tickets in one comment. The epic currently has 17 children.

Recommended correction: update ticket text and the map after this audit. Native blockers remain authoritative.

### 9. Issue #288 conflicts with epic ownership

Epic #290 says it does not touch the Composer. Issue #288 requires changes in the Composer model menu and selected-model control.

Composer Epic #261 owns those components and the model selector.

Recommended correction: move the Composer work to Epic #261. Keep only Models-settings provider labels and logout error handling in Epic #290.

### 10. The handoff carries stale counts and paths

The handoff correctly says 17 children. Its embedded kick-off also uses 17.

The handoff still directs implementation to a different branch and checkout than this audit. That is correct for implementation.

The handoff tells the orchestrator to ask for a reference path. Epic #290 publishes a private path in public issue text.

Recommended correction: remove the private path from #290. Keep private reference locations only in the handoff.

## Partial traceability table

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
|---|---|---|---|---|---|---|
| Provider enabled state | No Models control | Existing research says no source | Omitted | OMP `disabledProviders` | Stale conclusion | New ticket for a persisted switch |
| Provider auth mode | Typed UI omits it | Existing research says no source | #300, #302 | OMP `auth` schema | Missing input and validation | Expand both tickets |
| Built-in default model | No row flag | Research says no source | Explicit omission | Catalog `defaultModel` | Blanket omission is stale | Scope the flag or record a decision |
| Usage reports | No tab | Research and map disagree | #306 | `fetchUsageReports()` | Wrong comparison command | Correct #305 and #306 |
| OAuth account list | Single-account UI | Research identifies an array | #298 | `listOAuthAccounts()` | Active means Session-active | Define context and split ticket |
| API-key list | Single replacement field | Research identifies an array | #299 | Stored row APIs | Route contracts are absent | Specify append and remove-one routes |
| Advanced provider settings | Narrow form | Research uses an older shape | #300 | Current schema | Many current fields omitted | Split common and advanced settings |
| Composer route labels | Ambiguous model names | #288 evidence | #288 under #290 | Current ownership documents | Cross-epic ownership conflict | Move Composer work to #261 |
| Acceptance backend proof | Broad route checks | #305 | #305 | Current route list | No per-state contract matrix | Add exact request and persistence proofs |
| Acceptance visible proof | Side-by-side sweep | #305 | #305 | Ticket body | Mobile, zoom, focus, reload, and reconnect lack explicit cases | Expand acceptance criteria |

## Remaining audit work

- Complete all eight map checks against every capability.
- Inspect missing reference values only in the reference bundle.
- Verify every input, output, state, error, keyboard path, accessibility state, persistence path, and reconnect path.
- Test ticket size against one 200,000-token worker context.
- Produce the complete feature-to-ticket table.
- Count capabilities and gaps.
- Post the complete report to #341 only after completion.
