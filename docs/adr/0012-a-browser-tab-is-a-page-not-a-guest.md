---
status: accepted
---

# A Browser tab is a page the main process owns, not a guest in the renderer

Reeve's right panel can hold a web page beside a session. There are two ways to
put one there, they look identical to a human, and only one of them lets the
agent use it. This records which, and why the obvious choice was wrong.

Verified against Electron 44 on 2026-09-11 by running it, not by reading
documentation.

## What was decided first, and why it failed

The first Browser tab was a `<webview>` guest inside the renderer. It is the
natural choice: the page sits in the React tree, CSS lays it out, and it hides
and shows with the rest of the interface. The window was given `webviewTag`
and every guest was contained on attach, its privileges overwritten rather than
inspected.

It worked for a human and was useless to an agent.

Chromium reports a guest as a `webview` target. OMP's `pickElectronTarget`
keeps only `page` targets, and its `browser.pages()` fallback does the same.
Connected to Reeve, the SDK's own puppeteer could see exactly one thing:

```
ALL_TARGETS:            browser | webview https://example.com/ | page (Reeve UI)
SDK_PRIMARY_PATH_SEES:  [ "(Reeve UI)" ]
```

That is worse than the feature not working. An agent given the endpoint would
not fail; it would attach to Reeve's own interface and start driving the
application.

## The rule

**A Browser tab is a `WebContentsView` owned by the main process. The renderer
measures where it should be drawn and reports that rectangle.**

A `WebContentsView` is a first-class page target, so the same probe returns the
tab alongside Reeve's window and the SDK needs no change, no relay and no
extension.

The cost is that layout becomes a conversation. The view is positioned in window
coordinates by the main process, so the renderer keeps a placeholder, measures
it, and reports it as the panel resizes, the sidebar opens and the window moves.
An inactive Tab is hidden by the main process rather than by CSS. A rectangle
that cannot be drawn is refused rather than passed through, because a hidden
panel measures as zero.

## Containment moved, and got stronger

Enabling `webviewTag` was permission to create a guest, made safe by a handler
that overwrote its privileges on every attach. None of that is needed now,
because nothing creates a guest:

- `webviewTag` is `false`. An attach is refused outright rather than negotiated
  with after the fact.
- The same privileges the guest was forced into are set where the view is built:
  sandboxed, context-isolated, no node integration anywhere, no plugins, no
  nested guests, and no preload.
- One shared persistent partition for every Browser tab, and never the
  application's own session. The renderer holds the desktop launch token, and no
  web page may share a jar with that. A partition per Tab was rejected because it
  signs the human out of everything every time they open a Tab.
- Permissions are denied on that partition as well as the default session. A
  session with no handler grants whatever a page asks for, so denying only the
  default session left an ordinary web page able to take the camera or the
  microphone.

## Consequences

- A page is a live process. Removing its view from the tree does not end it, so
  closing a Tab closes the contents explicitly, and every page a window owns ends
  with that window.
- The page's identity is the Tab, not the component. Opening is idempotent per
  Tab id, which means a remount names the same page. Whichever mount owns it must
  be tracked, or a remount's cleanup closes the page the new mount just opened.
- Anything the human is signed in to in one Tab, they are signed in to in the
  next, and so is an agent that has been granted access. See ADR-0011.
- If a future Tab kind needs to be invisible to the agent, it cannot be a
  `WebContentsView`. That would be a new decision, not an implementation detail.
