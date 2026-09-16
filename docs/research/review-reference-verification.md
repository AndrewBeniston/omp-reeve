# Manual reference verification: retained, no longer required

**Status: not required.** On the user's explicit authorisation, the three
questions below were closed by accepted Reeve design decisions rather than by
observation. See R7, R8 and R9 in `review-reference.md`, where each decision is
recorded as a product choice and **not** as reference parity.

This checklist is kept for one reason: if anyone later wants to know what the
reference actually does, the method is already written and costs about ten
minutes. Running it can only reclassify a decision as a known divergence; it
cannot reopen the implementation, which is settled.

Companion to `review-reference.md`. Three observations remain that shipped code
cannot answer. Computer-use automation is not permitted to drive the reference
application, so these need a person. Together they take about ten minutes.

Record the reference build at the time of checking; a newer build supersedes an
older read per ADR-0001.

## Setup

A fixture script accompanies this research in the researcher's scratch area:
`make-review-fixture.sh <new-directory>`. It builds a throwaway repository with
a base and working branch, a staged and an unstaged change, image, PDF, SVG and
markdown files that change, an 800-line diff, and 300 untracked files. Delete
the directory afterwards.

## 1. Comment behaviour when lines move (R7)

Comment on a line in the 800-line diff. Edit the file so that line moves down by
ten, and refresh.

**Observe** whether the comment follows the content or stays on the original
line number. Then delete the commented line and refresh, and record whether the
comment is dropped, orphaned, or re-anchored nearby.

Source predicts it does not follow moved lines, because the anchor is a line and
column pair rather than a content fingerprint.

**Decides:** the comment re-anchoring strategy.

## 2. Viewed marks after a restart (R8)

In branch mode, mark two files viewed. Quit the application, reopen it, and
return to the same branch review.

**Observe** whether the marks survive.

Source predicts they do not, because the viewed store is the one piece of Review
state that does not use the persisted-setting factory.

**Decides:** whether viewed state is session-scoped or durable.

## 3. Focus order inside the panel (R9)

Click the review header, then press Tab repeatedly until focus leaves the panel,
writing down the order. Then put focus in the file list and press the arrow keys.

**Observe** the tab order, and whether arrow keys move between file rows.

Source predicts a single linear pass in DOM order and no arrow-key movement,
because Review carries no roving tabindex and no tree or grid roles.

**Decides:** tab order and focus movement inside the panel.

## Recording

For each, note the build, the action, and what happened. Where an observation
contradicts the source prediction above, the prediction is wrong and the
corresponding answer in `review-reference.md` needs revising.
