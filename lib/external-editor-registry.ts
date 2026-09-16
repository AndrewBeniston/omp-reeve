/**
 * The applications a reviewed file can be opened in.
 *
 * The reference does not enumerate what is installed and offer that. It holds
 * a fixed registry of open targets, each with a platform table and a way of
 * resolving its own launch command, and offers the ones whose command
 * resolves on this machine. Detection, not enumeration — recorded under R12 in
 * `docs/research/review-reference.md`.
 *
 * This registry is Reeve's own: the entries name applications a developer on
 * this platform plausibly has, and each one carries the command and arguments
 * Reeve would use to open a file at a line.
 *
 * Browser-safe. Nothing here touches the filesystem; `external-editor-detect`
 * does the resolving.
 */

export type ExternalEditorKind = "editor" | "terminal" | "file-manager" | "system-default";

export type ExternalEditorPlatform = "darwin" | "win32" | "linux";

/** Where a file is being opened, and at which line if one is known. */
export interface ExternalEditorRequest {
  path: string;
  line?: number;
}

export interface ExternalEditorLaunch {
  /** Resolved at detection: an executable on PATH, or an application bundle. */
  command: string;
  arguments: string[];
}

export interface ExternalEditorPlatformEntry {
  /**
   * What this target is called on this platform, where the platform's own
   * name differs. The file manager is the case that needs it: the same target
   * is Finder, File Explorer and the desktop's file manager.
   */
  label?: string;
  /** Executables looked for on PATH, in order of preference. */
  commands?: string[];
  /** macOS application bundles, checked for existence. */
  bundles?: string[];
  /**
   * Executables given as absolute paths, which may name an environment
   * variable as `%NAME%`. Windows installations need this, and so does a
   * macOS application whose launcher lives inside its own bundle.
   */
  paths?: string[];
  /** How this target is told which file, and which line, to open. */
  build?: (request: ExternalEditorRequest) => string[];
}

export interface ExternalEditorTarget {
  id: string;
  label: string;
  kind: ExternalEditorKind;
  /**
   * Kept out of general file menus, and shown in Review anyway. The reference
   * asks for hidden targets by name from its Review menu, and this is why.
   */
  hidden?: boolean;
  platforms: Partial<Record<ExternalEditorPlatform, ExternalEditorPlatformEntry>>;
}

/**
 * One entry as a menu sees it. The detection that fills this in is server-side
 * and this shape is not, so it lives here with the rest of the vocabulary.
 */
export interface ExternalEditorOption {
  id: string;
  label: string;
  kind: ExternalEditorKind;
  hidden: boolean;
  available: boolean;
  /** True for an application the platform offered for this file's type. */
  discovered?: boolean;
}

export interface ExternalEditorListing {
  targets: ExternalEditorOption[];
  preferredTargetId: string | null;
  /** `native` when the platform's own viewers lead, `editor` otherwise. */
  mode: "native" | "editor";
}

/** `code -g path:line`, which most editors of that family understand. */
const gotoArgument = (request: ExternalEditorRequest): string[] =>
  request.line ? ["-g", `${request.path}:${request.line}`] : [request.path];

/** `--goto path:line`, the long form of the same flag. */
const longGotoArgument = (request: ExternalEditorRequest): string[] =>
  request.line ? ["--goto", `${request.path}:${request.line}`] : [request.path];

/** `--line N path`, the JetBrains launcher convention. */
const jetbrainsArgument = (request: ExternalEditorRequest): string[] =>
  request.line ? ["--line", String(request.line), request.path] : [request.path];

const plainArgument = (request: ExternalEditorRequest): string[] => [request.path];

/** `path:line`, understood by the editors that take a suffix rather than a flag. */
const suffixArgument = (request: ExternalEditorRequest): string[] =>
  request.line ? [`${request.path}:${request.line}`] : [request.path];

function codeFamily(bundle: string, commands: string[]): Partial<Record<ExternalEditorPlatform, ExternalEditorPlatformEntry>> {
  return {
    darwin: { commands, bundles: [`/Applications/${bundle}.app`], build: gotoArgument },
    linux: { commands, build: gotoArgument },
    win32: { commands, build: gotoArgument },
  };
}

function jetbrains(id: string, label: string, bundle: string, command: string): ExternalEditorTarget {
  return {
    id,
    label,
    kind: "editor",
    platforms: {
      darwin: { commands: [command], bundles: [`/Applications/${bundle}.app`], build: jetbrainsArgument },
      linux: { commands: [command], build: jetbrainsArgument },
      win32: { commands: [`${command}64.exe`, `${command}.exe`], build: jetbrainsArgument },
    },
  };
}

export const EXTERNAL_EDITOR_TARGETS: readonly ExternalEditorTarget[] = [
  { id: "vscode", label: "VS Code", kind: "editor", platforms: codeFamily("Visual Studio Code", ["code"]) },
  { id: "vscodeInsiders", label: "VS Code Insiders", kind: "editor", hidden: true, platforms: codeFamily("Visual Studio Code - Insiders", ["code-insiders"]) },
  { id: "cursor", label: "Cursor", kind: "editor", platforms: codeFamily("Cursor", ["cursor"]) },
  { id: "windsurf", label: "Windsurf", kind: "editor", platforms: codeFamily("Windsurf", ["windsurf"]) },
  {
    // Devin Desktop keeps its launcher inside its own bundle, and `devin` on
    // PATH is a separate agent command that does not open a file, so this
    // target resolves the bundle path alone.
    id: "devin",
    label: "Devin Desktop",
    kind: "editor",
    platforms: {
      darwin: {
        paths: [
          "/Applications/Devin.app/Contents/Resources/app/bin/devin-desktop",
          "%HOME%/Applications/Devin.app/Contents/Resources/app/bin/devin-desktop",
        ],
        build: longGotoArgument,
      },
    },
  },
  { id: "antigravity", label: "Antigravity", kind: "editor", hidden: true, platforms: codeFamily("Antigravity", ["antigravity"]) },
  { id: "positron", label: "Positron", kind: "editor", hidden: true, platforms: codeFamily("Positron", ["positron"]) },
  {
    id: "zed",
    label: "Zed",
    kind: "editor",
    platforms: {
      darwin: { commands: ["zed"], bundles: ["/Applications/Zed.app"], build: suffixArgument },
      linux: { commands: ["zed", "zeditor"], build: suffixArgument },
      win32: { commands: ["zed.exe"], build: suffixArgument },
    },
  },
  {
    id: "sublimeText",
    label: "Sublime Text",
    kind: "editor",
    platforms: {
      darwin: { commands: ["subl"], bundles: ["/Applications/Sublime Text.app"], build: suffixArgument },
      linux: { commands: ["subl", "sublime_text"], build: suffixArgument },
      win32: { commands: ["subl.exe"], paths: ["%ProgramFiles%\\\\Sublime Text\\\\subl.exe"], build: suffixArgument },
    },
  },
  {
    id: "textmate",
    label: "TextMate",
    kind: "editor",
    platforms: { darwin: { commands: ["mate"], bundles: ["/Applications/TextMate.app"], build: (request) => request.line ? ["-l", String(request.line), request.path] : [request.path] } },
  },
  {
    id: "bbedit",
    label: "BBEdit",
    kind: "editor",
    platforms: { darwin: { commands: ["bbedit"], bundles: ["/Applications/BBEdit.app"], build: (request) => request.line ? [`+${request.line}`, request.path] : [request.path] } },
  },
  {
    id: "emacs",
    label: "Emacs",
    kind: "editor",
    platforms: {
      darwin: { commands: ["emacs"], bundles: ["/Applications/Emacs.app"], build: (request) => request.line ? [`+${request.line}`, request.path] : [request.path] },
      linux: { commands: ["emacs"], build: (request) => request.line ? [`+${request.line}`, request.path] : [request.path] },
      win32: { commands: ["emacs.exe"], build: plainArgument },
    },
  },
  {
    id: "neovim",
    label: "Neovim",
    kind: "editor",
    hidden: true,
    platforms: {
      darwin: { commands: ["nvim"], build: (request) => request.line ? [`+${request.line}`, request.path] : [request.path] },
      linux: { commands: ["nvim"], build: (request) => request.line ? [`+${request.line}`, request.path] : [request.path] },
      win32: { commands: ["nvim.exe"], build: plainArgument },
    },
  },
  {
    id: "xcode",
    label: "Xcode",
    kind: "editor",
    platforms: { darwin: { commands: ["xed"], bundles: ["/Applications/Xcode.app"], build: (request) => request.line ? ["--line", String(request.line), request.path] : [request.path] } },
  },
  {
    id: "visualStudio",
    label: "Visual Studio",
    kind: "editor",
    platforms: { win32: { commands: ["devenv.exe"], paths: ["%ProgramFiles%\\\\Microsoft Visual Studio\\\\2022\\\\Community\\\\Common7\\\\IDE\\\\devenv.exe"], build: (request) => request.line ? ["/edit", request.path, "/command", `edit.goto ${request.line}`] : ["/edit", request.path] } },
  },
  { id: "androidStudio", label: "Android Studio", kind: "editor", platforms: { darwin: { commands: ["studio"], bundles: ["/Applications/Android Studio.app"], build: jetbrainsArgument }, linux: { commands: ["studio", "android-studio"], build: jetbrainsArgument }, win32: { commands: ["studio64.exe"], build: jetbrainsArgument } } },
  jetbrains("intellij", "IntelliJ IDEA", "IntelliJ IDEA", "idea"),
  jetbrains("pycharm", "PyCharm", "PyCharm", "pycharm"),
  jetbrains("webstorm", "WebStorm", "WebStorm", "webstorm"),
  jetbrains("phpstorm", "PhpStorm", "PhpStorm", "phpstorm"),
  jetbrains("goland", "GoLand", "GoLand", "goland"),
  jetbrains("rider", "Rider", "Rider", "rider"),
  jetbrains("rustrover", "RustRover", "RustRover", "rustrover"),
  jetbrains("clion", "CLion", "CLion", "clion"),
  {
    id: "githubDesktop",
    label: "GitHub Desktop",
    kind: "editor",
    hidden: true,
    platforms: {
      darwin: { bundles: ["/Applications/GitHub Desktop.app"], build: plainArgument },
      win32: { paths: ["%LocalAppData%\\\\GitHubDesktop\\\\GitHubDesktop.exe"], build: plainArgument },
      linux: { commands: ["github-desktop"], build: plainArgument },
    },
  },
  {
    id: "systemDefault",
    label: "Default app",
    kind: "system-default",
    platforms: {
      darwin: { commands: ["open"], build: plainArgument },
      linux: { commands: ["xdg-open"], build: plainArgument },
      win32: { commands: ["cmd.exe"], build: (request) => ["/c", "start", "", request.path] },
    },
  },
  {
    id: "fileManager",
    label: "File manager",
    kind: "file-manager",
    platforms: {
      darwin: { label: "Finder", commands: ["open"], build: (request) => ["-R", request.path] },
      linux: { label: "File manager", commands: ["xdg-open"], build: (request) => [request.path] },
      win32: { label: "File Explorer", commands: ["explorer.exe"], build: (request) => [`/select,${request.path}`] },
    },
  },
  { id: "terminal", label: "Terminal", kind: "terminal", platforms: { darwin: { commands: ["open"], bundles: ["/System/Applications/Utilities/Terminal.app"], build: (request) => ["-a", "Terminal", request.path] }, linux: { commands: ["x-terminal-emulator", "gnome-terminal"], build: plainArgument }, win32: { commands: ["wt.exe", "cmd.exe"], build: plainArgument } } },
  { id: "iterm2", label: "iTerm2", kind: "terminal", platforms: { darwin: { bundles: ["/Applications/iTerm.app"], build: plainArgument } } },
  { id: "kitty", label: "Kitty", kind: "terminal", platforms: { darwin: { commands: ["kitty"], bundles: ["/Applications/kitty.app"], build: plainArgument }, linux: { commands: ["kitty"], build: plainArgument } } },
  { id: "ghostty", label: "Ghostty", kind: "terminal", platforms: { darwin: { commands: ["ghostty"], bundles: ["/Applications/Ghostty.app"], build: plainArgument }, linux: { commands: ["ghostty"], build: plainArgument } } },
  { id: "warp", label: "Warp", kind: "terminal", platforms: { darwin: { bundles: ["/Applications/Warp.app"], build: plainArgument }, linux: { commands: ["warp-terminal"], build: plainArgument } } },
  { id: "gitBash", label: "Git Bash", kind: "terminal", platforms: { win32: { paths: ["%ProgramFiles%\\\\Git\\\\git-bash.exe"], build: plainArgument } } },
  { id: "cmder", label: "Cmder", kind: "terminal", hidden: true, platforms: { win32: { commands: ["cmder.exe"], build: plainArgument } } },
  { id: "wsl", label: "WSL", kind: "terminal", hidden: true, platforms: { win32: { commands: ["wsl.exe"], build: plainArgument } } },
];

/** The targets this platform has an entry for, in registry order. */
export function targetsForPlatform(platform: NodeJS.Platform): ExternalEditorTarget[] {
  return EXTERNAL_EDITOR_TARGETS.filter((target) => Boolean(target.platforms[platform as ExternalEditorPlatform]));
}

export function findExternalEditorTarget(id: string): ExternalEditorTarget | undefined {
  return EXTERNAL_EDITOR_TARGETS.find((target) => target.id === id);
}

/** What a target is called on this platform, which the file manager varies. */
export function labelForPlatform(target: ExternalEditorTarget, platform: NodeJS.Platform): string {
  return target.platforms[platform as ExternalEditorPlatform]?.label ?? target.label;
}

/**
 * The arguments a resolved target is launched with. A target with no builder
 * for this platform is handed the path alone, which every one of them accepts.
 */
export function buildLaunchArguments(target: ExternalEditorTarget, platform: NodeJS.Platform, request: ExternalEditorRequest): string[] {
  const entry = target.platforms[platform as ExternalEditorPlatform];
  return entry?.build ? entry.build(request) : [request.path];
}
