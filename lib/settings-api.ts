import { REVIEW_SETTINGS_FIELDS, type ReviewSettingPath } from "./review-settings-store";

export type SettingsValue = boolean | string | number | string[] | Record<string, number> | null;

export interface SettingsOption {
  value: string;
  label: string;
  description?: string;
}

export type SettingsFieldType =
  | "boolean"
  | "select"
  | "text"
  | "secret"
  | "multiselect"
  | "providerLimits";

export type SettingsFieldOwner = "omp" | "browser";

export interface SettingsField {
  path: string;
  /** The owner defaults to omp when this property is absent. */
  owner?: SettingsFieldOwner;
  tab: string;
  group?: string;
  label: string;
  description: string;
  type: SettingsFieldType;
  value: SettingsValue;
  defaultValue: SettingsValue;
  configured: boolean;
  options?: SettingsOption[];
  ordered?: boolean;
  condition?: string;
  /**
   * A row shown but not offered.
   *
   * One setting in the reference has no native referent and no honest
   * substitute, so its row states the absence instead of disappearing.
   */
  readOnly?: boolean;
}

export interface SettingsTab {
  id: string;
  label: string;
  groups: string[];
}

export interface WebThemePalette {
  name: string;
  colorScheme: "dark" | "light";
  variables: Record<string, string>;
}

export interface WebThemeConfig {
  names: { dark: string; light: string };
  palettes: { dark: WebThemePalette; light: WebThemePalette };
}

export interface SettingsResponse {
  tabs: SettingsTab[];
  fields: SettingsField[];
  availableThemes: Array<{ name: string; colorScheme: "dark" | "light" }>;
  theme: WebThemeConfig;
}

export const COMPLETION_SOUND_SETTING_PATH = "web.omp-sound-enabled";

const COMPLETION_SOUND_FIELD = {
  path: COMPLETION_SOUND_SETTING_PATH,
  owner: "browser",
  tab: "interaction",
  group: "Notifications",
  label: "settings.interaction.completionSound",
  description: "settings.interaction.completionSoundDescription",
  type: "boolean",
  value: null,
  defaultValue: true,
  configured: false,
} as const satisfies SettingsField;

/**
 * The settings Reeve owns itself.
 *
 * Browser-owned because OMP's schema is OMP's own: a Reeve preference has no
 * path there, and inventing one would be a second settings runtime for the
 * same modal.
 */
export const WEB_SETTINGS_FIELDS: readonly SettingsField[] = [
  COMPLETION_SOUND_FIELD,
  ...REVIEW_SETTINGS_FIELDS,
];

export type BrowserSettingPath = typeof COMPLETION_SOUND_SETTING_PATH | ReviewSettingPath;

export type McpTransport = "stdio" | "http" | "sse";

export interface McpServerConfig {
  enabled?: boolean;
  timeout?: number;
  type?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: Record<string, unknown>;
  oauth?: Record<string, unknown>;
}

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  enabled: boolean;
  editable?: boolean;
  source?: {
    path: string;
    provider: string;
    level: "user" | "project" | "native";
  };
}

export interface McpScopeConfig {
  scope: "user" | "project";
  path: string;
  servers: McpServerEntry[];
  error?: string;
}

export interface McpConfigResponse {
  user: McpScopeConfig;
  project: McpScopeConfig | null;
}
