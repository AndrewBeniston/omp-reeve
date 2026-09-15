# Audit: the Browser tab against the reference

Research for [#105](https://github.com/AndrewBeniston/omp-reeve/issues/105), part of
[the panel map](https://github.com/AndrewBeniston/omp-reeve/issues/61).
Read on 2026-09-15.

## Question

Which Browser tab behaviours in the reference does Reeve's shipped Browser tab not
yet match?

## Sources, and how they were read

ADR-0001 governs sourcing: a shipped value is authoritative, and a runtime check
validates it rather than replacing it. Two reference sources were read separately.

- **The installed application.** Codex Desktop 26.908.40834, read read-only from
  the packed web view archive inside the installed application bundle. Used to
  confirm that the values below are the ones that ship: the device preset table
  with its dimensions, the zoom banner, the tab audio menu and the device preset
  message ids all appear in it.
- **The extracted bundle.** The same version unpacked to a scratch directory, read
  read-only. Used for the ordered reading: command registry entries with their
  default key bindings, the browser panel's own message catalogue, the zoom stop
  list, the clamp values, and the render order of the toolbar and the options menu.

No reference code, markup, class name, style rule or asset byte was copied into
this repository. What follows is values, orders, states and chords, in Reeve's own
words. Reference labels are described rather than reproduced.

Reeve's side is measured from this checkout at b638472, version 0.6.0: the Browser
tab component and its stylesheet, the desktop page registry, the desktop preload
bridge, the application menu table, the Tab strip, the Tab context menu, the
per-Project Tab registry, and the agent browser access module. Rows that need a
running build to settle are marked runtime, unverified.

The repository's /research skill asks for a background agent. None was available in
this run, so the reading was done inline. The rest of the skill was followed:
primary sources only, and one cited Markdown file beside the existing note in
docs/research.

## What the reference's Browser tab is

A page hosted in a panel, with a placement of right or bottom, bound to a chat. A
third placement value exists for a hidden page the agent drives. The panel draws a
40px toolbar above the page, from the shipped toolbar-pane height token.

The toolbar, in order: back, forward, reload, the address field, a control that
opens the page in the external browser, and the annotate control. The address
field carries a site-information control on its leading edge, which becomes an
explicit not-secure state with a label when an HTTPS page has a certificate error.
Loading is a 2px bar across the bottom edge of the toolbar, faded in and out
rather than switched. An empty tab shows a titled empty state inviting an address,
not a bare field.

Two further surfaces sit in the toolbar: an extensions control with its own
pinning, overflow and management behaviour, and a site-tools control listing the
tools a page offers the agent. Both are outside this ticket, but they own toolbar
space, so a spacing match has to account for them.

The options menu, in render order: a zoom row (out, the current percentage, in,
reset), find in page, print, show or hide the device toolbar, import cookies and
passwords, passwords and autofill with a password manager and contact information,
downloads, history, clear browsing data with cookies and cache beneath it, and
browser settings. The browser settings surface has its own back and forward
navigation and a site-settings section covering location, camera, microphone,
notifications, sound, JavaScript, images, pop-ups and redirects, automatic
downloads, third-party cookies, clipboard, USB devices, protocol handlers,
background sync, embedded content, protected content ids and intrusive ads.

### Values read from the reference

Zoom stops, in percent: 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200,
250, 300, 400, 500. The first and last are the clamp. Stepping moves to the next
stop in the direction asked. The chords are the ordinary ones: zoom in on Cmd+Plus
and Cmd+Shift+=, zoom out on Cmd+-, reset on Cmd+0.

Device toolbar presets, in the order the picker lists them, width by height in CSS
pixels:

| Preset | Size |
| --- | ---: |
| Responsive (default) | 390 x 844 |
| 4K | 2560 x 1440 |
| Laptop L | 1440 x 900 |
| Laptop | 1024 x 768 |
| Surface Pro 7 | 912 x 1368 |
| iPad Air | 820 x 1180 |
| iPad Mini | 768 x 1024 |
| Surface Duo | 540 x 720 |
| iPhone 15 Pro Max | 430 x 932 |
| Pixel 8 | 412 x 915 |
| iPhone 15 Pro | 393 x 852 |
| Samsung Galaxy S24 Ultra | 384 x 824 |
| iPhone SE | 375 x 667 |

A viewport clamps to 240px by 160px at the smallest and 4096px in either direction
at the largest. It can be dragged from the left edge, the right edge, the bottom
edge and the two bottom corners, typed as a width and a height, rotated, which
swaps the two and keeps the preset selected, and scaled by its own zoom control,
which is separate from page zoom. Editing the size away from a preset moves the
selection to responsive. The stage behind the viewport has its own colour token.

Find is Cmd+F, find next is Cmd+G, find previous is Cmd+Shift+G on macOS and
Shift+F3 elsewhere.

Browser commands in the registry, with their default bindings: open a browser tab
Cmd+T; focus the address bar Cmd+L; back Cmd+Left, or Alt+Left elsewhere; forward
Cmd+Right, or Alt+Right; reload Cmd+R; force reload Cmd+Shift+R. The reload
binding is marked overridable by the page, so a web application that wants Cmd+R
can take it.

Tab strip states for a Browser tab: playing audio, audio muted, using camera,
using microphone, using camera and microphone, and the combinations of those with
audio, each with its own accessible description. The audio state has its own
context menu with mute and unmute.

The Tab context menu, in order: new tab to the right, reload, duplicate, rename,
copy URL, open in external browser.

A Browser tab can be detached into a separate window, and the reference asks for
those tabs to be restored into the panel before a task moves between hosts. Tabs
are carried with the chat: the panel's browser state is keyed by the conversation,
and there is an explicit transfer of that state during a handoff.

The page itself can be annotated. Annotation mode has a coach mark, a marker
overlay that can be hidden, a hold-to-view-original gesture, a hold-space escape
to interact with the page, a pending-annotation count that sends into the composer,
and a discard confirmation. A screenshot of the page can be captured to the
clipboard, with its own success and failure states. Both are agent-facing features
rather than browser chrome, so both are decisions for Reeve rather than copies.

## What Reeve's Browser tab is today

A page owned by the desktop process and drawn into a rectangle the renderer
measures, in the Right panel only. The bridge exposes open, set bounds, set
visible, navigate, three commands (back, forward, reload), close, and three events
(navigated, title, favicon). Nothing else crosses it.

The toolbar is 40px, matching the reference token, and holds back, forward, reload
and the address field. The address shows the host while a page is read and the
whole address while focused. Enter navigates, and a bare host becomes https.
Escape blurs. An empty Tab focuses the address field and shows no empty state.

The strip shows the page's favicon and its title, a page may not rename a Tab the
human renamed, and middle-click closes a Tab. The context menu carries the
reference's six entries in the reference's order. Every open Tab stays mounted, and
an inactive one is hidden rather than closed.

Tabs are remembered per Project, as addresses only, in a Reeve registry outside
OMP's files. Every Browser tab shares one persistent partition, which Clear
browsing data empties before reloading every open page. Page permissions are
refused outright, for both the application session and the browser partition. A
popup leaves for the system browser and no window opens in the application. The
agent reaches pages over the debugging protocol, granted from a Reeve control and
effective at the next launch.

The application menu carries: open a browser tab Cmd+T, address bar Cmd+L, back
Cmd+Left, forward Cmd+Right, next and previous Tab, focus Tab 1 to 9, reopen the
closed Tab, close the other Tabs, and maximise the panel.

## The measured gap

**Mechanical** means the reference already decided it and Reeve only has to match
it. **Decision** means Reeve cannot copy the answer, because the thing the
reference command acts on does not exist in Reeve or already exists differently.

| # | Gap | Reference | Reeve today | Kind | Seam |
| --- | --- | --- | --- | --- | --- |
| 1 | Reload chord | Cmd+R, force reload Cmd+Shift+R, page may override reload | reload only from the toolbar and the Tab menu | mechanical | application menu table, then the existing panel action route |
| 2 | Find in page | Cmd+F, Cmd+G, Cmd+Shift+G over the page | nothing; the page cannot be searched | mechanical | a new bridge command and main-process find on the page |
| 3 | Page zoom | 17 stops from 25 to 500, in, out, reset | none | mechanical | bridge command, zoom state per Tab, application menu |
| 4 | Zoom readout | the percentage in the options menu and in a transient banner | none | mechanical | Browser tab chrome |
| 5 | Device toolbar | 13 presets, five drag handles, typed size, rotate, its own scale, clamps at 240x160 and 4096 | none | mechanical | Browser tab chrome, plus a bridge command that sets the page rectangle inside the Tab |
| 6 | Options menu | one menu holding zoom, find, print, device toolbar, downloads, history, browsing data and settings | no menu on the toolbar | mechanical for the container, decision per item | Browser tab chrome |
| 7 | Print | print the page | none | mechanical | bridge command |
| 8 | Downloads | a download surface and a download history that can be cleared | no download handling at all; a download is not surfaced or stored anywhere the human can find | decision | the desktop session download handler, plus a Reeve surface |
| 9 | History | browsing history, cleared as its own item | none, only the per-Tab back and forward stack | decision | browser partition and a Reeve registry |
| 10 | Site permissions | per-site prompts and a full site-settings surface | every permission refused, with no prompt and no record | decision | the permission handlers already in the desktop process |
| 11 | Site information | a control on the address field, with an explicit not-secure state | nothing; a certificate error is invisible | mechanical | Browser tab chrome, plus a certificate event on the bridge |
| 12 | Loading feedback | a 2px bar under the toolbar, faded | none; a slow page looks like a dead Tab | mechanical | bridge loading events, Browser tab chrome |
| 13 | Failed load | not readable from either source | no Reeve handling | mechanical | bridge failure event |
| 14 | Empty state | a titled empty state inviting an address | a focused address field over a blank page area | mechanical | Browser tab chrome |
| 15 | Non-URL address | the placeholder invites a search or a URL, so there is a fallback | the text becomes https plus itself, which fails for a search phrase | decision | the navigate command in the desktop page registry |
| 16 | Address suggestions | none found in the shipped web view | none | mechanical, already matched | none |
| 17 | Tab media state | playing audio, camera, microphone, muted, and the combinations, each described | none | mechanical | Tab strip, plus page media events on the bridge |
| 18 | Mute a Tab | mute and unmute from the audio state | none | mechanical | bridge command, Tab strip, Tab context menu |
| 19 | Detached Tab window | a Tab can live in its own window and is restored before a handoff | none | decision | panel host, not the Browser tab |
| 20 | Restoration scope | browser state is keyed to the chat and transferred with it | per Project, addresses only, shared by every Session in that Project | decision | the per-Project Tab registry |
| 21 | Popups | not readable from either source | every popup leaves for the system browser | decision | the window-open handler in the desktop process |
| 22 | Page annotation | annotate mode, markers, hold to view original, pending count, send into the composer | none | decision | a new agent-facing seam, not browser chrome |
| 23 | Page screenshot | capture the page to the clipboard, with success and failure states | none | decision | bridge command |
| 24 | Site tools for the agent | a toolbar surface listing the tools a page offers | none, and OMP has no equivalent | decision | out of Browser tab scope until OMP has the concept |
| 25 | Extensions | pinning, overflow and management in the toolbar | none | decision | out of Browser tab scope; its own epic if it is wanted |
| 26 | Browser settings | a navigable settings area with site settings beneath it | one row: clear browsing data | decision | the existing Browser setting rows |
| 27 | Import cookies and passwords | an import path from another browser | none | decision | probably declined; record the decision |
| 28 | Agent browser access, #49 | a placement value is reserved for the page the agent drives | every Tab is an equal page target and nothing marks the intended one | decision | the agent browser access module and the Tab model |
| 29 | Fork actions | forking is a chat action; the browser panel has none | no Fork action in the Browser tab either | decision, already matched | none; the ticket asked, and the reference answers no |

### The visual audit

| # | Property | Reference | Reeve today | Kind |
| --- | --- | --- | --- | --- |
| 30 | Toolbar height | 40px from the shipped token | 40px | matched |
| 31 | Toolbar contents | back, forward, reload, address, external, annotate, extensions, site tools | back, forward, reload, address | mechanical for the first four, decision for the rest |
| 32 | Address field shape | a field spanning the rest of the row | a pill spanning the rest of the row, 28px tall, true round corners | runtime, unverified against the reference's own height and radius |
| 33 | Icon sizes | back and forward 11px, reload 13px, as recorded when Reeve's toolbar was built | drawn at 14px inside a 24px control | mechanical, and it contradicts the note already in Reeve's own stylesheet |
| 34 | Hover and focus | the reference's own treatment | hover fills the control, focus draws Reeve's ring | runtime, unverified |
| 35 | Colours | the reference palette | the OMP theme through the Tier 1 adapter, as intended | matched by design |
| 36 | Strip overflow, resize, drag | not measured here | the active Tab scrolls into sight; no drag reorder | research, and it belongs to the panel host ticket |

## Parity checklist

Each line is one ticket candidate for the Browser and Terminal parity epic. A
mechanical line can be written from the values above without asking anything.

Mechanical:

- [ ] Reload Cmd+R and force reload Cmd+Shift+R in the application menu.
- [ ] Find in page on Cmd+F, Cmd+G and Cmd+Shift+G, with the match count and a closing behaviour.
- [ ] Page zoom over the 17 stops, on Cmd+Plus, Cmd+- and Cmd+0, clamped at 25 and 500.
- [ ] The zoom percentage readout.
- [ ] The device toolbar: 13 presets at the recorded sizes, five drag handles, typed size, rotate, its own scale, clamps at 240x160 and 4096.
- [ ] An options menu on the toolbar to hold the above.
- [ ] Print.
- [ ] Site information on the address field, with the not-secure state.
- [ ] Loading feedback under the toolbar.
- [ ] A failed load that says so.
- [ ] The Browser tab empty state.
- [ ] Tab media state in the strip, with mute and unmute.
- [ ] Icon sizes reconciled with the values recorded when the toolbar was built.

Decision:

- [ ] What a download does in Reeve, and where it is listed.
- [ ] Whether Reeve keeps browsing history, and what clears it.
- [ ] Whether a site permission may ever be granted, and where that is recorded.
- [ ] What a non-URL address means without a search provider.
- [ ] Whether Browser tabs stay per Project or move to per Session.
- [ ] Whether a popup may open a Tab instead of leaving for the system browser.
- [ ] Whether the agent's browser access names one Tab (#49).
- [ ] Whether page annotation and page screenshot have an OMP meaning.
- [ ] Whether Reeve's Browser settings grow a site-settings surface.
- [ ] Whether extensions and site tools are ever in scope.
- [ ] Whether a Browser tab may be detached into its own window. Panel host, not this epic.

Already matched, and worth keeping matched:

- [x] The Tab context menu entries and their order.
- [x] Cmd+T, Cmd+L, Cmd+Left and Cmd+Right.
- [x] The 40px toolbar.
- [x] Favicon and page title in the strip, with a human rename that survives navigation.
- [x] No address suggestion list.
- [x] No Fork action in the Browser tab.

## What could not be verified

- The reference's main process is not readable from either source. Its popup
  handling, download handling, certificate prompts, failed-load surface and any
  address search fallback are recorded as unknown rather than as absent. Rows 13,
  15 and 21 rest on Reeve's side alone.
- No reference runtime session was run. Every reference value above is a shipped
  value.
- Reeve's side was measured from source at b638472. A live pass was attempted and
  abandoned: dependencies were installed and a development server started, but the
  desktop shell exits at once while another Reeve desktop instance holds the
  single-instance lock, and another agent was running one against its own Fixture
  at the time. Interrupting it would have cost more than the rows it settles. Rows
  13, 32 and 34 stay runtime, unverified and need one live pass against a
  disposable Fixture when no other shell is running. The Reeve installed on this
  machine is 0.4.2 and predates this branch, so it is not evidence for 0.6.0.
- The strip's overflow, resize and drag behaviour belongs to the panel host
  inventory and was not measured here.


## Main-process addendum (2026-09-15)

The audit above recorded that the reference's main process is not readable. That
was wrong: it ships beside the web bundle and inside the installed application's
archive. Reading it settles rows 13, 15 and 21 on the reference side, and most
of what this document listed as unknown. Three sources are cited separately, per
ADR-0001:

- **The installed application.** ChatGPT 26.908.40834. Every value below was
  confirmed present in its packaged archive, searched in place, read-only.
- **The extracted web bundle.** The same version's web-view assets, read
  read-only outside this repository.
- **The extracted main process.** The same version's Electron main-process and
  shared-chunk build, beside that bundle, read read-only outside this repository.

Still a shipped-code read on the reference side: nothing here was observed at
runtime. No code, markup, class name or asset byte was copied. Values only.

### Popups: a popup becomes a Browser tab

A page that calls for a new window is answered by disposition:

| Disposition | Result |
| --- | --- |
| foreground tab | A new Browser tab **inside the panel**, adopting the child page, inserted immediately to the right of the opener, and made active |
| background tab | The same, left inactive |
| anything else | Denied |

Three checks run before that. A URL that parses as one of the application's own
deep links is queued as a deep link and the popup is denied. A page already
showing an error page sends the URL to the system browser instead. A navigation
the application restricts is denied outright. Nothing opens a detached native
window from a page.

Separately, the sandbox that hosts an MCP application denies **every** popup and
records it as blocked.

### Downloads

The browser session owns them, in the main process:

- The save location is a download-directory setting, falling back to the
  operating system's Downloads folder.
- A prompt-for-download-location setting, **false by default**, decides between
  a save dialog and a silent save.
- A download the human started reserves a unique path first, so an existing file
  is never overwritten silently.
- A download history is kept, with a changed event, a set of unacknowledged
  downloads for badging, a clear-history action and show-in-folder.
- The MCP application sandbox cancels every download and records it as blocked.
- Saving a copy of a workspace file bypasses all of this: it copies into the
  Downloads folder without prompting, appending " (1)", " (2)" on a clash.

### Certificates: no interstitial, and no way through

The main process registers **no** certificate-error handler and **no** custom
verification. A certificate failure is simply a failed load. The error page's
summary reads that the host's certificate could not be verified, and the page
snapshot marks the failure as a certificate error, distinguished by the error
code's prefix. There is no proceed-anyway path.

### The failed-load surface

An in-app error page replaces the view. It is tracked per Tab and keyed by the
failed URL, and an entry is dropped when its URL leaves the Tab's history, so
going back to a page that once failed does not resurrect a stale error.

| Element | Value |
| --- | --- |
| Heading | "This site can't be reached" |
| Summary | One of six, by cause: DNS, offline, refused, timeout, certificate, generic, each naming the host |
| Suggestion list | "Try:", then "Checking the connection" and "Checking the proxy, firewall, and DNS configuration" |
| Detail sections | Four, one of which names the application |
| Error code | Shown |
| Action | "Reload" |

A renderer crash gets its own page: "This page crashed", a summary saying the
host crashed unexpectedly, a "Reload" action, no error code and no suggestions,
plus an "Open in external browser" action that appears **only when the
application is not the default browser**. Loading the error page retries while
the view is still loading, up to a bounded number of attempts, and reports a
failure rather than leaving a blank Tab.

### Address search fallback: none in the main process

No search provider and no query-to-URL fallback appears. The only external-open
route is a private scheme carrying a URL parameter, used by the crash page's own
button. Whether the address field itself falls back to a search engine is
decided in the web layer, so row 21 stays a web-layer question, but the main
process offers it no search provider to fall back to.

### Two more values

- **Zoom routing.** Page-zoom chords reach whichever placement holds the focused
  browser page, and only when that page reports it can zoom. An open image
  preview takes them first.
- **Tab budget.** A budget marks Tab activity and enforces a detached-page
  budget; a page that is not visible has background throttling turned on unless
  it is being captured or the agent is driving it. No cap on the number of
  Browser tabs appears.

### Still open after this read

- Rows 32 and 34: the address field's own height and radius, and hover and focus
  treatment, against the reference's rendered surface.
- Row 13 on Reeve's side: what Reeve does today with a failed load.
- Every Reeve runtime row, which needs one pass against a disposable Fixture
  with no other Reeve desktop instance running.

