# Codex Desktop Review control surface

## Status

This report contains evidence only.

The mapping worker will complete every mapping section.

This file covers the Review surface only.

## Scope

This report inventories the Review control that Codex Desktop gives to its agent.

The report covers the Review panel, the review targets, and the pull request review links.

The report also covers inline review comments and transcript rendering.

The report excludes Browser control.

Ticket 440 covers Browser control.

## Evidence method

I inspected the installed Codex Desktop archive for version 26.915.31029.

I inspected the main process bundle, the renderer bundle, and the panel command chunk.

I inspected the tool schemas, the developer instruction text, and the comment parser.

I did not perform a live application test.

Therefore, every finding below is source-verified unless I label it as an inference.

## Capability inventory

### Review

Codex Desktop exposes one Review panel to the agent.

The agent opens that panel through the same panel tool that opens other Tabs.

The agent creates review comments through a message directive, not through a tool.

#### Registration and discovery

| Exact name | Registration point | How the agent learns about it |
| --- | --- | --- |
| `open_in_codex` | The Desktop tool builder adds it to `codex_app`. | Its schema lists review as a supported panel target. |
| `review` target | The tool schema declares two review target shapes. | The schema names each review view value. |
| `baseBranch` review target | The tool schema declares a separate branch target shape. | Its field text explains local revision comparison. |
| `browser` target with a review link | The tool schema permits two review deep link forms. | Its field text names the pull request form and the task form. |
| `windows.tabs.open` | `open_in_codex` queues this application command. | The agent learns only the enclosing tool. |
| `::code-comment` directive | The message parser reads the directive from the assistant message. | A developer instruction section teaches the directive. |
| Pull request diff link | The renderer converts the link into a review open action. | A developer instruction section teaches the link format. |

The `codex_app` namespace can defer the panel tool.

The agent loads the deferred tool when its schema becomes necessary.

The developer instruction text always includes the inline comment section.

The developer instruction text always includes the pull request diff link section.

The instruction text gives the exact directive attributes and the exact link parameters.
