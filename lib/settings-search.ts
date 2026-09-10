import type { SettingsField } from "./settings-api";
import type { SettingsNavigationItem } from "./settings-navigation";

export interface SettingsSearchResult {
  id: string;
  kind: "section" | "field";
  label: string;
  context: string;
  sectionId: string;
  icon?: string;
  fieldPath?: string;
}

function includesQuery(parts: Array<string | undefined>, query: string): boolean {
  return parts.some((part) => part?.toLocaleLowerCase().includes(query));
}

export function buildSettingsSearchResults(
  rawQuery: string,
  navigation: SettingsNavigationItem[],
  fields: Array<Pick<SettingsField, "path" | "tab" | "group" | "label" | "description">>,
): SettingsSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];

  const sectionResults = navigation.flatMap((item) => (
    includesQuery([item.label, item.description, item.group.label], query)
      ? [{
          id: `section:${item.id}`,
          kind: "section" as const,
          label: item.label,
          context: item.group.label,
          sectionId: item.id,
          icon: item.icon,
        }]
      : []
  ));
  const navigationById = new Map(navigation.map((item) => [item.id, item]));
  const fieldResults = fields.flatMap((field) => {
    if (!includesQuery([field.label, field.description, field.path, field.group], query)) return [];
    const sectionId = `settings:${field.tab}`;
    const section = navigationById.get(sectionId);
    if (!section) return [];
    return [{
      id: `field:${field.path}`,
      kind: "field" as const,
      label: field.label,
      context: `${section.label} · ${field.group ?? "General"}`,
      sectionId,
      icon: section.icon,
      fieldPath: field.path,
    }];
  });

  return [...sectionResults, ...fieldResults];
}
