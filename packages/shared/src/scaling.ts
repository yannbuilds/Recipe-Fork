import type { Ingredient } from './types.js';

// Quantity scaling + formatting helpers, used by the recipe detail pages, the
// meal plan and the sub-recipe expansion in ./ingredients.ts.
//
// This used to live twice — packages/web/src/utils/scaleQuantity.ts and
// packages/mobile/src/lib/recipeFormat.ts — as byte-identical copies. Both now
// re-export from here so the call sites didn't have to change.

export function parseFraction(q: string): number | null {
  const parts = q.trim().split(/\s+/);
  let total = 0;
  let parsedAny = false;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/').map(Number);
      if (isNaN(num) || isNaN(den) || den === 0) break;
      total += num / den;
      parsedAny = true;
    } else {
      const n = Number(p);
      if (!isNaN(n)) {
        total += n;
        parsedAny = true;
      } else {
        // Try extracting leading digits (e.g. "750g" → 750)
        const leading = p.match(/^(\d+(?:\.\d+)?)/);
        if (leading) {
          total += Number(leading[1]);
          parsedAny = true;
        }
        break; // stop after first non-pure-numeric token
      }
    }
  }
  return parsedAny ? total : null;
}

const COMMON_FRACTIONS: [number, string][] = [
  [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'], [0.5, '1/2'],
  [0.667, '2/3'], [0.75, '3/4'],
];

export function formatQuantity(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;

  for (const [target, label] of COMMON_FRACTIONS) {
    if (Math.abs(frac - target) < 0.02) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  if (value % 1 === 0) return String(value);
  return value.toFixed(1);
}

export function scaleQuantity(
  quantity: string,
  originalServings: number | null,
  currentServings: number,
): string {
  if (!originalServings || originalServings === 0) return quantity;
  // No quantity means "to taste" — scaling would turn it into a bogus "0".
  if (!quantity.trim()) return quantity;
  const parsed = parseFraction(quantity);
  if (parsed === null) return quantity;
  const scaled = parsed * (currentServings / originalServings);
  // Preserve trailing unit suffix glued to the number (e.g. "750g" → "1500g")
  const suffixMatch = quantity.match(/[a-zA-Z]+$/);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  return formatQuantity(scaled) + suffix;
}

/**
 * Return the complete ingredient line exactly as the recipe author supplied it,
 * while still honouring the serving control. Structured fields remain the
 * fallback for older and manually-created recipes without `original_text`.
 */
export function formatIngredientLine(
  ingredient: Ingredient,
  originalServings: number | null | undefined,
  currentServings: number | null | undefined,
): string {
  const originalText = ingredient.original_text?.trim();
  const quantity = ingredient.quantity.trim();

  if (!originalText) {
    const scaledQuantity = currentServings == null
      ? quantity
      : scaleQuantity(quantity, originalServings ?? null, currentServings);
    return [scaledQuantity, ingredient.unit.trim(), ingredient.item.trim()]
      .filter(Boolean)
      .join(' ');
  }

  if (!quantity || !originalServings || !currentServings || originalServings === currentServings) {
    return originalText;
  }

  const scaledQuantity = scaleQuantity(quantity, originalServings, currentServings);
  if (scaledQuantity === quantity) return originalText;

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Quantities such as "1 1/4" occasionally contain different whitespace in
  // the source line, so match each run of spaces flexibly.
  const quantityPattern = escapeRegExp(quantity).replace(/\s+/g, '\\s+');
  const unit = ingredient.unit.trim();

  if (unit) {
    const withUnit = new RegExp(`(${quantityPattern})(\\s*)(${escapeRegExp(unit)})`, 'i');
    if (withUnit.test(originalText)) {
      return originalText.replace(withUnit, (_match, _qty, spacing, matchedUnit) =>
        `${scaledQuantity}${spacing}${matchedUnit}`,
      );
    }
  }

  const quantityOnly = new RegExp(quantityPattern);
  return quantityOnly.test(originalText)
    ? originalText.replace(quantityOnly, scaledQuantity)
    : originalText;
}

// Scales a recipe's ingredient quantities to the servings the user actually saved.
// No-op when the recipe has no custom servings or no original servings to scale from.
export function scaleIngredientsForServings<T extends { quantity: string }>(
  ingredients: T[],
  originalServings: number | null | undefined,
  targetServings: number | null | undefined,
): T[] {
  if (!originalServings || !targetServings || originalServings === targetServings) {
    return ingredients;
  }
  return ingredients.map((ing) => ({
    ...ing,
    quantity: scaleQuantity(ing.quantity, originalServings, targetServings),
  }));
}
