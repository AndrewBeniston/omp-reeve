# Maintainer decisions on the agent control surface

## Status

Andrew decided these on 19 September 2026.

The decisions answer section 3 of docs/research/agent-control/mapping-reeve.md.

Four decisions stay open. They are marked open.

## Decisions

| # | Capability | Decision | Note |
| --- | --- | --- | --- |
| 1 | Capture of the foreground application, and the capture hotkey | Open | Andrew asked what the capability gives Reeve. |
| 2 | Read the current application page state | Open | This is route one of the same tool as decision 1. |
| 3 | Onboarding questions, option pickers, and the setup flow | Build | Andrew wants a welcome flow for Reeve. This is new product work. |
| 4 | Cloud environment configuration | Open | Andrew did not answer this one. |
| 5 | Scheduled automations by the agent | Defer, named | Record it as a named deferred item. Andrew wants it later. |
| 6 | Host listing and remote hosts | Defer, named | Record it as a named deferred item. Andrew wants it later. |
| 7 | Project creation by the agent | Build | Reeve already creates a project from the interface. |
| 8 | Usage limits and reset credits | Reject | Reeve has no account credit source. |
| 9 | Bundled runtime paths | Open | Andrew asked what Codex uses the runtime paths for. |
| 10 | The Session emoji | Build | Cosmetic, and Andrew wants it if it is good. |
| 11 | Sidebar sections, membership, and ordering | Build both | Build the human control and the agent control. |
| 12 | Plugin removal by the agent | Build | Andrew wants the agent path built in. |
| 13 | The celebration effect | Build | Andrew accepted it. |
| 14 | Pull request attachments on a Session | Build | Reeve already holds pull request data. |
| 15 | The short running summary on the activity row | Build | It changes the live activity header of epic 224. |
| 16 | Instruction text for each adopted control | Build, with a limit | Only an adopted control receives instruction text. |

## Counts

Andrew accepted nine capabilities.

Andrew rejected one capability.

Andrew deferred two capabilities, and both need a named deferred item.

Four decisions stay open.

## Effect on the ticket list

Decision 3 creates new product work. An onboarding flow does not exist in Reeve today.

Decision 11 needs two tickets, one for the human control and one for the agent control.

Decision 16 needs a context budget rule, because instruction text loads into every Session.
