import { conventionalGenerationConfig } from "@oh-my-pi/pi-coding-agent/commit/conventional/config";
import { generateConventionalCommit } from "@oh-my-pi/pi-coding-agent/commit/conventional/generate";
import { OmpCommitInference } from "@oh-my-pi/pi-coding-agent/commit/conventional/inference";
import { resolvePrimaryModel, resolveSmolModel } from "@oh-my-pi/pi-coding-agent/commit/model-selection";
import type { ConventionalCommit } from "@oh-my-pi/pi-coding-agent/commit/types";
import { getOmpRuntime, getSettingsForCwd } from "./omp-runtime";
import { readStagedInputs, repositoryRoot } from "./review-commit-git";

/**
 * A suggested commit message, written by omp's own commit generator.
 *
 * omp's `generateGitCommit` is deliberately not used: it opens its own
 * Settings, AuthStorage and ModelRegistry, and a second AuthStorage would open
 * a second handle on `agent.db`. The pieces underneath it are exported, so
 * this assembles them over the server's one runtime instead, and supplies the
 * staged tree as text it has read itself — no staging, no second handle, and
 * `resolvePrimaryModel` still resolves the `commit` role before `smol`.
 */
export type ReviewCommitMessageFailure = "no-staged-changes" | "unavailable";

export type ReviewCommitMessageResult =
  | { ok: true; message: string; validationError: string | null }
  | { ok: false; failure: ReviewCommitMessageFailure };

/** The conventional form as one message: subject, body, then footers. */
export function formatConventionalCommit(commit: ConventionalCommit): string {
  const scope = commit.scope ? `(${commit.scope})` : "";
  const subject = `${commit.type}${scope}: ${commit.summary}`.trim();
  const paragraphs = [commit.body.join("\n").trim(), commit.footers.join("\n").trim()].filter(Boolean);
  return [subject, ...paragraphs].join("\n\n");
}

/** The stat block llm-git's prompts expect, rendered from numstat. */
function renderStat(numstat: string): string {
  const rows = numstat.split("\n").filter(Boolean).map((line) => line.split("\t"));
  if (rows.length === 0) return "";
  let insertions = 0;
  let deletions = 0;
  const lines = rows.map(([added, removed, path]) => {
    const addedCount = Number(added) || 0;
    const removedCount = Number(removed) || 0;
    insertions += addedCount;
    deletions += removedCount;
    return ` ${path} | ${addedCount + removedCount} ${"+".repeat(Math.min(addedCount, 40))}${"-".repeat(Math.min(removedCount, 40))}`;
  });
  lines.push(` ${rows.length} file${rows.length === 1 ? "" : "s"} changed, ${insertions} insertion${insertions === 1 ? "" : "s"}(+), ${deletions} deletion${deletions === 1 ? "" : "s"}(-)`);
  return `${lines.join("\n")}\n`;
}

/** Scopes this repository already uses, which steers the generated scope. */
function commonScopes(subjects: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const subject of subjects) {
    const scope = /^[a-z]+\(([^)]+)\):/i.exec(subject)?.[1];
    if (scope) counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  const ranked = [...counts].sort((left, right) => right[1] - left[1]).slice(0, 10)
    .map(([scope, count]) => `${scope} (${count})`).join(", ");
  return ranked || undefined;
}

export async function generateReviewCommitMessage(cwd: string, modelOverride?: string): Promise<ReviewCommitMessageResult> {
  try {
    const root = await repositoryRoot(cwd);
    const { diff, numstat, subjects } = await readStagedInputs(root);
    if (!diff.trim()) return { ok: false, failure: "no-staged-changes" };

    const { modelRegistry } = await getOmpRuntime();
    const settings = await getSettingsForCwd(cwd);
    const config = conventionalGenerationConfig(settings.getGroup("commit"));
    // No override resolves the `commit` role first, then `smol`, then the rest.
    const primary = await resolvePrimaryModel(modelOverride, settings, modelRegistry);
    const smol = modelOverride ? primary : await resolveSmolModel(settings, modelRegistry, primary.model, primary.apiKey);
    // No `authStorage`: the generator closes what it is given, and the server's
    // storage is shared with every other request.
    const inference = new OmpCommitInference({ primary, smol, forcePrimaryForEveryRole: modelOverride !== undefined, config, cache: null });
    try {
      const generated = await generateConventionalCommit({
        diff,
        stat: renderStat(numstat),
        numstat,
        config,
        inference,
        context: {
          recentCommits: subjects.slice(0, 10).join("\n") || undefined,
          commonScopes: commonScopes(subjects),
        },
      });
      return { ok: true, message: formatConventionalCommit(generated.commit), validationError: generated.validationError };
    } finally {
      inference.dispose();
    }
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}
