# Adversarial audit: Browser and Terminal parity

Research for [#335](https://github.com/AndrewBeniston/omp-reeve/issues/335), under
[audit map #332](https://github.com/AndrewBeniston/omp-reeve/issues/332), for
[Epic #158](https://github.com/AndrewBeniston/omp-reeve/issues/158).

## Status

This report records the verified findings reached before the audit's 200,000-token
hard stop. It is not the resolution report. The reference re-check, the complete
capability matrix, and the final count remain incomplete.

Issue #335 was assigned before research started. The audit read the map, epic,
all twenty children, all current native blockers, both existing audits, the
orchestrator handoff, current Reeve source, OMP 18.1.6 source, and current OMP
18.2.4 source at commit `dbf3afad4894bde827d90f965e77b3fe1c5a95e5`.

The repository research skill requires a background agent. This task had no
background-agent tool, so the source reading ran in the main task.

## Evidence boundary

Verified facts below come from public issue bodies or source files. Recommendations
are proposals only. No reference application code or private machine detail appears
in this report.

Current Reeve source is origin/main at `2920ac07941451fbdffb86998431dc017e1d54b4`.
The repository locks OMP 18.1.6. The current published OMP release is 18.2.4.

## Confirmed corrections

1. Remove the statement that an OMP Session has one working directory.
   OMP 18.1.6 and 18.2.4 both store `additionalDirectories` in the Session header.
2. Add a Terminal ticket for the multi-root source-directory hint and directory
   switcher. Reeve currently drops `additionalDirectories` from its mirrored header.
3. Add #72 as a native blocker for #163. The handoff names this dependency, but
   GitHub does not enforce it.
4. Add a ticket or explicit linked decision for Browser popups. The measured
   reference opens foreground and background popups as panel Tabs. Epic #158 does
   not map that capability.
5. Reduce #114 to the remaining Reeve Edit-menu runtime check. Its other questions
   were settled by the Terminal audit addendum.
6. Reduce #115 to current Reeve runtime checks and the two unresolved rendered
   Browser measurements. Its reference main-process questions were settled by the
   Browser audit addendum.
7. Change every implementation worker hard stop from 250,000 tokens to 200,000.
   Map check six requires each ticket to fit one 200,000-token worker context.
8. Split #166. Registry lifetime, replay, alternate-screen restoration, and
   undo-close form several stateful delivery seams.
9. Split #168. Title fallback, Worktree mismatch, error recovery, theme colours,
   shell selection, and environment policy do not form one worker-sized change.
10. Split #188. Downloads, browsing history, and the navigable settings area each
    own storage, failure, empty, destructive, and persistence states.
11. Split #190. Clipboard screenshot and Composer annotation use different bridges,
    failure paths, and acceptance proof.
12. Expand #190 for the missing annotation states. It omits the coach mark, marker
    visibility, hold-space interaction, and discard confirmation.
13. Expand #188 for download cancellation, failure, unique-name selection,
    acknowledgement, show-in-folder, and prompt-location behavior.
14. Expand #162 for permission denial, dismissal, revocation, unsupported permission,
    reload, and multi-Session behavior.
15. Expand #189 for failed error-page loading, bounded retry, crash-page behavior,
    stale-error cleanup, offline state, and search-provider failure.
16. Expand #166 for attach failure, lost renderer, replay truncation, resize races,
    process exit during detach, and multi-Session ownership.
17. Expand #170 so visible proof and backend proof are separate checklist fields.
    Its current criteria mention one checklist and one full test run only.
18. Replace #170's dependence on mutable audit checklists with a fixed acceptance
    matrix that includes every corrected ticket and explicit maintainer decision.

## Partial feature-to-ticket traceability

| Capability | Current Reeve state | Research evidence | Ticket or decision | Proof | Gap | Recommended correction |
| --- | --- | --- | --- | --- | --- | --- |
| Browser reload and force reload | Toolbar reload only | Browser audit rows 1 and 219 | #159 | Reeve bridge accepts `reload` only | Force reload and page override remain unspecified | Add both command paths and override behavior to #159 |
| Browser find | Absent | Browser audit rows 2 and 220 | #159 | Reeve bridge has no find command | Match count, empty query, no results, next, previous, and focus are incomplete | Expand #159 acceptance |
| Browser page zoom | Absent | Browser audit rows 3 and 4 | #186 | Reeve bridge has no zoom command | Persistence and reload behavior are unspecified | Add per-Tab persistence and reload checks |
| Device toolbar | Absent | Browser audit row 5 | #160 and #187 | No device state exists in Reeve | Keyboard, accessibility, zoom, reload, and narrow-panel states are unspecified | Expand both tickets with the complete state matrix |
| Browser options and print | Absent | Browser audit rows 6 and 7 | #161 | Toolbar has no options control | Print cancellation and failure are unspecified | Expand #161 acceptance |
| Downloads | Absent | Browser addendum, Downloads | #188 | Reeve registers no download handler | Several input, output, error, and persistence states are absent | Split downloads into its own ticket |
| Browsing history | Back-forward stack only | Browser audit row 9 | #188 | No history registry exists | Empty, loading, failure, clear, and persistence states are absent | Split history into its own ticket |
| Site permissions | Denied globally | Browser audit row 10 | #162 | Main process always rejects permission checks and requests | Deny, dismiss, revoke, unsupported, and cross-Session behavior are absent | Expand #162 |
| Site information and failures | Absent | Browser addendum, Certificates and failed loads | #189 | Reeve emits no certificate or failed-load event | Crash, bounded retry, stale cleanup, and failure-page failure are absent | Expand #189 |
| Address search fallback | Bare text becomes `https://` plus text | Browser audit row 15 and addendum | #189, Reeve decision | Current main process has no search provider | The reference search behavior remains unverified | Mark this as a Reeve product decision and define provider errors |
| Browser media state | Absent | Browser audit rows 17 and 18 | #163 and #72 | Tab model has no media fields | Native dependency #72 is missing | Add #72 as a native blocker |
| Browser popup | Opens externally | Browser addendum, Popups | No ticket or explicit epic decision | Reeve always sends allowed popups externally | The reference opens supported popups as panel Tabs | Add a popup ticket or record a linked divergence |
| Screenshot and annotation | Absent | Browser audit rows 22 and 23 | #190 | Composer can accept attachments, but Browser has no capture bridge | Several annotation states are absent | Split screenshot and annotation, then expand annotation |
| Browser restoration scope | Per Project, addresses only | Browser audit row 20 | #165, blocked by #141 and #179 | Registry keys Browser Tabs by Project | Transfer, reload, conflict, and multi-Session behavior need fixed proof | Keep blockers and expand acceptance |
| Agent Browser Tab selection | Every page target is eligible | Issue #49 and current OMP Browser source | #191 | OMP still prefers the first visible page when no matcher exists | The proposed Tab marker does not itself enter OMP target selection | Define the integration that supplies the matcher before implementation |
| Site tools | Absent | Current OMP 18.2.4 source scan | Explicitly out of scope | No WebMCP or page-offered-tool surface exists in OMP | The decision has no reconsideration trigger | Link the decision to an OMP capability trigger |
| Terminal shell lifetime | Ends with the view | Terminal audit rows 5 through 7 | #166 | Component cleanup closes the pty | Ticket is oversized and omits several failure states | Split registry lifetime, replay, alternate screen, and undo-close |
| Terminal keyboard | No custom key handler | Terminal audit rows 12 through 14 | #167 and #192 | Xterm receives default keys only | Menu precedence and platform matrices remain thin | Add explicit per-platform and non-Terminal proof |
| Terminal title and Worktree warning | Shell title only | Terminal audit rows 9 and 10 | #168 | Initial label is `Terminal`; Tab stores one cwd | Multi-root and Worktree transitions are omitted | Split title and workspace state from shell policy |
| Terminal multi-root directory switcher | Absent | Current OMP Session header and workspace source | Declined as out of scope | OMP stores ordered additional workspace directories | The decline rests on a false source conclusion | Add a new Terminal ticket |
| Terminal output scroll and workspace refresh | Default xterm behavior only | Terminal audit rows 16 and 17 | #192 | No refresh scheduling exists | Cancellation, rapid output, inactive Tab, and multi-Session states are unspecified | Expand #192 |
| Terminal font and zoom | Hardcoded 12px and `--font-mono` | Terminal audit row 18 | #169 | Terminal options hardcode both values | Persistence, invalid font, fallback, and reload are unspecified | Expand #169 |
| Windows shell choice | Uses `COMSPEC` | Terminal audit row 20 | #193 | Reeve has no Windows shell setting | Missing executable and fallback states are incomplete | Expand #193 and require Windows backend proof |
| Acceptance | Not implemented | Map check eight | #170 | Ticket names the audit checklists | It does not separate visible and backend proof | Replace with a fixed two-column proof matrix |

## Eight-check progress

| Map check | Status at hard stop |
| --- | --- |
| 1. Map every reference capability | Partial. Browser popup and Terminal multi-root are confirmed omissions. |
| 2. Re-check current OMP | Complete for the identified unsupported claims. Multi-root is a stale conclusion. |
| 3. Cover every input, output, state, and error | Partial. Confirmed omissions are listed above. |
| 4. Cover keyboard, accessibility, persistence, and multi-Session behavior | Partial. Ticket criteria remain too thin. |
| 5. Verify dependencies and blockers | Partial. #72 is missing. #114 and #115 contain stale scopes. |
| 6. Fit each ticket into 200,000 tokens | Failed. Four tickets are clearly oversized, and every hard stop says 250,000. |
| 7. Verify the orchestrator handoff | Partial. The epic, count, branch, progress rule, and selectors are present. The worker hard stop is wrong. |
| 8. Separate visible and backend acceptance proof | Failed. #170 does not require separate proof fields. |

## Remaining work

The next audit task must inspect the reference bundle only for unresolved values.
It must finish all Browser and Terminal capability rows. It must inspect every
ticket for keyboard, accessibility, mobile, zoom, reload, reconnect, persistence,
and multi-Session behavior. It must verify ticket sizes and every native dependency.
It must then replace this partial table with the complete traceability matrix.

The completed report must state final capability and gap counts. Only that complete
report should be posted as the resolution comment on #335.
