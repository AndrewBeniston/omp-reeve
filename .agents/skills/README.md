# Agent skills

This folder carries a copy of Matt Pocock's skill set. Every contributor gets
the same skills from a clone. No install step is needed.

- Source: https://github.com/mattpocock/skills
- Licence: MIT. The notice is in `LICENSE` beside this file.
- Count: 37 skills.

`skills-lock.json` at the repository root records the source path and a hash
for each skill. It is the record of what came from where.

## Read a skill

Open the `SKILL.md` file inside a skill folder. Codex and Claude Code load
these folders on their own.

## Update the skills

Run this command from the repository root:

```bash
npx skills@latest update
```

Then review the difference before you commit it.

## Add a skill from the same source

```bash
npx skills@latest add mattpocock/skills --skill "<name>" -y --copy
```

Use `--copy`. Symbolic links need administrator rights on Windows.

## Repository setup

`setup-matt-pocock-skills` has already run for this repository. Its output is
in `docs/agents/`. Read `AGENTS.md` under "Agent skills" for the summary.

