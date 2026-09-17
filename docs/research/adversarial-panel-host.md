# Adversarial audit of the panel host and header

Research for [#337](https://github.com/AndrewBeniston/omp-reeve/issues/337), under
[the adversarial audit map](https://github.com/AndrewBeniston/omp-reeve/issues/332).
Read on 2026-09-17.

## Audit status

This report stopped at the ticket's 200,000-token hard limit. It is not the
complete resolution report. No resolution comment was posted.

The completed work covers the epic, all thirteen child bodies, the native
dependency graph, the acceptance ticket, ADR-0014, the host research, live-check
#111, the orchestrator handoff, and an initial current-source pass.

The remaining work is listed at the end. A later pass must complete that work
before anyone uses this document to correct the plan.

## Sources checked

- Epic #148 and children #149 to #157 and #182 to #185.
- Audit map #332 and audit ticket #337.
- Native blockers #111, #120, #140, #141, #143, #146, #178, #179, and #181.
- Bottom placement epic #139.
- `docs/research/panel-host-and-header.md`.
- ADR-0014.
- The panel-host orchestrator handoff.
- Current Reeve source at `origin/main`.
- Current installed OMP package source, version 18.1.6.

No reference bundle value was copied into this report.

## Verified findings

### The ticket bodies do not match the native dependency graph

GitHub's native dependency graph contains blockers that several bodies omit.
The orchestrator correctly says that native blockers control the frontier.
The stale bodies can still mislead a worker or reviewer.

| Ticket | Body says | Native graph says | Recommended correction |
| --- | --- | --- | --- |
| #149 | #141 | #141 and #179 | Add #179 to the body. |
| #150 | #140 and #141 | #140, #141, #178, and #179 | Add #178 and #179 to the body. |
| #151 | #140 and #143 | #140, #143, #178, and #181 | Add #178 and #181 to the body. |
| #153 | #143 and #151 | #143, #151, #181, and #183 | Add #181 and #183 to the body. |
| #156 | #111, #149, and #150 | #111, #149, #150, and #182 | Add #182 to the body. |
| #157 | #149 to #156 | #149 to #156 and #182 to #185 | Add #182 to #185 to the body. |

### The ticket budgets conflict with audit check 6

Audit map #332 requires each ticket to fit one worker with a 200,000-token goal.
All thirteen child bodies plan for 150,000 tokens and stop at 250,000 tokens.
Epic #148 and the orchestrator handoff repeat the 250,000-token stop.

Recommended correction: set each worker goal to 200,000 tokens. Keep the target
near 150,000 tokens. Make 200,000 tokens the hard stop in the epic, children,
and handoff.

### Several current Reeve statements are stale

Current Reeve already registers `Cmd+Alt+B` and shows a header panel toggle.
The desktop menu calls this command `Toggle panel`. The reference title is
`Toggle Review Panel`.

Current Reeve already computes the right panel maximum from the workspace width
with a 352px chat reserve. It does not apply the old 1200px ceiling on normal
desktop layouts. The 1200px constant remains only as a fallback.

Current Reeve already has a Session summary panel and a header toggle. The panel
shows environment data, Session actions, branches, the system prompt, usage,
subagents, and sources. Ticket #155 still treats this mapping as unknown.

Current Reeve still stores right-panel open state in component state. It stores
the width in local storage. It stores the maximised state in the resizer. It
does not use the planned per-Session workspace record.

Current Reeve still keeps a ten-entry closed-Tab stack in a ref. It excludes
Terminals through a hard-coded kind check. It loses this stack on restart.

Current Reeve still has five plain Tab variants. It has no capability
declarations from ADR-0014.

Current Reeve's Session identity shows a visual ellipsis. The ellipsis is not
an operable Chat actions menu.

Recommended corrections:

- Change #149 from building the toggle to correcting its menu title and testing
  its empty-panel behavior.
- Remove the stale 1200px-ceiling work from #150.
- Make #155 explicitly map the reference command to Reeve's existing summary
  panel after #111 records the reference contents.
- Keep the workspace-record, declaration, reopen, and header-menu work.

### The acceptance ticket does not satisfy audit check 8

Ticket #157 requests a checklist sweep, the full suite, and a changelog entry.
It does not require separate visible and backend evidence.
It does not name error, keyboard, accessibility, persistence, reload, reconnect,
mobile, zoom, or multi-Session evidence.

Recommended correction: add two evidence sections to #157. The first section
must record visible desktop behavior against the Fixture. The second section
must record workspace records, native messages, persistence, reload, and failure
behavior. Add explicit rows for keyboard, accessibility, mobile, zoom,
reconnect, and two concurrent Sessions.

### The orchestrator handoff contains stale execution data

The handoff correctly names Epic #148, thirteen children, branch
`codex/panel-host`, the bottom-placement dependency, and the model selectors.
It correctly requires progress as closed tickets divided by all tickets.

The handoff uses the 250,000-token worker stop. This conflicts with audit check
6. The handoff also says to start #149 and #150 after Epic #139 merges. The
current native graph has more precise child blockers. A future handoff must use
the native frontier after the merge.

Recommended correction: change the worker hard stop to 200,000 tokens. Replace
the fixed first pair with an instruction to query the native frontier after
Epic #139 merges.

## Partial feature-to-ticket traceability

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- |
| Toggle right panel | Implemented with `Cmd+Alt+B` | Host research, current menu source | #149 | Source read | Menu title differs. Empty-state behavior still needs a live check. | Narrow #149 to the title, Launcher behavior, persistence interaction, and live proof. |
| Hide Tab strip | Absent | Host research, current shell source | #149 | Source read | No keyboard, accessibility, reload, or placement-state criteria. | Add those criteria to #149. |
| Full view | Width maximisation exists | Host research, current layout source | #150 | Source read | The current implementation uses width state and `Ctrl+]`. | Keep the layout-mode migration. Remove the stale ceiling task. |
| Full-width restore rules | Absent | Host research and ADR-0014 | #182 | Ticket trace | Resize, reload, and each kind flag need separate evidence. | Expand #182 acceptance with record and desktop proof. |
| Tab capability declarations | Absent | ADR-0014 and current Tab union | Bottom epic blockers | Source read | Host work cannot start before the declarations and record land. | Keep the native blockers authoritative. |
| Strip menu | Browser-only native menu exists | Host research and current TabBar source | #151 | Source read | The ticket omits keyboard reorder and drag-to-pin evidence. | Add keyboard and drag-to-pin acceptance. |
| Reopen closed Tab | Ten-entry volatile ref | Host research and current shell source | #183 | Source read | Cancellation, unavailable routes, reload, and project change require proof. | Add these states to #183. |
| Detach Tab | Absent | Host research | #153 | Ticket trace | The acceptance omits pin-to-front and focus-source behavior. | Add both behaviors and detached-window accessibility. |
| Move Tab to Session | Absent | Host research | #185 | Ticket trace | Failure, cancellation, target closure, and two-Session persistence are absent. | Add those states to #185. |
| Find current surface | Absent | Host research | #152 | Ticket trace | Empty results, retry, cancellation, focus return, and Browser failure are absent. | Expand #152 acceptance. |
| Application navigation | Browser-only back and forward exist | Host research, live-check #111, current source | #184 | Source read | The application stack scope remains live-unverified. | Keep #111 as a blocker and test two windows and two Sessions. |
| Session Chat actions | Visual ellipsis only | Host research and current header source | #154 | Source read | The ticket groups many unrelated actions and error paths. | Split supported local actions from new-window and deferred actions. |
| Share | Absent | Host research | #154 decision | Source read incomplete | Current OMP support still needs a complete source check. | Do not retain `Coming soon` until the OMP source check finishes. |
| Pinned summary | Reeve summary panel exists | Current summary source | #155 | Source read | The reference contents and enabled state remain live-unverified. | Rewrite #155 around the verified existing panel after #111. |
| Header geometry | Existing Reeve geometry only | Host research and #111 | #156 | Research read | #111 remains open. Mobile and zoom criteria are absent. | Keep #111 blocking and add mobile and zoom measurements. |
| Acceptance | Checklist only | #157 | #157 | Ticket read | Visible and backend proof are not separate. | Add separate evidence sections and all map #332 states. |

## Remaining work before resolution

1. Complete the OMP 18.1.6 source check for Share, deeplinks, archive, export,
   fork, continuation, naming, and summary data.
2. Re-check every reference value still marked unknown. Read the extracted web
   and main-process bundles only where the existing research lacks a value.
3. Complete the traceability table for every capability in the host research
   and all thirteen children.
4. Check all loading, empty, failure, retry, cancellation, and destructive
   states.
5. Check every keyboard, accessibility, mobile, zoom, persistence, reload,
   reconnect, and multi-Session path.
6. Assess ticket size after the completed state inventory. Tickets #153 and
   #154 are likely split candidates, but that conclusion is not final.
7. Run GitNexus change detection after the final document edit.
8. Verify the final document contains no private path, machine name,
   credential, or vendor code.
9. Commit the completed report and post that exact report as the resolution
   comment on #337.

