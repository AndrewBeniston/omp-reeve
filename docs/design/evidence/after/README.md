# After-state evidence

This directory contains the production evidence for the OMP-Web redesign.

## 2026-09-04 interface parity refresh

- The build commit is `d1b16ded66157443a735a005d1cbb32a6bb74c33`.
- The signed Electron 44 ARM package uses OMP `18.1.6` and Bun `1.4.0`.
- Every capture uses the three sessions in `/tmp/omp-web-design-agent`.
- The logical desktop viewport is `1440x900`.
- The Mac was locked. Computer Use could not connect, so the local DevTools
  connection inspected the packaged renderer. A native window capture checked
  the traffic controls and title-bar layout.
- I opened and inspected every refresh image before staging it.

| File | Current evidence |
|---|---|
| `summary-dark-1440x900.png` | Dark Summary panel, full fixture message, neutral active toolbar state. |
| `summary-light-1440x900.png` | Light Summary panel and theme-owned surfaces. |
| `sidebar-project-hover-dark-1440x900.png` | Project card with task count, path, and Edit project. |
| `sidebar-session-hover-dark-1440x900.png` | Full task title, compact time, project, path, and branch. |
| `model-menu-dark-1440x900.png` | The 260px model menu. |
| `effort-menu-dark-1440x900.png` | The 180px effort menu and unsupported-capability message. |
| `desktop-window-dark-1440x900.png` | Native window controls, 46px title row, sidebar, transcript, and composer. |

The packaged renderer measured a 300px Summary panel. Its toolbar control is
28px with a 16px icon and a 10% neutral active fill. The 336px project card and
320px Session card rendered on the right of their rows. A full reload retained
the collapsed Project state and restored its region as inert. The native shell
uses the same transparent `menu` vibrancy configuration as the current Codex
bundle. The locked screen prevented a wallpaper-through-blur comparison.

The final DMG SHA-256 was
`de3257083ea72454b0af5edc0abe737935880f676d8f23845751ea4f754df3bf`.
The strict signature check passed before and after installation. The installed
app returned HTTP 204 with a valid desktop challenge. Temporary build worktrees
and profiles used 5.1GB and were removed after installation.

The refresh image SHA-256 values are:

```text
5fd5f596ec90128529a0cd7432fac2ccfb67b94f5f5a3888cc7482c9584e0932  summary-dark-1440x900.png
df484f34b893eaf6771d83e71755655989987af967213999cf42c38bc7ade597  summary-light-1440x900.png
f7fb1de6615ec274e5b94c1b35d5541409d77d8987c567b5450c08ea3dec56b2  sidebar-project-hover-dark-1440x900.png
e40673ebf17e41a1cf500c7d74dbb9b096a5dce7650ae2903910d90c9a90b1f1  sidebar-session-hover-dark-1440x900.png
ad52f9fcc3a9ce54e29c735c7a61f9909f37cbf4d91e308229957721db88b1d9  model-menu-dark-1440x900.png
7d9bd370a5efb5262b0e3edd84d501be05c032d7fdef5c0d66d33043ef69e050  effort-menu-dark-1440x900.png
80682359c00f5c9c446fe6c2ded32c8b139b359e250f89b18ceeb8999d9fda3f  desktop-window-dark-1440x900.png
```

## Capture environment

- The build commit is `5803dea350821ea4f9d80647e29d15eb9bcbc92c`.
- The fixture agent directory is `/tmp/omp-web-design-agent`.
- The fixture project is `~/omp-cwd-design-fixture`.
- The server URL is `http://localhost:31437/`.
- The recovery URL is `http://localhost:31437/recover`.
- The production server uses Bun and the staged Next.js production output.
- The server uses the isolated auth file `/tmp/omp-web-design-auth.json`.
- The capture uses the titanium dark mapping and the light light mapping.

The production compilation completed at the stated commit.
Desktop staging then stopped because the worktree lacks `bun-darwin-aarch64`.
The server used the completed staged output and the installed Bun runtime.

## Images

Each image contains PNG data and has the dimensions in its name.
I opened and inspected every image before staging it.

| File | Visible state |
|---|---|
| `empty-shell-dark-1440x900.png` | The dark desktop shell shows fixture navigation and an empty composer. |
| `empty-shell-dark-834x1112.png` | The dark tablet shell shows fixture navigation and an empty composer. |
| `empty-shell-dark-390x844.png` | The dark mobile shell shows an empty composer. |
| `empty-shell-light-1440x900.png` | The light desktop shell shows fixture navigation and an empty composer. |
| `empty-shell-light-834x1112.png` | The light tablet shell shows fixture navigation and an empty composer. |
| `empty-shell-light-390x844.png` | The light mobile shell shows an empty composer. |
| `transcript-dark-1440x900.png` | The dark desktop transcript shows user, thinking, tool, error, assistant, and completed states. |
| `transcript-dark-834x1112.png` | The dark tablet transcript shows the same fixture states with the navigation drawer. |
| `transcript-dark-390x844.png` | The dark mobile transcript shows the same fixture states and composer. |
| `transcript-light-1440x900.png` | The light desktop transcript shows user, thinking, tool, error, assistant, and completed states. |
| `transcript-light-834x1112.png` | The light tablet transcript shows the same fixture states with the navigation drawer. |
| `transcript-light-390x844.png` | The light mobile transcript shows the same fixture states and composer. |
| `composer-dark-1440x900.png` | The dark desktop composer shows a neutral ready draft and an enabled Send control. |
| `composer-dark-834x1112.png` | The dark tablet composer shows a neutral ready draft and an enabled Send control. |
| `composer-dark-390x844.png` | The dark mobile composer shows a neutral ready draft and an enabled Send control. |
| `composer-light-1440x900.png` | The light desktop composer shows a neutral ready draft and an enabled Send control. |
| `composer-light-834x1112.png` | The light tablet composer shows a neutral ready draft and an enabled Send control. |
| `composer-light-390x844.png` | The light mobile composer shows a neutral ready draft and an enabled Send control. |
| `settings-dark-1440x900.png` | The dark desktop settings show titanium and light fixture mappings. |
| `settings-dark-834x1112.png` | The dark tablet settings show titanium and light fixture mappings. |
| `settings-dark-390x844.png` | The dark mobile settings show titanium and light fixture mappings. |
| `settings-light-1440x900.png` | The light desktop settings show titanium and light fixture mappings. |
| `settings-light-834x1112.png` | The light tablet settings show titanium and light fixture mappings. |
| `settings-light-390x844.png` | The light mobile settings show titanium and light fixture mappings. |
| `file-viewer-dark-1440x900.png` | The dark desktop file viewer shows the fixture source and its diff. |
| `file-viewer-dark-834x1112.png` | The dark tablet file viewer shows the fixture source and its diff. |
| `file-viewer-dark-390x844.png` | The dark mobile file viewer shows the fixture source and its diff. |
| `file-viewer-light-1440x900.png` | The light desktop file viewer shows the fixture source and its diff. |
| `file-viewer-light-834x1112.png` | The light tablet file viewer shows the fixture source and its diff. |
| `file-viewer-light-390x844.png` | The light mobile file viewer shows the fixture source and its diff. |
| `subagent-panel-dark-1440x900.png` | The dark desktop panel shows completed and running fixture subagents. |
| `subagent-panel-dark-834x1112.png` | The dark tablet panel shows completed and running fixture subagents. |
| `subagent-panel-dark-390x844.png` | The dark mobile panel shows completed and running fixture subagents. |
| `subagent-panel-light-1440x900.png` | The light desktop panel shows completed and running fixture subagents. |
| `subagent-panel-light-834x1112.png` | The light tablet panel shows completed and running fixture subagents. |
| `subagent-panel-light-390x844.png` | The light mobile panel shows completed and running fixture subagents. |
| `recovery-dark-1440x900.png` | The dark desktop recovery page shows placeholder-only fields. |
| `recovery-dark-834x1112.png` | The dark tablet recovery page shows placeholder-only fields. |
| `recovery-dark-390x844.png` | The dark mobile recovery page shows placeholder-only fields. |
| `recovery-light-1440x900.png` | The light desktop recovery page shows placeholder-only fields. |
| `recovery-light-834x1112.png` | The light tablet recovery page shows placeholder-only fields. |
| `recovery-light-390x844.png` | The light mobile recovery page shows placeholder-only fields. |

## Dark desktop measurements

These measurements use the `1440x900` dark production page.
The narrow pane measurement uses a `700x900` viewport.
Section 7.5.1 supersedes the older composer height and radius in section 14.1.

| Check | Measured result | Target | Result |
|---|---:|---:|---|
| Header height | `46px` | `46px` | Pass |
| Header control center lines | Every visible control centers at `22.5px` | One shared center line | Pass |
| Refresh icon control | `31px x 31px` | `31px x 31px` | Pass |
| Hide sidebar icon control | `31px x 31px` | `31px x 31px` | Pass |
| Show file panel icon control | `31px x 31px` | `31px x 31px` | Pass |
| Sidebar width | `275px` | `275px` | Pass |
| Navigation row height | `30px` | `30px` | Pass |
| Empty composer height | `98px` | `98px` | Pass |
| Composer radius | `24px` | `24px` | Pass |
| Footer center from frame bottom | `22px` | `22px` | Pass |
| Send circle | `28px x 28px` | `28px x 28px` | Pass |
| Wide composer edges | `452.5px` to `1262.5px` | Maximum `810px` width | Pass |
| Wide transcript edges | `452.5px` to `1262.5px` | Share composer edges | Pass |
| Wide transcript width | `810px` | Maximum `810px` | Pass |
| Narrow composer edges | `16px` to `684px` | `16px` pane inset | Pass |
| Narrow transcript gutter | `15px` to `685px` | Match the pane inset | Pass |
| Narrow transcript content | `31px` to `669px` | `15px` inside composer edges | Pass |
| Transcript and composer flow | Transcript ends at `786px`; composer starts at `786px` | No overlap | Pass |
| Latest transcript content | The error state remains visible above the composer | Visible above composer | Pass |
| Body font family | `Autospawn Sans`, then system fallbacks | Autospawn Sans first | Pass |
| Settings navigation font family | `Autospawn Sans`, then system fallbacks | Autospawn Sans first | Pass |
| Font network requests | Five Autospawn files loaded from `localhost` | No external font request | Pass |
| Production CSS text | No standalone `Inter` text exists | No Inter | Pass |
| Transcript scrollbar | The transcript uses `overflow-y: auto`; the visible screenshot shows its scrollbar | Visible | Pass |

The measurement result is 24 passes and zero failures.

## Gaps

- The fixture has no live streaming run.
- The fixture has no queued composer item.
- The composer images show the empty and ready states only.
- The fixture session data supplies running and completed subagent items.
- The desktop staging command lacked its bundled Bun runtime.
- The production output still compiled and served with the installed Bun runtime.

## Production launch check

The checks used the same production server and port.

| Check | Exact URL | Result |
|---|---|---|
| Correct password | `http://localhost:31437/` | Pass. The browser accepted user `omp` and the disposable password. The fixture shell rendered. |
| Wrong password | `http://127.0.0.1:31437/` | Pass. The browser returned `ERR_INVALID_AUTH_CREDENTIALS`. |
| Recovery page | `http://localhost:31437/recover` | Pass. The page rendered the recovery heading and placeholder fields. |
| Update indicator | `http://localhost:31437/?session=22222222-2222-4222-8222-222222222222` | Pass. The dialog showed manual commands and no install button. |

The manual commands were `bun add --global omp-web@latest` and `npm install --global omp-web@latest`.
