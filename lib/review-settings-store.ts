import type { SettingsField, SettingsValue } from "./settings-api";
import {
  DEFAULT_REVIEW_SETTINGS,
  REVIEW_DELIVERIES,
  REVIEW_SEVERITIES,
  REVIEW_TRIGGERS,
  SECURITY_REVIEW_TRIGGERS,
  reviewSettings,
  type ReviewSettings,
} from "./review-settings";

/**
 * The review preferences as the settings surface sees them. Browser-owned,
 * like the completion sound, because OMP's schema is OMP's own. The surface
 * is the settings modal, as in the reference, not the panel.
 */

export const REVIEW_SETTINGS_GROUP = "Code review";
export const REVIEW_SETTINGS_TAB = "interaction";
export const REVIEW_SETTINGS_STORAGE_KEY = "reeve-review-settings";

const PATH_PREFIX = "web.review.";

/** One path per preference. */
export const REVIEW_SETTING_PATHS = {
  automaticReview: `${PATH_PREFIX}automaticReview`,
  reviewTrigger: `${PATH_PREFIX}reviewTrigger`,
  exhaustiveReview: `${PATH_PREFIX}exhaustiveReview`,
  automaticSecurityReview: `${PATH_PREFIX}automaticSecurityReview`,
  securityTrigger: `${PATH_PREFIX}securityTrigger`,
  automaticSeverityFloor: `${PATH_PREFIX}automaticSeverityFloor`,
  requestedSeverityFloor: `${PATH_PREFIX}requestedSeverityFloor`,
  delivery: `${PATH_PREFIX}delivery`,
} as const satisfies Record<keyof ReviewSettings, string>;

/** The row that exists to say a setting does not. */
export const REVIEW_CREDITS_PATH = `${PATH_PREFIX}credits`;

/** Every path this group owns, including the row that stores nothing. */
export type ReviewSettingPath =
  | (typeof REVIEW_SETTING_PATHS)[keyof typeof REVIEW_SETTING_PATHS]
  | typeof REVIEW_CREDITS_PATH;

export interface ReviewSettingsField extends SettingsField {
  /** Shown but not offered. Used once, for the credit allowance. */
  readOnly?: boolean;
}

/** The settings surface does not translate options, so these are not keys. */
const OPTION_LABELS: Record<string, string> = {
  publish: "I publish a pull request from Reeve",
  push: "I push from Reeve",
  smart: "Changes arrive during a review I started (experimental)",
  "with-code-review": "A code review runs",
  critical: "Critical",
  high: "High and above",
  medium: "Medium and above",
  low: "Everything",
  "current-chat": "The Session I asked from",
  "review-chat": "A separate review chat",
};

function options(values: readonly string[]) {
  return values.map((value) => ({ value, label: OPTION_LABELS[value] ?? value }));
}

/** In the reference's order: code review, then security, then delivery. */
export const REVIEW_SETTINGS_FIELDS: readonly ReviewSettingsField[] = [
  {
    path: REVIEW_SETTING_PATHS.automaticReview,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.automatic",
    description: "settings.review.automaticDescription",
    type: "boolean",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.automaticReview,
    configured: false,
  },
  {
    path: REVIEW_SETTING_PATHS.reviewTrigger,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.trigger",
    description: "settings.review.triggerDescription",
    type: "select",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.reviewTrigger,
    configured: false,
    options: options(REVIEW_TRIGGERS),
  },
  {
    path: REVIEW_SETTING_PATHS.exhaustiveReview,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.exhaustive",
    description: "settings.review.exhaustiveDescription",
    type: "boolean",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.exhaustiveReview,
    configured: false,
  },
  {
    path: REVIEW_CREDITS_PATH,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.credits",
    description: "settings.review.creditsDescription",
    type: "boolean",
    value: false,
    defaultValue: false,
    configured: false,
    readOnly: true,
  },
  {
    path: REVIEW_SETTING_PATHS.automaticSecurityReview,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.security",
    description: "settings.review.securityDescription",
    type: "boolean",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.automaticSecurityReview,
    configured: false,
  },
  {
    path: REVIEW_SETTING_PATHS.securityTrigger,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.securityTrigger",
    description: "settings.review.securityTriggerDescription",
    type: "select",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.securityTrigger,
    configured: false,
    options: options(SECURITY_REVIEW_TRIGGERS),
  },
  {
    path: REVIEW_SETTING_PATHS.automaticSeverityFloor,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.automaticSeverity",
    description: "settings.review.automaticSeverityDescription",
    type: "select",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.automaticSeverityFloor,
    configured: false,
    options: options(REVIEW_SEVERITIES),
  },
  {
    path: REVIEW_SETTING_PATHS.requestedSeverityFloor,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.requestedSeverity",
    description: "settings.review.requestedSeverityDescription",
    type: "select",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.requestedSeverityFloor,
    configured: false,
    options: options(REVIEW_SEVERITIES),
  },
  {
    path: REVIEW_SETTING_PATHS.delivery,
    owner: "browser",
    tab: REVIEW_SETTINGS_TAB,
    group: REVIEW_SETTINGS_GROUP,
    label: "settings.review.delivery",
    description: "settings.review.deliveryDescription",
    type: "select",
    value: null,
    defaultValue: DEFAULT_REVIEW_SETTINGS.delivery,
    configured: false,
    options: options(REVIEW_DELIVERIES),
  },
];

/** Absent on the server, which reads none. */
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function storage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // A browser with storage denied still has to render its settings.
    return null;
  }
}

export function readReviewSettings(store: PreferenceStorage | null = storage()): Readonly<ReviewSettings> {
  if (!store) return DEFAULT_REVIEW_SETTINGS;
  try {
    const raw = store.getItem(REVIEW_SETTINGS_STORAGE_KEY);
    return reviewSettings(raw ? JSON.parse(raw) as Record<string, unknown> : null);
  } catch {
    return DEFAULT_REVIEW_SETTINGS;
  }
}

export function writeReviewSettings(
  next: Readonly<ReviewSettings>,
  store: PreferenceStorage | null = storage(),
): Readonly<ReviewSettings> {
  const settled = reviewSettings(next);
  try {
    store?.setItem(REVIEW_SETTINGS_STORAGE_KEY, JSON.stringify(settled));
  } catch {
    // Storage being full or denied must not lose the change in this session.
  }
  return settled;
}

/** One setting changed, settled through the reader every load uses. */
export function applyReviewSetting(
  current: Readonly<ReviewSettings>,
  path: string,
  value: SettingsValue,
): Readonly<ReviewSettings> {
  const key = (Object.keys(REVIEW_SETTING_PATHS) as (keyof ReviewSettings)[])
    .find((name) => REVIEW_SETTING_PATHS[name] === path);
  if (!key) return current;
  return reviewSettings({ ...current, [key]: value });
}
