import { subRecipeIdsIn } from '@recipe-aggregator/shared';
import type { Ingredient } from '@recipe-aggregator/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

/*
 * "Are you making the pastry, or buying it?"
 *
 * Asked once, when a recipe with a linked sub-recipe goes into a week. The
 * answer decides what the shopping list does with the linked line:
 *   make it → the line is swapped for that recipe's own ingredients
 *   buy it  → the line stays, as a finished thing to put in the trolley
 *
 * The body is exported separately from the sheet because the week picker shows
 * it as one of its own steps — stacking two RN modals is asking for trouble.
 */

interface Linked {
  id: string;
  title: string;
}

interface BodyProps {
  recipeTitle: string;
  ingredients: Ingredient[];
  /** Recipes already being cooked in this same week, so we can say so. */
  alreadyPlannedIds?: Set<string>;
  onAnswer: (makeComponents: boolean) => void;
}

export function SubRecipePromptBody({
  recipeTitle,
  ingredients,
  alreadyPlannedIds,
  onAnswer,
}: BodyProps) {
  const t = useTheme();
  const [linked, setLinked] = useState<Linked[] | null>(null);

  const ids = subRecipeIdsIn(ingredients);
  const idKey = [...ids].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (ids.length === 0) {
        if (!cancelled) setLinked([]);
        return;
      }
      const { data } = await supabase.from('recipes').select('id, title').in('id', ids);
      if (!cancelled) setLinked((data as Linked[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  // Every link is dead — deleted, or owned by someone outside the family group.
  // There's nothing to ask about, so answer for them and get out of the way.
  useEffect(() => {
    if (linked !== null && linked.length === 0) onAnswer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  if (linked === null || linked.length === 0) {
    return (
      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
        <ActivityIndicator color={t.green} />
      </View>
    );
  }

  // Already cooking it this week? Then its ingredients are on the list once
  // already, and expanding it again would buy the basil twice.
  const clashes = linked.filter((l) => alreadyPlannedIds?.has(l.id));
  const names = linked.map((l) => l.title);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  const option = (
    label: string,
    detail: string,
    primary: boolean,
    answer: boolean,
  ) => (
    <Pressable
      onPress={() => {
        haptics.success();
        onAnswer(answer);
      }}
      style={{
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        marginTop: 8,
        backgroundColor: primary ? t.green : t.bg,
        borderWidth: primary ? 0 : 1,
        borderColor: t.border,
      }}
    >
      <Body size={14} weight="semi" color={primary ? t.onGreen : t.text}>
        {label}
      </Body>
      <Body size={12} color={primary ? t.onGreen : t.muted} style={{ marginTop: 2, opacity: primary ? 0.85 : 1 }}>
        {detail}
      </Body>
    </Pressable>
  );

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <Serif size={20} style={{ marginBottom: 10 }}>
        Making it or buying it?
      </Serif>

      <Body size={14} color={t.muted}>
        <Body size={14} color={t.text} weight="semi">
          {recipeTitle}
        </Body>{' '}
        uses{' '}
        <Body size={14} color={t.text} weight="semi">
          {list}
        </Body>
        .
      </Body>

      {clashes.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
            backgroundColor: t.warm,
          }}
        >
          <Body size={13} color={t.muted}>
            You&apos;re already cooking {clashes.map((c) => c.title).join(' and ')} this week, so the
            ingredients are on your list already.
          </Body>
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        {option("I'll make it", 'Shop for its ingredients instead', clashes.length === 0, true)}
        {option("I'll buy it", "Keep it on the list as it's written", clashes.length > 0, false)}
      </View>

      <Body size={12} color={t.muted} style={{ marginTop: 14 }}>
        You can change your mind from the meal&apos;s menu on the plan.
      </Body>
    </View>
  );
}

interface Props extends BodyProps {
  open: boolean;
  onClose: () => void;
}

export default function SubRecipePromptSheet({ open, onClose, ...body }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <SubRecipePromptBody {...body} />
    </BottomSheet>
  );
}
