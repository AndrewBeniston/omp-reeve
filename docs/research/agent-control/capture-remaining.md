# Capture surfaces and remaining registered services

## Status

This report contains evidence only.

This report covers one surface of the agent application control research.

The mapping worker will map these findings later.

## Scope

This report covers screen capture and application capture available to the Codex Desktop agent.

This report also sweeps every remaining registered service that a sibling report does not claim.

This report excludes Browser control.

This report excludes terminal, files, review, side chat, sub-agents, panel placement, settings, questions, goal state, and session lifecycle.

Sibling reports cover those surfaces.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected its main process bundle, its renderer bundle, and its named feature chunks.

I read tool schemas, service registrations, tool dispatchers, and transcript adapters.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Capture surfaces

Codex Desktop exposes one capture tool to the agent.

The tool has the name `capture_screen_context`.

The application calls its capture system Appshots.

The agent cannot start an Appshot outside a voice chat.

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `capture_screen_context` | The Desktop tool builder adds it to the `codex_app` namespace. | Its schema teaches the agent to read the foreground application. |
| `appshot` | The main process registers this window host service. | The agent does not receive this service directly. |
| `computer-use-frontmost-window` | The renderer requests this target lookup before a capture. | The agent does not receive this lookup directly. |

The Desktop tool builder adds the tool only for a voice thread start kind.

The builder accepts the kinds `all` and `realtime_voice`.

The builder also accepts an existing thread when a voice feature override is present.

The builder adds the tool only when the host is a desktop host.

The builder adds the tool only when Appshots are available and enabled.

The tool can arrive as a deferred tool.

A deferred tool loads its schema only when the model needs it.

### Enablement and permission

Four separate conditions control availability.

1. The platform must be macOS or Windows.
2. A capture feature flag must be active for the account.
3. The host configuration must not forbid Appshots.
4. The user setting for screen context must be on.

Windows adds a fifth condition.

Windows requires a native capture bridge that reports support.

The user setting has the name screen context.

The voice chat settings own that setting.

A voice onboarding step can request the setting and the operating system permission.

The tool refuses the call on macOS when the setting is off.

The refusal text asks the user to enable screen context in voice chat settings.

### Actions and returned identity

The tool takes no arguments.

The tool first checks the active voice session.

The session must be active for the calling task on the calling host.

The tool then selects one of two routes.

Route one applies when the Codex window is the focused window.

Route one returns application state and returns no image.

The state contains the current page kind and the right panel state.

The page kind is `thread`, `home`, `settings`, or `other`.

For a thread page the state also returns the task identifier and the task title.

The state also returns whether the right sidebar is open.

The state also returns the list of right panel Tabs and the focused Tab.

Route two applies when another application is in front.

Route two finds the frontmost window of the other application.

Route two then captures a screenshot and the accessibility text of that window.

The result returns one text item and one image item.

The text item contains the accessibility text of the captured window.

The image item contains the screenshot as a data URL.

The tool returns no capture identifier.

The tool returns no handle that a later call can reuse.

Therefore no capture identity survives reload, reconnect, or transfer.

The application stores the accessibility text as an Appshot context on the composer input.

That context belongs to the pending input and not to a durable record.

Windows uses a different capture sequence.

Windows prepares a capture, loads a source image, and completes the capture.

The Windows tool description states that capture outside Codex is not supported.

### Ownership

The voice session owns the tool.

The voice session binds to one host and one task.

The tool rejects a call from another task.

The tool rejects a call after the voice session stops.

The focused window decides the route.

The main process owns the Appshot hotkey service.

The hotkey service belongs to the application and not to one task.

### Instructions

The tool schema is the main instruction.

The schema restricts the tool to an active voice chat.

The schema forbids the tool in a normal text conversation.

The schema forbids the tool after a voice chat ends.

The schema names example triggers such as a visible message thread or a visible booking.

The schema orders the model not to guess screen details.

A voice session instruction repeats the rule.

That instruction names the deferred voice tools and orders the model to respect screen context settings.

A voice end instruction orders the model to stop loading the tool after the call ends.

### Transcript rendering and human access

The call enters the transcript as a dynamic tool call item.

The transcript adapter renders it as generic tool activity.

The adapter applies no capture specific presentation.

The adapter does not hide the tool.

No surface metadata key accompanies the result.

The result carries no link that opens a capture viewer.

Therefore the human cannot open the captured window from the activity.

The application logs the dispatch and the delivery of the result.

The logs record only the call identifier, the task identifier, and the elapsed time.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Invalid arguments | The tool reports invalid arguments. |
| No active voice session | The tool reports that screen context needs an active voice chat. |
| Voice session for another task | The tool reports the same restriction. |
| Screen context setting off on macOS | The tool asks the user to enable the setting. |
| Non-macOS host with another application in front | The tool reports that outside capture is unsupported on the device. |
| No foreground application found | The tool reports that it could not find an application to capture. |
| Host forbids Appshots | The tool reports that screen context is unavailable on the host. |
| Capture returns no image | The tool reports that it could not capture the application. |
| Capture throws an error | The tool reports the same capture failure. |
| Application state read failure | The tool reports that it could not read the Codex application state. |
| Windows bridge missing | The builder omits the tool. |
| Appshot permission abandoned | The onboarding records an abandoned permission result. |

## Visualizations

Evidence pending.

## Remaining registered services

### Window host services

Evidence pending.

### Remaining Desktop tools

Evidence pending.

### Dynamic tool namespaces

Evidence pending.

### Remaining application commands

Evidence pending.

## Unverified items

Evidence pending.
