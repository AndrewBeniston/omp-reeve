# Agent skills

This folder carries a copy of Matt Pocock's skill set. Every contributor gets
the same skills from a clone. No install step is needed.

- Source: https://github.com/mattpocock/skills
- Licence: MIT. The notice is in `LICENSE` beside this file.
- Count: 37 skills.

One skill here belongs to this repository, not to that set: `release-reeve`. It
carries the order and the gates of a release, and it sends the agent to
`RELEASING.md` for every command. It is not in `skills-lock.json`, because it has
no upstream source. Leave it in place when you update the set.

`skills-lock.json` at the repository root records the source path and a hash
for each skill. It is the record of what came from where.

## Read a skill

Open the `SKILL.md` file inside a skill folder.

## Where a skill lives

This folder is the source of truth. omp reads it, and Codex reads it. Neither
one needs a link.

Claude Code reads `.claude/skills` only. Run this command one time after a
clone:

```bash
bun run skills:link
```

The command makes one link in `.claude/skills` for each skill folder here. It
makes a junction on Windows, which needs no administrator rights. It makes a
symbolic link on macOS and on Linux. It keeps a real folder, such as a
`gitnexus-*` skill, and reports it.

The links stay on the machine. Never commit one. Git on Windows writes a
committed symbolic link out as a text file, and it stores a junction as a
second copy of the folder. `bun run skills:link --check` reports a missing
link and fails.

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
Run `bun run skills:link` after you add a skill.

## Repository setup

`setup-matt-pocock-skills` has already run for this repository. Its output is
in `docs/agents/`. Read `AGENTS.md` under "Agent skills" for the summary.
