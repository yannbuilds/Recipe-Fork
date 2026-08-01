import { Ionicons } from '@expo/vector-icons';
import type { Nutrition } from '@recipe-aggregator/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Eyebrow, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

/* ── Formatting ─────────────────────────────────────────────── */

// One decimal for small numbers, whole numbers once we're past 100 — nobody
// needs "586.4 calories".
function formatNumber(value: number): string {
  return String(value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);
}

function formatAmount(value: number, unit: string): string {
  const number = formatNumber(value);
  return unit ? `${number} ${unit}` : number;
}

// A serving size worth printing next to "per serving" — a weight or volume
// tells you something, "1 serving" is just noise.
function servingSuffix(servingSize?: string | null): string {
  if (!servingSize) return '';
  const trimmed = servingSize.trim();
  if (!/\d/.test(trimmed) || /^\d+\s*servings?$/i.test(trimmed)) return '';
  return `  ·  ${trimmed}`;
}

/**
 * Share of energy from each macro (protein and carbs at 4 kcal/g, fat at 9).
 * Null unless all three are published — a bar missing a slice would misread.
 * Percentages are nudged to sum to exactly 100 so the bar always fills.
 */
function macroSplit(n: Nutrition): { protein: number; carbs: number; fat: number } | null {
  const { protein, carbohydrate, fat } = n;
  if (protein == null || carbohydrate == null || fat == null) return null;
  const energy = protein * 4 + carbohydrate * 4 + fat * 9;
  if (energy <= 0) return null;

  const parts = [
    Math.round((protein * 4 * 100) / energy),
    Math.round((carbohydrate * 4 * 100) / energy),
    Math.round((fat * 9 * 100) / energy),
  ];
  const drift = 100 - parts.reduce((sum, p) => sum + p, 0);
  const largestIndex = parts.indexOf(Math.max(...parts));
  parts[largestIndex] += drift;

  return { protein: parts[0], carbs: parts[1], fat: parts[2] };
}

interface Props {
  nutrition?: Nutrition | null;
  /** Where the numbers came from, e.g. "recipetineats.com". */
  sourceLabel?: string | null;
}

/**
 * Per-serving nutrition, exactly as the source recipe published it.
 *
 * Deliberately quiet: it sits at the foot of the recipe as a single editorial
 * panel, leads with the four numbers people actually scan (calories and the
 * macros), and folds everything else behind a disclosure. Nothing here is
 * calculated from the ingredients — if a site publishes no nutrition, the
 * panel doesn't render at all. Mirrors packages/web NutritionPanel.
 */
export default function NutritionPanel({ nutrition, sourceLabel }: Props) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!nutrition) return null;

  const headline = [
    { label: 'Calories', value: nutrition.calories, unit: '' },
    { label: 'Protein', value: nutrition.protein, unit: 'g' },
    { label: 'Carbs', value: nutrition.carbohydrate, unit: 'g' },
    { label: 'Fat', value: nutrition.fat, unit: 'g' },
  ].filter((stat): stat is { label: string; value: number; unit: string } => stat.value != null);

  const breakdown = [
    { label: 'Saturated fat', value: nutrition.saturated_fat, unit: 'g' },
    { label: 'Unsaturated fat', value: nutrition.unsaturated_fat, unit: 'g' },
    { label: 'Trans fat', value: nutrition.trans_fat, unit: 'g' },
    { label: 'Fibre', value: nutrition.fibre, unit: 'g' },
    { label: 'Sugar', value: nutrition.sugar, unit: 'g' },
    { label: 'Sodium', value: nutrition.sodium, unit: 'mg' },
    { label: 'Cholesterol', value: nutrition.cholesterol, unit: 'mg' },
  ].filter((stat): stat is { label: string; value: number; unit: string } => stat.value != null);

  if (headline.length === 0 && breakdown.length === 0) return null;

  const split = macroSplit(nutrition);
  const segments = split
    ? [
        { label: 'Protein', pct: split.protein, colour: t.green },
        { label: 'Carbs', pct: split.carbs, colour: t.orange },
        // Ink rather than muted grey — at 4px tall a washed-out segment reads
        // as disabled, and fat is often the biggest slice.
        { label: 'Fat', pct: split.fat, colour: t.textSoft },
      ].filter((segment) => segment.pct > 0)
    : [];

  return (
    <View
      style={{
        marginTop: 28,
        backgroundColor: t.paper,
        borderWidth: 1,
        borderColor: t.ruleHair,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <Eyebrow style={{ marginBottom: 14 }}>
        Nutrition  ·  per serving{servingSuffix(nutrition.serving_size)}
      </Eyebrow>

      {/* Headline stats — hairline-separated cells, serif value over mono label. */}
      {headline.length > 0 && (
        <View style={{ flexDirection: 'row' }}>
          {headline.map((stat, i) => (
            <View
              key={stat.label}
              style={{
                flex: 1,
                minWidth: 0,
                paddingLeft: i === 0 ? 0 : 12,
                paddingRight: 6,
                borderLeftWidth: i === 0 ? 0 : 1,
                borderLeftColor: t.ruleHair,
              }}
            >
              {/* Serif number + small mono unit, the same pairing the serving
                  stepper uses ("6 sv"). */}
              <Serif size={24} numberOfLines={1}>
                {formatNumber(stat.value)}
                {stat.unit ? <Mono size={11}> {stat.unit}</Mono> : null}
              </Serif>
              <Eyebrow style={{ marginTop: 5, letterSpacing: 1.1 }}>{stat.label}</Eyebrow>
            </View>
          ))}
        </View>
      )}

      {/* Energy split — the one thing that turns four numbers into a glance. */}
      {segments.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', gap: 2, height: 4, borderRadius: 999, overflow: 'hidden' }}>
            {segments.map((segment) => (
              <View
                key={segment.label}
                style={{ flexGrow: segment.pct, flexBasis: 0, backgroundColor: segment.colour }}
              />
            ))}
          </View>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 14,
              rowGap: 6,
              marginTop: 10,
            }}
          >
            {segments.map((segment) => (
              <View
                key={segment.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: segment.colour }}
                />
                <Mono size={9.5} style={{ letterSpacing: 1.1 }}>
                  {segment.label.toUpperCase()} {segment.pct}%
                </Mono>
              </View>
            ))}
            <Mono size={9.5} style={{ letterSpacing: 1.1, opacity: 0.7 }}>
              OF ENERGY
            </Mono>
          </View>
        </View>
      )}

      {/* Everything else, folded away by default. */}
      {breakdown.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Pressable
            onPress={() => {
              haptics.light();
              setExpanded((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}
          >
            <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.1 }}>
              {expanded ? 'HIDE BREAKDOWN' : 'FULL BREAKDOWN'}
            </Mono>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={t.green} />
          </Pressable>

          {expanded && (
            <View style={{ marginTop: 10 }}>
              {breakdown.map((stat, i) => (
                <View
                  key={stat.label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 16,
                    paddingVertical: 9,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: t.ruleHair,
                  }}
                >
                  <Serif size={15}>{stat.label}</Serif>
                  <Mono size={11}>{formatAmount(stat.value, stat.unit)}</Mono>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Provenance. These are the source's numbers, not ours. */}
      <Serif italic size={12.5} color={t.muted} style={{ marginTop: 16 }}>
        {sourceLabel ? `As published by ${sourceLabel}` : 'As published with the original recipe'}
      </Serif>
    </View>
  );
}
