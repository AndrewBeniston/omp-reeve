/**
 * The applications the platform itself says can open this particular file.
 *
 * This exists because the reference has it, and it is narrower than it first
 * looks. Discovery **appends** to the fixed registry rather than replacing it,
 * and it is gated by the path rather than by the operating system.
 *
 * Two branches can append. A path that ends in `.html` or `.htm` is a page,
 * and the platform's browsers answer for it. Any other path must be a regular
 * file whose extension is in a fixed set of document, image, audio, video,
 * archive, design and office types, plus `csv`.
 *
 * A source file — `.ts`, `.js`, `.py`, `.rs`, `.go`, `.md` — is deliberately
 * absent from that set, so an ordinary reviewed file sees the registry alone
 * on every platform. In a review the members that do fire are `.csv`, `.html`,
 * and the image and PDF types.
 */

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** The most discovered applications ever appended, matching the reference cap. */
const DISCOVERY_LIMIT = 5;

/** The document types the platform's own applications are asked about. */
const NATIVE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  "pdf", "rtf", "rtfd", "txt", "epub", "djvu", "ps", "chm",
  "doc", "docx", "ppt", "pptx", "xls", "xlsm", "xlsx", "csv",
  "pages", "numbers", "key",
  "png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "heic", "heif", "avif", "ico", "svg", "psd", "ai", "eps", "raw", "dng",
  "mp3", "wav", "aac", "flac", "m4a", "ogg", "aiff",
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "mpg", "wmv",
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar", "dmg", "iso",
  "sketch", "fig", "xd", "blend",
  "html", "htm",
]);

/** The office types whose own default application is hoisted to the front. */
const OFFICE_EXTENSIONS: ReadonlySet<string> = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsm", "xlsx"]);

/** A page rather than a document, which the platform's browsers open. */
const WEB_PAGE_NAME = /\.html?$/i;

/** The applications that answer for a page, by the name the platform shows. */
const BROWSER_NAMES = /^(Safari|Google Chrome|Chromium|Firefox|Microsoft Edge|Brave Browser|Arc|Opera|Vivaldi|Orion)\b/i;

/** Where a Linux desktop entry is looked for, in order. */
const LINUX_APPLICATION_DIRECTORIES: readonly string[] = [
  "/usr/share/applications",
  path.join(homedir(), ".local/share/applications"),
];

export interface DiscoveredApplication {
  id: string;
  label: string;
  /** The application bundle or executable to launch. */
  command: string;
}

function fileExtension(filePath: string): string {
  return path.extname(filePath).replace(/^\./, "").toLowerCase();
}

/**
 * Whether this path is a page. The test is the name alone, as the reference's
 * own is: a page that is not written yet still opens in a browser.
 */
export function isWebPage(filePath: string): boolean {
  return WEB_PAGE_NAME.test(filePath);
}

/** Whether this path is one the platform's own applications are asked about. */
function allowsNativeDiscovery(filePath: string, exists: (target: string) => boolean = (target) => existsSync(target) && statSync(target).isFile()): boolean {
  if (!NATIVE_FILE_EXTENSIONS.has(fileExtension(filePath))) return false;
  try {
    return exists(filePath);
  } catch {
    return false;
  }
}

/**
 * Whether the offered set is led by the platform's own viewers rather than by
 * an editor. The reference flips the same way, and it decides which target is
 * offered first, not only which are offered.
 *
 * There is no platform test here. The reference flips on the path on every
 * platform, Windows included, and only the enumeration behind it differs.
 */
export function discoveryMode(filePath: string): "native" | "editor" {
  if (isWebPage(filePath)) return "native";
  return allowsNativeDiscovery(filePath) ? "native" : "editor";
}

/**
 * macOS: ask Spotlight for application bundles, most recently used first.
 *
 * Reeve's own bundle would be an odd thing to offer as a way of reading a
 * file, so it is dropped, as are anything that is not a bundle.
 */
async function spotlightApplications(): Promise<DiscoveredApplication[]> {
  const { stdout } = await exec("/usr/bin/mdfind", [
    "-0",
    'kMDItemContentType == "com.apple.application-bundle"',
    "-attr", "kMDItemDisplayName",
    "-attr", "kMDItemLastUsedDate",
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 5000 });
  const seen = new Map<string, DiscoveredApplication>();
  for (const record of stdout.split("\0").filter(Boolean)) {
    const [bundle, ...attributes] = record.split(/\s{2,}/);
    if (!bundle?.endsWith(".app")) continue;
    const name = attributes.find((value) => value.startsWith("kMDItemDisplayName = "))?.slice(21).trim();
    const label = (name && name !== "(null)" ? name : path.basename(bundle, ".app")).replace(/\.app$/, "");
    if (/^(Reeve|OMP)$/i.test(label)) continue;
    if (!seen.has(bundle)) seen.set(bundle, { id: `discovered:${bundle}`, label, command: bundle });
  }
  return [...seen.values()];
}

async function discoverOnDarwin(filePath: string): Promise<DiscoveredApplication[]> {
  const extension = fileExtension(filePath);
  const preferred = OFFICE_EXTENSIONS.has(extension) ? /Microsoft|LibreOffice|Pages|Numbers|Keynote/i : /Preview|QuickTime|Archive Utility/i;
  const applications = await spotlightApplications();
  // The platform's own viewer for this type first, then the rest as Spotlight
  // ordered them.
  return [
    ...applications.filter((application) => preferred.test(application.label)),
    ...applications.filter((application) => !preferred.test(application.label)),
  ].slice(0, DISCOVERY_LIMIT);
}

/** A desktop entry by name, wherever this desktop keeps it. */
function linuxDesktopEntry(entry: string): string | null {
  for (const directory of LINUX_APPLICATION_DIRECTORIES) {
    const candidate = path.join(directory, entry);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The browsers this machine offers for a page.
 *
 * macOS reads them out of the same Spotlight enumeration the other branch
 * uses, and Linux asks the desktop which applications claim `https`. Windows
 * has none to read: the reference's own two browser enumerators are both
 * macOS-only, so its Windows branch appends nothing either.
 */
async function discoverBrowsers(platform: NodeJS.Platform): Promise<DiscoveredApplication[]> {
  if (platform === "darwin") {
    const applications = await spotlightApplications();
    return applications.filter((application) => BROWSER_NAMES.test(application.label)).slice(0, DISCOVERY_LIMIT);
  }
  if (platform !== "linux") return [];
  const { stdout } = await exec("gio", ["mime", "x-scheme-handler/https"], { encoding: "utf8", timeout: 5000 });
  const found: DiscoveredApplication[] = [];
  const seen = new Set<string>();
  for (const match of stdout.matchAll(/[\w.+-]+\.desktop/g)) {
    const entry = match[0];
    if (seen.has(entry)) continue;
    seen.add(entry);
    const file = linuxDesktopEntry(entry);
    if (!file) continue;
    found.push({ id: `discovered:${file}`, label: path.basename(entry, ".desktop"), command: file });
    if (found.length >= DISCOVERY_LIMIT) break;
  }
  return found;
}

/**
 * Linux: the same extension gate, a different enumeration. Desktop entries
 * rather than Spotlight, which is the only part of this that differs.
 */
function discoverOnLinux(): DiscoveredApplication[] {
  return readdirSync("/usr/share/applications")
    .filter((entry) => entry.endsWith(".desktop"))
    .slice(0, DISCOVERY_LIMIT)
    .map((entry) => ({
      id: `discovered:/usr/share/applications/${entry}`,
      label: path.basename(entry, ".desktop"),
      command: `/usr/share/applications/${entry}`,
    }));
}

/**
 * The applications to append for this file, or none. Never throws: discovery
 * failing is a shorter menu, not a broken one.
 */
export async function discoverApplications(filePath: string, platform: NodeJS.Platform): Promise<DiscoveredApplication[]> {
  try {
    if (isWebPage(filePath)) return await discoverBrowsers(platform);
    if (platform !== "darwin" && platform !== "linux") return [];
    if (!allowsNativeDiscovery(filePath)) return [];
    return platform === "darwin" ? await discoverOnDarwin(filePath) : discoverOnLinux();
  } catch {
    return [];
  }
}
