---
status: proposed
---

# The transcript folds OMP's event stream into the reference's turn model

Reeve renders a Session from OMP's event stream. The reference application
renders a conversation from its own protocol, which names turns, items and
phases that OMP never names. Reeve must show the same transcript the reference
shows, so something has to translate. This records where that translation
lives and what it decides.

Evidence: the twelve research documents under `docs/research/session-*.md`,
read from the shipped reference on 2026-09-15 and cited per ADR-0001.

## The decision

One pure module, the **turn folder**, turns the ordered OMP events and session
entries of a Session into a list of **Turns**. Every transcript component
renders from that list and never from a raw event. The folder has no browser
dependency, so a test can drive it with a recorded event stream and assert the
turn list without a DOM.

### A Turn

A Turn starts at a user message and ends at the next user message. Steered and
queued messages that OMP injects during a run belong to the Turn they interrupt
and render inside it, as the reference does.

The **turn clock** starts at the first `agent_start` after the user message
and stops at `prompt_done`. An abort stops it at the abort round-trip and marks
the Turn stopped. For a Turn loaded from disk, the clock is the span from the
user message entry's timestamp to the Turn's last entry. Elapsed time is
computed, never stored.

### Turn phases

Each Turn is in one of three **phases**: idle, prework, final answer. The
reference reads a commentary flag from its model to tell prework text from the
final answer. OMP has no such flag. Reeve uses this rule instead: an assistant
text block is provisionally the final answer while it streams; a thinking
block, tool call or sub-agent event that follows it reclassifies that text as
prework. The phase is therefore settled only at `prompt_done`. The follow
machine and the response spacer read the provisional phase and accept the
rare correction.

### Activity rows

Every thinking block, tool call and sub-agent lifecycle inside a Turn becomes
one **Activity row**. A classifier maps the OMP tool name and its input onto the
reference's activity kinds: command, read, search, list, edit, web search,
sub-agent, connector tool. Consecutive rows of one kind with one target
collapse into a counted row, and the Turn's past-tense summary is composed from
the kinds present, in the reference's order and capitalisation. The classifier
is a table in one module, so a new OMP tool is one row, not a new component.

### The Divider

Each Turn with activity renders one **Divider**: a disclosure row between the
user message and the final answer whose label follows the turn clock (Working
under 1,000 ms, then Working for, then Worked for or You stopped after). The
Divider carries the count of approval denials in that Turn. Collapse is allowed
only when the final answer has started, the Turn is not stopped, and activity
exists. Each Turn sits inside its own error boundary.

### Notes

A **Note** is a transcript row no participant wrote: a compaction, a model
change, a reconnect, a fork origin, a load failure. Notes come from session
entries (`compaction`, `model_change`) and stream events. Nothing polls the
session file for a state the stream carries.

### Sub-agents

`subagent_lifecycle` carries the parent tool call id, so each sub-agent action
attaches to the Activity row of the tool call that spawned it, as a header with
per-agent rows. The per-Turn summary sentence is composed at `prompt_done`.
The collaboration card stays the panel view of the same events.

### Following

The reference's follow machine, four modes over the three phases, replaces
Reeve's single pin flag as a pure reducer. One band value, 24 px, decides
pinned and detached everywhere; the 48 px value goes.

### Strings

Every transcript string lives in the i18n table under one transcript
namespace, in the reference's words, with the reference's plural and select
rules. No component holds a literal.

## What this rules out

- Rendering any transcript state from a raw event in a component.
- A second transcript for the side chat or the sub-agent view; both render the
  same Turn list.
- Storing elapsed time, phase or summary text in the session file.

## Open

- The goal pill needs a goal object OMP does not have. The map records the
  maintainer's decision; the folder gains a goal source only if that decision
  is to build one.

