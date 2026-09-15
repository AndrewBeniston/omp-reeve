# Session 7. The assistant message and its actions

Research for [#201](https://github.com/AndrewBeniston/omp-reeve/issues/201), part of the Session view map ([#194](https://github.com/AndrewBeniston/omp-reeve/issues/194)).

## Sources

Read-only, cited separately per ADR-0001.

- **The extracted web bundle.** Carries the four string groups named on the ticket, the markdown namespace, the accessibility announcement component, the assistant action row, the image view disclosure and the edit-failure path. Every order, threshold and condition below comes from here unless stated otherwise.
- **The installed application** (version 26.908.40834). Confirms every id below and carries 65 locale tables for each one. The id `localConversation.imageView.summary` resolves 66 times because the source declares it twice with two different descriptions. Nothing contradicts the extracted web bundle.
- **The extracted main-process build.** Searched for all four groups, for the assistant action row namespace and for the markdown namespace. No match. This surface is renderer-side only. The main process contributes nothing to it.

No code, markup, class names or asset bytes were copied into this repository or the issue. Values only.

## Table 1. States for this surface

| State | When it shows | What decides it |
|---|---|---|
| Response started | The assistant response begins to stream and the item has not announced before | A per-item started flag is false, and the response is not complete |
| Response progress | The response is still streaming and new plain text exists that was not announced | A 5,000 ms interval, active only while the response is incomplete |
| Response complete | The response finishes and no unannounced plain text remains | The complete flag turns true and the remaining text length is 0 |
| Response complete with content | The response finishes and unannounced plain text remains | The complete flag turns true and the remaining text length is above 0 |
| Action row hidden | The message is not hovered and holds no focus | The row is present but not visible, unless a pin flag forces it visible |
| Action row shown | The pointer enters the message, or focus moves inside it | Hover or focus-within on the message group |
| Copy response | The message carries plain text that is not empty after trimming | A non-null trimmed text value |
| Branch in new chat | A fork handler exists for the message and the competing trailing slot is absent | The fork handler is set and one trailing slot is null |
| Branch in progress | The fork request is running | A busy flag sets aria-busy, disables the button and swaps the icon for a spinner |
| Goal achieved in {totalTime} | The thread goal completed in this turn | A goal value is present on the action row |
| Image view collapsed | The agent inspected one or more images | An image count above 0, with the disclosure closed |
| Image view expanded | The user opens the disclosure | At least one image path exists, so a toggle is offered |
| Image opened | The user selects one image in the expanded strip | The image strip is built with the image dialog enabled |
| Markdown could not render | Markdown content throws while rendering | A markdown-level error boundary, with a retry button |
| Markdown table controls | A markdown table renders | Copy and expand controls, plus a preview dialog that can close |
| File citation chip | The response cites a file, optionally with a location | Line, line range, page, slide or sheet location variants |
| File reference menu | The user opens the context menu on a referenced file | Platform-dependent reveal actions |
| Inline media | The response embeds an image, a video or an audio file | Loading, unavailable and playing states per media kind |
| Markdown metadata | Rendered markdown carries file metadata | A disclosure that hides extra fields behind a show-more control |
| Failed to edit message | The user edits the previous user message and the resubmission fails | A danger toast. The error is raised again after the toast |

**Announcement behaviour.** The announcement is a polite live region whose text the component sets directly. The started state writes once per item and records an empty announced-content value. The progress state trims the text back to the last complete word. It uses the platform word segmenter for the current locale, then announces only the part that was not announced before. The progress interval is 5,000 ms and it is removed as soon as the response completes. The complete state announces the remaining unannounced text, or the short form when nothing remains. The component also accepts an announce-on-mount input, so a response that mounts already complete can announce. Plain text comes from a supplied value, or it is derived from the content with the working directory and the projectless output directory.

**Action row order.** The row renders only when at least one action or slot is present. The order is: copy response, two leading slots, the feedback control, branch in new chat, two statistics slots, the goal label, an entries list, then two trailing slots. Copy writes plain text and HTML together when an HTML source exists, and plain text alone otherwise. Copy emits a product event with the action `copy` and the surface `assistant_message`, carrying the thread id and the turn id. The branch control uses the aria label "Fork chat from here" and the tooltip "Branch in new chat", so the two texts differ on purpose.

**Image view behaviour.** The image view is a disclosure row with an icon, a summary label and a body. The body renders only when the row is expanded. The toggle is offered only when at least one image path exists. The body is a horizontal strip that scrolls without a visible scrollbar. Each image opens in an image dialog.

**Truncation.** The reference truncates the user message, not the assistant response. The show-more and show-less controls belong to the user message namespace, which is the Session 8 surface. No assistant-response truncation id exists in the bundle.

## Table 2. Shipped strings per state

Defaults are the shipped English source text.

| Id | Default | Plural or select | Description shipped with the string |
|---|---|---|---|
| `localConversation.assistantResponse.announcement.started` | Response started | none | Polite screen-reader announcement indicating that an assistant response has started streaming |
| `localConversation.assistantResponse.announcement.progress` | Response: {content} | none | Polite screen-reader announcement containing the latest newly received plain-text portion of a streaming assistant response |
| `localConversation.assistantResponse.announcement.completed` | Response complete | none | Polite screen-reader announcement indicating that an assistant response has finished streaming |
| `localConversation.assistantResponse.announcement.completedWithContent` | Response complete: {content} | none | Polite screen-reader announcement indicating that an assistant response finished streaming and containing its final, previously unannounced plain-text portion |
| `localConversation.imageView.summary` | {imageCount, plural, one {Viewed an image} other {Viewed # images}} | plural on imageCount | Completed activity summary indicating that the agent inspected one or more images. A second declaration of the same id carries the description "Summary label for images inspected by the agent" |
| `localConversation.imageView.previewAlt` | Inspected image | none | Alt text for an image inspected by the agent |
| `localConversation.editLastMessageFailed` | Failed to edit message | none | Toast shown when editing the previous user message fails |
| `assistantMessageContent.copyResponseTooltip` | Copy response | none | Tooltip for the button beneath an assistant message that copies the response |
| `assistantMessageContent.branchInNewChatTooltip` | Branch in new chat | none | Tooltip for the button beneath an assistant message that branches the conversation into a new chat |
| `assistantMessageContent.forkAriaLabel` | Fork chat from here | none | Aria label for the button that forks the chat from an assistant message |
| `assistantMessageContent.goalAchieved` | Goal achieved in {totalTime} | none | Assistant action row label shown when a thread goal was completed |
| `CopyButton.copyTooltip` | Copy | none | Tooltip on copy message icon button. The generic copy control, used where the assistant-specific tooltip does not apply |

### The markdown namespace

The markdown namespace holds 57 ids. The transcript renders its assistant response through this namespace. The groups and their shipped defaults follow.

| Id | Default | Description shipped with the string |
|---|---|---|
| `markdown.renderError.title` | Markdown couldn't render | Error message shown when Markdown content fails to render |
| `markdown.renderError.retry` | Try again | Button label to retry rendering Markdown content |
| `markdown.copyTable` | Copy table | Tooltip and accessible label for copying a Markdown table |
| `markdown.expandTable` | Expand table | Tooltip and accessible label for opening a Markdown table preview |
| `markdown.tablePreview` | Table preview | Accessible label for the Markdown table preview dialog |
| `markdown.closeTablePreview` | Close table preview | Accessible label for closing the Markdown table preview |
| `markdown.imageLoading` | Image loading | Accessible label for a markdown image placeholder while image bytes are loading and no alt text is provided |
| `markdown.imagePreviewButton` | Open image preview | Accessible label for a markdown image button when no alt text is provided |
| `markdown.imageUnavailable` | Image unavailable | Accessible label for a markdown image fallback when the image fails to load and no alt text is provided |
| `markdown.videoPlayer` | Video | Accessible label for a markdown video when no alt text is provided |
| `markdown.videoUnavailable` | Video unavailable | Accessible label for a markdown video fallback when the video fails to load and no alt text is provided |
| `markdown.audioPlayer` | Audio | Accessible label for markdown audio when no alt text is provided |
| `markdown.audio.play` | Play {filename} | Accessible label for playing an inline audio file |
| `markdown.audio.pause` | Pause {filename} | Accessible label for pausing an inline audio file |
| `markdown.audio.seek` | Seek in {filename} | Accessible label for the timeline of an inline audio file |
| `markdown.audio.progress` | {currentTime} / {duration} | Current time and total duration for an inline audio attachment |
| `markdown.audio.loading` | Loading audio… | Loading state for an inline audio attachment |
| `markdown.audio.unavailable` | Audio unavailable | Error state for an inline audio attachment |
| `markdown.audio.fileType` | Audio | File type shown for an inline audio attachment |
| `markdown.audio.formattedFileType` | {format} audio | File type shown for an inline audio attachment |
| `markdown.audio.actions` | More options for {filename} | Accessible label for inline audio attachment actions |
| `markdown.audio.copyPath` | Copy path | Menu action to copy the path of an inline audio attachment |
| `markdown.audio.saveCopy` | Save a copy… | Menu action to save a local copy of an inline audio attachment |
| `markdown.audio.saveFailed` | Couldn't save audio | Error shown when saving an inline audio attachment fails |
| `markdown.fileCitation.lineLabel` | line {line} | Single line label shown inside a file citation chip |
| `markdown.fileCitation.linesLabel` | lines {line}-{endLine} | Line range label shown inside a file citation chip |
| `markdown.fileCitation.lineLabelDisplay` | ({lineLabel}) | Location label shown inside parentheses in a file citation chip |
| `markdown.fileCitation.documentPageLabel` | page {pageNumber} | Location label for a document file citation targeting a page |
| `markdown.fileCitation.presentationSlideNumberLabel` | slide {slideNumber} | Location label for a presentation file citation targeting a slide number |
| `markdown.fileCitation.presentationObjectLabel` | {slideLabel}, {label} | Location label for a presentation file citation targeting a labeled object on a slide |
| `markdown.fileCitation.workbookObjectLabel` | {sheet}, {label} | Location label for a spreadsheet file citation targeting a labeled object on a sheet |
| `markdown.fileCitation.ariaLabelWithLine` | {fileName} {lineLabel} | Accessible label for a file citation chip with location information |
| `markdown.fileCitation.ariaLabelWithType` | {fileName}, {fileTypeLabel} | Accessible label for an extensionless file citation chip |
| `markdown.fileCitation.ariaLabelWithTypeAndLine` | {fileName}, {fileTypeLabel} {lineLabel} | Accessible label for an extensionless file citation chip with location information |
| `markdown.fileCitation.artifactType.code` | Code | Fallback file type label for a code file citation with no extension |
| `markdown.fileCitation.artifactType.document` | Document | Fallback file type label for a document file citation with no extension |
| `markdown.fileCitation.artifactType.file` | File | Fallback file type label for a file citation with no extension |
| `markdown.fileCitation.artifactType.image` | Image | Fallback file type label for an image file citation with no extension |
| `markdown.fileCitation.artifactType.presentation` | Presentation | Fallback file type label for a presentation file citation with no extension |
| `markdown.fileCitation.artifactType.spreadsheet` | Spreadsheet | Fallback file type label for a spreadsheet file citation with no extension |
| `markdown.fileReference.viewFile` | Open file | Context menu action to open a referenced file in the Codex file viewer |
| `markdown.fileReference.viewInCodexBrowser` | View in browser | Context menu action to open a referenced local HTML file in the Codex browser |
| `markdown.fileReference.copyPath` | Copy path | Context menu item to copy a referenced file path |
| `markdown.fileReference.copyFileContents` | Copy file contents | Context menu item to copy a referenced file's contents |
| `markdown.fileReference.openInFinder` | Reveal in Finder | Context menu item to reveal a referenced file in Finder |
| `markdown.fileReference.openInExplorer` | Open in Explorer | Context menu item to reveal a referenced file in File Explorer |
| `markdown.fileReference.openInFileManager` | Open in File Manager | Context menu item to reveal a referenced file in the system file manager |
| `markdown.fileReference.openInGitHub` | Open in GitHub | Context menu action to open a referenced file at the clicked line on GitHub |
| `markdown.fileReference.openInTarget` | Open in {target} | Context menu action to open a referenced file in the preferred app |
| `markdown.fileReference.openWith` | Open with | Context menu submenu label for choosing an app to open a referenced file |
| `markdown.fileReference.openWithTarget` | {target} | Context menu action to open a referenced file in a specific app |
| `markdown.fileReference.saveAs` | Save as… | Context menu action to save a file tree item to a user-selected location. A second declaration of the same id carries the description "Context menu item for saving a referenced file to a user-selected location" |
| `markdown.metadata.title` | Metadata | Title for rendered Markdown file metadata |
| `markdown.metadata.showMore` | Show more | Disclosure control shown when a Markdown metadata preview hides additional fields |
| `markdown.metadata.showLess` | Show less | Disclosure control shown when a Markdown metadata preview can collapse additional fields |
| `markdown.pluginMention.loadingAppMetadata` | Loading app | Accessible label for an app-backed plugin mention while its display metadata loads. |
| `markdown.pluginMention.controlDesktopAppsFromCodex` | Control desktop apps from ChatGPT | Tooltip text shown when hovering a generic Computer Use plugin mention. |

The markdown namespace carries no code-block id. A separate code-block namespace exists in the same bundle, with run, preview, download, share, edit and language-fallback controls. That namespace belongs to the ChatGPT conversation surface. I did not confirm which code-block header the Codex transcript renders. See the live-run list.

## Table 3. OMP event per state in Reeve

Read from the transcript components and the session hook on this branch.

| Reference state | Reeve's nearest surface | OMP event that carries it |
|---|---|---|
| Response started | none. The transcript holds no live region | no source for the announcement. `message_start` marks the boundary |
| Response progress | none | no source. `message_update` carries the deltas that would feed it |
| Response complete and complete with content | none | no source. `message_end` and `prompt_done` mark the boundary |
| Action row hidden and shown | The assistant turn tracks hover and shows its footer controls on hover | local state. No event |
| Copy response | A copy button under the assistant turn, labelled "Copy message", with a tooltip that becomes "Copied" | no event. Content is the assembled message text. The button is suppressed while the message streams |
| Branch in new chat | none on the assistant turn. The user turn carries a branch control and a retry control | no source at the assistant turn. Fork exists as a session command, but no assistant-message entry point calls it |
| Branch in progress | The user turn control shows a pending label while a new session is created | the fork command response |
| Goal achieved in {totalTime} | none | no source. OMP has no goal event, which matches the map's decision row |
| Image view collapsed and expanded | Images render inline in the message body with an empty alt value. There is no disclosure and no count summary | `tool_execution_end` with an image. The count and the summary have no source |
| Image opened | none. The inline image has no open action and no dialog | no source |
| Markdown could not render | none. There is no markdown error boundary and no turn error boundary | no source |
| Markdown table controls | Tables render inside a horizontal scroll wrapper. There is no copy control, no expand control and no preview dialog | no source |
| File citation chip | none. There is no citation chip | no source |
| File reference menu | Local file links resolve against the session working directory and open in a file tab on a plain click. Modified clicks and non-self targets fall through | no event. Path resolution is local |
| Inline image state | Images render with lazy loading. There is no loading label and no unavailable fallback | no source |
| Inline video and audio | none | no source |
| Markdown metadata | Frontmatter parses through a frontmatter plugin and renders in a dedicated card | no event. The content carries it |
| Failed to edit message | The user turn retry control resubmits from that message. No failure toast exists | no source for the failure state |
| Streaming appearance | New markdown segments fade in. The segment delay is 16 ms and the total delay is capped at 96 ms | driven by the streaming flag, which comes from `message_start`, `message_update` and `prompt_done` |

Reeve renders markdown with GitHub-flavoured markdown, math, frontmatter, raw HTML and sanitisation. Math renders through KaTeX. Code blocks render with syntax highlighting and a copy control. Mermaid blocks render as diagrams with a zoomable viewer.

## Parity checklist

**Matches**

- Both render the assistant response as markdown with headings, lists, tables, code blocks, math and links.
- Both give the user one copy action under the assistant message.
- Both suppress the copy action while the response is still streaming. The reference hides the row until hover, and Reeve does the same.
- Both resolve local file links and open them inside the application.
- Both provide a copy control on a code block.
- Both render images that the agent inspected inside the transcript.

**Lacks**

- No accessibility announcements. Reeve has no polite live region for the response, so a screen-reader user receives no start, no progress and no completion announcement. The 5,000 ms progress interval and the word-boundary trim have no analogue.
- No branch or fork action under the assistant message. Reeve offers branch only on the user turn.
- No goal label in the action row.
- No image view disclosure, no image count summary, no alt text for inspected images and no image dialog.
- No markdown error boundary, so a malformed block can take the message with it.
- No table copy control, no table expand control and no table preview dialog.
- No file citation chips with line, page, slide or sheet locations.
- No file reference context menu, so there is no reveal, no copy path, no copy contents, no save as and no open with.
- No inline audio player and no inline video player.
- No failure toast when a message edit fails.
- No product event on copy.

**Differs**

- The reference copies plain text and HTML together when an HTML source exists. Reeve copies plain text only.
- The reference labels its copy control "Copy response". Reeve labels its control "Copy message".
- The reference uses two different texts for the same control, "Fork chat from here" as the aria label and "Branch in new chat" as the tooltip. Reeve uses one text per control.
- The reference shows the action row on hover or on focus within the message. Reeve shows its controls on hover only.
- The reference renders inspected images behind a disclosure with a count. Reeve renders them inline and always visible.
- The reference truncates the user message and not the assistant response. Reeve truncates neither.
- Reeve fades new markdown segments in as they stream. The reference shows no equivalent per-segment fade in the code I read.

## What only a live run can settle

- Whether a screen reader in practice reads the progress announcement every 5,000 ms, and whether the word-boundary trim leaves a readable phrase at that cadence.
- Whether the action row shows every slot at once in a normal turn, or whether the statistics, entries and feedback slots are rare.
- Which code-block header the Codex transcript renders. The bundle carries a full code-block namespace that belongs to the ChatGPT surface, and the markdown namespace carries none.
- Whether the assistant response shows a streaming cursor or a placeholder. I searched the bundle for the usual names and found none for this surface.
- Whether the branch control appears on every assistant message or only on the last one.
- What the goal label shows while a goal is still open, because only the achieved string exists.
- Whether the image dialog supports more than one image at a time, and what its controls are.
- Whether the markdown error boundary is per block or per message, and whether its retry recovers malformed content or only a transient failure.
- Whether the file reference context menu changes its items by file type, and which item is the default action.
- What triggers the edit failure toast in practice, because the edit path resubmits a whole turn.

