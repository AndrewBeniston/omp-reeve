# Model roles

OMP has one model for each work scope. Reeve exposes the same roles as the terminal interface.

| Role | What it runs |
| --- | --- |
| `default` | ordinary turns |
| `smol` | cheap, fast subagent and background work |
| `slow` | deep reasoning on hard problems |
| `plan` | plan mode |
| `commit` | commit messages and changelogs |
| `task` | the model subagents spawn with |
| `advisor` | the second model that reviews every turn |
| `vision`, `designer`, `tiny` | image turns, design work, classification |

Two places surface them:

- **The model picker in the chat bar** lists the configured roles above the flat model list. Picking one switches the session onto that role's model *and records the role*, exactly like `/model` does, so the transcript and omp's retry fallbacks agree on which role is driving.
- **Models → Model roles** assigns a model to each role. Writes go to `modelRoles` in `~/.omp/agent/config.yml` (or `.omp/config.yml` when you pick **This project**), which is the same record the CLI reads — an assignment made in the browser is what your next terminal session starts with.

Reeve asks OMP to name each Session through the `tiny`, `commit`, and `smol` model roles.
