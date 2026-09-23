export type SubagentGroupState = "active" | "updated" | "interrupted" | "completed" | "failed" | "progress";

export interface SubagentSummaryRow {
  id: string;
  name: string;
  state: SubagentGroupState;
  parentToolCallId?: string;
}

export interface SubagentActivityGroup {
  anchorId?: string;
  rows: readonly SubagentSummaryRow[];
}

export interface SubagentSummaryPart {
  type: "name" | "more" | "text";
  text: string;
  id?: string;
  hiddenCount?: number;
}

export interface SubagentSummary {
  parts: SubagentSummaryPart[];
  status: SubagentGroupState;
  statusText: string;
  hiddenCount: number;
  text: string;
}

export type SubagentSummaryTranslator = (key: string, params?: Record<string, string | number>) => string;

function state(row: SubagentSummaryRow): SubagentGroupState {
  return row.state;
}

function groupStatus(rows: readonly SubagentSummaryRow[]): SubagentGroupState {
  const states = rows.map(state);
  if (states.includes("interrupted")) return "interrupted";
  if (states.includes("updated")) return "updated";
  if (states.includes("failed")) return "failed";
  if (states.length > 0 && states.every((value) => value === "completed")) return "completed";
  if (states.includes("progress")) return "progress";
  return "active";
}

function statusText(status: SubagentGroupState, count: number, t: SubagentSummaryTranslator): string {
  if (status === "interrupted") return t(count === 1 ? "transcript.activity.subAgent.group.interrupted.one" : "transcript.activity.subAgent.group.interrupted.other");
  return t(`transcript.activity.subAgent.group.${status}`);
}

function listParts(names: string[], more: string | undefined, hiddenCount: number, locale: string): SubagentSummaryPart[] {
  if (names.length === 1) return [{ type: "name", text: names[0] ?? "" }];
  const tokens = [...names, ...(more ? [more] : [])];
  return tokens.flatMap((text, index) => {
    const part = index < names.length ? { type: "name" as const, text } : { type: "more" as const, text, hiddenCount };
    if (index === tokens.length - 1) return part;
    const next = index === tokens.length - 2 ? " and " : ", ";
    return [part, { type: "text" as const, text: next }];
  });
}

/** Compose the localized, interactive parts of one grouped sub-agent sentence. */
export function composeSubagentSummaryParts(
  rows: readonly SubagentSummaryRow[],
  locale: string,
  t: SubagentSummaryTranslator,
  onOpen?: (id: string) => void,
): SubagentSummary {
  const namedCount = rows.length <= 3 ? rows.length : 2;
  const named = rows.slice(0, namedCount).map((row) => ({ ...row, name: row.name || t("transcript.activity.subAgent.group.unnamed") }));
  const hiddenCount = rows.length - namedCount;
  const more = hiddenCount > 0 ? t("transcript.activity.subAgent.group.more", { count: hiddenCount }) : undefined;
  const parts = listParts(named.map((row) => row.name), more, hiddenCount, locale).map((part) => {
    if (part.type !== "name") return part;
    const row = named.find((candidate) => candidate.name === part.text);
    return row && onOpen ? { ...part, id: row.id } : part;
  });
  const status = groupStatus(rows);
  const suffix = statusText(status, rows.length, t);
  const text = `${parts.map((part) => part.text).join("")} ${suffix}`;
  return { parts, status, statusText: suffix, hiddenCount, text };
}

/** Compose a plain sentence for non-interactive callers. */
export function composeSubagentSummary(rows: readonly SubagentSummaryRow[], t: SubagentSummaryTranslator): string {
  return composeSubagentSummaryParts(rows, "en", t).text;
}

/** Assign rows to the last activity group that claims each row. */
export function groupSubagentRows({ activityGroups, backgroundRows }: {
  activityGroups: readonly SubagentActivityGroup[];
  backgroundRows: readonly SubagentSummaryRow[];
}): SubagentActivityGroup[] {
  const claimed = new Set<string>();
  const groups: SubagentActivityGroup[] = [];
  for (const activityGroup of [...activityGroups].reverse()) {
    const rows = activityGroup.rows.filter((row) => !claimed.has(row.id));
    for (const row of rows) claimed.add(row.id);
    if (rows.length > 0) groups.push({ anchorId: activityGroup.anchorId, rows });
  }
  const unclaimed = backgroundRows.filter((row) => !claimed.has(row.id));
  if (unclaimed.length > 0) groups.push({ rows: unclaimed });
  return groups;
}
