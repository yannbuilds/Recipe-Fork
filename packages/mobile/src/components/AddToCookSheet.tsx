import { Ionicons } from '@expo/vector-icons';
import type { MealPlanEntry, Recipe } from '@recipe-aggregator/shared/types';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import { Body, Eyebrow, Mono, Serif } from '@/components/ui';
import { useCookSession } from '@/context/CookSessionContext';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';
import { formatWeekStart, getSunday } from '@/lib/weekHelpers';

/*
 * "Cook another recipe" — reached from the + on the cooking bar.
 *
 * This week's uncooked planned meals sit at the top, because that's where a
 * second cook almost always comes from, and picking one there carries its plan
 * row along so finishing it still ticks the meal off. Everything else in the
 * collection is searchable underneath, for the nights when the second dish was
 * never planned at all.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PlannedOption {
  entryId: string;
  recipe: Recipe;
}

export default function AddToCookSheet({ open, onClose }: Props) {
  const t = useTheme();
  const router = useRouter();
  const { cooks, startCook } = useCookSession();
  const [planned, setPlanned] = useState<PlannedOption[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const cookingIds = useMemo(() => new Set(cooks.map((c) => c.recipeId)), [cooks]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    let cancelled = false;

    (async () => {
      setLoading(true);
      const weekStr = formatWeekStart(getSunday(new Date()));
      const { data: plans } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('week_start', weekStr)
        .order('created_at', { ascending: true });

      const planIds = ((plans ?? []) as { id: string }[]).map((p) => p.id);
      const [entriesResult, recipesResult] = await Promise.all([
        planIds.length
          ? supabase.from('meal_plan_recipes').select('*, recipe:recipes(*)').in('meal_plan_id', planIds)
          : Promise.resolve({ data: [] as MealPlanEntry[] }),
        supabase.from('recipes').select('*').order('created_at', { ascending: false }),
      ]);

      if (cancelled) return;

      const entries = ((entriesResult.data ?? []) as MealPlanEntry[]).filter(
        (e) => e.entry_type === 'cook' && !e.is_cooked && e.recipe,
      );
      // A recipe planned twice in a week shouldn't appear twice in the list.
      const seen = new Set<string>();
      setPlanned(
        entries.reduce<PlannedOption[]>((acc, e) => {
          if (!e.recipe || seen.has(e.recipe.id)) return acc;
          seen.add(e.recipe.id);
          acc.push({ entryId: e.id, recipe: e.recipe });
          return acc;
        }, []),
      );
      setRecipes((recipesResult.data as Recipe[]) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function pick(recipe: Recipe, entryId: string | null) {
    haptics.success();
    startCook({
      recipeId: recipe.id,
      mealPlanEntryId: entryId,
      title: recipe.title,
      imageUrl: recipe.image_url,
      stepCount: recipe.steps?.length ?? 0,
    });
    onClose();
    router.navigate({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  }

  const q = query.trim().toLowerCase();
  const plannedShown = planned.filter(
    (p) => !cookingIds.has(p.recipe.id) && (!q || p.recipe.title.toLowerCase().includes(q)),
  );
  const plannedIds = new Set(plannedShown.map((p) => p.recipe.id));
  const otherShown = recipes
    .filter(
      (r) => !cookingIds.has(r.id) && !plannedIds.has(r.id) && (!q || r.title.toLowerCase().includes(q)),
    )
    // Without a search the whole collection would bury the plan list, and this
    // is a "grab the next thing" sheet, not a browser.
    .slice(0, q ? 40 : 8);

  const row = (recipe: Recipe, entryId: string | null, key: string) => (
    <Pressable
      key={key}
      onPress={() => pick(recipe, entryId)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 9,
        paddingHorizontal: 8,
        borderRadius: 12,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {recipe.image_url ? (
        <Image
          source={{ uri: recipe.image_url }}
          cachePolicy="memory-disk"
          recyclingKey={recipe.id}
          style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.paper3 }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: t.border,
          }}
        >
          <Serif size={18} italic color={t.green}>
            {(recipe.title.trim()[0] ?? '?').toUpperCase()}
          </Serif>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={14} weight="semi" numberOfLines={1}>
          {recipe.title}
        </Body>
        {recipe.steps?.length > 0 && (
          <Mono size={10} color={t.muted} style={{ marginTop: 2 }}>
            {recipe.steps.length} STEPS
          </Mono>
        )}
      </View>
    </Pressable>
  );

  return (
    <BottomSheet open={open} onClose={onClose} maxHeightRatio={0.85}>
      <View style={{ paddingHorizontal: 20 }}>
        <Serif size={20} weight="semi" style={{ marginBottom: 12 }}>
          Cook another recipe
        </Serif>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.paper2,
            borderRadius: 12,
            paddingHorizontal: 12,
            marginBottom: 6,
          }}
        >
          <Ionicons name="search" size={15} color={t.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your recipes"
            placeholderTextColor={t.muted}
            style={{
              flex: 1,
              paddingVertical: 11,
              fontFamily: font.sans,
              fontSize: 15,
              color: t.text,
            }}
          />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 28, alignItems: 'center' }}>
            <ActivityIndicator color={t.green} />
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {plannedShown.length > 0 && (
              <>
                <Eyebrow style={{ marginTop: 8, marginBottom: 4, paddingLeft: 8 }}>
                  This week’s plan
                </Eyebrow>
                {plannedShown.map((p) => row(p.recipe, p.entryId, `plan-${p.entryId}`))}
              </>
            )}
            {otherShown.length > 0 && (
              <>
                {plannedShown.length > 0 && (
                  <Eyebrow style={{ marginTop: 12, marginBottom: 4, paddingLeft: 8 }}>
                    All recipes
                  </Eyebrow>
                )}
                {otherShown.map((r) => row(r, null, `all-${r.id}`))}
              </>
            )}
            {plannedShown.length === 0 && otherShown.length === 0 && (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <Body size={14} color={t.muted}>
                  {q ? 'No recipes match that.' : 'Nothing left to cook.'}
                </Body>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}
