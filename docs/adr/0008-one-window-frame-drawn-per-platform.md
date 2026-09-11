---
status: proposed
---

# One window frame, drawn per platform from runtime state

Reeve 0.5.0 on Windows spends two rows before the application starts, and the
window buttons sit on a system colour. ADR-0006 chose the desktop shell but did
not say how a single renderer serves three window frames. This records that.

Both reference applications were read on 2026-09-10, the Windows build on a
Windows 11 machine and the macOS build on a Mac. Every value below was read from
a shipped bundle, not from documentation. No source text was copied.

## The rule

**Ask the window what it is doing. Do not ask which system it runs on, and never
assume.**

A platform name answers the wrong question. It cannot say whether the window
buttons are visible right now, where they sit, or how wide they are. All three
change at runtime, and all three change again when the user resizes the window.

Two runtime sources answer it. The Window Controls Overlay API reports whether
the system draws the caption buttons and exactly where. A single measured value,
published as a CSS variable, reserves the space they occupy.

## What the reference applications do

### The frame

| | macOS | Windows and Linux |
| --- | --- | --- |
| Window option | `titleBarStyle: "hiddenInset"` | `titleBarStyle: "hidden"` plus a title bar overlay |
| Button position | `{ x: 16, y: 16 }` at zoom 1 | the system draws them, on the right |
| Bar height | 46 | 36 |
| Menu | the system menu bar, at the top of the screen | drawn by the renderer |
| Overlay background | not applicable | transparent |

On macOS `x` is fixed at 16 and `y` is computed as `round((46 * zoom - 14) / 2)`,
so the buttons stay centred when the window zoom changes. On Windows the overlay
height is `round(36 * zoom)` for the same reason.

### The menu is the real difference

macOS always owns a menu bar at the top of the screen, so the renderer draws no
menu. Windows and Linux have no such bar, so the renderer draws File, Edit, View
and Help itself.

Both platforms still register one application menu in the main process. It is
never removed: it carries the keyboard shortcuts, and removing it removes them.
On Windows the bar alone is hidden from the window.

The renderer decides which case applies and writes the answer onto the document
element. The value is `native` where the system owns the menu, and
`application-menu` where the renderer must draw it. The menu bar element renders
only in the second case.

### Two bars, not one

The reference applications carry two heights, not one. The toolbar is 46 and the
menu bar is 36. On Windows the 36 bar sits above everything and holds the menu
and the window buttons. On macOS that bar does not exist, and the window buttons
are inset into the 46 toolbar instead.

Reeve's current Windows work puts a 36 bar inside the sidebar. That does not
match either reference, and this decision supersedes it.

### The reserved space is measured, never fixed

A fixed pixel number for the caption buttons is wrong. It is wrong at a
different window zoom, wrong in a right-to-left layout, and wrong when the
system changes its caption metrics.

The reference applications publish one variable, defaulted to `0px`, and set it
at runtime to the measured inset divided by the window zoom, plus a small gap.
The header consumes it as its leading padding, with a floor so the layout never
collapses. A second variable does the same on the trailing edge.

Where the overlay is present, its own geometry variables give the exact numbers,
and those rules are scoped so they cannot fire on macOS.

### The drag region

The bar carries the drag region. Every button inside it opts out, so a click
reaches the button instead of moving the window. A named class marks anything
else that must stay clickable.

## Decision

1. Reeve keeps one renderer and one set of components. The frame differs by
   state, never by a copied component.
2. `preload.cjs` already writes the platform onto the document element. That
   attribute stays, and it selects the frame shape.
3. A second attribute records who owns the menu: `native` on macOS, and
   `application-menu` on Windows and Linux. The renderer draws the menu only in
   the second case.
4. A third attribute records whether the system draws the caption buttons now.
   It reads `navigator.windowControlsOverlay`, and it listens for
   `geometrychange`. The handler is slowed down, because that event fires many
   times in one resize.
5. The space reserved for the caption buttons is a CSS variable set from the
   measured overlay, never a fixed number. An earlier revision of the Windows
   branch used a fixed 138 pixels. `useCaptionInsets` replaced it, and no fixed
   reserve remains.
6. The application menu stays registered in the main process on every platform,
   for its keyboard shortcuts. Windows hides only the bar.
7. Heights follow the references: 46 for the toolbar, 36 for the menu bar. One
   test holds the renderer height and the main process overlay height together.

## The separation that protects macOS

Reeve on macOS works today, and this work must not damage it.

Every macOS rule keys on the platform attribute with the value `darwin`. Windows
and Linux work adds a rule beside it. It never widens a `darwin` rule, and it
never removes one.

The style tests name the `darwin` selectors exactly, so a widened rule fails the
suite rather than reaching a Mac. That is the guard, and it is the reason the
tests spell the selectors out.

The overlay attribute is false on macOS, because `navigator.windowControlsOverlay`
does not exist there. So an overlay rule cannot fire on a Mac even by accident.

## Consequences

Reeve draws one sidebar toggle, chosen by state. It does not draw two and hide
one, which is what the current Windows build does.

The Windows menu becomes renderer work. It is the largest part of this decision.

A macOS change and a Windows change touch different rules in the same files. A
reviewer can see which platform a change reaches by reading its selector.

No fixed reserve ships. `useCaptionInsets` measures the caption strip and
publishes it as `--ui-caption-inset-end`, and a style test asserts that no fixed
pixel value returns.
