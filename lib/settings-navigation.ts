export interface SettingsNavigationSource {
  id: string;
  label: string;
  icon?: string;
  requiresCwd?: boolean;
}

export interface OmpSettingsTabSource {
  id: string;
  label: string;
}

export interface SettingsNavigationGroup {
  id: "personal" | "integrations" | "coding" | "archived";
  label: "Personal" | "Integrations" | "Coding" | "Archived";
}

export interface SettingsNavigationItem extends SettingsNavigationSource {
  group: SettingsNavigationGroup;
  description: string;
  rank: number;
}

const GROUPS: Record<SettingsNavigationGroup["id"], SettingsNavigationGroup> = {
  personal: { id: "personal", label: "Personal" },
  integrations: { id: "integrations", label: "Integrations" },
  coding: { id: "coding", label: "Coding" },
  archived: { id: "archived", label: "Archived" },
};

const GROUP_RANK: Record<SettingsNavigationGroup["id"], number> = {
  personal: 0,
  integrations: 1,
  coding: 2,
  archived: 3,
};

type SectionDefinition = {
  group: SettingsNavigationGroup["id"];
  label?: string;
  description: string;
  rank: number;
};

const SECTION_DEFINITIONS: Record<string, SectionDefinition> = {
  "settings:interaction": {
    group: "personal",
    label: "General",
    description: "Choose input, approvals, notifications, speech, collaboration, startup, power, and Git behavior.",
    rank: 10,
  },
  themes: {
    group: "personal",
    label: "Appearance",
    description: "Choose the Reeve mode, language, and OMP palettes for light and dark interfaces.",
    rank: 20,
  },
  "settings:appearance": {
    group: "personal",
    label: "Terminal appearance",
    description: "Choose OMP terminal layout, status, image, and streaming display behavior.",
    rank: 30,
  },
  access: {
    group: "personal",
    label: "Security",
    description: "Protect Reeve web access with a local password and review network exposure guidance.",
    rank: 40,
  },
  skills: {
    group: "integrations",
    description: "Inspect, install, update, and control the skills available to OMP.",
    rank: 10,
  },
  plugins: {
    group: "integrations",
    description: "Inspect, install, update, enable, and remove OMP plugins.",
    rank: 20,
  },
  mcp: {
    group: "integrations",
    label: "MCP servers",
    description: "Inspect and control MCP servers by user or Project scope.",
    rank: 30,
  },
  "settings:providers": {
    group: "integrations",
    label: "Services",
    description: "Choose provider services, protocols, timeouts, speech, and privacy behavior.",
    rank: 40,
  },
  models: {
    group: "coding",
    description: "Configure model roles, providers, authentication, and model capabilities.",
    rank: 10,
  },
  "settings:model": {
    group: "coding",
    label: "Agent behavior",
    description: "Choose thinking, prompting, sampling, retry, advisor, and vision behavior.",
    rank: 20,
  },
  "settings:context": {
    group: "coding",
    description: "Choose context limits, compaction, rules, and experimental context behavior.",
    rank: 30,
  },
  "settings:memory": {
    group: "coding",
    description: "Choose OMP memory engines, automatic learning, and memory service behavior.",
    rank: 40,
  },
  "settings:files": {
    group: "coding",
    description: "Choose file editing, reading, summaries, and language server behavior.",
    rank: 50,
  },
  "settings:shell": {
    group: "coding",
    description: "Choose shell command and runtime evaluation behavior.",
    rank: 60,
  },
  "settings:tools": {
    group: "coding",
    description: "Choose tools, output limits, execution, discovery, and extension behavior.",
    rank: 70,
  },
  "settings:tasks": {
    group: "coding",
    description: "Choose task modes, subagents, isolation, commands, and skill behavior.",
    rank: 80,
  },
  archived: {
    group: "archived",
    description: "Review and restore archived Sessions without deleting their files.",
    rank: 10,
  },
  about: {
    group: "personal",
    label: "About",
    description: "Version, updates, and ways to support Reeve.",
    rank: 90,
  },
};

function describeFallback(label: string): string {
  return `Configure the ${label} values supplied by OMP.`;
}

export function buildSettingsNavigation(
  coreSections: SettingsNavigationSource[],
  ompTabs: OmpSettingsTabSource[],
): SettingsNavigationItem[] {
  const sources = [
    ...coreSections,
    ...ompTabs.map((tab) => ({ id: `settings:${tab.id}`, label: tab.label, icon: tab.id })),
  ];

  return sources.map((source) => {
    const definition = SECTION_DEFINITIONS[source.id] ?? {
      group: "coding" as const,
      description: describeFallback(source.label),
      rank: 999,
    };
    return {
      ...source,
      label: definition.label ?? source.label,
      group: GROUPS[definition.group],
      description: definition.description,
      rank: definition.rank,
    };
  }).sort((left, right) => (
    GROUP_RANK[left.group.id] - GROUP_RANK[right.group.id]
    || left.rank - right.rank
    || left.label.localeCompare(right.label)
  ));
}
