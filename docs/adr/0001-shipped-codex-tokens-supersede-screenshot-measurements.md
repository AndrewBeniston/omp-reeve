# Shipped Codex tokens supersede the screenshot measurements

`DESIGN.md` section 2.2 recorded Codex geometry measured from one screenshot at
2056x1225. Later work read the shipped Codex stylesheet and application bundle
directly, from the Chromium web view inside `/Applications/ChatGPT.app`, and
found different numbers. We treat the shipped token as the design intent and the
screenshot as one rendering of it, because a rendering carries a zoom factor and
a device pixel ratio that the token does not.

## Considered Options

The screenshot measurements were internally consistent, so they were not
obviously wrong. We rejected them because a token states intent directly, and
because three separate values disagreed in the same direction.

| Property | Screenshot | Shipped token | Now |
|---|---:|---:|---:|
| Sidebar width | 302.5px | 275px | 275px |
| Navigation row height | 33px | 30px | 30px |
| Navigation row radius | 12.5px | 10px | 12.5px task, 15px project |

The 2026-09-04 re-extraction of ChatGPT 26.901.22334 found that the current
task row resolves to 12.5px and the project row resolves to 15px. This newer
shipped code supersedes the older 10px token read. The rule remains the same:
shipped code beats a screenshot or a remembered value.

## Consequences

`DESIGN.md` keeps the superseded figures visible as history, so a reader who
finds an old 302.5px reference elsewhere can resolve the conflict.

A future disagreement between a measurement and shipped code resolves toward
the shipped code. Re-measuring a screenshot does not reopen this. A newer
verified application version may supersede an older code read, as happened on
2026-09-04.

2026-09-02: the same rule corrected the composer. The Electron theme sets
`--text-base` to 14px, every footer control to the 28px `composer` size, and the
editor cap to 25dvh. Earlier screenshot reads had 16px, 24px, and 200px.
`DESIGN.md` 7.5.1 carries the code table.
