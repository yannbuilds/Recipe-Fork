import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Nutrition } from '@recipe-aggregator/shared';

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

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
  return ` · ${trimmed}`;
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
    { key: 'protein' as const, value: Math.round((protein * 4 * 100) / energy) },
    { key: 'carbs' as const, value: Math.round((carbohydrate * 4 * 100) / energy) },
    { key: 'fat' as const, value: Math.round((fat * 9 * 100) / energy) },
  ];
  const drift = 100 - parts.reduce((sum, p) => sum + p.value, 0);
  const largest = parts.reduce((a, b) => (b.value > a.value ? b : a));
  largest.value += drift;

  return {
    protein: parts[0].value,
    carbs: parts[1].value,
    fat: parts[2].value,
  };
}

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SERIF = '"Newsreader", Georgia, serif';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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
 * panel doesn't render at all.
 */
export default function NutritionPanel({ nutrition, sourceLabel }: Props) {
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
        { label: 'Protein', pct: split.protein, colour: 'var(--green)' },
        { label: 'Carbs', pct: split.carbs, colour: 'var(--orange)' },
        // Ink rather than muted grey — at 4px tall a washed-out segment reads
        // as disabled, and fat is often the biggest slice.
        { label: 'Fat', pct: split.fat, colour: 'var(--text-soft)' },
      ].filter((segment) => segment.pct > 0)
    : [];

  // Sources that publish calories alone get the narrower desktop cap so the
  // box isn't mostly air (see .rd-nutrition* in index.css).
  const isSparse = segments.length === 0 && breakdown.length === 0;

  return (
    <section
      className={`rd-panel mt-8 ${isSparse ? 'rd-nutrition-sparse' : 'rd-nutrition'}`}
      style={{ animation: 'fadeUp 0.4s ease both' }}
    >
      <div className="rf-eyebrow" style={{ display: 'block', marginBottom: 14 }}>
        Nutrition · per serving{servingSuffix(nutrition.serving_size)}
      </div>

      {/* Headline stats — hairline-separated cells, serif value over mono label. */}
      {headline.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${headline.length}, minmax(0, 1fr))`,
          }}
        >
          {headline.map((stat, i) => (
            <div
              key={stat.label}
              style={{
                paddingLeft: i === 0 ? 0 : 14,
                paddingRight: 8,
                borderLeft: i === 0 ? 'none' : '1px solid var(--rule-hair)',
                minWidth: 0,
              }}
            >
              {/* Serif number + small mono unit, the same pairing the serving
                  stepper uses ("6 sv"). */}
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 26,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: 'var(--text)',
                }}
              >
                {formatNumber(stat.value)}
                {stat.unit && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
                    {' '}
                    {stat.unit}
                  </span>
                )}
              </div>
              <div
                className="rf-eyebrow"
                style={{ display: 'block', marginTop: 5, letterSpacing: '0.12em' }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Energy split — the one thing that turns four numbers into a glance. */}
      {segments.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              display: 'flex',
              gap: 2,
              height: 4,
              borderRadius: 999,
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            {segments.map((segment) => (
              <div
                key={segment.label}
                style={{ width: `${segment.pct}%`, background: segment.colour }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 14px',
              marginTop: 10,
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            {segments.map((segment) => (
              <span key={segment.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: segment.colour,
                    flexShrink: 0,
                  }}
                />
                {segment.label} {segment.pct}%
              </span>
            ))}
            <span style={{ opacity: 0.7 }}>of energy</span>
          </div>
        </div>
      )}

      {/* Everything else, folded away by default. */}
      {breakdown.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5"
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--green)',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide breakdown' : 'Full breakdown'}
            <ChevronDown
              size={13}
              strokeWidth={2}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
              aria-hidden="true"
            />
          </button>

          {expanded && (
            // Two columns once there's room, one on a phone — each cell carries
            // its own hairline so the grid still reads as a list either way.
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                columnGap: 28,
                margin: '12px 0 0',
              }}
            >
              {breakdown.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 16,
                    padding: '9px 0',
                    borderTop: '1px solid var(--rule-hair)',
                  }}
                >
                  <dt style={{ fontFamily: SERIF, fontSize: 15, color: 'var(--text)' }}>
                    {stat.label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--muted)',
                    }}
                  >
                    {formatAmount(stat.value, stat.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* Provenance. These are the source's numbers, not ours. */}
      <p
        style={{
          marginTop: 16,
          fontFamily: SERIF,
          fontStyle: 'italic',
          fontSize: 12.5,
          color: 'var(--muted)',
        }}
      >
        {sourceLabel ? `As published by ${sourceLabel}` : 'As published with the original recipe'}
      </p>
    </section>
  );
}
