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

`write_settings` needs one more condition.

The task mode and the thread start kind must both be the default value.

A thread start kind that requests every tool also satisfies that condition.

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

The transcript adapter converts each settings call into a generic tool activity.

The activity carries the call identifier, the namespace, the tool name, and the arguments.

The activity also carries a completed flag.

The adapter attaches result content for two other Desktop tools only.

Therefore the settings result text does not render in the activity.

The adapter defines no settings-specific activity type.

The adapter defines no settings-specific presentation metadata.

The adapter hides two other Desktop tools from the transcript.

The adapter does not hide either settings tool.

The transcript activity offers no action that opens the Settings screen.

The human must open the Settings screen from the application instead.

A configuration write shows a separate confirmation request to the human.

The human answers that request with an approval or a refusal.

### Instructions, permissions, and gating

The `read_settings` schema teaches inspection before a suggestion or a change.

The `write_settings` schema teaches six instructions.

It teaches the tool instead of a terminal edit for a supported setting.

It teaches that one call cannot carry settings and configuration together.

It teaches a settings read before a write.

It teaches that a configuration change needs user confirmation.

It teaches that a configuration change applies to new threads.

It teaches a short confirmation of the new values and the scope after a write.

The schema also teaches the human route for project configuration.

That route is the desktop Settings screen or the project configuration file.

An application settings write needs no user approval.

A configuration write always requests a confirmation from the human.

The confirmation request needs three conditions.

The task must have loaded state.

Two task mode values must both be the default value.

The task kind must not be an automation kind.

Two automation kinds are refused.

Managed policy can lock a configuration key.

Four origins lock a key.

Those origins are device management, session flags, and two legacy managed configuration sources.

The installation can also restrict the allowed approval policy values.

The installation can restrict the allowed sandbox mode values.

The installation can restrict the allowed web search mode values.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Non-local task | Both tools report that settings tools support local threads only. |
| Invalid arguments | The tool returns an unsuccessful result and names itself. |
| Settings store unavailable | The host request reports an unavailable settings store. |
| Unknown setting key | The write names the unknown setting. |
| Setting without write access | The write reports that Codex cannot write the setting. |
| Both payloads in one call | The write asks for separate calls. |
| Project configuration write | The write reports that chat cannot change project configuration. |
| Automation task | The write asks the human to make the change from the main chat. |
| Unloaded task state | The write asks the human to open the task in the desktop application. |
| Missing configuration file | The write reports that no configuration exists for the scope. |
| Disabled configuration layer | The write reports that the configuration is unavailable. |
| Managed configuration key | The write names the managed key and refuses. |
| Restricted approval policy | The write reports an installation restriction. |
| Restricted sandbox mode | The write reports an installation restriction. |
| Restricted web search mode | The write reports an installation restriction. |
| Unwritable configuration layer | The write reports that the configuration cannot be written. |
| Refused confirmation | The write reports that the user did not approve the change. |
| Second pending confirmation | The request resolves as a refusal at once. |
| Completed turn during confirmation | The confirmation resolves as a refusal. |
| Aborted tool call | The tool returns no result for that call. |

## Questions and option pickers

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `request_user_input_async` | The core app server registers this tool. | The core tool schema teaches the question call. |
| `request_option_picker` | The Desktop tool builder adds it to a gated onboarding set. | Its schema teaches an option choice in the onboarding flow. |
| `request_onboarding_input` | The same onboarding set. | Its schema teaches one to three structured onboarding questions. |
| `setup_codex_step` | The same onboarding set. | Its schema teaches the three native setup steps. |
| `request_environment_input` | The app server sends it as a tool call. | The agent learns the tool from the environment setup flow. |
| `item/tool/requestUserInput` | The app server sends this client request. | The agent does not receive this request directly. |
| `item/tool/requestOptionPicker` | The app server sends this client request. | The agent does not receive this request directly. |
| `item/tool/requestSetupCodexContextPicker` | The app server sends this client request. | The agent does not receive this request directly. |
| `mcpServer/elicitation/request` | An MCP server sends this client request. | The agent learns only the MCP tool. |

The desktop bundle does not define the schema of the core question tool.

Therefore the core app server owns that schema. This statement is an inference.

A feature gate controls the three onboarding tools.

The gate key names interactive onboarding tools.

The tool builder also adds them when the thread start kind requests every tool.

The tool builder removes them for the conversational onboarding kind.

The tool builder also removes them for the environment setup kind.

All three onboarding tools belong to the eager tool set.

The renderer dismisses the context picker request without human input.

It answers that request with a dismiss action and an empty source list.

### Question requests and responses

The user input request carries a thread identifier, an item identifier, and a turn identifier.

The request carries one or more questions.

Each question carries an identifier, an optional header, and the question text.

Each question carries a free-text flag and a secret flag.

Each question carries a list of options.

Each option carries a label and an optional description.

The request also carries a blocking flag.

The request can also carry an explicit auto-resolution window.

The response is a map from each question identifier to a list of answers.

The client omits a question with no answer from that map.

An empty map means that the human answered nothing.

The option picker request carries a thread identifier and a turn identifier.

It carries one question and a list of options.

It carries a flag that permits more than one selection.

It carries an optional submit label and an optional skip label.

The option picker response carries three fields.

It carries an action, a list of selected options, and one free-text answer.

The dismiss action value is `dismiss`.

A dismissed picker returns an empty selection and a null free-text answer.

The onboarding input tool accepts one to three questions.

Each of those questions needs an identifier, a question, and at least two options.

The option picker tool needs a question and a list of options.

The dynamic tool path returns the picker response as text.

That text is the JSON form of the response.

That result reports success.

### Option and free-text results

A question can offer options, free text, or both.

The free-text flag marks a question that accepts typed text.

The secret flag marks a question whose answer must stay hidden.

The option picker returns the selected options as a list.

The picker returns one free-text answer beside that list.

The multiple-selection flag decides whether the list can hold more than one option.

The chat surface uses a separate question widget.

That widget names two categories of question request.

Each widget question carries the question text and a list of option labels.

Each widget question carries a free-text placeholder.

Each widget question declares a single selection type or a multiple selection type.

The widget answer is recorded on the answering message as response metadata.

That metadata names the original request identifier.

A pending widget request records a blocking flag and an expiry time.

It also records the question identifiers, the request identifier, and a pending status.

### Ownership and persistence

The app server connection owns the pending question record.

One connection serves one host.

The record is keyed by the conversation.

A second record for the same conversation replaces the first record.

A reverse map returns the conversation for a request identifier.

Both maps are held in memory only.

Therefore a pending record does not survive an application restart. This statement is an inference.

Each window registers itself with the tracker as a surface.

The tracker holds the focus state of every surface.

The tracker also holds which surfaces present each conversation.

A destroyed surface is removed from both sets.

A resolved server request stops the tracking.

The answer travels back through the app server connection.

Therefore any window that presents the conversation can answer the question.

An async question keeps a stable identity inside the turn.

That identity combines the question tool name, the source item identifier, and the question index.

Therefore the identity survives a renderer reload of the same turn.

The tracker broadcasts every record change to every window.

### Transcript rendering and human access

A user input request renders as a dedicated question activity.

That activity carries the request identifier, the call identifier, and the turn identifier.

It carries the full question list and a completed flag.

An async question renders as one assistant message for each question.

Each of those messages carries the source item identifier and the question index.

Each of those messages carries the question title as its content.

A feature flag controls that per-question rendering.

Without that flag the turn renders one ordinary assistant message.

An async question does not count as the final answer of the turn.

An option picker request produces no transcript item.

The picker renders as a separate request surface instead.

The human answers each surface in place.

The transcript offers no action that reopens an answered question.

Telemetry records four picker events.

Those events are shown, dismissed, timed out, and selected.

The selection event records the chosen item and its position.

### Instructions, permissions, and skip path

A setting controls whether Codex can ask a question outside Plan mode.

The default value of that setting permits the question.

The agent can read and write that setting.

A false value disables the matching question feature for the default mode.

The onboarding tool schemas teach their own narrow use.

One schema teaches an option choice inside the onboarding flow.

One schema teaches one to three concise onboarding questions.

One schema teaches the three steps of the native setup flow.

A question needs no separate user approval.

The picker offers an explicit skip label for the skip path.

A skip returns the dismiss action with an empty selection.

The tracker can also resolve a question without any human answer.

A blocking request is never resolved by the tracker.

A request with an explicit window starts a countdown at once.

That window must be between 5,000 and 300,000 milliseconds.

A request without a window waits for inactivity when a focused surface presents the conversation.

The inactivity period is 60,000 milliseconds.

The countdown after that period is 90,000 milliseconds.

A conversation with no focused presenting surface starts the 90,000 millisecond countdown at once.

Human activity in the conversation restarts the inactivity period.

A countdown expiry submits an empty answer map for a user input request.

A countdown expiry declines an MCP elicitation request instead.

A snooze cancels the deadline of a request without an explicit window.

A snooze restarts the countdown of a request with an explicit window.

An automation-owned thread snoozes each non-blocking request without an explicit window.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Missing thread identifier | The client logs an error and drops the request. |
| Wrong request method for an answer | The client logs an error and sends no response. |
| Invalid onboarding tool arguments | The tool returns an unsuccessful result and names itself. |
| Invalid picker arguments | The tool returns an unsuccessful result and names itself. |
| Completion step of the setup tool | The client presents no request surface. |
| Abandoned conversation, user input | The client answers with an empty answer map. |
| Abandoned conversation, option picker | The client answers with a dismiss action. |
| Abandoned conversation, MCP elicitation | The client declines the request. |
| Countdown expiry, user input | The connection answers with an empty answer map. |
| Countdown expiry, MCP elicitation | The connection declines the request. |
| Unsafe MCP elicitation approval | The client raises an error and sends no approval. |
| User verification elicitation with an approval | The client sends no response. |
| Context picker request | The client dismisses the request at once. |
| Follower stream role | The client forwards the answer to the owning task. |
| Unknown pending request | The answer path returns without an effect. |






