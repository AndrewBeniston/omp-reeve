import { REVIEW_SETTINGS_FIELDS, type ReviewSettingPath } from "./review-settings-store";
import { COMPOSER_ENTER_BEHAVIOR_SETTING_PATH } from "./composer-keyboard-commands";
import {
  COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH,
  COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH,
  COMPOSER_TOP_INSET_SETTING_PATH,
  DEFAULT_COMPOSER_ATTACHMENT_LAYOUT,
  DEFAULT_COMPOSER_PLAIN_TEXT_MODE,
  DEFAULT_COMPOSER_TOP_INSET_PX,
} from "./composer-display-preferences";

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

const COMPOSER_DISPLAY_FIELDS = [
  { path: COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH, owner: "browser", tab: "interaction", group: "Composer", label: "settings.interaction.plainTextMode", description: "settings.interaction.plainTextModeDescription", type: "boolean", value: null, defaultValue: DEFAULT_COMPOSER_PLAIN_TEXT_MODE, configured: false },
  { path: COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH, owner: "browser", tab: "interaction", group: "Composer", label: "settings.interaction.attachmentLayout", description: "settings.interaction.attachmentLayoutDescription", type: "select", value: null, defaultValue: DEFAULT_COMPOSER_ATTACHMENT_LAYOUT, configured: false, options: [{ value: "card", label: "settings.interaction.attachmentLayout.card" }, { value: "icon", label: "settings.interaction.attachmentLayout.icon" }] },
  { path: COMPOSER_TOP_INSET_SETTING_PATH, owner: "browser", tab: "interaction", group: "Composer", label: "settings.interaction.topInset", description: "settings.interaction.topInsetDescription", type: "select", value: null, defaultValue: DEFAULT_COMPOSER_TOP_INSET_PX, configured: false, options: [0, 8, 16, 24, 32, 40, 48, 56, 64].map((value) => ({ value: String(value), label: `${value}px` })) },
] as const satisfies readonly SettingsField[];

const COMPOSER_ENTER_BEHAVIOR_FIELD = {
  path: COMPOSER_ENTER_BEHAVIOR_SETTING_PATH,
  owner: "browser",
  tab: "interaction",
  group: "Composer",
  label: "settings.interaction.sendShortcut",
  description: "settings.interaction.sendShortcutDescription",
  type: "select",
  value: null,
  defaultValue: "enter",
  configured: false,
  options: [
    { value: "enter", label: "Enter", description: "Enter sends. Shift and Enter insert a line." },
    { value: "cmdIfMultiline", label: "Enter or Command", description: "Enter sends one line. Command and Enter send multiline input." },
    { value: "cmdAlways", label: "Command", description: "Command and Enter send every message." },
  ],
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
  COMPOSER_ENTER_BEHAVIOR_FIELD,
  ...COMPOSER_DISPLAY_FIELDS,
  ...REVIEW_SETTINGS_FIELDS,
];

export type BrowserSettingPath = typeof COMPLETION_SOUND_SETTING_PATH | typeof COMPOSER_ENTER_BEHAVIOR_SETTING_PATH | typeof COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH | typeof COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH | typeof COMPOSER_TOP_INSET_SETTING_PATH | ReviewSettingPath;

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
