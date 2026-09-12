/**
 * Keep the machine that built a package out of the package.
 *
 * Next.js writes the project directory into the server bundle at build time. It
 * appears in `page_client-reference-manifest.js`, in webpack module ids inside
 * `chunks/*.js`, and in route loader query strings. `outputFileTracingRoot`
 * controls the trace files and not these, so the only reliable fix is to build
 * from a path that says nothing about whose machine it was.
 *
 * Reeve 0.5.0 shipped the maintainer's home directory in 159 files. Not a
 * secret, and not something a public product should carry.
 */

/**
 * Paths that name a person, on any of the three platforms.
 *
 * Each rule needs a name after the directory. Reeve serves a route at
 * /api/home, and the server bundle names that route in four files. A bare
 * "/home/" therefore reads the product as a person, and refuses a correct
 * package. The lookbehind removes that route, and it keeps a real path such
 * as "webpack://_N_E/home/someone/reeve".
 *
 * The Windows rule accepts one separator or two. A JavaScript string escapes
 * the separator and a manifest does not.
 */
const PERSONAL_PATH_PATTERNS = [
  /\/Users\/[A-Za-z0-9._-]+/,
  /(?<!\/api)\/home\/[A-Za-z0-9._-]+/,
  /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/,
];

/** The escape hatch, for a developer building locally who does not care. */
export const ALLOW_PERSONAL_BUILD_PATH = "REEVE_ALLOW_PERSONAL_BUILD_PATH";

/** Where a release is built from, one per platform. Documented in RELEASING.md. */
export const NEUTRAL_BUILD_PATHS = Object.freeze({
  darwin: "/tmp/reeve/build",
  linux: "/tmp/reeve/build",
  win32: "C:\\reeve\\build",
});

/** True when this text names somebody's home directory. */
export function namesAPerson(text) {
  return PERSONAL_PATH_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Whether a build may proceed from this directory.
 *
 * Pure. Returns null to allow, or the message explaining the refusal.
 */
export function refuseBuildPath(root, env = {}, platform = process.platform) {
  if (env[ALLOW_PERSONAL_BUILD_PATH] === "1") return null;
  if (!namesAPerson(root)) return null;

  const neutral = NEUTRAL_BUILD_PATHS[platform] ?? NEUTRAL_BUILD_PATHS.linux;
  return [
    `This build would bake ${root} into every package.`,
    "",
    "Next.js writes the project directory into the server bundle, so the path of",
    "the machine that built it ships to everyone who downloads it. Reeve 0.5.0",
    "shipped a home directory in 159 files that way.",
    "",
    `Build a release from ${neutral} instead. RELEASING.md has the steps.`,
    "",
    `For a local build you do not intend to ship, set ${ALLOW_PERSONAL_BUILD_PATH}=1.`,
  ].join("\n");
}
