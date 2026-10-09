import type { Ingredient, Step } from './types.js';

export interface StepTextPart {
  text: string;
  ingredient: boolean;
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function mentionPattern(mentions: string[]): RegExp | null {
  const terms = [...new Set(mentions.map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return terms.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.map(escapePattern).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
    : null;
}

/** Plain text in, plain text out: renderers add native bold, never HTML/Markdown. */
export function stepTextParts(step: Step): StepTextPart[] {
  const pattern = mentionPattern(step.ingredient_mentions ?? []);
  if (!pattern) return [{ text: step.instruction, ingredient: false }];
  const parts: StepTextPart[] = [];
  let cursor = 0;
  for (const match of step.instruction.matchAll(pattern)) {
    const start = match.index!;
    if (start > cursor) parts.push({ text: step.instruction.slice(cursor, start), ingredient: false });
    parts.push({ text: match[0], ingredient: true });
    cursor = start + match[0].length;
  }
  if (cursor < step.instruction.length) parts.push({ text: step.instruction.slice(cursor), ingredient: false });
  return parts;
}

function numberVariants(term: string): string[] {
  const irregular: Record<string, string> = { leaves: 'leaf', tomatoes: 'tomato', potatoes: 'potato' };
  const last = term.match(/\p{L}+$/u)?.[0];
  if (!last) return [term];
  let alternate: string;
  if (irregular[last]) alternate = irregular[last];
  else if (/ies$/.test(last)) alternate = last.slice(0, -3) + 'y';
  else if (/(?:sh|ch|ss|x)es$/.test(last)) alternate = last.slice(0, -2);
  else if (/s$/.test(last) && !/(?:ss|us)$/.test(last)) alternate = last.slice(0, -1);
  else if (/(?:sh|ch|ss|x)$/.test(last)) alternate = last + 'es';
  else if (/[^aeiou]y$/.test(last)) alternate = last.slice(0, -1) + 'ies';
  else alternate = last + 's';
  return [term, term.slice(0, -last.length) + alternate];
}

/** Conservative aliases derived only from the recipe's own ingredient list. */
export function ingredientAliases(ingredients: Ingredient[]): string[] {
  const aliases = new Set<string>();
  for (const { item } of ingredients) {
    // Imported names often contain nested notes. Remove them from the inside
    // out, so "olive oil ((Note 1))" still ends in the ingredient name.
    let cleaned = item.toLowerCase();
    while (/\([^()]*\)/.test(cleaned)) cleaned = cleaned.replace(/\([^()]*\)/g, ' ');
    const base = cleaned.split(/[,;]/)[0].replace(/\s+/g, ' ').trim();
    for (const alternative of base.split(/\s+(?:or|and)\s+|\/|&/)) {
      const name = alternative.trim().replace(/^(?:(?:fresh|dried|frozen|chopped|diced|minced|sliced|grated|shredded|crumbled|ground|crushed|boneless|skinless|unsalted|salted|large|small|medium|finely|roughly)\s+)+/, '');
      // "Garlic cloves", "parsley leaves", "lime juice" and "oil spray"
      // commonly become just "garlic", "parsley", "lime" and "oil".
      const core = name.replace(/(?:\s+(?:cloves?|leaves|stems?|sprigs?|fillets?|tubes?|kernels?|stalks?|sticks?|thighs?|breasts?|drumsticks?|wings?|chops?|juice|zest|spray))+$/, '');
      const terms = [alternative.trim(), name, core];
      for (const phrase of [name, core]) {
        const short = phrase.match(/\p{L}+$/u)?.[0];
        // A final food noun handles "red onion", "canned tuna", "soft
        // boiled eggs", etc. Generic modifiers/components aren't names.
        if (short && !/^(?:powder|paste|sauce|extract|flakes|seeds|spray|cloves|leaves|stems|sprigs|fillets|tubes|kernels|stalks|sticks|juice|zest|plain|purpose|similar|choice|taste|needed|garnish|optional|serving|each|large|small|medium|size|sub|note|notes)$/.test(short)) terms.push(short);
      }
      for (const term of terms) {
        if (term.length < 3 || /^(?:plain|purpose|similar|optional|garnish)$/.test(term)) continue;
        for (const variant of numberVariants(term)) aliases.add(variant);
      }
    }
  }
  return [...aliases];
}

/** Opt a recipe into highlighting without changing any instruction text. */
export function annotateStepIngredients(steps: Step[], ingredients: Ingredient[]): Step[] {
  const pattern = mentionPattern(ingredientAliases(ingredients));
  return steps.map((step) => ({
    ...step,
    ingredient_mentions: pattern
      ? [...new Set([...step.instruction.matchAll(pattern)].map((match) => match[0]))]
      : [],
  }));
}

/** An empty array still marks a step/recipe as opted in. */
export function hasIngredientHighlighting(steps: Step[]): boolean {
  return steps.some((step) => Array.isArray(step.ingredient_mentions));
}
