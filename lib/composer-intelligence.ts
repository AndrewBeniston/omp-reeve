import type { PluginPackageInfo, SkillInfo } from "@/lib/api-types";
import type { SlashCommandInfo, SlashCommandSource } from "@/lib/omp-types";
import type { FileIndexEntry } from "@/lib/file-fuzzy";
import type { ComposerMentionKind, ComposerMentionToken } from "@/lib/composer-mention-types";
import type { SubagentSnapshot } from "@/lib/types";

export type ComposerSuggestionGroup = "agents" | "commands" | "files" | "liveAgents" | "mcp" | "plugins" | "sessions" | "skills" | "tabs";

export interface ComposerSessionSource {
  id: string;
  label: string;
  detail?: string;
  context?: string;
}

export interface ComposerTranscriptMessage {
  role?: string;
  content?: unknown;
}

export interface ComposerTabSource {
  id: string;
  label: string;
  detail?: string;
  kind?: string;
}

export interface ComposerAgentSource {
  name: string;
  description: string;
  source?: string;
}

export interface ComposerMcpSource {
  name: string;
  enabled?: boolean;
  scope?: string;
}

export interface ComposerSuggestion extends ComposerMentionToken {
  id: string;
  group: ComposerSuggestionGroup;
  icon?: string;
  rightLabel?: string;
  searchTerms: string[];
  completionQuery?: string;
  isDirectory?: boolean;
  mentionLabel?: string;
  targetId?: string;
  /** Listed, and not selectable. Its detail says why. */
  disabled?: boolean;
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

function pluginName(plugin: PluginPackageInfo): string {
  const value = plugin.packageName ?? plugin.source;
  return value.startsWith("@") ? `@${formatComposerName(value.slice(1))}` : formatComposerName(value);
}

function buildPluginSuggestion(plugin: PluginPackageInfo): ComposerSuggestion {
  const name = pluginName(plugin);
  return {
    id: `plugin:${plugin.packageName ?? plugin.source}`,
    group: "plugins",
    kind: "plugin",
    icon: "extension",
    label: name,
    raw: `@plugin:${name}`,
    detail: "OMP Plugin",
    rightLabel: "Tab for more",
    searchTerms: [name, plugin.packageName ?? "", plugin.source, plugin.status],
    disabled: plugin.disabled,
  };
}

function buildAgentDefinitionSuggestion(agent: ComposerAgentSource): ComposerSuggestion {
  const name = formatComposerName(agent.name);
  return {
    id: `agent-definition:${agent.name}`,
    group: "agents",
    kind: "agent",
    icon: "agents",
    label: name,
    raw: `Use the ${name} Agent from OMP`,
    detail: agent.description,
    rightLabel: agent.source ? formatComposerName(agent.source) : undefined,
    searchTerms: [agent.name, name, agent.description, agent.source ?? ""],
  };
}

function buildLiveAgentSuggestion(agent: SubagentSnapshot): ComposerSuggestion {
  const label = agent.agent || `Agent ${agent.index + 1}`;
  const detail = agent.progress?.lastIntent
    ?? agent.task
    ?? agent.assignment
    ?? agent.description
    ?? agent.status;
  return {
    id: `agent:${agent.id}`,
    group: "liveAgents",
    kind: "agent",
    icon: "agents",
    label,
    raw: `Use the live ${label} Agent from OMP`,
    detail,
    rightLabel: agent.status === "running" ? "Running" : formatComposerName(agent.status),
    searchTerms: [label, agent.id, detail, agent.status],
  };
}

export const COMPOSER_SESSION_CONTEXT_LIMIT = 8_000;

function boundedSessionContext(context: string | undefined): string {
  return (context ?? "").slice(-COMPOSER_SESSION_CONTEXT_LIMIT);
}

function formatSessionMention(id: string, context: string): string {
  return context ? `@session:${id}\n\nPrior work context:\n${context}` : `@session:${id}`;
}

function buildSessionSuggestion(session: ComposerSessionSource): ComposerSuggestion {
  const context = boundedSessionContext(session.context);
  return {
    id: `session:${session.id}`,
    group: "sessions",
    kind: "session",
    icon: "message",
    label: session.label,
    raw: formatSessionMention(session.id, context),
    detail: session.detail,
    targetId: session.id,
    searchTerms: [session.label, session.detail ?? "", session.id],
  };
}

function buildTabSuggestion(tab: ComposerTabSource): ComposerSuggestion {
  return {
    id: `tab:${tab.id}`,
    group: "tabs",
    kind: "tab",
    icon: tab.kind === "browser" ? "browser" : "file",
    label: tab.label,
    raw: `@tab:${tab.id}`,
    detail: tab.detail,
    targetId: tab.id,
    searchTerms: [tab.label, tab.detail ?? "", tab.id, tab.kind ?? ""],
  };
}

function buildMcpSuggestion(server: ComposerMcpSource): ComposerSuggestion {
  const name = formatComposerName(server.name);
  return {
    id: `mcp:${server.name}`,
    group: "mcp",
    kind: "mcp",
    icon: "mcp",
    label: name,
    raw: `@mcp:${server.name}`,
    detail: server.enabled === false ? "MCP server · Disabled" : "MCP server",
    rightLabel: server.scope ? formatComposerName(server.scope) : undefined,
    disabled: server.enabled === false,
    searchTerms: [server.name, name, server.scope ?? "", server.enabled === false ? "disabled" : "enabled"],
  };
}

export function buildAtMentionSections({
  query,
  fileQuery = query,
  connectedQuery = query,
  files,
  skills,
  plugins,
  sessions = [],
  tabs = [],
  agents = [],
  subagents = [],
  mcpServers = [],
}: {
  query: string;
  /** Files and prior Sessions use the 100 ms query lane. */
  fileQuery?: string;
  /** Skills, Plugins, Agents, Tabs, and MCP use the 300 ms query lane. */
  connectedQuery?: string;
  files: FileIndexEntry[];
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  sessions?: ComposerSessionSource[];
  tabs?: ComposerTabSource[];
  agents?: ComposerAgentSource[];
  subagents?: SubagentSnapshot[];
  mcpServers?: ComposerMcpSource[];
}): ComposerSuggestionSection[] {
  const computer = buildComputerUseSuggestion(plugins);
  const computerPlugin = computerUsePackage(plugins);
  const pluginCandidates = [
    ...(computer ? [computer] : []),
    ...plugins.filter((plugin) => plugin !== computerPlugin).map(buildPluginSuggestion),
  ];
  const mcpCandidates = mcpServers.map(buildMcpSuggestion);
  const sessionCandidates = sessions.map(buildSessionSuggestion);
  const tabCandidates = tabs.map(buildTabSuggestion);
  const agentCandidates = agents.map(buildAgentDefinitionSuggestion);
  const skillCandidates = skills.map(buildSkillSuggestion);
  const fileCandidates = files.map(buildFileSuggestion);
  const liveAgentCandidates = subagents.map(buildLiveAgentSuggestion);
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    const fileLane = [...sessionCandidates, ...fileCandidates];
    const connectedLane = [
      ...mcpCandidates,
      ...pluginCandidates,
      ...agentCandidates,
      ...liveAgentCandidates,
      ...tabCandidates,
      ...skillCandidates,
    ];
    const ranked = [
      ...(fileQuery.trim() ? rankSuggestions(fileLane, fileQuery, 8) : []),
      ...(connectedQuery.trim() ? rankSuggestions(connectedLane, connectedQuery, 8) : []),
    ]
      .sort((left, right) => suggestionScore(right, normalizedQuery) - suggestionScore(left, normalizedQuery)
        || (left.group === "mcp" ? -1 : right.group === "mcp" ? 1 : 0)
        || (left.group === "plugins" ? -1 : right.group === "plugins" ? 1 : 0)
        || (left.group === "files" ? 1 : right.group === "files" ? -1 : 0))
      .slice(0, 8);
    return ranked.length > 0
      ? [{ id: "commands", title: "Results", showTitle: false, items: ranked }]
      : [];
  }
  const mcpItems = rankSuggestions(mcpCandidates, query, 5);
  const pluginItems = rankSuggestions(pluginCandidates, query, 5);
  const agentItems = rankSuggestions(agentCandidates, query, 5);
  const liveAgentItems = rankSuggestions(liveAgentCandidates, query, 5);
  const tabItems = rankSuggestions(tabCandidates, query, 5);
  const skillItems = rankSuggestions(skillCandidates, query, 5);
  const sessionItems = rankSuggestions(sessionCandidates, query, 5);
  const fileItems = rankSuggestions(fileCandidates, query, 5);
  const sections = [
    { id: "mcp" as const, items: mcpItems },
    { id: "plugins" as const, items: pluginItems },
    { id: "agents" as const, items: agentItems },
    { id: "liveAgents" as const, items: liveAgentItems },
    { id: "tabs" as const, items: tabItems },
    { id: "skills" as const, items: skillItems },
    { id: "sessions" as const, items: sessionItems },
    { id: "files" as const, items: fileItems },
  ].filter((section) => section.items.length > 0);
  return sections;
}

export function formatSessionTranscriptContext(messages: ComposerTranscriptMessage[]): string {
  const text = messages.map((message) => {
    if (typeof message.content === "string") return message.content;
    if (!Array.isArray(message.content)) return "";
    return message.content
      .filter((block): block is { type: string; text: string } => (
        typeof block === "object"
        && block !== null
        && (block as { type?: unknown }).type === "text"
        && typeof (block as { text?: unknown }).text === "string"
      ))
      .map((block) => block.text)
      .join("\n");
  }).filter(Boolean).join("\n\n").trim();
  return boundedSessionContext(text);
}

export function attachSessionTranscriptContext(
  suggestion: ComposerSuggestion,
  messages: ComposerTranscriptMessage[],
): ComposerSuggestion {
  if (suggestion.kind !== "session" || !suggestion.targetId) return suggestion;
  return {
    ...suggestion,
    raw: formatSessionMention(suggestion.targetId, formatSessionTranscriptContext(messages)),
  };
}

export function rankComposerSessionSources(
  sessions: ComposerSessionSource[],
  query: string,
  limit = 5,
): ComposerSessionSource[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sessions.slice(0, limit);
  return sessions
    .map((session, index) => ({
      session,
      index,
      score: Math.max(
        scoreTerm(session.label, normalizedQuery),
        scoreTerm(session.detail ?? "", normalizedQuery),
        scoreTerm(session.id, normalizedQuery),
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ session }) => session);
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
  disabledCommands,
}: {
  query: string;
  commands: SlashCommandInfo[];
  skills: SkillInfo[];
  /** Commands listed with their reason instead of an action. */
  disabledCommands?: ReadonlySet<string>;
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
    .map((command) => {
      const suggestion = buildSlashSuggestion(command, skills);
      return disabledCommands?.has(command.name) ? { ...suggestion, disabled: true } : suggestion;
    });
  const ranked = rankSuggestions(suggestions, query, Number.POSITIVE_INFINITY);
  return orderSectionsByMatch(["commands", "skills"].map((group) => ({
    id: group as ComposerSuggestionGroup,
    items: ranked.filter((suggestion) => suggestion.group === group),
  })).filter((section) => section.items.length > 0), query);
}

export function flattenSuggestionSections(sections: ComposerSuggestionSection[]): ComposerSuggestion[] {
  return sections.flatMap((section) => section.items);
}

export function buildComposerAddSections({ commands, skills, plugins, sessions = [], tabs = [], agents = [], subagents = [], mcpServers = [] }: {
  commands: SlashCommandInfo[];
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  sessions?: ComposerSessionSource[];
  tabs?: ComposerTabSource[];
  agents?: ComposerAgentSource[];
  subagents?: SubagentSnapshot[];
  mcpServers?: ComposerMcpSource[];
}): ComposerSuggestionSection[] {
  const computer = buildComputerUseSuggestion(plugins);
  const candidates = [
    ...commands.map(command => buildSlashSuggestion(command, skills)),
    ...skills.map(buildSkillSuggestion),
    ...sessions.map(buildSessionSuggestion),
    ...tabs.map(buildTabSuggestion),
    ...agents.map(buildAgentDefinitionSuggestion),
    ...(computer ? [computer] : []),
    ...subagents.map(buildLiveAgentSuggestion),
    ...mcpServers.map(buildMcpSuggestion),
  ];
  const seen = new Set<string>();
  const items = candidates.filter(item => {
    if (seen.has(item.raw)) return false;
    seen.add(item.raw);
    return true;
  });
  const priority = ["/goal", "/plan"];
  const groups: ComposerSuggestionGroup[] = ["mcp", "plugins", "agents", "liveAgents", "tabs", "skills", "sessions", "commands"];
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
  sessions = [],
  tabs = [],
  agents = [],
  mcpServers = [],
}: {
  skills: SkillInfo[];
  plugins: PluginPackageInfo[];
  commands: SlashCommandInfo[];
  files?: FileIndexEntry[];
  subagents?: SubagentSnapshot[];
  sessions?: ComposerSessionSource[];
  tabs?: ComposerTabSource[];
  agents?: ComposerAgentSource[];
  mcpServers?: ComposerMcpSource[];
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
    ...subagents.map(buildLiveAgentSuggestion),
    ...sessions.map(buildSessionSuggestion),
    ...tabs.map(buildTabSuggestion),
    ...agents.map(buildAgentDefinitionSuggestion),
    ...mcpServers.map(buildMcpSuggestion),
    ...(computer ? [computer] : []),
  ].map(({ kind, label, raw, detail, icon }) => ({ kind, label, raw, detail, icon }));
}
