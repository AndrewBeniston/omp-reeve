# Review reference questions (R1-R20)

Answered 2026-09-15 against Codex Desktop **26.908.40834**, for
[Review 2. Answer the reference questions](https://github.com/AndrewBeniston/omp-reeve/issues/82).

Sourcing follows ADR-0001: shipped code, tokens, and coded defaults are
authoritative; a runtime observation validates them and never supplants them.
No reference code, markup, class names, or asset bytes are reproduced here.

## How to read the evidence

Every answer carries an **Evidence** line naming the shipped asset it was read
from. Web view assets are named by their shipped filename; the Electron main
process and the native host are named as such. Byte offsets for each individual
claim are held in the researcher's private evidence index, which maps claim to
file, offset, and the reasoning that connects them.

Two copies were read, and R1 establishes they are the same build:

- **Installed**: the shipped desktop application on disk.
- **Bundle**: a separately extracted copy of the same application's web view.

**A catalogue string proves only that text exists.** Where an answer asserts
that Review reaches a behaviour, that is established by a **caller chain** in
the module import graph, rooted at the Review panel module
(`thread-side-panel-tab-content`), not by the presence of a message. Where a
behaviour exists in the reference but is **not** reachable from Review, the
answer says so.

## Reachability method

The import graph was built over all 7151 web view JavaScript assets and
traversed breadth-first from the Review panel module. Two properties of the
method matter.

**Reachability counts every sibling-filename reference, not only static
imports.** Static import statements alone give 25476 edges; including the
filename references through which lazily loaded chunks and their preload
dependency lists resolve gives **35082**.

**Hub modules must not be transited.** `app-initial` references almost the whole
application, so any path routed through it proves nothing about Review. With the
hub modules barred as transit, Review's own closure is **73 modules**. A claim
that Review reaches a behaviour below means a chain exists that never passes
through a hub; a claim that it does not means no such chain exists, while the
module may still be reachable through the hub like any other part of the
application.

Evidence: import graph over the bundle. The Review panel directly imports 21
non-infrastructure modules, including `code-diff`, `review-file-tree-pane`,
`review-file-tree-side-pane`, `review-preferences-model`,
`pull-request-code-review`, `pull-request-revision-queries`,
`revision-review-unavailable-message`, `local-conversation-git-actions`,
`git-branch-picker-dropdown-content`, `diff-source`, and
`use-create-git-repository`.

## R1. Bundle correspondence

**Resolved. The bundle corresponds to the installed build exactly.**

The installed application's version metadata and the bundle's package metadata
both read 26.908.40834. The installed archive's directory table lists 8155 web
view asset entries; the extracted copy holds 8155 files; no file is present on
only one side and no size differs. All 8155 were hashed with SHA-256 on both
sides and all 8155 matched.

Evidence: installed archive header and directory table; bundle package metadata;
full hash comparison.

## R2. File source beside the diff

**Resolved.**

Review opens the file-source view itself. The Review panel imports the shipped
open-tab function and calls it from a file-header control whose accessible label
describes opening a review file in an app tab. The call passes the file path,
the current line, the host id, and a flag resetting tab state, so the view opens
**at a line**, as a **tab**, not as a modal.

The view is composed of a tab module, a content module, a per-item module and a
breadcrumb, and there is a **separate Electron-only editable variant** which
additionally pulls in the Electron text-file editor content module. An editable
form exists and is desktop-only.

Editing writes to the working tree, on a timer, behind a modification-time
guard. The save machine lives in the editor module the Electron variant
delegates to, reached through a thin re-export.

- **Write.** Saving calls a host operation named for writing a file, passing the
  content, the file path, the host, and an **expected modification time**. On the
  cloud path the same guard is explicit: read metadata, compare the modified
  time to the expected one, write only if they match, then re-read metadata;
  otherwise return a conflict outcome without writing.
- **Autosave.** Saves are scheduled on a **3000 ms** timer, cleared and
  rescheduled on further edits, and skipped while the document is read-only or
  while an unresolved external change is held. Concurrent saves coalesce through
  a single in-flight promise, and a save that lands while further edits exist
  reschedules itself.
- **External change.** When the expected time does not match, the editor re-reads
  the file. If the disk content equals what is being saved it simply adopts the
  new modification time. Otherwise it performs a three-way merge of document,
  disk content and local content; a conflict result cancels any in-progress
  selection edit and raises an external-conflict callback rather than
  overwriting.
- **Size limits.** Reading refuses a file over **20 MiB** outright, and a file
  over **10 MiB** opens **read-only**. Content is checked for being text by
  sampling the **first 4096 bytes**, so binary detection is a sniff, not a
  suffix test.

The editable Review variant wires review comments into that editor, enabling
pull-request comments whenever the review source is not last-turn, and its
default editor state opens markdown in rendered mode with separate scroll
positions and drafts for rendered and source views.

Evidence: `thread-side-panel-tab-content` (open call, file-header control);
`review-file-source-tab` re-exporting the open and toggle functions from
`app-initial`; `review-file-source-tab-content`, `review-file-source-item`,
`review-file-source-breadcrumb`;
`editable-review-file-source-tab-content.electron` and
`text-file-editor-tab-content.electron`.

## R3. Large-diff strategy

**Resolved. Four mechanisms, each with its shipped thresholds.**

Four mechanisms ship together:

1. **Virtualisation.** A metrics module supplies a hunk line count of 32, a hunk
   separator height of 32, a default diff header height of 0, and a line height
   derived as font size times 1.8, with block spacing read live from a diff gap
   custom property defaulting to 0.
2. **Lazy per-file loading.** A file's diff is fetched as it approaches the
   viewport, through an intersection observer with a 300px lower root margin,
   with a disk fallback for branch, unstaged and uncommitted sources.
3. **Single-file mode.** Past a size the reference treats as large, the list
   shows one file at a time, with a banner saying so and previous-file and
   next-file controls.
4. **Refusal.** Beyond that, an empty state states the diff is too large and
   directs the user to open the file directly. A separate single-line prompt
   covers one file too large to render, offering to open it in an editor.

Separately, Review omits untracked files past a large count, says how many it
skipped, and offers a copyable interactive cleanup command. That is a filtering
decision in the same area rather than a fifth rendering strategy, which is why
it is listed apart from the four.

**Thresholds.** The diff is produced in the application's own JavaScript worker
in the Electron main process, and the limits are literals in it.

| Limit | Shipped value | Where it applies |
|---|---|---|
| Per-diff output cap | 32 MiB | every diff invocation; a caller may ask for less but never more |
| Aggregate diff cap | 64 MiB | running total across files in one review collection |
| Object read cap | 5 MiB | per blob read, and the default when no size is given |
| Untracked file ceiling | 256 files | applied when the operation source is a review |

Exceeding either diff cap produces a typed error carrying the limit that was
hit, and the panel's too-large empty state is a selector testing precisely that
error type. So the empty state in R3's fourth mechanism is driven by a byte
ceiling, not a line count, and the untracked notice is driven by a file count of
256.

**Single-file mode and the per-file prompt are also resolved**, from the two
predicates that decide them.

Single-file mode engages when **any** of these holds across the review:

| Input | Threshold |
|---|---|
| Changed files | more than 128 |
| Changed lines | more than 9000 |
| Changed bytes | more than 12 MiB |

A single file falls back to the open-in-editor prompt when **any** of these
holds for that file: more than **15000** changed lines, more than **3 MiB**
changed, or a single changed line over **1 MiB**. The same three thresholds are
applied again at hunk scope.

So R3 has no remaining unknown: per-diff 32 MiB and aggregate 64 MiB produce the
refusal state, 128 files or 9000 lines or 12 MiB switches to one file at a time,
15000 lines or 3 MiB or a 1 MiB line sends a file to the editor prompt, and 256
untracked files triggers the omission notice.

Evidence: `review-diff-virtualizer-metrics`; `thread-side-panel-tab-content`
(observer, banner, too-large empty state, untracked notice); `code-diff`
(single-line open-in-editor prompt); installed native host binary (configuration
field names only).

## R4. Whitespace handling

**Resolved as optional, shown by default, from the persisted setting's own
initializer.**

The Review panel's whitespace toggle writes a persisted setting named for hiding
diff whitespace, declared through the application's keyed persisted-setting
factory with an initial value of **false**. Whitespace is therefore shown until
the user hides it. Hiding is a two-way menu item in the review options menu,
which the panel imports. Underneath, the diff cache key distinguishes an
ignore-whitespace read from an exact-whitespace read, so the two are separate
cached results rather than a display-time filter.

The same trace resolves the other diff settings the panel writes:

| Setting | Shipped initial value |
|---|---|
| Diff view mode | unified |
| Hide diff whitespace | false, so whitespace is shown |
| Wrap code diff | false |
| Word diffs enabled | false |
| Diff rich preview | false |
| File source Git blame | false |
| Load full files | true |
| Filter generated files | false |
| Skip revert confirmation | false, so reverts are confirmed |

Note that **rich preview is off by default in the right panel**, while a
separate per-thread record defaults on and is read only by the file-source view.
R6 traces both bindings. Note also that the rich preview setting does not gate
every preview: raster images and PDFs preview regardless.

Evidence: `app-initial` (the nine setting declarations and their initial values,
at recorded offsets, reached by resolving the panel's toggle targets through its
import aliases); `review-preferences-model` (the three review preferences using
the same factory); `pull-request-code-review` (menu items); `code-diff` (cache
key composition).

## R5. Generated-file filtering

**Resolved on mechanism, default, and reveal.**

Generated files are identified by the Git **linguist-generated** attribute, not
a path pattern list. The control is a checkbox in the changed-files tree filter
menu, hiding matching files from both the tree and the review diff list. The
persisted preference **defaults to off**.

**Reveal is the same toggle.** The checkbox sets a single boolean; there is no
per-file reveal in the filter menu and none was found in the changed-files tree
modules. Vendored paths are not separately handled; only the generated attribute
appears.

Evidence: `review-file-tree-side-pane` (checkbox and its single boolean set);
`review-preferences-model` (persisted default off).

## R6. Rich preview

**Resolved from the selector itself: markdown, images and PDFs, each gated
differently.**

The decision is made by one selector in `app-initial`, which `code-diff` calls
for every file and which returns one of four outcomes: markdown, image, pdf, or
an ordinary diff. Reading it directly, rather than inferring from what modules
load, the rule is:

| File | Previews when | Gated by the rich preview setting |
|---|---|---|
| Raster image: avif, bmp, gif, ico, jpeg, jpg, png, tif, tiff, webp | always | no |
| SVG | only with rich preview on | yes |
| Markdown: markdown, md, mdown, mdx, mkd | only with rich preview on, and never for a deletion | yes |
| PDF | always | no |
| Anything else | never | n/a |

Two consequences are easy to get wrong. **Raster images and PDFs preview even
with rich preview switched off**, because the selector reaches them without
consulting the setting. And **markdown preview is suppressed on a deleted
file**, which is an explicit condition, not an accident of rendering.

The suffix test is a plain lowercase extension check on the final path segment,
handling both separators, so it is extension-driven and not content-sniffed.

Under the shipped defaults, then, a Review user sees image and PDF previews
immediately, and gets markdown and SVG previews only after enabling rich
preview.

Supporting modules behind those branches:

- **Images.** A preview source module reachable from the panel reads binary
  content through two host operations, one for a Git object at a ref defaulting
  to head and one for a file on disk, and lays the two sides out as a one or two
  column grid with a loading label.
- **PDFs.** A PDF diff module renders a before and after pair keyed by kind,
  host, working directory, ref and path, with its own empty and render-failure
  placeholders, and it pulls in the shared PDF pager. Both are reachable from the
  panel without hub transit.
- **Binary fallback.** A binary that cannot be previewed states that it is binary
  and is not shown. A file renamed without content change gets its own statement.

### Which rich-preview setting Review actually reads

Two settings exist and they disagree, so the binding matters.

- A **global** setting, initial value **false**.
- A **per-thread** record, whose derived value falls back to **true** when a
  thread entry is present.

The right panel binds the **global** one: the panel's rich preview value is read
from that setting's atom, traced through the panel's import alias to the
declaration, and the same value is what it passes down for the preview decision
and to the options menu. So **in the right panel rich preview is off until the
user turns it on**.

The per-thread selector is imported by exactly one module in the whole
application, the file-source item renderer. So the file-source view defaults the
other way, to on. A parity implementation that reads one setting for both
surfaces would be wrong in one of them.

**Word document and notebook preview are not Review behaviours.** No chain
reaches either without transiting a hub; both are reached from the artifact tab
content, and the Word preview additionally from a cloud file preview.

The PDF modules are pulled in by a **dynamic import whose preload dependency
list is a plain filename reference**, so they are invisible to a static-import
graph and are established here by the filename-reference graph with hub transit
barred.

Evidence: `use-binary-preview-source` and `pdf-preview-diff` and `use-pdf-pager`,
all reachable as panel to `code-diff` to `use-code-diff-context-menu`, the last
two through that module's dynamic-import preload list at a recorded offset;
`code-diff` (binary fallback, rename statement); `pull-request-code-review`
(panel-imported toggle); `docx-preview-panel` and `notebook-preview-panel` (no
non-hub chain).
## R7. Comment persistence

**Partially resolved.**

Draft comments persist in a dedicated drafts store, held per conversation and
keyed per anchor, where the anchor is a **line and column pair on a side of the
diff**. The model distinguishes a saved comment from a draft, and a
model-authored comment from the user's own. The comment editor cancels on
Escape.

Model-authored comments are **not** in the drafts store: they derive from the
conversation's own turn stream. That is why dismissing one is a view-level act,
and why the confirmation says the comment is hidden from the diff but remains in
the task transcript.

**Store backing, from source.** The drafts store is not component state. It goes
through the application's shared keyed store, the same one that holds durable
records such as the saved remote connection lists. That places drafts in durable
application storage rather than in a per-view lifetime, though the storage
medium behind that shared store was not traced to its final write.

**Unresolved:** what invalidates a saved comment, and what happens when its
lines move. A line-and-column anchor rather than a content fingerprint suggests
a comment does not follow moved lines, but that is an inference from the key
shape, not evidence of runtime behaviour. Closing it needs a runtime
observation, which is currently blocked.

**Superseded by an accepted Reeve decision. This is a design choice, not
reference parity, and must never be described as parity.** The reference's
behaviour here remains unobserved. On the user's authorisation, Reeve adopts the
answer judged best rather than waiting on the observation:

- A comment **follows its line** when the anchor can be re-found reliably and
  unambiguously after an insertion or a move.
- When the line is deleted, or when re-anchoring would be ambiguous, the comment
  **stays visible as detached** rather than vanishing.
- Reeve **never silently reattaches** a comment to a line it is not sure of, and
  **never silently deletes** one.

The reasoning is that a review comment is human work, and losing or misplacing it
without saying so is the worst available outcome; a visible detached comment is
recoverable, a silently moved one is misleading.

Evidence: `review-preferences-model` (drafts store, anchor key, author split,
Escape handling); `use-conversation-diff-comments` (model comments from the turn
stream), reachable through `review-file-tree-side-pane`.

## R8. Viewed state

**Resolved on keying and scope; persistence across restart unresolved.**

The mark keys on the **file's revision**. On marking, the panel stores the
file's current diff revision, falling back to the summary's revision, against
that path; the file reads as viewed only while the stored value matches the
current revision. Marking an already-viewed file stores null, clearing it.

Two consequences:

- A new revision of the same file **clears the mark by itself**.
- The control is offered **only in branch review mode**, because the enabling
  condition tests the source explicitly. It does not appear for uncommitted,
  staged, unstaged, last-turn, or single-commit sources.

**Unresolved:** whether the store survives a restart. Every persisted Review
setting resolved in R4 goes through one named keyed persisted-setting factory,
declaring a key and an initial value. The viewed store does **not** use that
factory: it is a keyed atom family created from an identity function with a null
default. That is a real structural difference from the settings, and it points
at session scope, but the atom family's own backing was not traced, so this is
not proof.

**Superseded by an accepted Reeve decision. A design choice, not reference
parity.** The reference's restart behaviour remains unobserved, and the source
hint above points the other way. On the user's authorisation Reeve takes the more
useful answer instead of the inferred one:

- Viewed marks **persist across a restart**.
- They are keyed by **owner plus file plus the diff revision**.
- A **changed revision clears the mark**, which R8 already establishes as the
  reference's own keying and is kept.

The reasoning is that reviewing a large branch across sittings is the case that
benefits, and revision keying already prevents a stale mark from surviving a real
change. Note this is a deliberate divergence if the reference turns out to be
session-scoped.

Evidence: `thread-side-panel-tab-content` (revision derivation, store write,
branch-mode condition, viewed labels); `review-preferences-model` (the
persisted-preference helper it does **not** use).

## R9. Keyboard map and focus order

**Partially resolved: bindings resolved, focus order not.**

The reference carries a **command registry** in `app-initial` with 126 entries
pairing a command id with its title, its shortcut scope, and per-platform
default keybindings. Review's commands are in it, and three carry shipped
defaults:

| Command | Shipped default |
|---|---|
| Open review tab | Ctrl+Shift+G |
| Toggle side panel, titled Toggle Review panel | CmdOrCtrl+Alt+B |
| Find in thread | CmdOrCtrl+F |

Commands present with **no** default binding, and so user-assignable: toggle
review, toggle maximize side panel, go to definition, navigate back and forward
in file navigation, and the Git commands for commit or push, create pull
request, create draft pull request, create branch, merge pull request, open pull
request, and toggle blame. A keyboard shortcuts dialog and a keyboard shortcuts
settings section ship, so the map is user-visible and user-editable.

Within the review surface, key handling is local rather than registry-driven in
at least one place: the diff comment editor handles Escape directly.

**Focus handling, from source.** Review's own modules contain five imperative
focus calls and one autofocus, and **no roving tabindex and no tree, grid,
listbox or tab ARIA roles**. Focus order is therefore DOM order, steered at a
few points by explicit focus calls, rather than a managed roving pattern. That
is a meaningful negative result: Reeve does not owe a roving-tabindex
implementation for parity.

**Unresolved: the resulting order itself**, and in-surface keys beyond that
Escape. Both need a runtime capture, currently blocked.

**Superseded by an accepted Reeve decision. A design choice, not reference
parity.** The reference's focus order remains uncaptured. On the user's
authorisation Reeve implements the best-practice keyboard model rather than
copying an unobserved one:

- **Tab** moves through interactive controls in the ordinary way, with no focus
  trap anywhere in the panel.
- In the **file tree**: Up and Down move between rows, Home and End jump to the
  first and last, **Left** collapses or moves to the parent, **Right** expands or
  moves to the first child, and **Enter** selects.
- Focus is always **visibly indicated**.

This is a richer model than the reference appears to ship, since R9 establishes
it carries no roving tabindex and no tree roles. Reeve is choosing accessibility
over imitation here, and the tree keys imply the tree roles and roving pattern
that the reference lacks. Recorded plainly so nobody later "fixes" Reeve to match
the reference and removes them.

Evidence: `app-initial` command registry entries at recorded offsets;
`keyboard-shortcuts-dialog`; `review-preferences-model` (Escape).

## R10. Copy and apply

**Section actions take the whole section, not the visible subset.** Asked
directly for [Review 9](https://github.com/AndrewBeniston/omp-reeve/issues/89).

The section pill carries **no file list at all**. Its buttons dispatch with an
empty path and a section scope, and the handler builds the input list itself:
for a section action it reads the **diff query result's own file array**, taken
straight from the successful query data. For a per-file action it returns no list
and instead looks up that single file's revision by path. The typed file search
and the generated-file filter act on a **different** atom — the rendered file
entries used for the tree, scrolling and search — and neither writes back into
the query result the section action reads. So no filter narrows a section action
in the reference.

The section itself is the stage filter, not the viewport: the pill reads whether
the current section is staged or unstaged, offers stage or unstage accordingly,
and hides Revert all entirely in the staged section.

**The reference's safety design is reporting, not narrowing.** It expects a
section action to apply to some files and not others, and ships distinct messages
for exactly that: a partial-success notice for a section, another for a single
file, another for a hunk, alongside the outright failures and a notice that
reverting requires a Git repository. It acts on everything in scope and tells you
what did not apply.

That makes "operate on the visible files" a deviation rather than a safer
reading of the same behaviour. It is also surprising in the direction that
matters: a user who has typed a filter, or who has generated files hidden by a
default-off preference they never set, would see Stage all silently skip changes
that are part of the section. If Reeve wants a narrowed variant, the reference
shape for it is a separate, explicitly labelled action, not a redefinition of
this one.

**Resolved.**

Review offers, per scope:

- **Copy path**, from the diff file header and the file tree context menu.
- **Copy git apply command**, from the review options menu, confirmed by a toast.
- **Apply** and **revert** of a patch, each reporting success, **partial
  success**, and failure distinctly, each refused outside a Git repository with
  a message saying so.
- **Stage**, **unstage**, and **revert** at three scopes, hunk, file and
  section, each with its own action label, partial success again its own
  outcome.
- Distinct messages when a patch cannot be built for a file, and for a hunk.

Reverting is confirmed by a dialog stating the change is removed, carrying a
don't-ask-again checkbox whose persisted preference **defaults to asking**.

The partial-success reporting corroborates the epic's decision to report partial
failure as partial failure.

Evidence: `code-diff` (scoped stage, unstage, revert labels; patch-missing
messages); `pull-request-code-review` (copy git apply command);
`review-preferences-model` (revert confirmation preference, default asking);
`use-code-diff-context-menu`.

## R11. Empty-state actions


**Resolved.**

Each empty state carries its own text and action: no changes yet; not a Git
repository, offering to create one with a creating state, a success toast and a
failure carrying the underlying reason; last turn reverted, and last turn
committed or reverted, as separate messages; diffs no longer available; no
staged changes and no unstaged changes as separate states, one telling the user
that accepting edits stages them; and a filter-hides-everything state distinct
from having no changes, matched by a separate empty state for the jump-to-file
search.

Several empty states additionally offer to **view the branch diff** when one is
available, which is the most transferable detail: the empty state offers the
next useful comparison rather than dead-ending.

Evidence: `thread-side-panel-tab-content` (no-diff family, stage filter empty
states, untracked notice, branch-diff action); `review-file-tree-side-pane`
(file search empty state).

## R12. External editors

**Resolved. A fixed target registry, detected per target. The earlier answer on
this page said the offered set was dynamic Spotlight discovery; that was wrong,
and this replaces it.**

What Review offers is a **fixed registry of 32 open targets** held in the
Electron main process, each with an id, a label, an icon, a kind, a platform
table, a detection routine and an argument builder. A target appears on the
current platform only if the registry entry has an entry for that platform. The
kinds are editor, terminal, file manager and system default. The families are
the mainstream code editors and their insiders channels, the JetBrains IDEs,
Xcode and Visual Studio, several classic Mac editors, several terminals, the
Windows shells, a Git client, and the platform file manager. That registry is
why the bundle ships artwork for a stable set of known applications.

**Availability is detection, not enumeration.** For every registry entry the
main process asks a worker to resolve that target's launch command. An entry
whose command resolves is available; one whose command does not resolve is
returned with the entry still present and marked unavailable. Windows also
resolves each icon at that point. Reeve's equivalent therefore needs a
per-target probe, not an installed-application scan.

**The user can extend the registry.** A custom-file-handlers setting appends
user-defined targets, each carrying its own command and icon, after the built-in
entries. Detection then runs over the extended list.

**Discovery exists, and it turns on the file's extension, not on the platform.**
The `/usr/bin/mdfind` enumeration is real and is what the earlier answer saw. It
**appends** to the registry list rather than replacing it, and it is gated by one
predicate: the path exists, is a regular file, and its extension is in a fixed
set of **53** extensions. That set is documents, images, audio and video,
archives, design files, the Office and iWork types, `csv`, and `html`. Each
extension in it also carries a short list of preferred bundle identifiers, which
is how the platform's own viewer is hoisted to the front.

Three branches can append, each capped at 5 entries, ranked by recency of use
then use count, with background-only applications and the reference's own bundles
filtered out:

- The path is a web URL or ends in `.html`, which discovers browsers. This is the
  only branch that can fire on Windows.
- The extension is one of the seven Office document types, on macOS or Linux,
  which discovers document applications with the Office default hoisted.
- Otherwise the extension is in the 53-entry set, on macOS or Linux, which
  discovers that file's candidate applications.

**Linux is not a blanket.** An earlier draft of this answer said discovery ran
"on Linux generally"; that was wrong. Linux reaches the per-file branch through
exactly the same extension test as macOS, and only differs in how it enumerates
applications — a desktop-entry lookup rather than Spotlight. Windows never
reaches the per-file branches at all.

**What that means for an ordinary source file.** Source extensions are absent
from the set: no `.ts`, `.js`, `.py`, `.rs`, `.go`, `.md`. A source file in a
review therefore sees the registry alone, on every platform. The review-plausible
exceptions are `.csv` and `.html`, and the image and PDF types, which do take the
per-file branch on macOS and Linux — though Review previews those in-panel
anyway, per R6. When a branch does fire, the resolved mode flips from editor to
native, which also changes which target is offered as primary.

The two discovery modes the code distinguishes, a full scan and a
known-bundle-identifier lookup, belong to the browser branch.

**Preference.** A preferred target is persisted globally and per path, and the
primary entry resolves as the persisted preference when it is available,
otherwise the first available target. Review's file-tree menu opens **without**
persisting the choice, so picking an app there does not change the default.

**Menu shape in Review.** The file-tree context menu carries "Open in {target}"
for the primary target, an "Open with" submenu listing the targets individually,
and copy path. Review includes targets the registry marks hidden; the workspace
browser is a separate scope with its own labels. While the query is in flight the
menu shows a disabled loading entry rather than an empty submenu.

**The diff file header is not the external-editor route.** In Review the panel
overrides the header action with its own control, labelled "Open in" and
described as opening the file in a tab instead of an external editor. That is the
in-app file-source tab of R2. The header's external-editor control is the
default for other surfaces, not for Review.

**The large-file prompt has no Open button in Review.** The single-line
"too large to display here" row renders its "Open in editor" button only when a
can-open flag and an open handler are passed. The Review panel passes neither in
this build, so the row is text only. Reeve should treat the button as a
deliberate improvement if it wants one, not as parity.

Evidence: Electron main process bundle inside the installed archive (the
registry, its platform filter, per-target command detection, custom handlers,
preference storage, and the three Spotlight branches with their cap); the
application-services module inside the same archive (the Spotlight query,
ranking, filtering, and the scan-versus-known modes); `use-target-apps` (the
query, per-target availability and icon enrichment); `review-file-tree-pane`
(menu shaping, hidden targets included, preference not persisted);
`thread-side-panel-tab-content` (the header override);
`code-diff` (the header control and the large-file prompt's gating).

## R13. "Work here"

**Resolved, and it maps onto an existing ticket.**

"Work here" is a **worktree branch setup** modal, reached from the Review
toolbar's Git actions, which the Review panel imports directly. It creates a new
branch or checks out an existing one so the user can commit, push and open a
pull request from that worktree. It validates that a new branch name is not
taken, disables checkout with an explanatory tooltip when the branch is already
checked out elsewhere, and separates its failures into failing to set the
branch, failing to check out, and a fallback.

It does not start work from a reviewed file. The behaviour belongs with
[Review 15. Commit, branch, and publish from Review](https://github.com/AndrewBeniston/omp-reeve/issues/95),
which already covers committing onto a newly named branch and publishing, and
should absorb the worktree branch setup step rather than a new ticket being cut.

Evidence: `local-conversation-git-actions`, imported directly by the Review
panel; its toolbar carries create branch, commit or push, create PR and view PR.

## R14. Model review route

**Resolved in shape.**

A requested review starts a turn whose prompt is composed from a fixed preamble,
a mode-specific instruction block, and the user's own request message. Two modes
ship. The uncommitted mode instructs the model to review the current changes
across staged, unstaged and untracked files. The base-branch mode first resolves
the **merge base** between the current branch and the chosen base, **fails
outright if no merge base is found**, then instructs the model to review against
the named base, naming the merge base commit and directing it to inspect the
changes by diffing against that commit, asking for concise actionable feedback
as an ordinary Markdown response.

Alongside the prompt the request carries a **diff filter** naming the scope, and
the base branch where one applies. Delivery is either inline in the current
conversation or into a separate side chat, the preference described in R17.
Failure to start surfaces as a toast.

The branch flow pins to a merge base rather than a plain two-dot diff. That
matches the epic's base-pinning intent and is worth preserving exactly.

Evidence: `review-slash-command-submenu-registration` (prompt composition, merge
base query and its failure, diff filter, delivery modes); installed native host
(the uncommitted instruction text).

## R15. Pull-request review model


**Resolved, and Review reaches it.**

Each behaviour below sits in a module the Review panel imports, so these are
Review behaviours and not only pull-request-page behaviours.

- **Thread actions**: a thread resolves and reopens and shows a resolved status.
  Replies are first-class. A request-change action exists on a diff comment.
  Comments expand and collapse.
- **Permissions**: a read-only comment form ships separately from the editable
  one, which is how insufficient permission is presented rather than by a
  failing action.
- **Submission failure**: a comment the remote refuses is reported as the remote
  refusing it, with a retry.
- **Stale head**: a dedicated message states the pull request changed while its
  diff was loading, with a try-again action, so staleness is detected during
  load and surfaced.
- **Base pinning**: revision queries are a separate module the panel imports,
  and exact-revision review is gated on its own availability check.
- **Publication prerequisite**: exact-revision review requires the GitHub CLI,
  signed in to the matching account, on the selected host, with a checking state
  before that verdict. Loading, unavailable and empty are three separate states,
  which matters for the epic's requirement that a missing credential never reads
  as an empty list.

Evidence: `pull-request-code-review` (resolve, reply, stale, loading,
unavailable); `review-preferences-model` (request change, resolved status);
`pull-request-readonly-comment`; `revision-review-unavailable-message`;
`pull-request-revision-queries`. All in the panel's import closure, the first,
second, fourth and fifth directly.

## R16. Create-pull-request flow

**Resolved, and Review reaches it.**

The modal is reached from the Review toolbar's Git actions, which the panel
imports. It collects a **title** and a **message**, stating that an empty
description is generated. It shows head and base with an arrow between them,
handles a missing branch on either side, and offers creating a new branch. It
carries an explicit **commit and push local changes** option, so publishing
local work is part of the same act rather than a precondition.

It creates either a normal or a **draft** pull request, and offers to open the
result in the browser afterwards. When a pull request already exists for the
branch it says so and offers to view it instead.

**GitLab** is handled in the same modal, not a separate flow: the same component
relabels throughout to merge request, including a draft merge request and an
open-in-browser action. A separate GitLab merge-request form dialog exists in
the application but is **not reachable from the Review panel**, so Review's
GitLab path is the relabelled modal.

Evidence: `create-pull-request-modal-content`, reachable as panel to
`local-conversation-git-actions` to the modal; `gitlab-merge-request-form-dialog`
(unreachable from the panel).

## R17. Review settings

**Resolved, including where it is reached, what it configures, and what each
setting becomes in native OMP.**

The code review settings module has **no importer** in the web view graph: it is
a lazily registered settings page reached from settings navigation, not from the
Review panel. The graph confirms Review does not reach it.

It configures the **hosted review service that reviews pull requests on a
remote**, and the page says so: its subtitle is about setting the product up to
review pull requests automatically. There are two groups.

Personal preferences: automatic review on or off, described as reviewing pull
requests in repositories where code review is enabled; a review trigger chosen
from on-PR-open, on-every-push and a smart trigger; exhaustive review, which
keeps looking until no new findings appear; and whether credits may be consumed
for reviews after rate limits.

Personal security review preferences: automatic security review, stored as a
two-value preference of always versus the repository default rather than a plain
boolean; a security trigger with **four** options, the three above plus
"whenever code review runs", where the smart option is labelled experimental and
is described as deciding from the changes since the last completed security
review; and two minimum reporting severities from critical, high, medium and
low, one for automatic reviews and one for reviews requested by mentioning the
assistant on the pull request. The surface has its own loading, error, retry and
save-failure states.

**The per-setting mapping into native OMP.** Reeve has no hosted service, no
remote pull-request webhook and no credit ledger, so a faithful mapping asks
what each setting *means* and where that meaning already lives in OMP. Taken one
at a time:

| Reference setting | Native OMP mapping | Recommendation |
|---|---|---|
| Automatic review on/off | Whether Reeve starts a review turn by itself | Keep, as a Reeve preference. The native trigger is local Git state, not a remote pull request. |
| Review trigger: on PR open | No local analogue; a PR is opened from Review, and the changes are already on screen | Drop the option, keep the intent under the commit-and-publish flow: offer a review before publishing. |
| Review trigger: on every push | Reeve can see a push because it performs it | Keep as "review before push", gated on the same preference. |
| Review trigger: smart | Changes since the last completed review | Keep the *idea* but not the label. Reeve can compare against the revision R8 already keys viewed state by. Mark it experimental as the reference does. |
| Exhaustive review | A turn-level instruction to keep going until no new findings appear | Keep. This is a prompt and stop-condition choice in R14's composition, and it costs nothing architecturally. |
| Use credits after rate limits | Model and rate-limit policy | Drop as shipped. Its native neighbour is OMP's model role and provider choice, which is configured elsewhere and must not be duplicated here. |
| Automatic security review, always vs repository default | A second review preset with a security instruction | Keep as one preference. The two-value shape exists because repositories carry policy; Reeve has no repository-level policy store, so a plain on/off is the faithful reduction. |
| Security trigger, four options | As above, plus "whenever a code review runs" | Keep the fourth option: it is the cheapest one to honour, because Reeve already knows when it starts a review. |
| Minimum severity, automatic and manual | A floor applied to what the review reports | Keep both, as a single pair of selectors over the same four severities. **Instruction only** — see the correction below. |
| Loading, error, retry, save failure | Reeve settings already own these states | Keep, from Reeve's own settings conventions. |

The recommendation column is a research reading, not a scope decision. Two
settings have **no native referent** as shipped — the on-PR-open trigger, because
Reeve opens the pull request itself rather than reacting to a remote event, and
the credits allowance, because there is no credit ledger. Both are therefore
**candidates for the epic to rule on against its own constraints**, and neither
is cut here. Everything else maps without a hosted service.

**Where the surface belongs.** Not in the Review panel. The reference reaches it
from settings navigation, and Reeve should do the same, from its settings modal,
so the panel stays a review surface. The one preference that does belong beside
the panel is R14's delivery choice, whether a requested review lands in the
current chat or a separate review chat, because the user picks it per review.

Evidence: `code-review-settings` (no importers in the graph; both preference
groups, the always-versus-repository-default shape, and the four security
trigger options); `app-initial` (settings navigation entries);
`review-slash-command-submenu-registration` (the delivery choice that does map).

**Correction: the severity floor is not a display filter.** An earlier version of
the row above said the floor was "an instruction to the model plus a filter on
what Review displays". The second half was unsupported and is withdrawn.

Nothing on the client filters a review by severity. The word does not appear at
all in any module of the Review panel's closure — panel, diff, file tree, the
preferences model, or the model-comment hook. It appears only on the settings
page that configures the hosted service, and on a separate security surface
outside Review. The floor is enforced where the hosted reviewer posts, so a
below-threshold finding never reaches the client to be filtered.

**What follows for Reeve.** A prompt-side floor is therefore the whole of it, and
it is faithful rather than a reduction: at the only boundary Reeve can observe,
omitting the finding at the source and filtering it on arrival are
indistinguishable. A display filter would be a new feature. One honest caveat,
which belongs in the ticket rather than being engineered away: an instruction is
not an enforcement guarantee, so a model may still volunteer something below the
floor. Treat the floor as advisory and say so.

**A structured landing place does exist, but it is not severity.** Worth
recording, because it is the obvious next question: the local review route's
instructions forbid a structured findings schema and require ordinary Markdown,
while allowing a structured **inline comment** directive for feedback attached to
a changed line, with required title, body and file, and optional start, end and
priority. So the reference does have a machine-readable place for a finding to
land on the diff, and it does carry a priority. But that priority is optional,
free-form in practice, and not tied to the four-value scale the hosted floors
use. The floor and the directive are two different systems in the reference, and
nothing joins them. Building findings-on-the-diff in Reeve is a real piece of
work with a reference shape to copy; it is not required by R17 and should not be
justified by it.

## R18. Slash-command entry

**Resolved.**

**Availability does not depend on a Review tab.** Asked directly for
[Review 13](https://github.com/AndrewBeniston/omp-reeve/issues/93): the reference
registers the review command from the composer, and its gate is Git, not the
right panel. The registration component resolves a Git root for the session's
cwd, behind a host capability probe whose operation source is named for command
registration, and enables the entry when a root resolved and one surface check
passes. Nothing in that path reads a panel, a side-panel tab, or a tab id.

Two details matter for the implementation:

- When the gate fails the entry is **disabled, not hidden**. The component always
  renders a registration; only its enabled flag changes. The command also
  requires an empty composer, which is a separate condition and the only other
  one.
- The full submenu mounts lazily, only once the composer's active slash source is
  this command; until then a lightweight placeholder carries the same enabled
  flag. That is a loading optimisation, not an availability rule.

The single tab read in the whole flow happens **after** submit: having started the
review, it looks at the active tab to decide a layout side effect. A tab is a
consequence of running a review, never a precondition for offering one.

So hiding the command until a session-owned Review tab exists diverges from the
reference twice over: it hides where the reference disables, and it conditions on
a tab where the reference conditions on a Git root. It also puts the check in the
wrong place for [Review 3](https://github.com/AndrewBeniston/omp-reeve/issues/83):
ownership is a property of the changes a request is allowed to read, so it belongs
on the request and its route, not on whether the command is offered. Gating
visibility does not enforce ownership; it only hides the entry point while leaving
the route unguarded.

One qualifier: the surface check beside the Git-root test compares the current
surface against a constant, and I did not resolve which surface it excludes. It
is not a panel or tab test.

Review is a composer slash-command **submenu**, not a single command. It offers
reviewing uncommitted changes and reviewing against a base branch. The
base-branch entry lists branches built from the default target branch, the
current branch and recent branches, de-duplicated, with loading, error and retry
states.

Two details are worth carrying: the branch list is seeded with a default target
branch rather than starting empty, and Git being unusable is diagnosed
specifically. On macOS an unaccepted Xcode licence is detected and explained
with the exact command to run, instead of surfacing a raw Git failure.

Evidence: `review-slash-command-submenu-registration`.

## R19. Approval nudge

**Resolved, including the threshold that was previously unresolved. It is an
approvals feature, not a Review one, and the word "review" in its name is a
false friend.**

The nudge is an offer to **stop approving every command by hand**. It appears in
the composer beside a pending approval request, asks whether the user wants
fewer approval prompts, and offers to let the assistant approve eligible actions
while it works, noting that this may use more credits, with a learn-more link.
Its two actions are keeping manual approvals, which dismisses it permanently, and
accepting, which is the default focused action.

Accepting does one specific thing: it moves the thread into a mode where a
**separate reviewer subagent** vets each command request and the user is asked
only about actions judged potentially unsafe. It writes that as a thread
permission, as the preferred non-full-access mode, and as the agent-mode
preference, so the choice persists beyond the thread that prompted it. The mode
it enables keeps its own accepted-and-rejected tally, which the assistant message
exposes, and a slash command can approve one retry of a single denial, with the
retry still passing through the same check.

**The threshold is three.** A per-conversation counter increments on each manual
approval and the nudge appears when the counter reaches the threshold; the
shipped default is 3, and it is overridable by remote configuration through a
single integer. The nudge is skipped entirely when the user has dismissed it
before, which is stored as one persisted flag, or when the conversation is
already showing one. Clearing it resets that conversation's counter to zero, and
dismissing it clears the nudge in **every** conversation at once. While it is on
screen it defers automatic turns, and it withdraws itself if the connection
breaks. Eligibility also requires the thread to be in the ordinary automatic
mode with the reviewer mode available.

Nothing in the Review panel's import closure references any of this.

**The native mapping, since Reeve already has the destination.** Reeve ships the
same three-way approval choice this nudge exists to sell: ask for approval, an
"Approve for me" mode described as asking only about actions detected as
potentially unsafe, and full access. The reference's nudge is a prompt into the
middle one. So an equivalent in Reeve is small and faithful: count consecutive
manual approvals per session, offer the middle mode once the count reaches three,
write the existing `tools.approvalMode` setting on acceptance, and store one
permanent dismissal. Two parts do not carry over: there are no credits to warn
about, and OMP's middle mode is a policy rather than a reviewer subagent, so the
offer should describe what OMP actually does rather than promise a reviewer.

**Routing correction.** An earlier draft here suggested filing this outside the
Review epic. That was overreach:
[Review 13](https://github.com/AndrewBeniston/omp-reeve/issues/93) names R19 in
its scope and accepts a feature "implemented as research establishes, or
recorded as absent". The nudge stays with #93. What follows is the mapping that
keeps it there.

Evidence: `auto-review-approval-nudge` (the offer, its two actions, the failure
toast, and what accepting sets); `app-primary` (the counter, the threshold and
its remote override, the dismissal flag, the eligibility test, the turn deferral,
and the reviewer-mode tally and denial-retry command); absent from the Review
panel's import closure. Reeve side: its approval-mode setting and the shipped
wording of its three modes.

## R20. Shipped geometry and tokens


**Resolved for the variants Review actually uses.**

Values are read from the Codex theme block, identified rather than assumed
because it carries the 275px sidebar token ADR-0001 already records. Crucially,
they are resolved **through the variant each Review control actually passes**,
not from a generic token. Counting button size props across Review's own modules:
toolbar 20, default 5, small composer 2, icon 1. The toolbar variant therefore
governs the review header and its controls.

An earlier count here said 13 toolbar and included an extra-small variant. Both
were wrong: the count missed sites, and the extra-small and compact props it
picked up belong to a menu item icon and a popover, not to the button component,
which has no extra-small size at all.

Resolving that variant through the component to its utility and then to the
theme block:

| Property | Shipped value | How it resolves |
|---|---|---|
| Review toolbar control height | 28px | toolbar utility height reads the composer-height token, 7 spacing steps |
| Review toolbar inline padding | 8px | toolbar inline-padding token, 2 spacing steps |
| Review toolbar corner radius | 12.5px in the desktop app, 10px without corner-shape support | toolbar radius token points at the large radius, base .625rem times the corner-radius scale; see the radius-scale note below |
| Review toolbar text | 14px at 18px line height | toolbar variant sets the small text size and an explicit line height |
| Changed-file row height | 28px | the row consumes the composer-height token directly |
| Small composer control height | 28px in the desktop app, 20px elsewhere | 5 spacing steps at the root, raised to 7 under the desktop window type |
| Spacing step | 4px | |
| Diff font size | 12px default; one pixel below the chat code size in chat | |
| Diff line height | font size times 1.8, so 21.6px at the default | |
| Diff block gap | 0 | |
| Line-number column minimum width | 1ch, and 4ch in the second context | |
| Icon sizes | 14px, 16px, 18px | |
| Base text size | 14px | |
| Radius, small and medium | 7.5px and 10px in the desktop app; 6px and 8px without corner-shape support | scale applies to both |
| Radius, full | 9999px | |

**The radius scale is conditional, and the desktop app takes the higher branch.**
The large radius resolves as a base times a scale. The base is .625rem in the
main theme block and .5rem in the in-app browser window's block, which does not
apply here. The scale is where the earlier answer stopped too early: it is 1 at
the root, but a feature query on `corner-shape: superellipse()` raises it to
**1.25** and, in the same block, applies a `superellipse(1.5)` corner shape to
the toolbar, medium, large and extra-large radius utilities. The in-app browser
window resets both to 1 and a round corner; the desktop window does not.

So the reference's own desktop app renders the Review toolbar at **12.5px with a
superellipse corner**, not 10px with a round one, on any Chromium that supports
`corner-shape` — which is Chrome 139 and later. This matters for Reeve directly:
Reeve is on Electron 44, whose Chromium is well past that, so Reeve takes the
same branch. Build to 1.25 and the superellipse, and treat the 1× round values as
the fallback for an older engine rather than the target.

The small radius is a half-step weaker as evidence: the feature query redeclares
the medium, large and extra-large radii explicitly but not the small one, which
picks up the new scale only because its root declaration is a calculation over
the same scale variable. The arithmetic is sound; it is simply inferred from
re-evaluation rather than restated.

These agree with the virtualiser independently: it computes line height as font
size times 1.8 from a 12px base and reads the same gap property, defaulting to
0. Two unrelated modules arriving at the same numbers is the strongest geometric
evidence here.

**Interaction states, now traced.** The toolbar utility defines height and inline
padding only, and no hover or focus rule attaches to it. Every state comes from
the button component instead: one base rule shared by all sizes, plus a colour
variant. The base rule is the part Reeve can adopt wholesale, because it is
geometry and opacity rather than colour:

| State | Shipped value | Notes |
|---|---|---|
| Focus ring width | 2px | drawn as a ring, with the native outline suppressed |
| Focus ring offset | 0 | an inset option exists and moves the ring inside the box |
| Focus ring colour | the ring token | adapter contract; one block remaps it to the editor's focus border |
| Disabled opacity | 0.40 | with the default cursor |
| Disabled hover | suppressed | every hover rule is gated on the control being enabled |
| Border width | 1px on every size Review uses | mostly with a transparent colour, so it reserves space without showing |
| Pressed / active | **no rule** | see below |

The colour variants Review passes are ghost (10 uses), secondary and outline (5
each), an active-text ghost (4), a tertiary ghost (2), and one each of a muted
ghost, danger and primary. Their state structure is consistent and worth copying:

- Hover is a background wash at **8% in light and 12% in dark**, expressed as a
  percentage of a single alpha base colour. The secondary variant instead sits on
  a 5% fill and hovers to 10%; danger sits on 10% and hovers to 20%.
- **The open state of a menu trigger reuses the hover treatment exactly.** A
  control whose menu is open looks hovered. This is the single most copyable rule
  here and the easiest to miss.
- Two ghost variants change **text** colour on hover and keep the background
  transparent, rather than washing the background.
- Outline is the only Review variant with a visible border; it also carries a
  soft 8%/12% fill.

**There is no pressed state.** No variant Review uses defines an active or
pressed rule, and none carries a pressed ARIA attribute; a hover-active token
exists in the theme at 12% light, but no Review variant references it. Pressed
feedback in Reeve would therefore be an addition, not parity.

One Electron-specific detail: the icon size and the small composer size both
change under the desktop window type. The icon button takes the medium radius
rather than a full round, 4px padding rather than 2px, and an 18px glyph.

Evidence: bundle stylesheets `app`, `app-initial`, `app-primary`;
`review-diff-virtualizer-metrics`; `review-file-tree-pane` (which tokens the
rows consume).

## Runtime validation: closed by decision, not by observation

**Status.** The three items below were never observed. On the user's explicit
authorisation they are now **closed by accepted Reeve design decisions**, recorded
in R7, R8 and R9. That authorisation supersedes the earlier requirement for a
manual reference observation.

Each decision is a **product choice, not parity**. Nothing in this document should
be read as claiming Reeve matches the reference on comment re-anchoring, viewed
persistence, or focus order. If the reference is ever observed and differs, the
difference is a known divergence rather than a defect, and the decision stands
until the user says otherwise.

The original reasoning is preserved below because it explains why an observation
was wanted, and the companion checklist is retained should anyone want to close
the loop later.

Three items need a runtime observation in the reference application: the focus
order itself and the in-surface key map beyond Escape (R9); comment
invalidation and line movement (R7); and viewed-state persistence across
restart (R8).

Computer-use automation refuses to drive the reference application, reporting
that it is not allowed to use that application for safety reasons. That refusal
is accepted as given: it is not circumvented through screenshots, scripted
input, or any other control mechanism. Supplied screenshots later settled
appearance, but none of these three is an appearance question, which is why the
decisions above were taken instead.

## Tickets affected

### What can proceed before the three manual observations

#### Review 13's mapping, reconciled with "nothing is sent without an explicit action"

[Review 13](https://github.com/AndrewBeniston/omp-reeve/issues/93) owns R14, R17,
R18 and R19 together, and its third criterion governs all four. Read it as a
**send** rule: no turn starts, no review request leaves, and no message is
written unless the user did something that means it. Changing a stored preference
is not a send; firing a review is.

On that reading the four resolve cleanly:

- **The nudge belongs here and satisfies the rule.** It sends nothing. It appears
  after three consecutive manual approvals in a session, offers Reeve's existing
  middle approval mode, and changes `tools.approvalMode` only on acceptance. Ask
  stays the default, declining is permanent, and the offer must say plainly that
  accepting means future eligible commands run without a prompt — that sentence
  is what keeps a consent-reducing offer honest. The reference's reviewer
  subagent and credits warning do not carry over.
- **Automatic review is armed, never ambient.** Every trigger it ships is a
  moment the user caused, so "automatic" here means armed by me and fired by my
  own action. Default the whole group off.
- **The on-PR-open trigger does have an analogue after all**, and the earlier
  "no native referent" reading was too quick. Reeve opens pull requests itself
  (R16), so the trigger becomes *review when I publish a pull request from
  Reeve*. Publishing is the explicit action, which is exactly the shape the
  criterion wants. The same holds for the on-every-push trigger, since Reeve
  performs the push.
- **The smart trigger is the one that can breach the rule**, because it decides
  by itself whether to review again. Keep it, default it off, mark it
  experimental as the reference does, and confine it to re-reviewing inside a run
  the user already started. It must never wake a session.
- **The fourth security option, "whenever a code review runs", is free**: it
  inherits whatever explicit action started the review it attaches to.
- **Exhaustive review and the two severity floors raise no send question.**
  Exhaustive extends a turn the user already authorised; give it a bound so it
  cannot run away. The floors are an instruction plus a display filter.
- **Credits: omit the control, but say why.** Do not drop it silently. Show the
  row disabled with an explicit note that it is unavailable because model spend
  follows the configured provider policy rather than a credit ledger. That
  records the absence the way the criterion's "or recorded as absent" allows, and
  it stops a future reader assuming the setting was missed.

Nothing above needs a hosted service, and nothing above sends without a user
action. The one genuine tension is the nudge, and it is a tension about future
consent rather than about sending: it is resolved by defaulting to ask, stating
the consequence in the offer, and honouring a permanent decline.

The three open runtime items (R7 comment invalidation, R8 restart persistence,
R9 focus order) do not hold up most of the epic, because each one is a detail
inside an answer that is otherwise settled in source.

**Ready in full from source:** R2 and R12 settle opening a reviewed file; R3
settles the large-diff thresholds and the four mechanisms; R4 settles the nine
diff-control defaults; R5 settles generated-file filtering; R6 settles the rich
preview selector and its two differing defaults; R10 settles the scoped apply
actions and the revert confirmation; R11 settles the empty states; R13 and R16
settle branch setup and pull-request creation; R14 and R18 settle the model
review route and its entry point; R15 settles the pull-request review model; R17
now carries its per-setting mapping; R20 settles the geometry for every variant
Review uses, apart from interaction-state colour, which is a CSS trace rather
than a runtime question.

**Formerly held on an observation, now decided:**

- Keyboard work proceeds on the accepted model in R9: ordinary Tab through
  interactive controls with no trap, and full arrow, Home, End and Enter handling
  in the file tree. The shipped bindings from source still apply.
- Viewed-state work proceeds as revision-keyed and branch-mode-only, and
  **persists across a restart**, keyed by owner, file and revision, per R8.
- Comment work proceeds on the re-anchoring rule in R7: follow the line when the
  anchor is reliable and unambiguous, stay visible and detached when it is not,
  never silently reattach or delete.

All three are Reeve decisions rather than observed parity, and each is labelled
as such at its answer.

- [Review 15. Commit, branch, and publish from Review](https://github.com/AndrewBeniston/omp-reeve/issues/95)
  should absorb the "Work here" worktree branch setup step from R13.
- [Review 11. Open a reviewed file where I want it](https://github.com/AndrewBeniston/omp-reeve/issues/91)
  can be specified in full from R12 and R2 now. The external route is a fixed
  registry of targets probed one by one for a launch command, extensible by a
  user setting, with a preferred target persisted globally and per path and
  **not** persisted when chosen from the file-tree menu. Spotlight discovery is
  not part of the source-file route. The in-app route is the file-source tab,
  which the Review panel wires to the diff file header in place of the header's
  external-editor control, and which R2 bounds at 20 MiB for the read and 10 MiB
  before the view is read-only.
- [Review 7. A large diff stays readable](https://github.com/AndrewBeniston/omp-reeve/issues/87)
  should note that the reference's single-line too-large row is text only inside
  Review: its "Open in editor" button needs a can-open flag and a handler that
  the Review panel does not pass. An escape hatch there is an improvement on the
  reference, not parity, and the natural one is the R12 file-tree route.
- The large-diff ticket should carry four mechanisms plus the untracked-file
  omission notice, with the shipped thresholds in R3: 32 MiB per diff and 64 MiB
  aggregate for refusal, 128 files or 9000 lines or 12 MiB for single-file mode,
  15000 lines or 3 MiB or a 1 MiB line for the per-file editor prompt, and 256
  untracked files for the omission notice.
- The generated-file ticket should be specified against the Git
  linguist-generated attribute, default off, revealed by clearing the filter.
- The viewed-state ticket should be specified as revision-keyed and
  branch-mode-only.
- The rich-preview ticket should follow the shipped selector: raster images and
  PDFs preview unconditionally, SVG and markdown only when rich preview is on,
  markdown never for a deletion, and the setting the right panel reads defaults
  off while the file-source view reads a different one that defaults on. Word
  and notebook preview are other surfaces and are not Review parity.
- The diff-controls ticket should carry the nine shipped defaults in R4:
  unified mode, whitespace shown, wrap off, word diffs off, rich preview off,
  blame off, full files on, generated-file filter off, revert confirmation on.
- The keyboard ticket should note that Review uses **no roving tabindex and no
  tree or grid ARIA roles**, so focus order is DOM order with a few explicit
  focus calls.
- The review-settings ticket can be written from the per-setting mapping in R17.
  Eight settings have a clear native referent. Two do not, as shipped: the
  on-PR-open trigger and the credits allowance. Those two are raised for the
  epic to rule on against its own constraints; this document does not drop them.
  The surface belongs in Reeve's settings rather than the panel, with only R14's
  delivery choice beside the panel.
- The approval nudge is an approvals ticket, not a Review one. R19 now carries
  the shipped threshold of three manual approvals and the exact state it writes,
  and Reeve already ships the approval mode the nudge sells, so an equivalent is
  a small surface over the existing setting. The epic still decides whether it
  wants one.
- R9's shipped bindings are available to the keyboard ticket; focus order still
  needs a runtime capture.
- [Review 5. A diff reads the way the reference presents it](https://github.com/AndrewBeniston/omp-reeve/issues/85)
  and [Review 19. Reeve's colours and the reference's geometry](https://github.com/AndrewBeniston/omp-reeve/issues/99)
  both need the corrected R20 numbers: the desktop app scales every radius by
  1.25 and applies a superellipse corner, so the toolbar radius is 12.5px rather
  than 10px; the small composer control is 28px rather than 20px under the
  desktop window type; there is no pressed state; a menu trigger held open takes
  the hover treatment; the focus ring is 2px at zero offset; and disabled is 40%
  opacity with hover suppressed.
