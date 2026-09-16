import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "./file-access";
import { repositoryRoot } from "./review-commit-git";

/**
 * The repository a Worktree belongs to, checked against the allowed roots.
 *
 * The owner check clears the Worktree and its Project. This covers the root
 * Git itself walks up to, which a link can place outside either, and which is
 * what a commit, a push or a published branch would actually act on.
 */
export async function reviewRepositoryDenied(cwd: string): Promise<boolean> {
  const roots = await getAllowedFileRoots();
  const root = await repositoryRoot(cwd).catch(() => null);
  return root === null || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots);
}
