# Models 2. Reeve's Models settings, audited against OMP

Research for [#287](https://github.com/AndrewBeniston/omp-reeve/issues/287), part of the Models map ([#285](https://github.com/AndrewBeniston/omp-reeve/issues/285)).

## Sources

Read-only, cited separately.

- **Reeve's own source.** `components/ModelsConfig.tsx`, `components/ModelRolesPanel.tsx`, `components/models/*`, `components/SettingsConfig.tsx`, and the routes under `app/api/models-config` and `app/api/auth`. Read in full for the files listed in the ticket, with targeted `rg` reads for the rest.
- **The OMP SDK source**, in `node_modules/@oh-my-pi`. `pi-ai/src/auth-storage.ts` for credential types and origin kinds, `pi-ai/src/registry/oauth` for the OAuth registry and engines, `pi-coding-agent/src/config/model-registry.ts` for `ModelRegistry` and the provider config shape, `pi-catalog/src/provider-models/descriptor-types.ts` for the catalog descriptor. Shapes only; no credential value was read or copied.
- **The first worker's comment on this ticket.** One bug it confirmed live against a disposable agent directory, and three more it found by reading. Recorded here as given, not repeated.
- **`docs/research/models-opencodex-providers-page.md`** on branch `research/models-opencodex-providers-page`, read with `git show`. The reference for the mapping in this document.

No dev server ran and no browser opened for this document. No markup, code, or credential value was copied into this repository or the issue.

## Table 1. Reeve's Models settings: views, controls, and flows

| Element | File | What it does |
|---|---|---|
| `ModelsConfig` modal | `components/ModelsConfig.tsx` | Owns the whole `models.yml` draft in state, loads it from `GET /api/models-config`, and loads the OAuth and API-key provider lists from `GET /api/auth/providers` and `GET /api/auth/all-providers`. Renders a sidebar tree and a detail pane, with Cancel and Save actions. Save sends the full draft to `PUT /api/models-config` |
| Sidebar tree | `components/models/ModelsSidebarTree.tsx`, `models-tree-navigation.ts` | An ARIA `treeitem` list: one Roles row, then active OAuth rows, then active API-key rows, then one branch per custom provider with its models and an "Add model" row. Arrow keys, Home, and End move focus; Left/Right expand or collapse a provider branch |
| Roles panel | `components/ModelRolesPanel.tsx` | Lists every omp model role (`default`, `smol`, `slow`, `plan`, `commit`, and so on) from `GET /api/model-roles`, with a model picker and a thinking-level row per role. A Global/Project scope toggle picks `~/.omp/agent/config.yml` or `.omp/config.yml` as the write target. Assignment goes through `PUT /api/model-roles` |
| Provider detail | `components/models/ProviderDetail.tsx` | Edits one custom provider's name, base URL, API key, API kind (`openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`), and headers. A "Discover models" action posts to `/api/models-config/discover` and lets the user check off returned models to add |
| Model detail | `components/models/ModelDetail.tsx` | Edits one model's id, name, API override, reasoning flag, thinking-level map, input modalities, context window, max tokens, cost fields, headers, and compat flags. Has its own "Test connection" action against `/api/models-config/test` and a catalog-lookup action against `/api/models-config/catalog` |
| OAuth detail | `components/models/OAuthDetail.tsx` | Login/relogin/disconnect for an OAuth-capable provider. Opens an `EventSource` on `GET /api/auth/login/[provider]` and renders one of eight phases: connecting, auth (paste-the-redirect-URL), device_code, prompt, select, progress, success, error |
| API-key detail | `components/models/ApiKeyDetail.tsx` | A single masked-key form: save posts to `POST /api/auth/api-key/[provider]`, disconnect calls `DELETE` on the same route |
| Add-provider picker | `components/models/AddProviderPicker.tsx` | A searchable modal listing not-yet-connected OAuth providers, not-yet-configured API-key providers, and a Custom option, each opening the matching detail view |
| Roles panel — thinking row | `components/ModelRolesPanel.tsx`, `lib/model-role-selection.ts` | Per-role thinking-level buttons, filtered to levels the assigned model actually supports; `role-selector-change.ts` decides whether a model swap keeps or resets the pinned level |
| Header list editor | `components/models/HeaderListEditor.tsx` | Key/value editor for a provider's or model's `headers` map |
| Thinking-level map editor | `components/models/ThinkingLevelMapEditor.tsx` | Per-model override of the thinking-level label set |
| Settings shell | `components/SettingsConfig.tsx` | Hosts `ModelsConfig` as one panel among the app's other settings, in embedded mode (`embedded=true`, no own overlay or close button) |

## Table 2. Reeve routes under `app/api/models-config` and `app/api/auth`

| Route | Method | Purpose | Cache invalidation on write |
|---|---|---|---|
| `/api/models-config` | GET | Reads `models.yml`, falling back to `models.yaml` then `models.json` | — |
| `/api/models-config` | PUT | Replaces `models.yml` wholesale, dropping blank-id model rows first | `invalidateModelsCache()` and `invalidateOmpRuntime()` |
| `/api/models-config/catalog` | GET | Proxies and caches `models.dev`'s catalog (1 h TTL) for the model-fields lookup and preset recommendation | — (read-only, own cache) |
| `/api/models-config/discover` | POST | Calls a candidate provider's model-list endpoint live, using the submitted (not-yet-saved) provider config | — (no persistence) |
| `/api/models-config/test` | POST | Builds a throwaway `ModelRegistry` over a temp `models.json` holding just the submitted provider and model, resolves auth through the real `AuthStorage`, and sends one probe completion | — (no persistence) |
| `/api/auth/providers` | GET | OAuth-capable provider list, via `buildOAuthProviderList` | — |
| `/api/auth/all-providers` | GET | API-key-capable provider list, via `buildApiKeyProviderList` | — |
| `/api/auth/api-key/[provider]` | GET | Auth status for one provider (never the key) | — |
| `/api/auth/api-key/[provider]` | POST | Stores an API key through `AuthStorage.set` | `invalidateModelsCache()` only |
| `/api/auth/api-key/[provider]` | DELETE | Removes stored keys, rejecting if the stored credential is OAuth | `invalidateModelsCache()` and `invalidateOmpRuntime()` |
| `/api/auth/login/[provider]` | GET | SSE stream driving `AuthStorage.login()`; forwards `onPrompt`, `onAuth`, `onProgress`, `onManualCodeInput` as `prompt_request`, `auth`, `progress`, `success`/`error`/`cancelled` events | `invalidateModelsCache()` and `invalidateOmpRuntime()`, on `success` only |
| `/api/auth/login/[provider]` | POST | Resolves a pending prompt/manual-code/redirect-URL token from the GET stream | — |
| `/api/auth/logout/[provider]` | POST | Logs out an OAuth-authenticated provider through `AuthStorage.logout` | `invalidateModelsCache()` and `invalidateOmpRuntime()` |

## Table 3. OMP plumbing behind the page

Read from `node_modules/@oh-my-pi` source, shapes only.

| Concern | SDK source | Shape |
|---|---|---|
| `models.yml` provider entry | `pi-coding-agent/src/config/model-registry.ts`, `ProviderConfigInput` | `baseUrl`, `apiKey`, `api`, `headers`, `compat`, `authHeader`, `transport`, `usage`, an `oauth` object (`name`, `login`, `refreshToken`, `getApiKey`, `modifyModels`), a `fetchDynamicModels` factory, and `models: []` |
| `models.yml` model entry | Same file, nested in `ProviderConfigInput.models` | `id`, `name`, `api`, `baseUrl`, `reasoning`, `thinking`, `input` (`"text"|"image"`), `supportsTools`, `cost` (input/output/cacheRead/cacheWrite), `contextWindow`, `maxTokens`, `preferWebsockets`, `headers`, `compat`, `contextPromotionTarget`, `compactionModel`, `remoteCompaction`, `premiumMultiplier`. Reeve's local `ProviderEntry`/`ModelEntry` in `components/models/types.ts` is a narrower editing view of this same schema, not a separate format |
| Credential types | `pi-ai/src/auth-storage.ts` | `ApiKeyCredential { type: "api_key", key, source?: "login" }`, `OAuthCredential { type: "oauth", ...OAuthCredentials }`. A provider can hold one or an array (`AuthCredentialEntry`) |
| Credential origin kinds | Same file, `CredentialOriginKind` | Exactly `"runtime" | "config" | "oauth" | "api_key" | "env" | "fallback"`, resolved by `getCredentialOrigin` in that precedence order |
| OAuth registry | `pi-ai/src/registry/oauth/index.ts`, `types.ts` | `getOAuthProviders()` returns `OAuthProviderInfo { id, name, available, storeCredentialsAs? }`. `storeCredentialsAs` is why a login id and a model-catalog provider id can differ (e.g. a device-code login id storing under the plain provider id) |
| OAuth login controller | `pi-ai/src/registry/oauth/types.ts`, `OAuthController` | Exactly `onAuth?`, `onProgress?`, `onManualCodeInput?`, `onPrompt?`, `signal?`, `fetch?`. No `onSelect` and no device-code-specific callback exist anywhere in this interface or in `AuthStorage.login()`'s own signature (confirmed at `pi-ai/src/auth-storage.ts:3017`, which only forwards `onAuth`, `onPrompt`, `onProgress`, `onManualCodeInput`) |
| Device-code engine | `pi-ai/src/registry/engine/device-code.ts` | On receiving the user code, calls only `ctrl.onAuth?.({ url: verificationUriComplete ?? verificationUri, instructions: "…code…" })`. It never calls a separate device-code callback, because `OAuthController` has none |
| `ModelRegistry` | `pi-coding-agent/src/config/model-registry.ts` | `getAll()`, `getAvailable()`, `hasProvider(id)`, `find(provider, modelId)`, `getApiKeyAndHeaders(model)`, `getError()`, `refresh(strategy)` with strategies including `"online-if-uncached"` and `"offline"` |
| Catalog descriptor | `pi-catalog/src/provider-models/descriptor-types.ts` | `ProviderDescriptor { providerId, createModelManagerOptions, defaultModel, allowUnauthenticated?, dynamicModelsAuthoritative?, catalogDiscovery? }`. `PROVIDER_DESCRIPTORS` is the array Reeve's `lib/provider-listing-runtime.ts` reads for `hasApiKeyLogin` |
| Roles | `lib/model-roles.ts` wrapping `pi-coding-agent/config/model-roles` and `config/model-resolver` | `listModelRoles` resolves each role's selector (`provider/modelId[:thinkingLevel]`) against available models; `writeModelRole` writes `~/.omp/agent/config.yml` (global) or `.omp/config.yml` (project) through `Settings` |
| Enabled-model scope | `lib/model-scope.ts` wrapping `pi-coding-agent/config/model-resolver`'s `resolveModelScope` | Glob and fuzzy matching against `provider/modelId` or a bare id, with an optional `:thinkingLevel` suffix, falling back to every available model when patterns match nothing |

## Table 4. Mapping — OpenCodex dashboard Providers page → Reeve/OMP source

Reference: `docs/research/models-opencodex-providers-page.md` on `research/models-opencodex-providers-page`.

| OpenCodex Providers page element | Reeve/OMP source, or "no source" |
|---|---|
| Provider rail with status dot, default star, Local/Free badge | No source. Reeve's sidebar tree (`ModelsSidebarTree.tsx`) lists rows but has no status dot, no default-provider concept (OMP has no "default provider", only the `default` role), and no Local/Free badge |
| Five-tab provider detail (Overview, Models, Usage, Accounts/Keys, Settings) | Partial. Reeve's `ProviderDetail.tsx` is one flat form: base URL, key, API kind, headers, and model discovery in one pane. `OAuthDetail.tsx`/`ApiKeyDetail.tsx` cover only the Accounts/Keys tab's job. No Overview, Usage, or separate Settings tab exists |
| Models tab: search, virtualised list, Default/Selected flags, copy-id | Partial. `ProviderDetail.tsx`'s discovery list has its own filter box and a 300-row slice instead of virtualisation, and a per-model add checkbox instead of Default/Selected flags. The sidebar tree lists saved models without search |
| Usage tab, quota report | No source. OMP's `ModelRegistry`/`AuthStorage` expose no quota or usage endpoint that Reeve surfaces; `GET /api/provider-quotas` has no OMP equivalent |
| Accounts tab: multi-account list, active/reauth badges, Add account | No source. `OAuthDetail.tsx` supports exactly one credential slot per provider (login/relogin/disconnect); OMP's `AuthStorage` can store an array of credentials per provider (`AuthCredentialEntry`) but Reeve's UI and routes never read past the first |
| API Keys tab: masked list, Add key, Remove | Partial. `ApiKeyDetail.tsx` supports one key per provider (save replaces, disconnect removes); OMP's `AuthStorage` credential array could hold more than one, so a multi-key pool has SDK-side support Reeve does not surface |
| Add provider: preset catalog ranked by usage | Partial. `AddProviderPicker.tsx` lists not-yet-connected OAuth and not-yet-configured API-key providers plus a Custom option, from `lib/provider-listing.ts`'s capability-based list, not a usage-ranked preset catalog. `GET /api/models-config/catalog` proxies `models.dev` for model-level suggestions, not provider presets |
| Add provider, OAuth flow with polling and a manual-code path | Partial. Reeve drives OAuth login over SSE instead of polling, and does have a manual-code path (`prompt`/`auth` phases), backed by `AuthStorage.login()`'s real `onPrompt`/`onManualCodeInput` hooks. The `device_code` and `select_request` phases in `OAuthDetail.tsx` have no SDK-side source at all — see Bug 3 below |
| Add provider, local-token import (server returns 200 with empty URL) | No source. Reeve's login route always expects a browser-facing URL or a prompt; there is no local-token-import path |
| Remove provider | Yes. `ProviderDetail.tsx`'s Delete button and `ModelsConfig.tsx`'s `deleteProvider`, backed by `PUT /api/models-config` |
| Provider record fields (`adapter`, `hasApiKey`, `defaultModel`, `authMode`, `codexAccountMode`, `liveModels`, `modelContextWindows`, and so on) | Partial. OMP's `models.yml` provider entry (Table 3) carries `api`, `headers`, `compat`, and per-model `contextWindow`/`maxTokens`/`cost`, but has no `authMode` enum, no `defaultModel` field, and nothing resembling `codexAccountMode`'s pooled-account distinction |
| Model record (`id`, Default flag, Selected flag) | Yes for the id; no source for the flags. OMP's per-model `ModelEntry` (Table 3) has an id and per-model facts, but "Default" and "Selected" are page-level concepts (default provider, enabled-model scope) that Reeve's model list does not project onto each row |

## Table 5. Bug list

Steps are given against the current codebase; "expected" is the code's own stated intent (comments, sibling routes, or the reference page); "observed" is what the source shows will happen. Only the first bug carries a live confirmation; the rest are confirmed by reading the SDK and route code, not by running Reeve.

### Bug 1 — the custom-provider source filter never fires (confirmed live)

- Steps: add a custom provider to `models.yml` with an `apiKey` written inline, then load the Models settings.
- Expected: `buildApiKeyProviderList` in `lib/provider-listing.ts` excludes a `models.json`-sourced provider, because "the Models panel already renders them from `models.json` itself" (the function's own comment).
- Observed: the exclusion checks `provider.status.source` against `CUSTOM_PROVIDER_SOURCES = new Set(["models_json_key", "models_json_command"])`, but `AuthStorage.getCredentialOrigin`'s `CredentialOriginKind` is one of `"runtime" | "config" | "oauth" | "api_key" | "env" | "fallback"` — no such source string is ever emitted. The filter's condition is always false, so the provider appears twice: once as its own sidebar tree node (from `models.yml`) and once as a connectable "configured" API-key card (from `/api/auth/all-providers`).

### Bug 2 — API-key POST never invalidates the OMP runtime cache

- Steps: call `POST /api/auth/api-key/[provider]` to store a new key for a provider not previously configured.
- Expected: every mutation invalidates the runtime cache, per this repository's own rule in `lib/omp-runtime.ts` and per the sibling routes — `DELETE` on the same file, and both `login`/`logout` routes, all call `invalidateModelsCache()` **and** `invalidateOmpRuntime()`.
- Observed: `POST /api/auth/api-key/[provider]/route.ts` calls only `invalidateModelsCache()`. `invalidateOmpRuntime()` is imported into the file (for the `DELETE` handler) but never called from `POST`. The process-wide `ModelRegistry`/`Settings`/`AuthStorage` bundle in `globalThis.__ompRuntimePromise` is left as-is, so any route that depends on a freshly-constructed `ModelRegistry` picking up the new key (rather than `AuthStorage`'s own live SQLite read) can serve a stale view until the runtime is invalidated by something else or the process restarts.

### Bug 3 — two OAuth login phases the backend can never reach

- Steps: open `OAuthDetail.tsx` for any OAuth provider and start a login.
- Expected: the component's `OAuthLoginState` type declares `device_code` (with `userCode`, `verificationUri`, `intervalSeconds`, `expiresInSeconds`) and `select` (with a list of `{ id, label }` options) as reachable UI phases, each with its own rendered block and, for `device_code`, its own styling (`styles.deviceCode`).
- Observed: `GET /api/auth/login/[provider]/route.ts`'s SSE handler only ever sends `prompt_request`, `auth`, `progress`, `success`, `error`, and `cancelled`. It calls `AuthStorage.login()` with only `onPrompt`, `onManualCodeInput`, `onAuth`, `onProgress` — the full and only set that `AuthStorage.login()`'s signature accepts (`pi-ai/src/auth-storage.ts:3017`-3049). There is no `onSelect` hook anywhere in the SDK's `OAuthController`, and the device-code login engine (`pi-ai/src/registry/engine/device-code.ts`) reports its user code through `onAuth` (as a URL plus embedded instructions text), not through a distinct device-code callback. `OAuthDetail.tsx`'s `data.type === "device_code"` and `data.type === "select_request"` branches are therefore dead: no code path in this repository or the SDK ever sends either event type. A real device-code login instead falls into the `auth` phase and shows the generic "paste the redirect URL" prompt, which is wrong for a flow that has no redirect URL to paste.

### Bug 4 — no cross-dedup across the three sidebar id spaces (theoretical)

- Steps: configure one provider id under `models.yml` (a custom provider) and also have credentials for the same id available through the OAuth or API-key list.
- Expected: one sidebar entry per provider, matching `ModelsConfig.tsx`'s own comment on `refreshAuthProviders` about avoiding "the provider rendered twice."
- Observed: `buildModelsTree` in `components/models/models-tree-navigation.ts` builds three independent root-node groups — one `oauth:` id per OAuth provider, one `apikey:` id per API-key provider, one `provider:` id per `models.yml` provider — with no id-space reconciliation between them. `treeNodeIdForSelection`'s `sameSelection` only compares within one `Selection` variant, never across variants. A provider id present in more than one space renders as more than one row.

### Bug 5 — the discovered-models list is not virtualised past 300 rows (found by reading)

- Steps: discover models against an endpoint returning more than 300 model ids.
- Expected: the discovery list in `ProviderDetail.tsx` should let the user browse and select from the full discovered set, matching the "Discover models" affordance's own purpose.
- Observed: `shownDiscoveredModels = filteredDiscoveredModels.slice(0, 300)` is a hard slice, not a windowed/virtualised render. Anything past the first 300 filtered matches is invisible and unselectable, with no count or "more available" indicator distinguishing this from a genuinely short list.

## Parity checklist against the OpenCodex dashboard's Providers page

**Matches**

- Both list providers and open a detail view per provider, with add and remove flows.
- Both support key-based and OAuth-based auth per provider, backed by a masked-key view and an account/login view respectively.
- Both drive OAuth login through a browser-facing URL with a manual-code fallback path, backed by real prompt callbacks on the SDK side.
- Both can discover a provider's live model list from an endpoint rather than requiring hand-typed model ids.

**Lacks**

- No provider rail with a status dot, default star, or Local/Free badge; no "default provider" concept exists in OMP at all.
- No five-tab detail view; Overview, Usage, and a distinct Settings tab do not exist.
- No quota or usage report per provider; OMP exposes no such endpoint for Reeve to surface.
- No multi-account or multi-key pool UI, though `AuthStorage`'s credential array could hold more than one per provider.
- No virtualised, searchable saved-model list with copy-to-clipboard ids; the sidebar tree has no search at all, and the discovery list's own filter caps out at 300 shown rows (Bug 5).
- No usage-ranked preset catalog for Add Provider; the picker is a flat capability-based list.

**Differs**

- Reeve stores providers and models in `models.yml` through `ModelRegistry`, and credentials in OMP's SQLite `AuthStorage`; the reference stores both in one JSON config plus its own keychain, behind its own admin API.
- The reference's provider record carries `authMode`, `defaultModel`, and `codexAccountMode` as first-class fields; OMP's nearest equivalents are credential origin kind, the `default` model role, and nothing at all for pooled accounts.
- The reference resolves OAuth login by polling a status endpoint; Reeve streams the same information over SSE, backed by callback hooks the SDK actually exposes — except for `device_code` and `select`, which the SDK exposes no hook for at all (Bug 3).
- OMP scopes models by role (`default`, `smol`, `slow`, and so on) and by an `enabledModels` glob/fuzzy pattern list, a layer the reference page has no equivalent for; Reeve's `ModelRolesPanel` is this map's own addition, with nothing to compare against on the reference page.

## What only a live run can settle

- Whether Bug 2's stale-runtime window (API-key POST not invalidating `__ompRuntimePromise`) is actually observable in the UI, given that `AuthStorage.hasAuth`/`getCredentialOrigin` read live SQLite state regardless of the cached `ModelRegistry` — this needs a request sequence against a running server to confirm which downstream read, if any, is affected.
- The exact wording and layout a user sees when a device-code login is attempted through `OAuthDetail.tsx` today (Bug 3): whether it silently stalls in the `auth` phase, or errors out, depends on runtime behaviour not visible from source alone.
- Whether Bug 4's three-way id collision is reachable through the picker's own de-duplication logic in `AddProviderPicker.tsx`, or only through a hand-edited `models.yml` — the picker filters by `loggedIn`/`configured` state, which may mask some collision paths.
- The rendered colours, hover states, and any animation timing across Reeve's Models settings, for a like-for-like comparison against the reference page's own unverified visual items.
- Whether `GET /api/models-config/discover`'s and `GET /api/models-config/test`'s error messages leak upstream response bodies in a way that matters for the public-repository constraint on this project.

## Note on scope

This document completes the audit and mapping for [#287](https://github.com/AndrewBeniston/omp-reeve/issues/287), building on the first worker's live-confirmed and read-confirmed findings without repeating that work. The bug list adds one bug (Bug 5) and one refinement (the `select` phase folded into Bug 3, since it shares the same missing-SDK-hook root cause as `device_code`) found while reading the same files for the inventory and plumbing sections. No implementation change was made; this is a research document only.

