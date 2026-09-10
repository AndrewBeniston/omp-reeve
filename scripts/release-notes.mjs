#!/usr/bin/env bun
/** bun run release:notes <version>  prints the CHANGELOG.md body for one version. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseNotesFor } from "./release-core.mjs";

const version = (process.argv[2] ?? "").replace(/^v/, "");
if (!version) { console.error("usage: release:notes <version>"); process.exit(1); }
const text = readFileSync(join(import.meta.dir, "..", "CHANGELOG.md"), "utf8");
const body = releaseNotesFor(text, version);
if (!body) { console.error(`[release-notes] no entries for ${version}`); process.exit(1); }
process.stdout.write(`${body}\n`);
