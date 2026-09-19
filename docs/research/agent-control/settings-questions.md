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

Evidence pending.

### Ownership and persistence

Evidence pending.

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

