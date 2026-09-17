# Adversarial audit of the Files surface

Status: incomplete because the audit reached its 200,000-token hard stop.

This checkpoint records only verified findings. It is not the resolution report
for issue #334.

## Sources checked

- Epic #129 and all fourteen child issues.
- Native blockers for every child issue.
- Audit map #332 and audit ticket #334.
- The acceptance ticket, #138.
- `docs/research/panel-files.md`.
- ADR-0014.
- The Files orchestrator handoff.
- Reeve at `2920ac0`.
- OMP 18.1.6 source from the repository dependency.
- The prior language-server correction on issue #69.
- The open runtime blocker, issue #112.

## Verified corrections

### Current OMP invalidates the separate language-server plan

OMP 18.1.6 contains an exported LSP subsystem under
`@oh-my-pi/pi-coding-agent/lsp`.

It already owns configuration, process lifecycle, idle shutdown, crash cleanup,
document synchronization, and LSP requests.

Its public `LspTool` supports definition, type definition, implementation,
references, hover, diagnostics, symbols, rename, and code actions.

OMP resolves project-local binaries before `PATH` binaries.

OMP does not download the reference application's pinned server bundle.

Issues #136 and #176 must first decide how Reeve uses OMP's LSP subsystem.

The current tickets instead specify a second LSP host in Reeve.

That plan duplicates current OMP and conflicts with the epic's native OMP rule.

Recommended correction: replace #136 with a server-provisioning ticket.

The ticket must install only missing reference-compatible servers and record notices.

Recommended correction: replace #176 with an OMP LSP adapter ticket.

The adapter must expose structured definition results to the Files surface.

The adapter must preserve OMP configuration, process ownership, idle shutdown,
and error behavior.

### The reference server and capability tables disagree with the epic

The Files research addendum records six providers.

The providers include SourceKit LSP for Swift.

The epic and issue #136 specify five servers and omit Swift.

The addendum records capability query, locations, and hover as the reference's
three host capabilities.

The addendum explicitly records no type-definition surface.

The epic and issues #137 and #176 require type definition.

Recommended correction: reconcile the extracted reference bundle and main
process before implementation.

If type definition is absent, record it as a deliberate Reeve extension.

If Swift remains in scope, add it to #136, #137, #138, and the Fixture.

### Current Reeve invalidates parts of the original state table

The file tree component is currently unmounted.

The sidebar no longer renders `FileExplorer`.

The Files launcher still opens file search through the command palette.

The desktop Files menu item also uses `CmdOrCtrl+P` and the same `open-files`
action.

Issue #130 must split Search Files from Toggle File Tree at the menu contract.

The current file viewer supports source, preview, diff, images, audio, PDF,
DOCX, live file updates, downloads, and line mentions.

The review file-source path also supports desktop editing and autosave.

The epic's statement that the viewer stays a viewer is stale.

Recommended correction: state that the Files work preserves current media,
document, diff, live-update, download, mention, and review-edit behavior.

### The existing tree cannot satisfy #130 unchanged

Issue #130 says to show the existing file explorer unchanged.

The component still owns uploads, Git status, changed-file rows, and sidebar
specific callbacks.

Issue #173 later removes Git decoration and adds per-Tab state.

The component has no keyboard tree interaction or tree accessibility roles.

Directory load failures are silently ignored.

The root load error has no retry control.

The per-directory spinner has no live accessibility announcement.

Recommended correction: remove "unchanged" from #130.

Add a preparatory component split before #130 or include that split in #130.

The split must preserve uploads outside the Files parity tree unless a maintainer
explicitly removes them.

### Native blockers differ from ticket prose

The native dependency graph adds #174 as a blocker for #135.

The native dependency graph adds #174, #175, and #176 as blockers for #137.

The native dependency graph adds #172 through #176 as blockers for #138.

The orchestrator must use native blockers rather than ticket prose.

### The acceptance ticket is too weak

Issue #138 points to the old parity checklist.

That checklist does not cover current media and document viewers.

It does not separate backend evidence from visible evidence.

It does not require keyboard-only or accessibility verification.

It does not cover mobile, zoom, reload, reconnect, multi-Session state, or failures.

It does not verify every native blocker before acceptance.

Recommended correction: replace its checklist with the final traceability table.

Each row must name separate source, automated, visible, and accessibility proof.

## Orchestrator handoff findings

The handoff correctly names Epic #129, fourteen children, the branch, and the
progress rule.

It correctly directs the orchestrator to native blockers.

It incorrectly says issue #136 is ready before OMP reuse is decided.

It also names the superseded five-server plan.

It says Files 8 depends on issue #112, which matches the native blocker.

Recommended correction: require the LSP architecture correction before dispatching
#136 or #176.

## Remaining audit work

- Complete the feature-to-ticket traceability table.
- Inspect the reference only for missing values.
- Re-check tree drag, search ranking, and the feature-flag default.
- Inspect every file input, output, state, error, retry, and cancellation path.
- Inspect keyboard, accessibility, mobile, zoom, persistence, reload, reconnect,
  and multi-Session behavior.
- Assess every ticket against the one-worker size limit.
- Produce exact issue edits and any new tickets.
- Count the checked capabilities and gaps.
- Post the complete report to issue #334.

