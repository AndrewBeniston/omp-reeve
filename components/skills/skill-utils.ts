import type { SkillInfo as Skill } from "@/lib/api-types";

export function shortenPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

export function sourceLabel(skill: Skill): "global" | "project" | "path" {
  const source = skill.sourceInfo?.source;
  const scope = skill.sourceInfo?.scope;
  if (scope === "user" || source === "user") return "global";
  if (scope === "project" || source === "project") return "project";
  return "path";
}

export function skillGroupLabel(skill: Skill): string {
  const source = sourceLabel(skill);
  if (source === "path") return source;
  return skill.install?.skillsShUrl ? `${source} / skills.sh` : source;
}

export function updateKey(skill: Skill): string | null {
  return skill.install
    ? `${skill.install.scope}\0${skill.install.package}`
    : null;
}

export function shortVersion(version?: string): string {
  return version ? version.slice(0, 8) : "unknown";
}
