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

#### Actions and identity

`open_in_codex` opens or reveals the Review panel in the calling task.

The Review panel is one Tab with the fixed identifier `diff`.

The panel title is Review.

The tool result returns the task identifier, the type `review`, the placement, the status, and the Tab identifier.

The status is `opened` for a new Tab and `existing` for a present Tab.

The tool accepts four review view values.

| View value | Verified effect |
| --- | --- |
| `last-turn` | The panel shows the changes of the most recent turn. |
| `branch` | The panel compares the branch against its base revision. |
| `staged` | The panel shows the staged changes. |
| `unstaged` | The panel shows the unstaged changes. |

The second target shape accepts a base branch value.

A base branch value selects the branch view and stores the base revision for the repository root.

The base branch must resolve locally to a commit.

An optional path value selects one file inside the Review panel.

A path, a view, or a base branch also clears the selected commit.

The panel keeps a separate last explicit view value in durable storage.

That stored value defaults to `branch`.

The agent can also pass a review deep link as a browser target.

A pull request link must contain a pull request address, a file path, and a positive line number.

The link accepts a side value of `left` or `right` and defaults to `right`.

A pull request link opens the pull request code Tab, not the local Review Tab.

A pull request link returns the status `superseded`.

A task review link opens the local Review Tab with the view and path from the link.

A task review link must name the calling task.

The Review Tab identifier does not change between sessions.

The Tab stores a durable route record with version 1.

That record holds the task identifier, the working directory, the host identifier, and the view.

The record also holds the base branch, the commit, the repository root, and the turn identifier.

After a reload, the panel restores only when the task, working directory, and host still match.

A mismatch cancels the restore and the Tab does not return.

#### Placement and human access

`open_in_codex` accepts `right` or `bottom` placement for the Review panel.

The Review panel uses the right placement when the call omits a placement.

An existing Review Tab keeps its current placement.

The call reveals and focuses the Review Tab.

The Review Tab is always available in the panel registry.

The panel registry reports no unavailable state for the review Tab type.

The human can open the review surface from several places.

A pull request diff link in the transcript is an active link.

The link shows a preview card with the repository, the destination, and the changed file count.

The card also shows an open, draft, closed, or merged status.

A click on the link opens the pull request code Tab at the named file and line.

An inline comment from the model appears in the Review panel.

A selection of that comment opens the related file and scrolls to the comment.

The human can also open the Review panel without any agent action.

#### Transcript rendering

The Review panel tool call renders as generic `codex_app` tool activity.

The tool result stays text content inside the tool activity.

No review presentation metadata accompanies the result.

The presentation metadata keys cover browser use and computer use only.

The inline comment directive does not render as visible text.

The message renderer removes every directive line from the displayed message.

The comment appears in the Review panel instead.

The application stores model comments per task in a durable comment record.

Each record holds the comment text, the file path, the line, and the side.

The side value is always `right` for a model comment.

The application reads the comments only from the last agent message.

The application collects comments only for a local task.

A user message that returns review comments to the model renders with a comment count.

That message also renders the comment list.
