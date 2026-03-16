import type { Ingredient } from '@recipe-aggregator/shared';

export interface AggregatedIngredient {
  item: string;
  quantity: string;
  unit: string;
  shoppingCategory?: string;
}

function normalise(s: string): string {
  const t = s.toLowerCase().trim();
  return t.endsWith('s') && t.length > 2 ? t.slice(0, -1) : t;
}

function parseQty(q: string): number | null {
  const parts = q.trim().split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/').map(Number);
      if (isNaN(num) || isNaN(den) || den === 0) return null;
      total += num / den;
    } else {
      const n = Number(p);
      if (isNaN(n)) return null;
      total += n;
    }
  }
  return total;
}

export function combineIngredients(ingredients: Ingredient[]): AggregatedIngredient[] {
  const map = new Map<string, Map<string, { display: string; unit: string; quantities: string[] }>>();

  for (const ing of ingredients) {
    if (!ing.item.trim()) continue;
    const normItem = normalise(ing.item);
    const normUnit = normalise(ing.unit);

    if (!map.has(normItem)) map.set(normItem, new Map());
    const unitMap = map.get(normItem)!;

    if (!unitMap.has(normUnit)) {
      unitMap.set(normUnit, { display: ing.item, unit: ing.unit, quantities: [] });
    }
    unitMap.get(normUnit)!.quantities.push(ing.quantity);
  }

  const result: AggregatedIngredient[] = [];
  for (const [, unitMap] of map) {
    for (const [, entry] of unitMap) {
      const parsed = entry.quantities.map(parseQty);
      if (parsed.every((p) => p !== null)) {
        const sum = parsed.reduce((a, b) => a! + b!, 0)!;
        const formatted = Number.isInteger(sum) ? String(sum) : sum.toFixed(1);
        result.push({ item: entry.display, quantity: formatted, unit: entry.unit });
      } else {
        result.push({ item: entry.display, quantity: entry.quantities.join(' + '), unit: entry.unit });
      }
    }
  }

  return result.sort((a, b) => a.item.localeCompare(b.item));
}
