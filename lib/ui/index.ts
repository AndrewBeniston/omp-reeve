import { recipes, type RecipeVariants } from "./recipes";

export type { RecipeVariants } from "./recipes";

export type RecipeName = keyof RecipeVariants;
type Variants<K extends RecipeName> = Partial<RecipeVariants[K]>;

type RecipeDefinition = {
  base: string;
  variants?: Record<string, Record<string, string>>;
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}

export function ui<K extends RecipeName>(recipe: K, variants?: Variants<K>): string {
  const definition = (recipes as Record<string, RecipeDefinition>)[recipe];
  if (!definition) throw new Error(`Unknown UI recipe: ${recipe}`);

  const classes = [definition.base];
  for (const [name, value] of Object.entries(variants ?? {})) {
    if (value === undefined) continue;
    const variant = definition.variants?.[name];
    const className = variant?.[String(value)];
    if (!className) throw new Error(`Unknown ${recipe} ${name}: ${String(value)}`);
    classes.push(className);
  }
  return cx(...classes);
}
