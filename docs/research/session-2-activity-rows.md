# Session 2. The activity rows and their summaries

Research for issue #196, part of the Session view map (#194). Read-only reading of the
reference at version 26.908.40834. Values only: no code, markup, class names or asset
bytes are reproduced here.

## Sources

Three sources, cited separately per ADR-0001.

- **The extracted web bundle.** Carries every string id, its default text, its plural
  and select rules and its translator description, plus the renderer logic that picks
  a header, groups repeats and composes the past-tense summary. Everything below is
  from this source unless another is named.
- **The extracted main-process build.** Carries the turn-level protocol: the per-turn
  set of interrupted command-execution item ids, and the turn interrupt call with its
  user-stop mode. This is what makes a command render as stopped rather than finished.
- **The installed application.** Confirms the shipped version string 26.908.40834 and
  that the same string table ships inside the packaged archive.

## What this surface is

One activity area per agent turn. While the turn runs, its header is a single live
line describing the newest unfinished action. When the turn ends, or when the area is
no longer the latest visible unit, the header becomes a past-tense summary of what the
turn did. A disclosure opens the area and reveals the individual rows.

The header rule, from the bundle, in order:

1. If the unit is not the latest visible unit, or the turn is not in progress, or the
   activity slice is closed, the header is the **summary**.
2. Otherwise, if the turn is exploring, the header is the exploration label for the
   newest command item that is still running; if none is running, the newest command
   item of any state.
3. Otherwise, walk the unit's items from newest to oldest and take the first item that
   is still in progress. An automatic approval review in that position yields the
   **thinking** header instead of an activity header.
4. If nothing is in progress, the header is **thinking**.

A command item counts as in progress when its execution status is not "interrupted"
and its parsed command is not finished.

## Table 1. The states for this surface

| # | State | When it shows | Icon token |
| --- | --- | --- | --- |
| 1 | Running a command | An exec item is in progress and the detail level is not the everyday one | run-command |
| 2 | Running a command, generic | Same, at the everyday detail level (no command text shown) | run-command |
| 3 | Reading a target | Exec item parsed as a read | run-command |
| 4 | Reading a skill | The read target resolves to a skill definition file | run-command |
| 5 | Reading Internal Knowledge | The read target is the canonical Internal Knowledge skill | internal-knowledge |
| 6 | Searching for a query | Exec item parsed as a search with a query and no path | code-searching |
| 7 | Searching a folder | Search with a path | code-searching |
| 8 | Searching files | Search with neither | code-searching |
| 9 | Listing files | A list-files command with no path | list-files |
| 10 | Listing a folder | A list-files command with a path | list-files |
| 11 | Ran a command | Exec finished, still shown in the active label slot | run-command |
| 12 | Stopped a command | Execution status is "interrupted" | stop |
| 13 | Editing files | A patch item is running | patch icon |
| 14 | Creating or updating a visualization | Patch classified as a visualization create or update | edit-files |
| 15 | Searching the web | Web search item with an empty trimmed query | web icon |
| 16 | Searching the web for a query | Web search item with a query | web icon |
| 17 | Running a connector tool | An MCP tool call is in progress; label comes from the per-connector table | connector logo |
| 18 | Repeated calls to one connector tool | Consecutive identical completed MCP calls collapse into one row | connector logo |
| 19 | Repeated calls with a first-party label | The same collapse where the row already has a first-party label | first-party icon |
| 20 | Waiting for your answer | The turn is blocked on a question or an active elicitation | question icon |
| 21 | A plugin must be installed | An inline plugin-installation request is shown above the activity | plugin icon |
| 22 | Untitled browser tool call | An in-app browser tool call with no title | browser icon |
| 23 | Untitled Chrome tool call | The same with the Chrome backend | browser icon |
| 24 | Summary: ran commands | Collapsed past-tense segment for command executions | first item's icon |
| 25 | Summary: edited files | Collapsed segment for file changes | first item's icon |
| 26 | Summary: stopped creating files | Collapsed segment for stopped file creation | first item's icon |
| 27 | Summary: read files | Collapsed segment for exploration | first item's icon |
| 28 | Summary: called tools | Collapsed segment for unnamed MCP calls | first item's icon |
| 29 | Summary: loaded tools | Collapsed segment for tool loading | first item's icon |
| 30 | Summary: searched the web | Collapsed segment for web searches | first item's icon |
| 31 | Summary: used named sources | Collapsed segment where at least one source is the browser | first item's icon |
| 32 | Summary: used integrations | Collapsed segment where no source is the browser | first item's icon |
| 33 | Summary: created or updated a visualization | Collapsed visualization segment | first item's icon |
| 34 | Summary fallback | The summary has no parts at all | none |

## Table 2. The shipped strings per state

### Group: agentActivity

Ids are given without their shared localConversation prefix.

| Id | Default text | Rules | Description (when it shows) |
| --- | --- | --- | --- |
| agentActivity.runningCommand | Running {command} | command is the trimmed parsed command | Active agent activity header for a running command |
| agentActivity.runningCommandGeneric | Running command | none | Active agent activity header for a running command in everyday mode |
| agentActivity.editingFiles | Editing files | none | Active agent activity header for a running patch |
| agentActivity.searchingWeb | Searching the web | none | Active agent activity header for a web search |
| agentActivity.searchingWebForQuery | Searching the web for {query} | query is trimmed; empty falls back to the line above | Active agent activity header for a web search with a query |
| agentActivity.waitingForYourAnswer | Waiting for your answer | none | Activity status shown while the assistant is waiting for the user to answer a question or an active elicitation |
| agentActivity.pluginInstallationRequired | {appName} needs to use a plugin | appName is the everyday product name in Work mode and the coding product name in coding mode | Static activity status shown above an inline plugin-installation request |
| agentActivity.repeatedToolCalls | {toolName} followed by a middle dot and {count, plural, one {# call} other {# calls}} | plural on count; the count is displayed | Disclosure for consecutive calls to one tool |
| agentActivity.repeatedCodexCallCount | a middle dot and {count, plural, one {# call} other {# calls}} | plural on count; appended after a first-party label | Standalone count after a first-party tool action label |
| agentActivity.completed | Worked | none | Fallback completed summary for an agent activity group |
| agentActivity.summary.commands.leading | {count, plural, one {Ran a command} other {Ran commands}} | plural on count; count not displayed | First action in a list of completed agent actions; sentence-initial casing |
| agentActivity.summary.commands | {count, plural, one {ran a command} other {ran commands}} | plural on count; count not displayed | Non-leading action; mid-sentence casing |
| agentActivity.summary.editedFiles.leading | {count, plural, one {Edited a file} other {Edited files}} | plural on count | Leading collapsed summary segment for file changes |
| agentActivity.summary.editedFiles | {count, plural, one {edited a file} other {edited files}} | plural on count | Collapsed summary segment for file changes |
| agentActivity.summary.stoppedCreating.leading | {count, plural, one {Stopped creating a file} other {Stopped creating files}} | plural on count | Leading segment for stopped file creation |
| agentActivity.summary.stoppedCreating | {count, plural, one {stopped creating a file} other {stopped creating files}} | plural on count | Segment for stopped file creation |
| agentActivity.summary.readFiles.leading | Read files | no plural | First action in a list; sentence-initial casing; an active verb phrase, not a noun phrase |
| agentActivity.summary.readFiles | read files | no plural | Non-leading action; mid-sentence casing |
| agentActivity.summary.calledTools.leading | {count, plural, one {Called a tool} other {Called tools}} | plural on count | Leading segment for unnamed tool calls |
| agentActivity.summary.calledTools | {count, plural, one {called a tool} other {called tools}} | plural on count | Segment for unnamed tool calls |
| agentActivity.summary.loadedTools.leading | {count, plural, one {Loaded a tool} other {Loaded tools}} | plural on count; count not displayed | First action in a list; sentence-initial casing |
| agentActivity.summary.loadedTools | {count, plural, one {loaded a tool} other {loaded tools}} | plural on count; count not displayed | Non-leading action; mid-sentence casing |
| agentActivity.summary.webSearch.leading | Searched the web | no plural | Leading segment for web searches |
| agentActivity.summary.webSearch | searched the web | no plural | Segment for web searches |
| agentActivity.summary.sources.leading | Used {sources} | sources is a conjunction list | Leading segment for named tool sources |
| agentActivity.summary.sources | used {sources} | sources is a conjunction list | Segment for named tool sources |
| agentActivity.summary.integrations.leading | Used {sources} {sourceCount, plural, one {integration} other {integrations}} | plural on sourceCount | Leading segment for named integrations |
| agentActivity.summary.integrations | used {sources} {sourceCount, plural, one {integration} other {integrations}} | plural on sourceCount | Segment for named integrations |
| agentActivity.summary.source.browser | the browser | none | Localized browser tool source name inside a sources list |

### Group: toolActivity

Every one of these carries two named tags in its default text: an action tag and, where
a value is shown, a detail tag. The two are styled differently; the detail is the part
that can be truncated. The tags are written below as (action) and (detail).

| Id | Default text | Rules | Description |
| --- | --- | --- | --- |
| toolActivity.active.read | (action) Reading (detail) {target} | target is the display label, else the formatted path or name | While the agent is reading a file |
| toolActivity.active.readSkill | (action) Reading (detail) {skillName} skill | skillName from the resolved skill summary | While the agent is reading a skill definition |
| toolActivity.active.readInternalKnowledge | (action) Reading (detail) Internal Knowledge | none | While the agent is reading the canonical Internal Knowledge skill definition |
| toolActivity.active.search.query | (action) Searching (detail) for {query} | query is term-formatted at the everyday detail level, raw otherwise | While the agent is searching for a query |
| toolActivity.active.search.folder | (action) Searching (detail) files in {folder} folder | folder is the formatted path | While the agent is searching files in a folder |
| toolActivity.active.search.files | (action) Searching (detail) files | none | While the agent is searching files |
| toolActivity.active.list.files | (action) Listing (detail) files | none | While the agent is listing files |
| toolActivity.active.list.folder | (action) Listing (detail) files in {folder} folder | folder is the formatted path | While the agent is listing files in a folder |
| toolActivity.active.command.running | (action) Running command | used when the trimmed command is empty | While the agent runs a command |
| toolActivity.active.command.running.detail | (action) Running (detail) {command} | command is trimmed | While the agent runs a command |
| toolActivity.active.command.ran | (action) Ran command | trimmed command empty | After the agent runs a command |
| toolActivity.active.command.ran.detail | (action) Ran (detail) {command} | command is trimmed | After the agent runs a command |
| toolActivity.active.command.stopped | (action) Stopped command | trimmed command empty | After the agent stops a command |
| toolActivity.active.command.stopped.detail | (action) Stopped (detail) {command} | command is trimmed | After the agent stops a command |

The visualization activity strings sit in their own group but feed the same rows: an
active pair (Creating visualization, Updating visualization), a row pair (Creating,
Created, Updating, Updated visualization) and a summary pair in both leading and
non-leading casing (Created visualization, created visualization, and the same for
updating).

### Group: pendingMcpToolCalls

| Id | Default text | Description |
| --- | --- | --- |
| pendingMcpToolCalls.usedBrowser | Used the browser | Fallback activity label for an untitled in-app browser tool call |
| pendingMcpToolCalls.usedChrome | Used Chrome | Fallback activity label for an untitled Chrome browser tool call; chosen when the browser backend is Chrome |

### Group: mcpToolActivity, sampled

901 ids in the shipped table, across 11 connector namespaces: browser, figma, github,
gmail, google, linear, notion, sites, slack, vercel, wallet. The shape is one id per
tool per state. Suffix counts across the whole group: 327 active, 327 completed,
55 activeWithContext, 60 completedWithContext, 11 activeWithQuery, 11 completedWithQuery,
5 activeWithName, 5 completedWithName, 5 activeWithRecipient, 5 completedWithRecipient,
4 activeWithTitle, 4 completedWithTitle.

Ten ids, with their default text:

| Id | Default text |
| --- | --- |
| mcpToolActivity.browser.run_code_unsafe.active | Running JavaScript |
| mcpToolActivity.browser.run_code_unsafe.completed | Ran JavaScript |
| mcpToolActivity.figma.add_code_connect_map.active | Adding Code Connect mapping |
| mcpToolActivity.figma.add_code_connect_map.completed | Added Code Connect mapping |
| mcpToolActivity.figma.create_new_file.active | Creating Figma file |
| mcpToolActivity.figma.create_new_file.activeWithContext | Creating Figma file, followed by the quoted {itemName} |
| mcpToolActivity.figma.create_new_file.completed | Created Figma file |
| mcpToolActivity.figma.create_new_file.completedWithContext | Created Figma file, followed by the quoted {itemName} |
| mcpToolActivity.figma.download_assets.active | Downloading assets |
| mcpToolActivity.figma.generate_deck.completed | Generated deck |

The description of every id in the group follows one of two forms: an active label for
the named tool, or a completed label for the named tool, with a trailing clause naming
the value for the context-bearing variants.

## The rules that decide the words

**Leading or trailing capitalisation.** Every summary segment ships twice: a leading
form with sentence-initial casing and a non-leading form with mid-sentence casing. The
composer maps the segments of a turn in order and passes "is leading" as true only for
index zero. The translator descriptions state the rule explicitly, and they also tell a
translator to keep the agent as the grammatical subject, so "Read files" is an act, not
a noun phrase.

**How segments join.** The completed header renders its segments through a list
component with the unit list type, which in English joins with commas and no
conjunction. The translator descriptions give conjunction examples, such as "Edited
files, read files, and ran commands", so the descriptions and the shipped join type
disagree. Only a live run settles which one the user sees.

**Sources lists.** The named-source segment dedupes the source names, replaces the
browser key with the localized "the browser", and joins them with a conjunction list.
The integrations variant is chosen when no source in the group is the browser source.

**When the summary is empty.** If the completed header has zero segments, the whole
header is the single word "Worked".

**Repeat counting.** Consecutive MCP tool calls collapse into one row when they are
identical on the tuple of server, tool, function name, plugin id, connector id, link id
and invocation resource uri. Only a call that is completed, has no explicit source, is
not the computer-use server, returned a success result, carries no automatic approval
review and is not an error qualifies. A qualifying run renders as the tool name followed
by a middle dot and the call count; where the row already has a first-party label, the
label renders and the count is appended as a separate standalone segment. The count is
the number of calls the disclosure reveals.

**Search query formatting.** At the everyday detail level a query is split on unescaped
pipe characters into terms. If any term contains an unescaped regular-expression
metacharacter, or an escape before an alphanumeric, the formatting is abandoned and the
raw query is shown. Otherwise every term is stripped of leading and trailing straight
quotes, wrapped in curly quotes, and the terms are joined: two terms with " and ", three
or more with commas and ", and " before the last.

**Which item supplies the active exploration label.** The bundle scans the item list
from newest to oldest for a command item that is still in progress; if none is found it
scans again and accepts a finished one. That second pass is why a finished command can
still show in the live header as "Ran command".

**A stopped command.** The main-process build carries a set of interrupted
command-execution item ids on the turn, written when a turn is interrupted with the
user-stop mode. The web bundle reads the item's execution status: "interrupted" selects
the stopped strings and the stop icon, a finished parse selects the ran strings, and
anything else selects the running strings.

**The disclosure.** The collapsed header is a button whose content is the icon of the
first item plus the header text, truncated to one line. Grouped rows expand into the
individual rows beneath it. The group disclosure opts out of the initial collapse
animation.

**The order of rows.** Rows follow stream order. The splitter in the bundle pulls a
number of kinds out of that order before the activity is rendered: user messages and
heartbeat-triggered messages, the turn diff, the todo list, the proposed plan, the plan
implementation, permission requests, approval items, an incomplete user-input item, and
the model-changed and model-rerouted notices. Automatic approval reviews are attached to
the item they target rather than rendered in line. A trailing run of automatic approval
reviews moves after the assistant message. The final assistant message is removed from
the activity list and rendered as the answer, and a trailing system error is pulled out
to render after it. Elicitation items for a server with a pending elicitation suppress
that server's incomplete tool calls.

## Table 3. The OMP event per state in Reeve

Reeve's transcript is built from the session hook's event switch and from the message
list. The events that exist are: message_start, message_update, message_end,
tool_execution_start, tool_execution_end, agent_start, agent_end, agent_settled,
prompt_done, prompt_error, auto_retry_start, auto_retry_end, compaction_start,
compaction_end (with the older auto-compaction pair), queue_update, subagent_lifecycle,
subagent_progress, extension_ui_request, extension_error, session_name_changed and the
extension action set.

| Reference state | OMP event in Reeve | Note |
| --- | --- | --- |
| Running a command | tool_execution_start with a bash-classified tool name | Gives the tool name and call id; the command text comes from the tool call block, not the event |
| Running a command, generic | no source | Reeve has no detail-level setting |
| Reading a target | tool_execution_start, tool name classified as read | No parsed target; Reeve shows the raw input preview |
| Reading a skill | no source | No skill resolution in the transcript layer |
| Reading Internal Knowledge | no source | Not a concept in OMP |
| Searching for a query | tool_execution_start, grep-classified | The query is read from the tool input, not the event |
| Searching a folder | no source | Reeve does not distinguish a path search |
| Searching files | tool_execution_start, glob- or grep-classified | |
| Listing files, listing a folder | tool_execution_start, glob-classified | No separate list state |
| Ran a command | tool_execution_end plus the tool result message | |
| Stopped a command | partial: the bash execution message carries a cancelled flag and an exit code | No turn-level interrupted-item set, so an aborted turn is not attributed to a specific row |
| Editing files | tool_execution_start, edit-classified | |
| Creating or updating a visualization | no source | |
| Searching the web, with or without a query | tool_execution_start, browser-classified | One state only |
| Running a connector tool | tool_execution_start with the MCP tool name | No per-connector verb table |
| Repeated calls to one connector tool | no source | No repeat collapsing in Reeve |
| Waiting for your answer | extension_ui_request, and the ask and confirm actions | Rendered as the question request panel, not as an activity header |
| A plugin must be installed | no source | |
| Untitled browser or Chrome tool call | no source | |
| Summary: any past-tense segment | partial: the process details group counts messages and tool calls | Counts, not verbs |
| Summary fallback | no source | |

## Parity checklist

**What Reeve already matches**

- One collapsed group per turn that hides the process and reveals it on a disclosure.
  Reeve's process details group opens by default when the turn produced no final answer,
  which is the same intent as the reference keeping the live activity open.
- A live status line while the turn runs, with a running-tool state, a waiting-for-model
  state and a thinking state.
- A row per tool call with a status (running, success, error), an icon per tool kind, a
  preview of the tool's input, a duration, a diff view with added and removed counts, and
  a terminal view for a shell command with pending and error states.
- A stopped or failed command renders differently from a successful one.
- A question to the user is a first-class surface.

**What Reeve lacks**

- Past-tense summary verbs of any kind. The collapsed header reads as counts, where the
  reference reads as a sentence.
- The leading and non-leading casing pair, and therefore the ordered-sentence rule.
- The empty-summary fallback word.
- Repeat collapsing for consecutive identical tool calls, and the call count.
- A verb per tool. Reeve shows the raw tool name where the reference shows "Reading",
  "Searching", "Listing" or "Running".
- The reading and searching detail forms: skill names, the Internal Knowledge case, the
  folder forms, and the everyday-mode query term formatting with curly quotes.
- Named sources and integrations in the summary.
- The plugin-installation status line and the untitled-browser fallbacks.
- A turn-level record of which command was interrupted.

**What differs**

- Reeve's live status line lives in the composer turn status, below the transcript; the
  reference's live line is the header of the activity group inside the transcript.
- Reeve's row is a card with a name, a preview and an expander; the reference's row is a
  single line of prose with an icon.
- Reeve's edit rows default to expanded; the reference keeps everything collapsed behind
  the group.
- Reeve's status strings end in an ellipsis; no reference activity string uses one.
- Reeve counts messages and tool calls in its collapsed header; the reference counts only
  repeated calls, and only inside one row.
- Reeve's strings live in its own table with flat keys and no plural or select rules on
  these entries; the reference uses plural or select on almost every summary segment.

## What only a live run can settle

1. Whether the summary segments read with commas only or with a conjunction. The shipped
   join type and the translator descriptions disagree.
2. Whether a collapsed repeat of exactly one call ever renders, or whether a run of one
   always renders as an ordinary row.
3. The order in which segment kinds appear in a mixed summary, and whether that order
   follows first appearance in the turn or a fixed precedence.
4. Whether the activity group animates open, and the duration of that animation.
5. Whether a stopped command keeps its stopped row after the turn ends, or whether the
   summary absorbs it.
6. What the header shows in the gap between a tool result and the next model token.
7. Whether the plugin-installation line replaces the activity header or sits above it.
8. The truncation behaviour of a long command in the detail slot, and whether the middle
   or the tail is dropped.
9. Whether the everyday detail level is reachable in the coding mode at all, which
   decides whether the generic command header and the curly-quote query formatting are
   live states or dead ones.
10. The icon drawn for each state, since this document records icon tokens only.

