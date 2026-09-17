# Models 1. The OpenCodex dashboard's Providers page

Research for [#286](https://github.com/AndrewBeniston/omp-reeve/issues/286), part of the Models map ([#285](https://github.com/AndrewBeniston/omp-reeve/issues/285)).

## Sources

Read-only, cited separately.

- **The OpenCodex GUI source.** The maintainer's local checkout of the open source GUI. Carries the provider rail, the detail tabs, the add-provider catalog and form, the auth panel, and the CSS values below.
- **The installed OpenCodex package.** Carries the server route registry and the management routes that back the page. Confirms the endpoint list and the config shape.
- **The OpenCodex dashboard.** The running local instance, queried through its management API with `curl` and the admin token. Confirms live provider records, quota shapes, and key-pool shapes. No screenshot or pointer test ran this session, so drag, hover, and animation timing are not verified and are marked below.

No markup, class names, or code were copied into this repository or the issue. This document records values only.

## What the page is

The Providers page has two layouts behind one hash route. The classic layout is a card list. A newer workspace layout sits behind a `/workspace` hash suffix and adds a provider rail, a detail panel with five tabs, and virtualised model search. The workspace layout is the richer reference surface.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Provider rail row | The workspace layout is open | One row per provider: an icon, the display name, a Local or Free badge, a secondary line with the model count, a default star, and a status dot |
| Rail status dot | Always, per row | Three states: disabled (inactive colour), ready (active colour), needs setup (warning colour) |
| Detail header | A rail row is selected | A back link to "All providers", the provider icon, the display name, a Local or Free badge, a remove action, and an enabled Switch. The Switch is disabled when the provider is the default |
| Detail tabs | A provider is selected | Overview, Models, Usage, an auth tab (Accounts or API Keys, only when the provider has an auth surface), and Settings. Arrow keys, Home, and End move focus between tabs |
| Overview tab | Default tab on selection | Provider summary, quota, and links to edit settings or view usage |
| Models tab | The user picks Models | A search field, a count of available models, and a list of model rows. Each row shows the model id, a Default flag on the provider's default model, a Selected flag when the model is in the enabled set, and a copy-id button |
| Models tab, loading | Models are being fetched | A status paragraph, no list |
| Models tab, load failed | The fetch failed | An alert with a Retry button |
| Models tab, empty | No default model and no available models | A muted paragraph, no search field |
| Models tab, no match | A search query matches nothing | A muted status paragraph |
| Models tab, virtual list | More than 40 models | The list virtualises with an estimated 36 px row height and 12 rows of overscan |
| Usage tab | The user picks Usage | Usage totals and the quota report for the provider |
| Accounts tab, OAuth surface | The provider authenticates by OAuth | A status dot and text (logged in email, or the login error, or "not logged in"), a Login or Logout button, an account list, and an Add account action |
| Accounts tab, login wait | A login is in flight | A spinner, a "waiting on the browser" line, and a link to reopen the auth page if it did not open |
| Accounts tab, account row | An account exists | A status dot (needs reauth, active, or normal), the account label, a Reauth badge or an Active badge, and a Remove action. The active row cannot be clicked again. A row mid-switch cannot be clicked |
| Accounts tab, codex pool | The provider is the Codex login pool | An embedded account-pool panel instead of the generic OAuth list |
| API Keys tab | The provider authenticates by key | A list of masked keys, each with a status dot, the masked value, an Active badge, and a Remove action. An Add key action opens a password field with Save and Cancel |
| Settings tab | The user picks Settings | An editable form for the provider record. Leaving the tab with unsaved changes asks for confirmation |
| Add provider, catalog | The user opens Add provider | A tiered catalog of presets (accounts, free, paid) plus a Custom provider option, ranked by 30-day usage |
| Add provider, preset form | A preset is chosen | A name, adapter, base URL, and auth fields pre-filled from the preset. A reserved Codex-forward preset skips the name and base URL requirement |
| Add provider, custom form | Custom provider is chosen, or `initialCustom` is set | The same form with empty fields and the `openai-chat` adapter as the default |
| Add provider, OAuth flow | The chosen preset uses OAuth | A Login button opens the provider's auth page in a new tab and polls login status every 2 s, up to 100 tries, then times out |
| Add provider, local-token import | The OAuth login call returns 200 with an empty URL | No browser opens. The panel shows the server's instructions text and keeps polling |
| Add provider, manual code | The OAuth flow supports a manual code | A code field with its own busy and message state, separate from the polling loop |
| Add provider, validation error | The name or base URL is missing on a non-reserved preset | An inline error text, no request sent |
| Add provider, save error | The POST to add the provider fails | The server's error text, or a generic failed-with-status message |
| Remove provider | The user confirms removal from the detail header | The provider record is deleted through `DELETE /api/providers` |

## Table 2. What a provider record and a model record hold

Read from the config route response and the workspace item type. Field names are the wire names.

**Provider record** (`providers.<name>` in the config, and the same shape from `GET /api/providers`): `adapter`, `baseUrl`, `hasApiKey`, `hasHeaders`, `defaultModel`, `authMode` (`key`, `oauth`, `forward`, or `local`), `keyOptional`, `disabled`, `note`, `codexAccountMode` (`direct` or `pool`, Codex-forward only), `models` (an explicit list, when the provider does not discover models live), `liveModels` (whether the model list comes from a live discovery call), `modelContextWindows`, `modelMaxOutputTokens`, `modelReasoningEfforts`, `modelInputModalities`, `modelReasoningSummaryDelivery`, `modelSupportsReasoningSummaries`, `allowPrivateNetwork`.

**Model record**, as the Models tab renders it: a model id string, a boolean derived by comparing the id to the provider's `defaultModel`, and a boolean derived by comparing the id against the enabled-model selection. The tab holds no other per-model fields; context window, output limit, and reasoning-effort facts live on the provider record, keyed by model id, not on a separate model object.

**Quota report** (`GET /api/provider-quotas`): `provider`, `label`, `source`, `updatedAt`, and a `quota` object. The `quota` shape varies: a five-hour and weekly percent pair with reset timestamps for OAuth account quotas, a weekly percent with an aggregation block for pooled Codex accounts, or a list of named custom windows with a percent and a reset time.

**API key entry** (`GET /api/providers/keys`): `id`, an optional `label`, `masked` (a redacted value, not the key), and `active`.

**OAuth account** (`GET /api/oauth/accounts`): `id`, an optional `email`, `active`, an optional `needsReauth`, and an optional `expiresAt`.

## Table 3. Management API routes for this page

Read from the server route registry. Every route needs an admin credential, a local-capability header, or a browser session; the dashboard's own requests carry the credential automatically.

| Route | Method | Purpose |
|---|---|---|
| `/api/config` | GET | The full provider config, keyed by provider name |
| `/api/providers` | GET, POST, PATCH, PUT, DELETE | List, add, patch, batch-replace, and remove providers. PUT is scoped to the GUI's JSON editor, not the card or workspace form |
| `/api/providers/test` | POST | Test a provider's connectivity and credentials |
| `/api/providers/reload` | POST | Reload provider config, gated to a local capability principal |
| `/api/provider-quotas` | GET | The quota report list |
| `/api/provider-request-pacing` | GET | Request pacing state per provider |
| `/api/provider-context-caps` | GET, PUT | Context-window caps per provider |
| `/api/provider-presets` | GET | The preset catalog for the Add provider modal |
| `/api/providers/keys` | GET, POST, DELETE | List, add, and remove API keys for a key-auth provider |
| `/api/providers/keys/active` | PUT | Switch the active key in the pool |
| `/api/providers/keys/alias` | PUT | Rename a key entry |
| `/api/providers/keychain` | GET, POST | Read or write the credential keychain |
| `/api/oauth/providers` | GET | The list of OAuth-capable provider ids |
| `/api/oauth/status` | GET | Login status for one provider |
| `/api/oauth/login` | POST | Start an OAuth login, browser or local-token flow |
| `/api/oauth/login/code` | POST | Submit a manual login code |
| `/api/oauth/login/cancel` | POST | Cancel an in-flight login |
| `/api/oauth/logout` | POST | Log out a provider |
| `/api/oauth/accounts` | GET, DELETE | List or remove OAuth accounts for a provider |
| `/api/oauth/accounts/active` | PUT | Switch the active account |
| `/api/oauth/accounts/alias` | PUT | Rename an account |
| `/api/oauth/accounts/pool` | GET, PUT, PATCH | The Codex login account pool |
| `/api/oauth/accounts/import` | POST | Import an account from a local token store |
| `/api/oauth/accounts/clear-cooldown` | POST | Clear a rate-limit cooldown on an account |
| `/api/providers/{provider}/alias` | PUT | Rename a provider |
| `/api/providers/{provider}/model-aliases` | PUT | Set model aliases for a provider |

A live query against the running dashboard confirmed the `GET /api/config`, `GET /api/oauth/providers`, `GET /api/provider-quotas`, and `GET /api/providers/keys` shapes above. The exact field values from that query are not reproduced here, because they carry the maintainer's own provider list and network addresses.

## Table 4. Sizes and values from the CSS source

Read from the workspace shell stylesheet. Values are literal where the source states a literal; a token name is given where the source uses a design variable instead of a literal.

| Element | Value |
|---|---|
| Workspace shell max width | 1440 px |
| Detail panel minimum height | 480 px |
| Rail-to-detail gap | the `--space-4` token |
| Search field left padding (icon space) | 32 px |
| Search field corner radius | the `--radius-sm` token |
| Rail status dot | 6 px by 6 px, fully round |
| Rail icon minimum box | the `--control-md` token, both axes |
| Auth row minimum width | 230 px |
| Auth row corner radius | the `--radius-sm` token |
| Auth row padding | 10 px |

**Unverified.** Hover, focus-ring, and transition timings do not appear as literal values in the files read for this document. A live pointer pass over the rendered page did not run this session, so exact colours and any animation timing are not recorded here.

## Parity checklist against Reeve's current Models settings

**Matches**

- Both list providers with a status indicator and open a detail view per provider.
- Both offer an Add provider flow from a preset catalog or a custom form.
- Both support key-based and OAuth-based auth, with a masked key list and an account list respectively.
- Both let the user set a default model.

**Lacks**

- Reeve's settings modal has no provider rail with a status dot, no default star, and no Local or Free badge.
- Reeve has no five-tab detail view (Overview, Models, Usage, Accounts or Keys, Settings) per provider.
- Reeve has no virtualised, searchable model list with copy-to-clipboard ids and Default or Selected flags.
- Reeve has no quota report per provider, and no usage tab.
- Reeve has no multi-account or multi-key pool with an explicit active row and a switch action.
- Reeve has no manual-code path for an OAuth login that needs one.

**Differs**

- OMP stores provider and model records in `models.yml`, read through OMP's own registry, and credentials in OMP's SQLite auth store through `AuthStorage`. The reference stores both in one JSON config file plus its own keychain, served through its own admin API.
- The reference bundles context window, output limit, reasoning-effort, and modality facts onto the provider record, keyed by model id. OMP's model roles and enabled-model scope are a separate configuration layer in `config.yml`, described in this repository's agent instructions.
- The reference's Default provider and Default model are two different ideas: a `defaultProvider` field in the config, and a per-provider `defaultModel` field. OMP has no default provider concept; its nearest equivalent is the `default` role.

## What only a live run can settle

- The rendered colours, hover states, and any transition timing on the rail, the tabs, and the auth rows.
- The exact wording of every string in the page; this pass read the component logic, not the full string table.
- The drag or keyboard behaviour, if any, for reordering providers in the rail.
- Whether the classic card layout and the workspace layout share every API call, or whether the classic layout uses a narrower set.
- The visual states of the busy spinner, the switching badge, and the reauth badge side by side.
- The full preset catalog contents served by `/api/provider-presets` on a given install.

## Note on scope

This pass covered the GUI source and the server route registry in full for the files most relevant to the reference page, and confirmed four endpoint shapes live. Given the token budget for this ticket, the full string table (as Table 2 in the session-11 research document), the classic card layout's own markup, and a live pointer-driven UI pass were not completed. They are the most useful next steps for a full parity pass.
