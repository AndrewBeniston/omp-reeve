import { conventionalGenerationConfig } from "@oh-my-pi/pi-coding-agent/commit/conventional/config";
import { generateConventionalCommit } from "@oh-my-pi/pi-coding-agent/commit/conventional/generate";
import { OmpCommitInference } from "@oh-my-pi/pi-coding-agent/commit/conventional/inference";
import { resolvePrimaryModel, resolveSmolModel } from "@oh-my-pi/pi-coding-agent/commit/model-selection";
import { getOmpRuntime, getSettingsForCwd } from "./omp-runtime";
import { readBranchInputs, repositoryRoot } from "./review-commit-git";

/**
 * The description a pull request gets when the human leaves it empty (R16).
 *
 * The reference says plainly in the modal that an empty description is
 * written for you, so this is the thing that writes it. It reads the branch
 * against its base and nothing else: no staging, no commit, no push.
 *
 * A branch with one commit needs no model - that commit is already the
 * description its author wrote, and using it keeps their words. Anything
 * longer goes through the same generator the commit message uses, over the
 * server's one runtime, and falls back to the list of commits when no model
 * can be reached, so an empty description is always filled with something
 * true rather than left empty or invented.
 */
export type ReviewPublishMessageFailure = "no-commits" | "unavailable";

export interface ReviewPublishMessage {
  title: string;
  body: string;
  /** How it was written, so the surface can say so rather than imply more. */
  source: "single-commit" | "generated" | "commit-list";
}

export type ReviewPublishMessageResult =
  | { ok: true; message: ReviewPublishMessage }
  | { ok: false; failure: ReviewPublishMessageFailure };

/** The commits, as a list a reader can scan. */
function commitList(subjects: readonly string[]): string {
  return subjects.map((subject) => `- ${subject}`).join("\n");
}

/** The stat block the generator prompts expect, rendered from numstat. */
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

export async function generateReviewPublishMessage(cwd: string, base: string): Promise<ReviewPublishMessageResult> {
  let subjects: string[] = [];
  try {
    const root = await repositoryRoot(cwd);
    const inputs = await readBranchInputs(root, base);
    subjects = inputs.subjects;
    if (subjects.length === 0) return { ok: false, failure: "no-commits" };
    if (subjects.length === 1) {
      return { ok: true, message: { title: subjects[0], body: inputs.bodies[0] ?? "", source: "single-commit" } };
    }

    const { modelRegistry } = await getOmpRuntime();
    const settings = await getSettingsForCwd(cwd);
    const config = conventionalGenerationConfig(settings.getGroup("commit"));
    const primary = await resolvePrimaryModel(undefined, settings, modelRegistry);
    const smol = await resolveSmolModel(settings, modelRegistry, primary.model, primary.apiKey);
    // No authStorage: the generator closes what it is given, and the
    // server's storage is shared with every other request.
    const inference = new OmpCommitInference({ primary, smol, forcePrimaryForEveryRole: false, config, cache: null });
    try {
      const generated = await generateConventionalCommit({
        diff: inputs.diff,
        stat: renderStat(inputs.numstat),
        numstat: inputs.numstat,
        config,
        inference,
        context: { recentCommits: subjects.join("\n") || undefined },
      });
      const summary = generated.commit.summary.trim();
      const written = generated.commit.body.join("\n").trim();
      return {
        ok: true,
        message: {
          title: summary || subjects[0],
          body: [written, commitList(subjects)].filter(Boolean).join("\n\n"),
          source: "generated",
        },
      };
    } finally {
      inference.dispose();
    }
  } catch {
    // The branch is known even when no model is. Its own commits describe it
    // truthfully, which is better than an empty description or an invented one.
    return subjects.length > 0
      ? { ok: true, message: { title: subjects[0], body: commitList(subjects), source: "commit-list" } }
      : { ok: false, failure: "unavailable" };
  }
}
