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

### Human-initiated capture

The human can start a capture without the agent.

The main process registers a global capture hotkey.

The hotkey service reads the configured hotkey from stored application state.

The service reports a supported flag, the configured hotkey, and an active flag.

A key press sends a capture message to the primary window.

The service chooses one of two messages.

One message adds the capture to the current task.

The other message starts a new chat with the capture.

A destination setting controls that choice.

The setting accepts an automatic value.

The window must also report that it can accept the capture shortcut.

The service skips the capture when no primary window exists.

The service also skips the capture when the primary window is destroyed.

The capture becomes an Appshot context on the composer.

The composer sends the Appshot context to the model as structured text.

That text names the application, the bundle identifier, and the window title.

That text also names the image and contains the accessibility tree.

The composer sends the screenshot as a separate image attachment.

Therefore the agent reads a human capture as ordinary input.

The agent receives no capture tool result for a human capture.

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

The agent has no visualization tool.

The agent creates a visualization by writing a file.

The application detects the write and renders a visualization activity.

### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `visualizations` | The main process registers this window host service. | The agent does not receive this service directly. |
| Visualization activity detection | The transcript adapter inspects each file change. | The agent learns nothing about the detection. |

A bundled skill teaches the model when to build a visualization.

The skill is called visualize.

The skill description tells the model to show how something works.

The skill description tells the model to compare options or explore a change.

The skill description tells the model to use standard tools for a static scientific figure.

### Actions and returned identity

The application reserves a visualization directory inside the Codex home directory.

The path adds the year, the month, the day, and the task identifier.

The application grants that directory as a writable root for the turn.

It grants the root only when the sandbox policy allows workspace writes.

The adapter marks each detected file as `create` or `update`.

A create result outranks an update result for the same file in one change set.

The file path is the identity.

The path contains the owning task identifier.

Therefore the identity survives reload because the file stays on disk.

The identity does not transfer to another task.

### Ownership

The visualization directory belongs to one task.

The service resolves the working directory for a local task only.

The service returns no working directory for a cloud chat task.

The window host owns the service instance.

### Transcript rendering and human access

The change renders as a patch activity.

The patch activity carries a list of visualization activities.

Each entry holds the file path and the change kind.

An assistant message can also reference a visualization source path.

The application reads the file through the visualization service to share a thread.

The sharing path refuses a file above the size limit.

The human can therefore open the visualization from the activity.

### Failure and unavailable states

| State | Verified result |
| --- | --- |
| Service missing | The sharing path returns no visualization. |
| File missing | The read returns nothing. |
| File above the size limit | The application reports the limit and drops the file. |
| Read error | The application returns no visualization and continues. |
| Non-workspace-write sandbox | The application grants no temporary visualization root. |

## Remaining registered services

### Window host services

The main process builds one application host object for each renderer window.

That object is the complete window host service registry.

I counted about ninety service keys in the current build.

The agent never calls a host service directly.

The renderer calls a host service while it serves an agent tool.

Sibling reports claim the `terminal`, `contentTabs`, `detachedWindows`, and `workspaceFiles` services.

The table below names every remaining service key.

| Service key | Apparent purpose |
| --- | --- |
| `httpFetch` | Performs outbound HTTP requests for the window. |
| `websitePreviews` | Produces website preview data. |
| `pluginIncentives` | Tracks plugin promotion state. |
| `ambientSuggestions` | Supplies ambient suggestion content. |
| `applicationMenu` | Controls the native application menu. |
| `customRuntime` | Reserved and unset in this build. |
| `appActions` | Queues application commands for the agent. |
| `clientCoordination` | Coordinates several renderer clients. |
| `threadReadState` | Tracks the read state of each task. |
| `statsig` | Reads feature flag values. |
| `statsigEvaluations` | Publishes flag evaluation results. |
| `settings` | Reads and writes application settings. |
| `configSettingsWriteConfirmations` | Confirms a configuration write. |
| `workModeAccess` | Gates work mode access. |
| `appInfo` | Reports application version information. |
| `accessInputs` | Handles access input prompts. |
| `installerAttribution` | Reports the install source. |
| `artifactDocuments` | Manages artifact documents. |
| `artifactSessions` | Manages artifact viewer sessions. |
| `avatarOverlay` | Controls the avatar overlay window. |
| `appUpdates` | Checks and applies application updates. |
| `realtimeVoiceRuntime` | Runs the realtime voice runtime. |
| `browserProfileImport` | Imports a browser profile. |
| `browserHost` | Hosts the in-application browser. |
| `browserTabs` | Lists and controls browser Tabs. |
| `browserAutocomplete` | Supplies browser address suggestions. |
| `browsingHistory` | Reads browsing history. |
| `debug` | Opens debug windows. |
| `demoTools` | Supplies demonstration tooling. |
| `downloads` | Tracks file downloads. |
| `dynamicToolCalls` | Routes dynamic tool calls to the renderer. |
| `fileDrags` | Handles file drag operations. |
| `tabDragPreview` | Draws a Tab drag preview. |
| `hotkeyWindowCommands` | Runs hotkey window commands. |
| `hotkeyWindowHotkeys` | Registers hotkey window hotkeys. |
| `inAppBrowserIncompleteNavigation` | Reports an incomplete browser navigation. |
| `keyboardModifiers` | Reports keyboard modifier state. |
| `shortcutCapture` | Captures a keyboard shortcut from the user. |
| `libraryFiles` | Reads library files. |
| `localEnvironments` | Lists local environments. |
| `managedWorktrees` | Creates and lists managed worktrees. |
| `projects` | Lists and orders projects. |
| `projectFolderConsent` | Requests consent for a project folder. |
| `sshConnectionRegistration` | Registers a remote connection. |
| `projectlessWorkspace` | Manages a workspace without a project. |
| `executionPaths` | Resolves execution paths. |
| `localThreadCatalog` | Reads the local task catalog. |
| `localAutomationsScheduler` | Schedules local automations. |
| `appshot` | Runs the capture hotkey and capture updates. |
| `lsp` | Runs language server features. |
| `browserUsePermissions` | Reads browser use permissions. |
| `browserPluginConfig` | Reads browser plugin configuration. |
| `conversationalOnboarding` | Drives conversational onboarding. |
| `customAvatars` | Manages custom avatars. |
| `fileAttachments` | Manages file attachments. |
| `github` | Runs Git and GitHub operations. |
| `dictationAudio` | Captures dictation audio. |
| `systemAudioSpectrum` | Reports the system audio spectrum. |
| `dictationHistory` | Stores dictation history. |
| `owlFeatures` | Reports browser feature state. |
| `owlBrowserCrashCounter` | Counts browser crashes. |
| `primaryRuntime` | Reports the primary runtime. |
| `localAutomations` | Reads and writes local automations. |
| `quickChatWindow` | Controls the quick chat window. |
| `pluginScheduledTasks` | Runs plugin scheduled tasks. |
| `chromeNativeHost` | Talks to the browser native host. |
| `chromiumBrowser` | Controls an external browser. |
| `chatGptProjectFiles` | Reads project files from the account. |
| `chatGptBrowserSession` | Manages the account browser session. |
| `chronicle` | Records screen history on macOS. |
| `performanceTelemetry` | Reports performance telemetry. |
| `pinnedThreads` | Reads and writes pinned tasks. |
| `processMemory` | Reports process memory. |
| `clipboard` | Reads and writes the clipboard. |
| `computerUseSettings` | Reads computer use settings. |
| `pullRequestMessageGeneration` | Generates a pull request message. |
| `textGeneration` | Generates short text. |
| `realtimeContinuity` | Keeps voice continuity state. |
| `realtimeMemory` | Stores voice memory. |
| `realtimeVoiceHistory` | Stores voice history. |
| `realtimeVoiceMultiAgentActivity` | Reports multi-agent voice activity. |
| `realtimeVoice` | Controls the voice session. |
| `realtimeVoicePresentation` | Controls voice presentation. |
| `requestUserInputAutoResolution` | Resolves a user input request automatically. |
| `userVerification` | Verifies the user. |
| `remoteControlEnvironments` | Lists remote control environments. |
| `remoteHostedPIP` | Controls a hosted picture in picture view. |
| `startup` | Reports startup state. |
| `notificationPermissionsSupported` | Reports notification permission support. |
| `systemPermissions` | Reads operating system permissions. |
| `systemFonts` | Lists system fonts. |
| `threadArchive` | Archives and restores a task. |
| `threadMetadataGeneration` | Generates task metadata. |
| `threadMetadata` | Reads task metadata. |
| `threadProjectAssignments` | Assigns a task to a project. |
| `threadTurnSummaries` | Stores turn summaries. |
| `triggers` | Reads trigger subscriptions. |
| `tracing` | Controls tracing sample rates. |
| `hostedThreadFiles` | Reads files for a hosted task. |
| `environmentConfigs` | Reads environment configurations. |
| `mcpAppSandbox` | Hosts an MCP application sandbox. |
| `visualizations` | Reads visualization files and temporary roots. |
| `codexMicro` | Controls the compact window. |
| `notifications` | Sends desktop notifications. |
| `openIn` | Opens a path in an external application. |
| `windowNavigation` | Navigates a window. |

This list is source-verified.

The purpose column is an inference from each service name and constructor.

### Remaining Desktop tools

The Desktop tool builder produces one namespace called `codex_app`.

The builder can mark any tool as deferred.

Sibling reports claim `open_in_codex`, `read_thread_terminal`, and the task lifecycle tools.

The table below names every remaining Desktop tool.

| Tool name | Gate | Action |
| --- | --- | --- |
| `create_worktree` | Managed worktrees available and thread tools enabled | Creates a managed Git worktree and attaches it to the task. |
| `attach_artifact` | Pull request association enabled | Attaches a pull request to the task. |
| `remove_artifact` | Pull request association enabled | Removes an attached pull request. |
| `list_artifacts` | Pull request association or worktrees enabled | Lists every attachment on the task. |
| `update_running_summary` | Running summary enabled | Updates the short status on the activity pill. |
| `automation_update` | Desktop and local desktop host | Creates, views, updates, or deletes an automation. |
| `request_environment_input` | Environment setup or full thread start | Requests an approved environment configuration. |
| `finalize_environment` | Environment setup or full thread start | Finalizes a simulated cloud environment. |
| `fire_confetti` | Toys availability | Fires confetti in the focused main window. |
| `navigate_to_codex_page` | Desktop, local host, and navigation enabled | Navigates the focused main window to a task or chat. |
| `list_hosts` | Project tools enabled | Lists the local host and enabled remote hosts. |
| `create_project` | Project tools enabled | Creates a local or remote project. |
| `get_usage_limits` | Account sign-in complete | Reads usage limits for the signed-in account. |
| `consume_usage_reset` | Account sign-in complete | Redeems one usage reset credit. |
| `share_thread` | Thread sharing enabled | Creates an immutable share link. |
| `load_workspace_dependencies` | Local host with the workspace dependencies experimental feature enabled | Reports bundled runtime paths. |
| `read_settings` | Local host with the settings feature | Reads settings and setting definitions. |
| `write_settings` | Local host with the settings feature | Updates settings or thread configuration. |
| `get_thread_emoji` | Thread emojis enabled | Reads the emoji beside a task. |
| `set_thread_emoji` | Thread emojis enabled | Sets the emoji beside a task. |
| `create_sidebar_section` | Custom sidebar sections enabled | Creates a sidebar section. |
| `rename_sidebar_section` | Custom sidebar sections enabled | Renames a sidebar section. |
| `delete_sidebar_section` | Custom sidebar sections enabled | Deletes a sidebar section. |
| `move_project_to_sidebar_section` | Custom sidebar sections enabled | Moves a project between sections. |
| `move_thread_to_sidebar_section` | Custom sidebar sections enabled | Moves a task between sections. |
| `reorder_section` | Custom sidebar sections enabled | Reorders items inside a section. |
| `reorder_sidebar_projects` | Custom sidebar sections enabled | Reorders unpinned projects. |
| `reorder_sidebar_sections` | Custom sidebar sections enabled | Reorders sidebar sections. |
| `set_thread_pinned` | Custom sidebar sections disabled | Pins or unpins a task. |
| `get_handoff_status` | Thread tools enabled | Reads the status of a handoff operation. |
| `request_option_picker` | Onboarding tool set active | Asks the user to pick options during onboarding. |
| `request_onboarding_input` | Onboarding tool set active | Asks for onboarding input. |
| `setup_codex_step` | Onboarding tool set active | Advances the native setup flow. |
| `complete_conversational_onboarding_task` | Conversational onboarding start | Reports a conversational onboarding outcome. |
| `complete_sidebar_onboarding_checklist_task` | Sidebar checklist start | Reports a checklist task outcome. |

The gate column is source-verified from the builder conditions.

Each tool description is the only instruction that teaches the model when to call it.

Each call renders as a dynamic tool call activity in the transcript.

The transcript hides `update_running_summary` and `load_workspace_dependencies`.

The transcript gives `automation_update`, `create_thread`, and `handoff_thread` a special activity.

Every other tool in this table uses the generic tool activity.

Therefore the human cannot open the controlled surface from most of these activities.

### Dynamic tool namespaces

The renderer wraps the Desktop tools in one namespace.

The namespace has the name `codex_app`.

The builder reports that the Session supports dynamic tool namespaces.

The builder can add further namespaces.

| Namespace name | Condition | Tools |
| --- | --- | --- |
| `codex_app` | Always for a desktop Session | Every Desktop tool above. |
| `plugin_management` | The plugin management connector is enabled | `uninstall_plugin`. |
| `openai_settings` | The settings connector is enabled instead | `uninstall_plugin`. |

The plugin namespace tool always loads as a deferred tool.

Two feature override keys change the Desktop tool set.

The key `thread_tools` adds the task tool group.

The key `settings_tools` adds the settings tools.

The application requests the tool set through a thread start event.

The main process routes the request to the primary ready renderer.

The renderer builds the tool set within a five second budget.

A slow lookup falls back to a smaller set.

A build failure returns an empty tool set.

### Remaining application commands

The renderer defines seven application commands.

The Desktop action host runs a command in the primary window.

The host can also queue a command for a task in the primary window.

| Command name | Agent path | Effect |
| --- | --- | --- |
| `windows.tabs.open` | `open_in_codex` | Opens a panel Tab. A sibling report covers it. |
| `windows.fire_confetti` | `fire_confetti` | Fires confetti in the current window. |
| `windows.show_thread` | `navigate_to_codex_page` | Navigates the current window to a task or chat. |
| `app.get_summary` | `capture_screen_context` | Returns the current page and right panel state. |
| `windows.show_home` | None | Shows the home page from a human command. |
| `windows.sidebar.toggle` | None | Toggles the sidebar from a human command. |
| `windows.terminal.toggle` | None | Toggles the Terminal from a human command. |
| `windows.review.toggle` | None | Toggles Review from a human command. |

Four commands have no agent path in this build.

The human reaches those four through the command palette or a keyboard shortcut.

`navigate_to_codex_page` resolves the task kind before it runs the command.

The kind is a Codex task or an account chat.

The tool returns only a navigated flag.

The tool returns no Tab identifier and no window identifier.

`fire_confetti` returns a fired flag.

Its schema orders the model to claim success only when that flag is true.

Both tools report a failure message when the action host is missing.

The message states that application actions are unavailable in the host.

## Unverified items

I did not perform a live application test.

I did not verify any capture result on screen.

I did not verify the Windows capture path on a Windows computer.

I did not trace the internal behaviour of every window host service.

The purpose column of the host service table is an inference.

I did not confirm which sibling report claims each shared service.

I read the visualize skill from the installed bundled plugin cache.

I did not find that skill text inside the application archive.

I did not trace an agent path for four application commands.

I found no agent path for them in this build.
