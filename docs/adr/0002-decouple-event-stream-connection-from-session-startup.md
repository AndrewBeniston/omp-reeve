---
status: accepted
---

# Decouple the event stream connection from agent session startup

`GET /api/agent/[id]/events` used to await `startRpcSession` before it sent its
`connected` event, so the browser's 5000 ms connect deadline covered the whole
agent startup. Startup time varies with a user's extensions, skills, and memory,
so no fixed deadline can be correct, and sending a message failed intermittently
with `EventStreamConnectionError`. The route now sends `connected` immediately
and completes startup behind it.

## Considered Options

Raising the deadline was rejected. It moves the failure rather than removing it,
because the startup cost is unbounded in principle.

Changing only the route was attempted and proven impossible. `AgentSessionWrapper`
forwards events to current listeners and buffers nothing, and its `onEvent`
replays only pending interface requests. A listener attached after
`startRpcSession` resolves can therefore miss every event emitted during startup.

## Consequences

`lib/rpc-manager.ts` now owns listener channels keyed by Session id, and
`startRpcSession` attaches them to the Wrapper before `wrapper.start()`. The
route registers its listener before any file lookup, so no event can be emitted
before a listener exists. Keep that order. A subscription made after startup
looks simpler and reintroduces the race.

A startup failure that happens after `connected` was sent now reaches the browser
as the existing `prompt_error` event, which the client already renders.

This defect predates the interface redesign. The installed 0.2.16 build carries
the same deadline and the same coupling.
