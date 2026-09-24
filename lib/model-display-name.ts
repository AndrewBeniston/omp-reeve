export interface ModelDisplayNameInput {
  id: string;
  name?: string | null;
}

const BRAND_WORDS: Record<string, string> = {
  claude: "Claude",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  glm: "GLM",
  gpt: "GPT",
  hy: "Hy",
  kimi: "Kimi",
  longcat: "LongCat",
  mimo: "MiMo",
  minimax: "MiniMax",
  openai: "OpenAI",
  qwen: "Qwen",
};

function formatRawModelId(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLocaleLowerCase();
      if (BRAND_WORDS[lower]) return BRAND_WORDS[lower];
      if (/^\d/.test(part)) return part;
      return `${lower[0]?.toLocaleUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join(" ");
}

/** Keep an OMP display name, or turn a raw model id into a readable name. */
export function modelDisplayName(model: ModelDisplayNameInput): string {
  const id = model.id.trim();
  const name = model.name?.trim();
  if (!name || name.toLocaleLowerCase() === id.toLocaleLowerCase()) return formatRawModelId(id);
  return name;
}
