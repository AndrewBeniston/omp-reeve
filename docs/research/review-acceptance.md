# Review acceptance evidence, epic 80

Status: Accepted by the maintainer on 2026-09-16. Merge and release preparation continue in issue 278.

This document records what is verified for the Review capability, and how.
It is the durable record. The temporary run artefacts are removed.

## 1. Evidence classes

| Class | Meaning |
|---|---|
| Test | An automated test in this repository asserts it. |
| Source | A reviewer read the shipped source and the documented contract. |
| Live | An operator drove the running desktop application and read the result. |
| Pixels | An operator inspected a screen capture, not only the accessibility tree. |

## 2. Test totals, at the pre-merge release check

- Integrated suite: 2183 pass, 6 skip, 0 fail. The earlier CSS token failure is
  corrected, and the suite ran again after the correction.
- Clipboard and Review copy: 14 pass, 0 fail.
- Scroll anchor and file rendering: 23 pass, 0 fail.
- Typecheck: exit 0.

The Review test files sit beside the code they cover. There are 86 of them under
`lib/review-*.test.mjs`, `components/review/*.test.mjs`, `lib/clipboard.test.mjs`,
`components/FileIcons.*.test.mjs` and `app/corner-shape.test.mjs`.

## 3. Capability groups, all 74 stories

Each row gives the story numbers, the evidence class, and the state.
"Part" means one named item inside the group is still open. Section 6 names it.

| Group | Stories | Class | State |
|---|---|---|---|
| Opening Review, binding, tab state, restart | 1, 2, 5 | Live, Pixels | Verified |
| Per-tab scope, file and scroll isolation | 3, 14 | Live, Pixels | Verified |
| Window layout, resize, maximise, reopen | 4 | Live | Verified |
| Scopes: uncommitted, staged, unstaged, branch, commit | 6 to 10 | Live, Test | Verified |
| Last agent turn, and when it cannot be trusted | 11, 12, 13 | Live | Verified |
| Changed-file tree, filter, steppers, hidden list | 15 to 18 | Live, Pixels | Verified |
| Diff reading: renames, modes, split, word diffs, wrap | 19 to 21, 28 | Live, Pixels | Verified |
| Context expansion and whole-file load | 22 | Live | Verified |
| Whitespace, generated and vendored files | 23, 24 | Live | Verified |
| Previews: images, rich content, binary, conflicts | 25 to 27 | Live | Verified |
| Large diffs: limits, omissions, scroll behaviour | 29, 30 | Live | Verified |
| Viewed marks and keyboard operation | 31, 32 | Live | Verified |
| Stage, unstage and revert, with a Git readback | 33, 34 | Live, Test | Verified |
| Stale patch refusal, partial failure, unrelated edits | 35, 36, 37 | Live | Verified |
| Copy diff, copy patch command, copy path | 38, 42 | Live, Test | Verified |
| Empty states and their actions | 39 | Live | Verified |
| Open a file in a tab or an external editor | 40 | Live | Verified |
| Work here, starting work from a reviewed file | 41 | Live | Verified |
| Commit, new branch, push | 43, 44, 45 | Live | Verified |
| Local comments: create, edit, delete, range | 46, 47 | Live | Verified |
| Model findings: cards, dismiss, moved lines | 47 | Live, Pixels | Verified |
| Comment persistence and Session anchoring | 48, 49 | Live | Verified |
| Send a comment to the Composer, file references | 50, 51 | Live | Verified |
| Ask the agent to review, and never publish by accident | 52, 53 | Live | Verified |
| Pull requests: list, search, open, read files | 54, 55 | Live | Verified |
| Published threads: read, reply, edit, delete, resolve | 56 to 59 | Live | Verified |
| Submit a review: approve, comment, request changes | 60, 61, 62 | Live | Verified |
| Drafts: separation, explicit publish, uncertain writes | 63, 64 | Live | Verified |
| Stale head and base pinning before a publish | 65, 66 | Live | Verified |
| Permission, authentication and remote data failures | 67, 68 | Live | Verified |
| Create a pull request from Review | 69 | Live | Verified |
| On-disk change pickup, background and manual refresh | 70, 71, 72 | Live | Verified |
| Theme colours and typed file icons | 15, 73 | Pixels, Source, Test | Verified |
| Spacing, icon sizing, corners, interaction states | 74 | Live, Source, Test | Verified |

## 4. Notes on four groups

**Scroll and tabs, stories 3 and 14.** The diff column keeps its position across a
scope change, a return and a file filter. Two Review tabs with different owners
keep separate positions. Tests: `lib/review-scroll-anchor.test.mjs`,
`lib/review-tab-registry.test.mjs`, `components/review/ReviewFiles.render.test.mjs`.

**Copy actions, stories 38 and 42.** All three copies were checked live with a
clipboard readback against a sentinel value. A rejected clipboard API now falls
back to the document command. Tests: `lib/clipboard.test.mjs`,
`components/review/ReviewFiles.copy-refusal.test.mjs`.

**Operation scopes, story 33.** Staging a hunk reaches the Git index, and the
staged patch holds exactly that hunk's line changes. The operation scopes are
resolved in `docs/research/review-reference.md` as hunk, file and section. This
document does not restate the epic's own wording. Tests:
`lib/review-hunk-binding.test.mjs`, `lib/review-patch.test.mjs`.

**Last turn refusals, story 12.** All ten refusal reasons render live, each one
on its own. The last three were driven from a purpose-built record store, so no
existing record was overwritten. Tests: `lib/review-turn-read.test.mjs`,
`lib/review-turn-attribution.test.mjs`, `lib/review-limits.test.mjs`.

**Refresh and an open comment, story 71.** A failed read kept the last good diff
and kept the text in an open comment editor. Tests:
`lib/review-refresh-state.test.mjs`, `lib/review-watch.test.mjs`.

**Icons and geometry, stories 15 and 73.** A typed icon draws its own asset in its
own colours, and a generic icon follows the interface text colour. The asset
scheme follows the resolved theme class, not the operating system appearance.
Tests: `components/FileIcons.assets.test.mjs`,
`components/review/review-geometry.test.mjs`, `app/corner-shape.test.mjs`.

**Panel geometry, story 74.** The computed values were read from the running
renderer, in the dark theme. The Review panel resolves the hover wash to 12
percent of the interface text colour, which is the documented dark value. The
document root keeps its own hover colour, so the panel restates the token
locally, as the design record states. The control corner hook is unset at the
root, and a Review options button computes a superellipse corner at a 12.5 px
radius. No pixel was measured, and no theme was changed. Tests:
`components/review/review-geometry.test.mjs`, `app/corner-shape.test.mjs`.

**Panel splitter, story 4.** The splitter resizes by pointer and by keyboard.
The user observed the pointer drag on 2026-09-16, in a small window and in a
full screen window, and the width stayed within its limits in both. The keyboard
path was verified earlier, moving the width from 525 px to 513 px and back.

## 5. Limitations of the evidence, not of the product

1. The true clipboard refusal message is covered by a source test only. No live
   pass has produced both copy paths refusing at once.
2. The acceptance fixture holds one hunk per file, so a hunk stage and a file
   stage carry the same content there. Subset isolation rests on the operation
   tests.
3. Story 6, a machine without the Git command, rests on backend evidence and a
   test. It was not checked live, because that needs the server restarted with a
   changed search path.
4. Some captures returned a blank window while the accessibility tree stayed
   alive and answered. A later whole-desktop capture found the application on
   another workspace, and a later application capture drew normally, with the
   renderer holding 288 to 400 MB. These are capture and visibility limits. They
   do not establish that the renderer painted a blank surface.
5. A watcher that fails does not re-subscribe on Refresh. A window reload clears
   the notice. This is an observation, and it may deserve its own ticket.

## 6. Cleanup

The temporary run artefacts are removed. The counts are verified.
Removed: 1795 temporary directories, 47 obsolete scripts, 87 further owned files
and captures, 24 session files, 26 session directories, 70 review turn records,
22 fixture directories, 15 Review tab registry keys, and the acceptance fixture.
The user's own fixture, its sessions, its three review turn records and its
Review tab key are preserved.

## 7. Open

Nothing is open in this document. The maintainer accepted the Review capability
on 2026-09-16, as the status line at the top of this document records.

## 8. Merge gate, separate from acceptance

The two Thermos reviews run once at the merge to the default branch. They are a
merge gate. They do not block user acceptance, and this document does not count
them as acceptance work. No build, no release and no commit is part of this work.
