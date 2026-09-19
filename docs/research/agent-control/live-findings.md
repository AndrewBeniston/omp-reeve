# Live findings against the reference

Recorded 19 September 2026. These are observations of a running Codex Desktop build, not source reading.

Two sources. A Codex Desktop task ran twelve tool checks and pasted its raw results. The maintainer operated the panel by hand.

## Observed

| # | Finding | Source | Tickets |
| --- | --- | --- | --- |
| 1 | The panel tool result for a file, a terminal, a review, and a pull request link is the same object: a queued status and the task identifier. It carries no Tab identifier and no placement. | Tool result | 452, 455, 456 |
| 2 | The bottom host accepts the Terminal only. The plus control in the bottom panel opens every other kind in the right panel. A file target with a bottom placement opens on the right. | Maintainer | 139, 144, 456, 457 |
| 3 | The capture tool without a voice call returns the text "Screen context is only available during an active voice chat for this task." | Tool result | decision 1 |
| 4 | The goal tools return a goal record with a token budget, a used count, and a status. The goal pill sits above the composer. It reads "Goal limited" with used and budget values, and "Goal achieved in 54s" on completion. | Tool result and screenshot | 318 |
| 5 | The Question surface is a card above the composer with a title, numbered options, a free text field, a microphone, a Skip control with a five second countdown, and Send. | Screenshot | 493, 315 |
| 6 | Sub-agent activity renders as two transcript rows, "Created an agent" and "<name> finished". The result arrives as a notification message. No sub-agent Tab was visible in the right panel strip. | Screenshot | 144, 506 |
| 7 | This build exposes no settings read tool and no settings write tool in the task catalogue. The research placed them behind a feature gate. | Tool catalogue | 451, 482 to 492 |
| 8 | The bundled runtime tool reports git, Node.js, pnpm, and Python paths plus a bundle version. | Tool result | decision 9 |
| 9 | The plugin exposes 35 tools with the codex_app prefix in this build. | Tool catalogue | 449 |
| 10 | The spawn row reads "Created an agent" with a disclosure. A click expands it inline to show the name and the instruction text. It opens no Tab. | Maintainer | 144, 506 |
| 11 | The finish row reads "<name> finished". A click opens a Tab in the right panel strip titled with the sub-agent name. The Tab shows the sub-agent conversation: the prompt as a user message, the reply, and its own composer with an access mode and a model selector. | Maintainer | 144, 506, 509 |

## Still open

- Check 11, the visualization block in the transcript. No file was written.
- The sandbox default. The test task ran with full access and no approvals, which is the maintainer's own configuration.
- The settings surface, because the gate is closed in this build.

## Effect on tickets

Ticket 456 states that the result names the real Placement. The reference result does not. That is a Reeve improvement, and the ticket must say so.

Ticket 144 places the sub-agent Tab. The reference bottom host holds the Terminal only, so a bottom placement for sub-agents departs from the reference.

Tickets 482 to 492 build a surface that no observed build exposes. They stay valid as parity work, but no live check can confirm them until the gate opens.
