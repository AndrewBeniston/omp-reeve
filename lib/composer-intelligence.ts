import type { PluginPackageInfo, SkillInfo } from "@/lib/api-types";
import type { SlashCommandInfo, SlashCommandSource } from "@/lib/omp-types";
import type { FileIndexEntry } from "@/lib/file-fuzzy";
import type { ComposerMentionKind, ComposerMentionToken } from "@/lib/composer-mention-types";
import type { SubagentSnapshot } from "@/lib/types";

export type ComposerSuggestionGroup = "agents" | "commands" | "files" | "plugins" | "skills";

export interface ComposerSuggestion extends ComposerMentionToken {
  id: string;
  group: ComposerSuggestionGroup;
  icon?: string;
  rightLabel?: string;
  searchTerms: string[];
  completionQuery?: string;
  isDirectory?: boolean;
  mentionLabel?: string;
}

function formatSlashSubcommandMention(commandName: string, subcommandName: string): string {
  return `${formatComposerName(commandName)}: ${formatComposerName(subcommandName)}`;
}

export interface ComposerSuggestionSection {
  id: ComposerSuggestionGroup;
  title?: string;
  showTitle?: boolean;
  items: ComposerSuggestion[];
}

export interface SlashQueryContext {
  query: string;
  parentCommand?: SlashCommandInfo;
}

export function resolveAutocompleteSelection<T>(
  key: string,
  shiftKey: boolean,
  items: T[],
  activeIndex: number,
): { captured: boolean; item?: T } {
  const captured = key === "Tab" || (key === "Enter" && !shiftKey);
  return captured ? { captured, item: items[activeIndex] } : { captured };
}

const SLASH_SOURCE_GROUP: Record<SlashCommandSource, ComposerSuggestionGroup> = {
  builtin: "commands",
  extension: "commands",
  custom: "commands",
  mcp_prompt: "commands",
  prompt: "commands",
  file: "commands",
  skill: "skills",
};

const SLASH_SOURCE_ORDER: Record<SlashCommandSource, number> = {
  builtin: 0,
  extension: 1,
  custom: 2,
  mcp_prompt: 3,
  prompt: 4,
  file: 5,
  skill: 6,
};

const DISPLAY_WORDS: Record<string, string> = {
  ai: "AI",
  api: "API",
  cli: "CLI",
  collab: "Collaboration",
  codex: "Codex",
  css: "CSS",
  dir: "Directory",
  dirs: "Directories",
  gpt: "GPT",
  html: "HTML",
  image: "Image",
  mcp: "MCP",
  omp: "OMP",
  pdf: "PDF",
  ssh: "SSH",
  tdd: "TDD",
  tts: "TTS",
  ui: "UI",
  ugc: "UGC",
  url: "URL",
  vfx: "VFX",
};

export function formatComposerName(value: string): string {
  return value
    .replace(/^skill:/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => DISPLAY_WORDS[word.toLowerCase()]
      ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function scopeLabel(skill: SkillInfo): string | undefined {
  const scope = skill.sourceInfo.scope?.toLowerCase();
  if (scope === "project") return "Project";
  if (scope === "user" || scope === "global") return "User";
  return undefined;
}

function scoreTerm(term: string, query: string): number {
  const candidate = term.toLowerCase();
  if (!query) return 1;
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80;
  if (candidate.includes(query)) return 50;
  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return 20;
  }
  return 0;
}

function suggestionScore(suggestion: ComposerSuggestion, query: string): number {
  return Math.max(
    scoreTerm(suggestion.label, query),
    scoreTerm(suggestion.raw, query),
    scoreTerm(suggestion.detail ?? "", query),
    ...suggestion.searchTerms.map((term) => scoreTerm(term, query)),
  );
}

function rankSuggestions(suggestions: ComposerSuggestion[], query: string, limit: number): ComposerSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();
  return suggestions
    .map((suggestion, index) => ({ suggestion, index, score: suggestionScore(suggestion, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || left.index - right.index
      || left.suggestion.label.localeCompare(right.suggestion.label))
    .slice(0, limit)
    .map(({ suggestion }) => suggestion);
}

function orderSectionsByMatch(
  sections: ComposerSuggestionSection[],
  query: string,
): ComposerSuggestionSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sections;
  const bestScore = Math.max(
    0,
    ...sections.flatMap((section) => section.items.map((item) => suggestionScore(item, normalizedQuery))),
  );
  const minimumScore = bestScore >= 50 ? 50 : 1;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => suggestionScore(item, normalizedQuery) >= minimumScore),
    }))
    .filter((section) => section.items.length > 0)
    .sort((left, right) => (
      Math.max(...right.items.map((item) => suggestionScore(item, normalizedQuery)))
      - Math.max(...left.items.map((item) => suggestionScore(item, normalizedQuery)))
    ));
}

function fileRaw(path: string): string {
  return path.includes(" ") ? `@"${path}"` : `@${path}`;
}

function buildFileSuggestion(entry: FileIndexEntry): ComposerSuggestion {
  const name = entry.path.split("/").pop() ?? entry.path;
  const extensionIndex = name.lastIndexOf(".");
  const stem = !entry.isDir && extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  const directory = entry.path.slice(0, Math.max(0, entry.path.length - name.length)).replace(/\/$/, "");
  return {
    id: `file:${entry.isDir ? "directory" : "file"}:${entry.path}`,
    group: "files",
    kind: "file",
    icon: entry.isDir ? "folder" : "file",
    label: entry.isDir ? `${name}/` : name,
    raw: fileRaw(entry.isDir ? `${entry.path}/` : entry.path),
    detail: directory || undefined,
    searchTerms: [entry.path, name, stem],
    completionQuery: entry.isDir ? `${entry.path}/` : undefined,
    isDirectory: entry.isDir,
  };
}

function buildSkillSuggestion(skill: SkillInfo): ComposerSuggestion {
  return {
    id: `skill:${skill.name}`,
    group: "skills",
    kind: "skill",
    icon: "skill",
    label: formatComposerName(skill.name),
    raw: `/skill:${skill.name}`,
    detail: skill.description,
    rightLabel: scopeLabel(skill),
    searchTerms: [skill.name, `@${skill.name}`, skill.description],
  };
}

function computerUsePackage(packages: PluginPackageInfo[]): PluginPackageInfo | undefined {
  return packages.find((plugin) => (
    plugin.status === "loaded"
    && !plugin.disabled
    && [plugin.packageName, plugin.source].some((value) => value?.includes("computer-use"))
  ));
}

function buildComputerUseSuggestion(packages: PluginPackageInfo[]): ComposerSuggestion | null {
  const plugin = computerUsePackage(packages);
  if (!plugin) return null;
  return {
    id: "plugin:computer-use",
    group: "plugins",
    kind: "computer-use",
    icon: "computer",
    label: "Computer Use",
    raw: "@computer",
    detail: "Control desktop applications with OMP",
    rightLabel: "Plugin",
    searchTerms: ["computer", "computer use", "desktop", "apps", plugin.packageName ?? plugin.source],
  };
}

function buildAgentSuggestion(agent: SubagentSnapshot): ComposerSuggestion {
  const label = agent.agent || `Agent ${agent.index + 1}`;
  const detail = agent.progress?.lastIntent
    ?? agent.task
    ?? agent.assignment
    ?? agent.description
    ?? agent.status;
  return {
    id: `agent:${agent.id}`,
    group: "agents",
    kind: "agent",
    icon: "agents",
    label,
    raw: `agent://${agent.id}`,
    detail,
    rightLabel: agent.status === "running" ? "Running" : formatComposerName(agent.status),
    searchTerms: [label, agent.id, detail, agent.status],
  };
}

export function buildAtMentionSections({
  query,
  files,
  skills,
  plugins,
  subagents = [],
}: {
  query: string;
  files: FileIndexEntry[];
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  subagents?: SubagentSnapshot[];
}): ComposerSuggestionSection[] {
  const computer = buildComputerUseSuggestion(plugins);
  const pluginCandidates = computer ? [computer] : [];
  const skillCandidates = skills.map(buildSkillSuggestion);
  const fileCandidates = files.map(buildFileSuggestion);
  const agentCandidates = subagents.map(buildAgentSuggestion);
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    const candidates = [...pluginCandidates, ...agentCandidates, ...skillCandidates, ...fileCandidates];
    const ranked = candidates
      .map((suggestion, index) => ({
        suggestion,
        index,
        score: suggestionScore(suggestion, normalizedQuery),
        priority: suggestion.label.toLowerCase().startsWith(normalizedQuery)
          ? suggestion.group === "plugins" ? 0 : suggestion.group === "files" ? 3 : 2
          : suggestion.group === "files" ? 3 : 2,
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || left.priority - right.priority
        || left.index - right.index)
      .slice(0, 8)
      .map(({ suggestion }) => suggestion);
    return ranked.length > 0
      ? [{ id: "commands", title: "Results", showTitle: false, items: ranked }]
      : [];
  }
  const pluginItems = rankSuggestions(pluginCandidates, query, 4);
  const agentItems = rankSuggestions(agentCandidates, query, 5);
  const skillItems = rankSuggestions(skillCandidates, query, 5);
  const fileItems: ComposerSuggestion[] = [];
  const sections = [
    { id: "plugins" as const, items: pluginItems },
    { id: "agents" as const, items: agentItems },
    { id: "skills" as const, items: skillItems },
    { id: "files" as const, items: fileItems },
  ].filter((section) => section.items.length > 0);
  return sections;
}

function slashRightLabel(command: SlashCommandInfo, skill?: SkillInfo): string | undefined {
  if (skill) return scopeLabel(skill);
  if (command.location === "project") return "Project";
  if (command.location === "user") return "User";
  if (command.source === "extension") return "Extension";
  if (command.source === "mcp_prompt") return "MCP";
  return undefined;
}

function buildSlashSuggestion(command: SlashCommandInfo, skills: SkillInfo[]): ComposerSuggestion {
  const skillName = command.source === "skill" && command.name.startsWith("skill:")
    ? command.name.slice("skill:".length)
    : null;
  const skill = skillName ? skills.find((candidate) => candidate.name === skillName) : undefined;
  const detail = skill?.description ?? command.description;
  const kind: ComposerMentionKind = skill ? "skill" : "command";
  return {
    id: `slash:${command.source}:${command.name}`,
    group: SLASH_SOURCE_GROUP[command.source],
    kind,
    icon: command.icon ?? (
      command.source === "skill" ? "skill"
        : command.source === "extension" ? "extension"
          : command.source === "mcp_prompt" ? "mcp"
            : command.source === "builtin" ? "action"
              : "prompt"
    ),
    label: skill ? formatComposerName(skill.name) : formatComposerName(command.name),
    raw: `/${command.name}`,
    detail,
    rightLabel: slashRightLabel(command, skill),
    searchTerms: [command.name, ...(command.aliases ?? []), detail ?? ""],
  };
}

export function extractSlashQuery(
  value: string,
  commands: SlashCommandInfo[],
): SlashQueryContext | null {
  const match = /^\/([^\s]*)(?:\s+([^\s]*))?$/.exec(value);
  if (!match) return null;
  const commandName = match[1] ?? "";
  const subcommandQuery = match[2];
  if (subcommandQuery === undefined) return { query: commandName };
  const normalized = commandName.toLowerCase();
  const parentCommand = commands.find((command) => (
    command.name.toLowerCase() === normalized
    || command.aliases?.some((alias) => alias.toLowerCase() === normalized)
  ));
  if (!parentCommand?.subcommands?.length) return null;
  return { query: subcommandQuery, parentCommand };
}

export function buildSlashSubcommandSections(
  command: SlashCommandInfo,
  query: string,
): ComposerSuggestionSection[] {
  const items = rankSuggestions((command.subcommands ?? []).map((subcommand) => ({
    id: `slash:${command.name}:${subcommand.name}`,
    group: "commands" as const,
    kind: "command" as const,
    icon: command.icon ?? "action",
    label: formatComposerName(subcommand.name),
    mentionLabel: formatSlashSubcommandMention(command.name, subcommand.name),
    raw: `/${command.name} ${subcommand.name}`,
    detail: subcommand.description ?? subcommand.usage,
    rightLabel: formatComposerName(command.name),
    searchTerms: [subcommand.name, subcommand.description ?? "", subcommand.usage ?? ""],
  })), query, 20);
  return items.length > 0 ? [{ id: "commands", title: formatComposerName(command.name), items }] : [];
}

export function buildSlashSections({
  query,
  commands,
  skills,
}: {
  query: string;
  commands: SlashCommandInfo[];
  skills: SkillInfo[];
}): ComposerSuggestionSection[] {
  const seen = new Set<string>();
  const suggestions = [...commands]
    .sort((left, right) => SLASH_SOURCE_ORDER[left.source] - SLASH_SOURCE_ORDER[right.source]
      || left.name.localeCompare(right.name))
    .filter((command) => {
      const name = command.name.toLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((command) => buildSlashSuggestion(command, skills));
  const ranked = rankSuggestions(suggestions, query, 40);
  return orderSectionsByMatch(["commands", "skills"].map((group) => ({
    id: group as ComposerSuggestionGroup,
    items: ranked.filter((suggestion) => suggestion.group === group),
  })).filter((section) => section.items.length > 0), query);
}

export function flattenSuggestionSections(sections: ComposerSuggestionSection[]): ComposerSuggestion[] {
  return sections.flatMap((section) => section.items);
}

export function buildComposerAddSections({ commands, skills, plugins, subagents = [] }: {
  commands: SlashCommandInfo[];
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  subagents?: SubagentSnapshot[];
}): ComposerSuggestionSection[] {
  const computer = buildComputerUseSuggestion(plugins);
  const candidates = [
    ...commands.map(command => buildSlashSuggestion(command, skills)),
    ...skills.map(buildSkillSuggestion),
    ...(computer ? [computer] : []),
    ...subagents.map(buildAgentSuggestion),
  ];
  const seen = new Set<string>();
  const items = candidates.filter(item => {
    if (seen.has(item.raw)) return false;
    seen.add(item.raw);
    return true;
  });
  const priority = ["/goal", "/plan"];
  const groups: ComposerSuggestionGroup[] = ["commands", "plugins", "skills", "agents"];
  return groups.map(id => ({
    id,
    items: items.filter(item => item.group === id).sort((left, right) => {
      const rank = (item: ComposerSuggestion) => {
        const index = priority.indexOf(item.raw);
        return index < 0 ? priority.length : index;
      };
      return rank(left) - rank(right) || left.label.localeCompare(right.label);
    }),
  })).filter(section => section.items.length > 0);
}

export function buildRecognizedComposerMentions({
  skills,
  plugins,
  commands,
  files = [],
  subagents = [],
}: {
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  commands: SlashCommandInfo[];
  files?: FileIndexEntry[];
  subagents?: SubagentSnapshot[];
}): ComposerMentionToken[] {
  const computer = buildComputerUseSuggestion(plugins);
  const subcommands = commands.flatMap((command) => (command.subcommands ?? []).map((subcommand) => ({
    kind: "command" as const,
    icon: command.icon ?? "action",
    label: formatSlashSubcommandMention(command.name, subcommand.name),
    raw: `/${command.name} ${subcommand.name}`,
    detail: subcommand.description ?? subcommand.usage,
  })));
  return [
    ...skills.map(buildSkillSuggestion),
    ...commands.map((command) => buildSlashSuggestion(command, skills)),
    ...subcommands,
    ...files.filter((entry) => !entry.isDir).map(buildFileSuggestion),
    ...subagents.map(buildAgentSuggestion),
    ...(computer ? [computer] : []),
  ].map(({ kind, label, raw, detail, icon }) => ({ kind, label, raw, detail, icon }));
}
