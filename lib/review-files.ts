import { getRelativeFilePath, joinFilePath } from "./file-paths";

export interface ReviewFile {
  path: string;
  oldPath: string;
  patch: string;
  binary: boolean;
  conflicted?: boolean;
  additions: number | null;
  deletions: number | null;
}

/**
 * The path a changed file is referenced by in the owning Session's composer.
 *
 * A patch names its files from the repository root, and a Session's working
 * directory can be a subfolder of that repository, so the repository-relative
 * path is the wrong name for that agent to resolve. Rebase it: repository root
 * plus patch path is the file, and the Session's directory is what the name is
 * relative to. Paths shown or copied in the panel stay repository-relative,
 * because they name the patch rather than address a Session.
 */
export function reviewReferencePath(repositoryRoot: string, cwd: string, repositoryPath: string): string {
  return getRelativeFilePath(joinFilePath(repositoryRoot, repositoryPath), cwd);
}

function decodePath(value: string): string {
  if (!value.startsWith('"')) return value;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const escapes: Record<string, string> = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", '"': '"', "\\": "\\" };
  const body = value.slice(1, -1);
  for (let index = 0; index < body.length;) {
    if (body[index] === "\\") {
      const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1));
      if (octal) {
        bytes.push(parseInt(octal[0], 8));
        index += octal[0].length + 1;
        continue;
      }
      bytes.push(...encoder.encode(escapes[body[index + 1]] ?? body[index + 1]));
      index += 2;
    } else {
      const point = String.fromCodePoint(body.codePointAt(index)!);
      bytes.push(...encoder.encode(point));
      index += point.length;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function headerPaths(header: string): [string, string] {
  const paths = header.slice("diff --git ".length);
  // Unquoted identical paths can contain the separator itself.
  if (paths.startsWith("a/") && paths.length % 2 === 1) {
    const half = (paths.length - 1) / 2;
    const left = paths.slice(0, half);
    const right = paths.slice(half + 1);
    if (paths[half] === " " && right === `b/${left.slice(2)}`) return [left.slice(2), right.slice(2)];
  }
  const match = /^("(?:[^"\\]|\\.)*"|a\/.*?) ("(?:[^"\\]|\\.)*"|b\/.*)$/.exec(paths);
  if (!match) return [paths, paths];
  return [decodePath(match[1]).replace(/^a\//, ""), decodePath(match[2]).replace(/^b\//, "")];
}

export function reviewFilesFromPatch(patch: string, conflictedPaths: string[] = []): ReviewFile[] {
  const files: ReviewFile[] = patch.split(/(?=^diff --(?:git|cc|combined) )/m).filter((part) => part.startsWith("diff --git ")).map((part) => {
    const lines = part.split("\n");
    let [oldPath, filePath] = headerPaths(lines[0]);
    let additions = 0;
    let deletions = 0;
    let inHunk = false;
    for (const line of lines.slice(1)) {
      if (line.startsWith("@@ ")) { inHunk = true; continue; }
      if (inHunk) {
        if (line.startsWith("+")) additions++;
        if (line.startsWith("-")) deletions++;
        continue;
      }
      if (line.startsWith("rename from ")) oldPath = decodePath(line.slice(12));
      if (line.startsWith("rename to ")) filePath = decodePath(line.slice(10));
      if (line.startsWith("--- ")) {
        const value = decodePath(line.slice(4).split("\t")[0]);
        if (value !== "/dev/null") oldPath = value.replace(/^a\//, "");
      }
      if (line.startsWith("+++ ")) {
        const value = decodePath(line.slice(4).split("\t")[0]);
        if (value !== "/dev/null") filePath = value.replace(/^b\//, "");
      }
    }
    const binary = /^Binary files |^GIT binary patch$/m.test(part);
    return { path: filePath, oldPath, patch: part, binary, additions: binary ? null : additions, deletions: binary ? null : deletions };
  });
  for (const filePath of conflictedPaths) {
    const file = files.find((candidate) => candidate.path === filePath);
    if (file) {
      file.conflicted = true;
      file.additions = null;
      file.deletions = null;
    } else {
      files.push({ path: filePath, oldPath: filePath, patch: "", binary: false, conflicted: true, additions: null, deletions: null });
    }
  }
  return files;
}
