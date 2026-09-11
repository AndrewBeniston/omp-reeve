---
status: proposed
---

# The agent's door to the browser opens at launch, or not at all

Reeve can hold web pages beside a session, and the agent it drives should be
able to use them. Doing that means serving Chromium's debugging protocol, which
is a protocol with no authentication of its own: anything that can reach the
port can drive every page in the application. This records how that is granted,
and why the grant is deliberately slow.

Every behaviour below was verified against Electron 44 on 2026-09-11, by running
it rather than by reading documentation.

## The rule

**The grant is read before Chromium starts. Nothing in a running Reeve can open
the door.**

`--remote-debugging-port` is a startup switch. Chromium reads it before the
application is ready, and no call afterwards can open the port. Reeve records
the human's decision in a file and reads that file in `main.cjs` at module
scope, ahead of `app.whenReady()`.

So a decision made now takes effect at the next launch. That is the security
property, not a limitation to design around, and it is worth stating precisely
rather than generously.

It does **not** mean nothing but a human can write the grant. The settings panel
asks the main process to record it, and any code running in Reeve's own renderer
could ask the same way. What the delay buys is that no such request can open a
port in the session that made it. A compromise that lasts one run yields nothing
to connect to, and the grant it left behind is shown in the panel, on by itself,
the next time the human looks.

A web page in a Browser tab is not part of this. It has no preload and no bridge
into the application, so it cannot reach the handler at all (ADR-0012).

A torn write leaves a file that does not parse, and anything that does not parse
as exactly `true` reads as no grant. The failure direction is closed.

An earlier note on the ticket concluded a separate launcher process was needed
to append the switch. It is not. `main.cjs` itself runs early enough.

## What is granted, and what that costs

The port binds to `127.0.0.1` and to port `0`, so the operating system chooses
the number and it differs every launch. Two consecutive launches took 63682 and
63686. Binding anywhere but loopback would let another machine on the network
drive the browser, and the protocol would not ask it for anything.

Being ephemeral is worth stating plainly: the number cannot be written down
today and attacked tomorrow, and the panel therefore reports it rather than
promising it.

The grant is not narrow. Reeve's own interface is a page target too, so an agent
given the endpoint can reach the application, not only the human's browser tabs.
The settings panel says so in those words. Anything the human is signed in to in
a tab, the agent is signed in to, because the tabs share one persistent partition
(see the browser tab work in #36 and #39).

### Naming the page is not optional

It is worse than "could reach". Measured against a live Reeve on 2026-09-11
with OMP's own `pickElectronTarget`, with one Browser tab open on a real page:

| How the tool is asked | What it attaches to |
| --- | --- |
| no options | the Browser tab |
| `matcher: "example.com"` | the Browser tab |
| `preferVisible: true` | **Reeve's own window**, three runs out of three |

The third row is the default path. `tab-supervisor.ts` sets
`preferVisible: !activateForScreenshot`, and for a connected browser with no
explicit target that resolves to `true`. So an agent handed `app.cdp_url` and
asked to do something without naming a page attaches to the application and
starts driving it.

Reeve cannot fix this from its side. The picker prefers the first page that
reports `document.visibilityState === "visible"`, Reeve's renderer is genuinely
visible and is enumerated first, and the skip pattern it filters with matches
devtools and service workers rather than applications. Hiding Reeve's own window
from the endpoint would mean proxying the protocol, which is the relay that
decision #13 rejected.

So the rule is a rule for the human, and the panel has to carry it: **tell the
agent which page to work on.** Recorded as #49.

## The trap that would have shipped a bug

Chromium writes the port it bound to `DevToolsActivePort` in the user-data
directory. It does **not** remove that file when the switch is absent. A launch
with the door open followed by a launch with it shut leaves the file behind,
holding a port that now refuses every connection.

Anything that read that file to decide whether the door was open would hand the
agent a dead address and an incomprehensible failure. A launch without the grant
therefore deletes the file.

## Four states, not two

Because the decision and the launch can disagree, the control has four honest
states rather than an on and an off:

| Granted | This launch | What the human is told |
| --- | --- | --- |
| no | closed | Closed. Nothing is listening. |
| yes | open | Open, with the address to give the agent. |
| yes | closed | Opens on restart. Nothing is listening yet. |
| no | open | **Still open.** The door does not shut until a restart. |

The last row is the one that matters. Withdrawing the grant cannot close a port
this process already opened, and a panel that went quiet and green at that
moment would be lying at exactly the wrong time.

## What this does not need

OMP's browser tool needs no change, no relay and no extension. Its
`normalizeConnectedCdpUrl` wants the HTTP discovery endpoint, for example
`http://127.0.0.1:63682`, and refuses a `ws://` URL, so that is the one shape
Reeve reports. The relay in the SDK exists to impersonate a Chromium discovery
endpoint in front of ordinary Chrome; Reeve serves the real one.

This only became true once a browser tab stopped being a `<webview>` guest. A
guest is a `webview` target, and the SDK keeps only `page` targets, so the agent
could previously see nothing but Reeve's own window. ADR territory for that
change is the browser tab itself; it is recorded in #38.

## Consequences

- Turning the grant on or off asks for a restart, and the panel says so.
- The address changes every launch, so it is read from the panel rather than
  remembered.
- A human who grants this is exposing the application, not only their browsing.
  The wording must keep saying so.
- Reeve must keep deleting `DevToolsActivePort` on a closed launch. Anything
  that starts trusting that file without checking whether the switch was
  actually applied reintroduces the dead-address bug.
