import type { ReviewFile } from "./review-files";

/*
 * Generated files, identified by Git's `linguist-generated` attribute and
 * hidden behind one boolean that is off until the human turns it on. R5 in
 * `docs/research/review-reference.md` has the reference's mechanism, default
 * and reveal.
 */

/**
 * Whether `git check-attr` reported a value the reference reads as generated.
 *
 * Git distinguishes an attribute that is set from one set to a value, so
 * `linguist-generated` returns `set` while the commoner `=true` returns the
 * literal `true`. The reference maps both to set, and maps `-linguist-generated`
 * and `=false` to unset. The comparison is case-sensitive there, so `=TRUE`
 * is a value neither of them and leaves the file shown.
 */
export function isGeneratedAttributeValue(value: string): boolean {
  return value === "set" || value === "true";
}

/**
 * The paths `git check-attr -z --stdin linguist-generated` called generated.
 *
 * Its output is NUL-separated triples of path, attribute and value.
 */
export function generatedPathsFromAttributes(output: string): string[] {
  const fields = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    if (fields[index + 1] === "linguist-generated" && isGeneratedAttributeValue(fields[index + 2])) paths.push(fields[index]);
  }
  return paths;
}

export interface ReviewGeneratedPartition<File> {
  /** The files to show, in the order they arrived. */
  visible: File[];
  /** The generated files being held back, which is empty while the filter is off. */
  hidden: File[];
}

/**
 * The changed files split into what is shown and what the filter is holding.
 *
 * Both sides come back, because the panel has to know how many files it is
 * holding to offer them at all.
 */
export function partitionGeneratedReviewFiles<File extends Pick<ReviewFile, "path">>(
  files: readonly File[],
  generatedPaths: readonly string[],
  hideGenerated: boolean,
): ReviewGeneratedPartition<File> {
  if (!hideGenerated) return { visible: [...files], hidden: [] };
  const generated = new Set(generatedPaths);
  return {
    visible: files.filter((file) => !generated.has(file.path)),
    hidden: files.filter((file) => generated.has(file.path)),
  };
}
