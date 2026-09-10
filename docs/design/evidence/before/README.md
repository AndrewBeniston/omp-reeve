# Baseline evidence: before state

This directory holds the committed baseline screenshots for the OMP-Web redesign.
DESIGN.md section 13 defines the full evidence requirements.

## Committed baselines

| File | Route | Theme | Viewport | Private content |
|---|---|---|---|---|
| `recover-dark-1280x720.png` | `/recover` | dark | 1280x720 | none |

The recover page shows no session data. The recovery code field shows a placeholder only.

## Rejected baselines and the reason

Three further baseline captures existed. I did not commit them.

| Rejected capture | Reason |
|---|---|
| Main chat view with an open session | The transcript shows private chat text. |
| Main empty state with the sidebar open | The sidebar shows private session titles. |
| Settings modal with model roles | The screen shows the home directory path and private provider names. |

## Capture protocol for the remaining baselines

Follow these rules before you add any further screenshot.

1. Start OMP-Web against a scratch working directory. Use `~/omp-cwd-design-fixture`.
2. Seed that directory with fixture sessions only. Do not open a real project.
3. Give every fixture session a neutral title. Use `Fixture session 01`.
4. Confirm the sidebar shows no real project name and no real session title.
5. Confirm the header shows no real absolute path.
6. Confirm the settings screens show no provider name that is private.
7. Capture at 1440x900, 834x1112, and 390x844. Capture dark and light.
8. Name each file `<surface>-<theme>-<width>x<height>.png`.
9. Inspect every file before you stage it. Do not stage a file you did not open.

## Redaction rule

Do not blur private text as a substitute for a fixture profile.
A blur can be reversed and it hides layout detail that the review needs.
Re-capture the screen with fixture data instead.
