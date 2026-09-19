# Maintainer decisions on the agent control surface

## Status

Andrew decided these on 19 September 2026.

The decisions answer section 3 of docs/research/agent-control/mapping-reeve.md.

Andrew settled every decision. None stays open.

Andrew stated the rule for the four late answers. Codex Desktop has the capability, and Reeve should match it.

## Decisions

| # | Capability | Decision | Note |
| --- | --- | --- | --- |
| 1 | Capture of the foreground application, and the capture hotkey | Build | Route two needs the Electron shell and a voice session. Build the hotkey path first. |
| 2 | Read the current application page state | Build | This is route one of the same tool as decision 1. It needs no image. |
| 3 | Onboarding questions, option pickers, and the setup flow | Build | Andrew wants a welcome flow for Reeve. This is new product work. |
| 4 | Cloud environment configuration | Build | Reeve needs a cloud environment first. That is a product direction, not one ticket. |
| 5 | Scheduled automations by the agent | Defer, named | Record it as a named deferred item. Andrew wants it later. |
| 6 | Host listing and remote hosts | Defer, named | Record it as a named deferred item. Andrew wants it later. |
| 7 | Project creation by the agent | Build | Reeve already creates a project from the interface. |
| 8 | Usage limits and reset credits | Reject | Reeve has no account credit source. |
| 9 | Bundled runtime paths | Build | Reeve must ship a Python and document libraries in the desktop package. |
| 10 | The Session emoji | Build | Cosmetic, and Andrew wants it if it is good. |
| 11 | Sidebar sections, membership, and ordering | Build both | Build the human control and the agent control. |
| 12 | Plugin removal by the agent | Build | Andrew wants the agent path built in. |
| 13 | The celebration effect | Build | Andrew accepted it. |
| 14 | Pull request attachments on a Session | Build | Reeve already holds pull request data. |
| 15 | The short running summary on the activity row | Build | It changes the live activity header of epic 224. |
| 16 | Instruction text for each adopted control | Build, with a limit | Only an adopted control receives instruction text. |

## Counts

Andrew accepted thirteen capabilities.

Andrew rejected one capability.

Andrew deferred two capabilities, and both need a named deferred item.

## Effect on the ticket list

Decision 3 creates new product work. An onboarding flow does not exist in Reeve today.

Decision 11 needs two tickets, one for the human control and one for the agent control.

Decision 16 needs a context budget rule, because instruction text loads into every Session.

Decision 1 splits into three parts. The hotkey path needs no voice session. Route one needs no image. Route two needs the Electron shell.

Decision 4 has a hard dependency. Reeve has no cloud environment today, so the agent control cannot come first.

Decision 9 is a packaging decision. It adds a bundled Python and document libraries to the desktop package size.

## Planner decisions on the specifications

Andrew delegated these on 19 September 2026. The planner decided them for Codex Desktop parity with the OMP harness.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Who owns the single control registration | Spec 449, ticket 452. One in-process extension factory at Session creation. It also carries the sandbox gate. |
| 2 | Control load mode | Match the reference. Core controls load eagerly. The long tail loads on demand. Ticket 454 sets the split after a live measurement. |
| 3 | Instruction budget | 400 characters for each control, 1,500 for the shared block, 6,000 for the set. Ticket 454 measures the real token cost. |
| 4 | Sandbox default | workspace-write. Ticket 490 and 492 state the grant risk. |
| 5 | Pull request attachment record | Reeve-owned. It holds the URL and metadata fetched through gh. It depends on no existing pull request code. |
| 6 | Visualization reference form | A fenced block with a named language. Reeve authors its own skill text and copies no vendor bundle. |

The user stories keep the to-spec form. The 20-word rule governs prose written for Andrew, not a template.

## Published tickets

Six specifications, 446 to 451. Sixty tickets, 452 to 511. Four tickets have no blocker: 452, 464, 468, and 505.

Two groups have no specification yet: capture with the page state read and the onboarding flow, and cloud environments with the bundled runtime packaging.
