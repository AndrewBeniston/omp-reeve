# Settings, approval state, questions, and option pickers

## Status

This report contains evidence only.

The mapping worker will complete the mapping sections.

## Scope

This report inventories the Codex Desktop settings control surface.

This report also inventories the question and option picker surface.

This report excludes every other application control surface.

Ticket 444 covers the complete inventory.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected its main process, renderer, tool schemas, setting definitions, and transcript adapters.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Settings and approval state

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `read_settings` | The Desktop tool builder adds it to the app namespace. | Its schema teaches settings and configuration inspection. |
| `write_settings` | The Desktop tool builder adds it to the same namespace. | Its schema teaches settings and configuration updates. |
| `settings-read` | The main process registers this host request. | The agent does not receive this request directly. |
| `settings-write` | The main process registers this host request. | The agent does not receive this request directly. |
| `config/batchWrite` | The configuration write path sends this app server request. | The agent learns only the enclosing tool. |

A feature gate controls both tools.

The gate key has the value `settings_tools`.

The tool builder adds no settings tool when the gate is off.

The tool builder also requires a local desktop host.

`write_settings` needs two more conditions.

The task mode must be the default mode.

The thread start kind must also be the default kind.

Both tools belong to the eager tool set.

Therefore the agent receives both schemas at thread start.

The agent does not need a tool search for either tool.

### Actions, state, and identity

`read_settings` returns four parts of the application settings state.

It returns the settings file path.

It returns the configured values.

It returns the effective values after defaults.

It returns the machine-readable setting definitions.

Each definition carries a key, a description, a default, a schema, and an agent access level.

The application defines 90 settings in total.

Fifty five settings use the `read-write` access level.

Four settings use the `read-only` access level.

Thirty one settings use the `hidden` access level.

The definition list excludes every hidden setting.

Therefore the agent can inspect 59 settings.

The `include_config` argument adds the thread agent configuration.

The `scope` argument selects the user scope or the project scope.

The default scope is the user scope.

The configuration view returns the scope and the configuration file path.

It returns the configured values and the effective values.

It returns the allowed values for approval policy, sandbox mode, and web search.

It returns the locked keys and a disabled reason.

The effective approval policy can be `untrusted`, `on-request`, or `never`.

The effective sandbox mode can be `read-only`, `workspace-write`, or `danger-full-access`.

The effective web search mode can be `disabled`, `cached`, `indexed`, or `live`.

The `indexed` mode needs app server version 0.142.0-alpha.6 or later.

An unset approval policy reads as `on-request`.

An unset sandbox mode reads as `read-only`.

An unset reasoning summary reads as `auto`.

An unset web search mode reads as `live` under full access.

An unset web search mode reads as `cached` otherwise.

`write_settings` accepts two separate payloads.

The `settings` payload updates ordinary application settings.

The `config` payload updates the agent configuration.

One call cannot carry both payloads.

The configuration payload accepts six keys only.

| Configuration key | Accepted values |
| --- | --- |
| `approval_policy` | `on-request` or `never` |
| `sandbox_mode` | `read-only`, `workspace-write`, or `danger-full-access` |
| `sandbox_workspace_write.network_access` | a boolean |
| `web_search` | `disabled`, `cached`, `indexed`, or `live` |
| `model_verbosity` | `low`, `medium`, `high`, or null |
| `model_reasoning_summary` | `auto`, `concise`, `detailed`, `none`, or null |

The write tool cannot set the `untrusted` approval policy.

The configuration payload needs at least one key.

A settings write validates each key against the definition list.

A settings write rejects any key without `read-write` access.

A settings write returns the configured values and the effective values.

A configuration write returns a confirmation that the configuration changed.

It also returns the scope and a flag that a new thread is necessary.

A setting has a stable string key as its identity.

A configuration value has a key path as its identity.

Neither call returns a handle or a session identifier.

A configuration write sends a batch of edits to the app server.

Each edit carries a key path, a value, and a merge strategy.

A null value replaces the entry.

A non-null value upserts the entry.

The batch carries the target file path and the expected file version.

### Ownership and persistence

The main process owns one settings store for the application.

No window owns the settings store.

Therefore every window and every task reads the same values.

A setting definition names one of three storage kinds.

The kinds are host configuration, host global state, and a persisted atom.

Every kind survives a renderer reload and a reconnect.

The agent configuration is stored in configuration files instead.

The user scope uses the user configuration file.

The project scope uses a project configuration file inside the project.

A configuration change applies to new threads.

The current thread keeps its existing configuration.

Therefore a configuration change does not transfer into the running turn.

The confirmation request is keyed by the conversation.

One conversation holds one pending confirmation at a time.

A second request for the same conversation resolves as a refusal.

The renderer can also subscribe to confirmations for a host and thread pair.

That subscription answers confirmations by key.

This second path supports a confirmation outside the requesting window. This statement is an inference.

A completed turn cancels the pending confirmation.

An aborted tool call also cancels the pending confirmation.

A successful write invalidates the cached settings and configuration queries.

### Transcript rendering and human access

Evidence pending.

### Instructions, permissions, and gating

Evidence pending.

### Failure and unavailable states

Evidence pending.

## Questions and option pickers

### Registration and discovery

Evidence pending.

### Question requests and responses

Evidence pending.

### Option and free-text results

Evidence pending.

### Ownership and persistence

Evidence pending.

### Transcript rendering and human access

Evidence pending.

### Instructions, permissions, and skip path

Evidence pending.

### Failure and unavailable states

Evidence pending.


