import { Ionicons } from '@expo/vector-icons';
import type { MealPlan, MealPlanEntry, Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IngredientIcon from '@/components/IngredientIcon';
import RateCookSheet from '@/components/RateCookSheet';
import RecipePickerSheet from '@/components/RecipePickerSheet';
import { Body, Button, CheckSquare, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { categoriseIngredients, CATEGORY_ORDER } from '@/lib/categoriseIngredients';
import { combineIngredients, type IngredientWithRecipe } from '@/lib/combineIngredients';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import {
  formatWeekLabel,
  formatWeekStart,
  getDefaultWeekStart,
  getMonday,
  isPlanningMode,
  shiftWeek,
} from '@/lib/weekHelpers';
import { scaleIngredientsForServings, toRoman } from '@/lib/recipeFormat';

type Tab = 'meals' | 'shopping';

function formatMins(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function MealPlanScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getDefaultWeekStart());
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('meals');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  // Post-cook rating popup: set when marking a meal cooked logs a recipe_cooks row.
  const [rateCook, setRateCook] = useState<{ cookId: string; title?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCategorised = useRef('');

  const loadPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStr = formatWeekStart(weekStart);
    const { data: existingList } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('week_start', weekStr)
      .order('created_at', { ascending: true });
    let existing = existingList?.[0] ?? null;
    if (!existing) {
      const { data: created } = await supabase
        .from('meal_plans')
        .insert({ user_id: user.id, week_start: weekStr })
        .select()
        .single();
      existing = created;
    }
    if (!existing) {
      setLoading(false);
      return;
    }
    const planData = existing as MealPlan;
    setPlan(planData);
    setCheckedItems(new Set(planData.checked_items || []));
    setCategoryMap(planData.shopping_categories || {});
    const { data: mpr } = await supabase
      .from('meal_plan_recipes')
      .select('*, recipe:recipes(*)')
      .eq('meal_plan_id', existing.id);
    setEntries((mpr as MealPlanEntry[]) || []);
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // The Plan tab stays mounted while you're on a recipe screen, so servings saved there
  // wouldn't reach the shopping list. Re-pull the recipes (not the checked state) on focus.
  const planId = plan?.id;
  useFocusEffect(
    useCallback(() => {
      if (!planId) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from('meal_plan_recipes')
          .select('*, recipe:recipes(*)')
          .eq('meal_plan_id', planId);
        if (!cancelled && data) setEntries(data as MealPlanEntry[]);
      })();
      return () => {
        cancelled = true;
      };
    }, [planId]),
  );

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.is_cooked === b.is_cooked ? 0 : a.is_cooked ? 1 : -1)),
    [entries],
  );

  const uncooked = entries.filter((e) => !e.is_cooked);
  // Shop for the servings the user actually saved on the recipe, not the source recipe's yield.
  const allIngredients: IngredientWithRecipe[] = uncooked.flatMap((e) =>
    scaleIngredientsForServings(
      e.recipe?.ingredients || [],
      e.recipe?.servings,
      e.recipe?.custom_servings ?? e.recipe?.servings,
    ).map((ing) => ({
      ...ing,
      _recipeTitle: e.recipe?.title || 'Unknown',
      _recipeId: e.recipe?.id || '',
    })),
  );
  const combined = useMemo(() => combineIngredients(allIngredients), [JSON.stringify(allIngredients)]);
  const cookedCount = entries.filter((e) => e.is_cooked).length;
  const cookedPct = entries.length > 0 ? Math.round((cookedCount / entries.length) * 100) : 0;

  // Categorise ingredients when they change
  useEffect(() => {
    if (!plan || combined.length === 0) return;
    const fingerprint = `${plan.id}-${combined.map((c) => c.item).sort().join(',')}`;
    if (fingerprint === lastCategorised.current) return;
    const hasUncategorised = combined.some((ing) => !categoryMap[ing.item.toLowerCase().trim()]);
    if (!hasUncategorised) {
      lastCategorised.current = fingerprint;
      return;
    }
    lastCategorised.current = fingerprint;
    (async () => {
      const updated = await categoriseIngredients(combined, categoryMap);
      setCategoryMap(updated);
      await supabase.from('meal_plans').update({ shopping_categories: updated }).eq('id', plan.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, combined.length]);

  const grouped = useMemo(() => {
    const withCat = combined.map((ing) => ({
      ...ing,
      shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
    }));
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: withCat.filter((ing) => ing.shoppingCategory === cat),
    })).filter((g) => g.items.length > 0);
  }, [combined, categoryMap]);

  function persistChecked(next: Set<string>) {
    if (!plan) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('meal_plans').update({ checked_items: [...next] }).eq('id', plan.id);
    }, 300);
  }

  function toggleShopping(key: string) {
    haptics.select();
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistChecked(next);
      return next;
    });
  }

  async function addRecipe(recipe: Pick<Recipe, 'id'>) {
    if (!plan) return;
    const { data } = await supabase
      .from('meal_plan_recipes')
      .insert({ meal_plan_id: plan.id, recipe_id: recipe.id })
      .select('*, recipe:recipes(*)')
      .single();
    if (data) setEntries((prev) => [...prev, data as MealPlanEntry]);
  }

  async function removeEntry(entryId: string) {
    haptics.light();
    await supabase.from('meal_plan_recipes').delete().eq('id', entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  async function toggleCooked(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = !entry.is_cooked;
    // A cooked meal is a small win — celebrate it; un-marking is just a light tick.
    if (next) haptics.success();
    else haptics.select();
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_cooked: next } : e)));
    await supabase.from('meal_plan_recipes').update({ is_cooked: next }).eq('id', entryId);

    if (next && user) {
      // Log the cook in the recipe's history, then ask how it went.
      const { data: cook } = await supabase
        .from('recipe_cooks')
        .insert({ recipe_id: entry.recipe_id, user_id: user.id, meal_plan_recipe_id: entryId })
        .select('id')
        .single();
      if (cook) setRateCook({ cookId: cook.id, title: entry.recipe?.title });
    } else if (!next) {
      // Un-marking means "I didn't actually cook this" — clear the logged cook.
      await supabase.from('recipe_cooks').delete().eq('meal_plan_recipe_id', entryId);
    }
  }

  const isCurrentWeek = formatWeekStart(getMonday(new Date())) === formatWeekStart(weekStart);
  const isNextWeek = formatWeekStart(shiftWeek(getMonday(new Date()), 1)) === formatWeekStart(weekStart);
  const isLastWeek = formatWeekStart(shiftWeek(getMonday(new Date()), -1)) === formatWeekStart(weekStart);
  const weekStatus = isLastWeek
    ? { label: 'LAST WEEK', tone: 'muted' as const }
    : isPlanningMode() && isNextWeek
      ? { label: 'PLANNING NEXT WEEK', tone: 'green' as const }
      : isCurrentWeek
        ? { label: 'THIS WEEK', tone: 'green' as const }
        : isNextWeek
          ? { label: 'NEXT WEEK', tone: 'green' as const }
          : null;

  const subtitle = loading
    ? 'Loading your week…'
    : entries.length === 0
      ? 'Nothing planned yet — add recipes to build your week.'
      : `${entries.length} meal${entries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked.`;

  const existingIds = new Set(entries.map((e) => e.recipe_id));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}>
        {/* Masthead */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Eyebrow>The plan</Eyebrow>
          <Serif size={34} style={{ marginTop: 10, lineHeight: 36 }}>
            Meal <Serif size={34} italic color={t.green}>Plan</Serif>
          </Serif>
          <Body size={14.5} color={t.textSoft} style={{ marginTop: 10 }}>
            {subtitle}
          </Body>
        </View>

        {/* Week switcher */}
        <View
          style={{
            marginHorizontal: 16,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 4,
            backgroundColor: t.card,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => setWeekStart((p) => shiftWeek(p, -1))}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={17} color={t.muted} />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Serif size={18}>Week of {formatWeekLabel(weekStart)}</Serif>
              {weekStatus && (
                <Mono size={9} color={weekStatus.tone === 'green' ? t.green : t.muted} style={{ marginTop: 4, letterSpacing: 1.2 }}>
                  {weekStatus.label}
                </Mono>
              )}
            </View>
            <Pressable
              onPress={() => setWeekStart((p) => shiftWeek(p, 1))}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-forward" size={17} color={t.muted} />
            </Pressable>
          </View>

          {entries.length > 0 && (
            <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.ruleHair }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Mono size={10}>{cookedCount} OF {entries.length} COOKED</Mono>
                <Mono size={10}>{cookedPct}%</Mono>
              </View>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: t.warm, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${cookedPct}%`, backgroundColor: t.green, borderRadius: 999 }} />
              </View>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 28, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 20 }}>
          {([
            ['meals', 'Meals', entries.length],
            ['shopping', 'Groceries', combined.length],
          ] as const).map(([key, label, count]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  haptics.select();
                  setTab(key);
                }}
                style={{ paddingBottom: 12, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: active ? t.green : 'transparent' }}
              >
                <Serif size={18} color={active ? t.text : t.muted}>
                  {label} <Mono size={11}>· {count}</Mono>
                </Serif>
              </Pressable>
            );
          })}
        </View>

        {/* Meals tab */}
        {tab === 'meals' && (
          <View style={{ paddingHorizontal: 16 }}>
            {!loading && entries.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="calendar-outline" size={40} color={t.muted} />
                <Serif size={21} style={{ marginTop: 14 }}>
                  Nothing planned yet
                </Serif>
                <Body size={14} color={t.muted} style={{ marginTop: 4 }}>
                  Add some recipes to build your week.
                </Body>
              </View>
            )}

            <View style={{ gap: 20 }}>
              {sortedEntries.map((entry) => {
                const cooked = entry.is_cooked;
                const meta: string[] = [];
                if (entry.recipe?.prep_time != null) meta.push(`Prep ${formatMins(entry.recipe.prep_time)}`);
                if (entry.recipe?.cook_time != null) meta.push(`Cook ${formatMins(entry.recipe.cook_time)}`);
                const plannedServings = entry.recipe?.custom_servings ?? entry.recipe?.servings;
                if (plannedServings != null) meta.push(`Serves ${plannedServings}`);
                return (
                  <View key={entry.id} style={{ opacity: cooked ? 0.72 : 1 }}>
                    {/* Photo — tapping it just views the recipe (no cook mode) */}
                    <Pressable
                      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe_id } })}
                      style={{ position: 'relative', aspectRatio: 4 / 3, borderRadius: 4, overflow: 'hidden', backgroundColor: t.paper3 }}
                    >
                      {entry.recipe?.image_url ? (
                        <Image source={{ uri: entry.recipe.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={entry.recipe.id} />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="restaurant-outline" size={32} color={t.muted} />
                        </View>
                      )}
                      <Pressable
                        onPress={() => removeEntry(entry.id)}
                        style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </Pressable>
                      {cooked && (
                        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(251,248,241,0.92)' }}>
                          <Ionicons name="checkmark" size={11} color={t.greenDeep} />
                          <Mono size={9} color={t.greenDeep}>COOKED</Mono>
                        </View>
                      )}
                    </Pressable>
                    <View style={{ marginTop: 10 }}>
                      {/* Title — also a plain "view recipe" tap target */}
                      <Pressable onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe_id } })}>
                        <Serif size={19} style={{ textDecorationLine: cooked ? 'line-through' : 'none' }}>
                          {entry.recipe?.title}
                        </Serif>
                      </Pressable>
                      {meta.length > 0 && (
                        <Mono size={10} style={{ marginTop: 5, letterSpacing: 0.6 }}>
                          {meta.join('   ').toUpperCase()}
                        </Mono>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <Pressable
                          onPress={() => toggleCooked(entry.id)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: cooked ? t.green : t.border, backgroundColor: cooked ? t.greenLight : t.card }}
                        >
                          {cooked && <Ionicons name="checkmark" size={14} color={t.green} />}
                          <Body size={13} weight="medium" color={cooked ? t.green : t.text}>
                            {cooked ? 'Cooked' : 'Mark cooked'}
                          </Body>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: '/recipe/[id]',
                              params: cooked
                                ? { id: entry.recipe_id }
                                : { id: entry.recipe_id, cook: '1', entry: entry.id },
                            })
                          }
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            paddingVertical: 9,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: cooked ? t.border : t.greenSolid,
                            backgroundColor: cooked ? t.card : t.greenSolid,
                          }}
                        >
                          {!cooked && <Ionicons name="flame" size={13} color={t.onGreen} />}
                          <Body size={13} weight="medium" color={cooked ? t.text : t.onGreen}>
                            {cooked ? 'View recipe' : 'Cook recipe'}
                          </Body>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable
              onPress={() => setShowAdd(true)}
              style={{
                marginTop: entries.length > 0 ? 20 : 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: t.green,
                borderRadius: 4,
              }}
            >
              <Ionicons name="add" size={18} color={t.green} />
              <Serif size={16} italic color={t.green}>
                Add a recipe
              </Serif>
            </Pressable>
          </View>
        )}

        {/* Shopping tab */}
        {tab === 'shopping' && (
          <View style={{ paddingHorizontal: 16 }}>
            {combined.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="cart-outline" size={40} color={t.muted} />
                <Serif size={21} style={{ marginTop: 14 }}>
                  {entries.length === 0 ? 'No meals added yet' : 'All meals cooked'}
                </Serif>
                <Body size={14} color={t.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                  {entries.length === 0 ? 'Add some meals to generate a shopping list.' : 'Nothing left to shop for.'}
                </Body>
              </View>
            )}

            {combined.length > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 18, borderBottomWidth: 1, borderBottomColor: t.border }}>
                <Mono size={10} style={{ letterSpacing: 1.4 }}>SHOPPING LIST</Mono>
                <Mono size={11}>{checkedItems.size}/{combined.length} TICKED</Mono>
              </View>
            )}

            {grouped.map((group, gi) => (
              <View key={group.category} style={{ marginBottom: 22 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 2 }}>
                  <Serif size={13} italic color={t.green}>{toRoman(gi + 1)}.</Serif>
                  <Serif size={18} style={{ flex: 1 }}>{group.category}</Serif>
                  <Mono size={11}>{group.items.length}</Mono>
                </View>
                {group.items.map((ing, i) => {
                  const key = `${ing.item}-${ing.unit}`;
                  const checked = checkedItems.has(key);
                  const qty = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim();
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleShopping(key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        borderBottomWidth: i < group.items.length - 1 ? 1 : 0,
                        borderBottomColor: t.ruleHair,
                        opacity: checked ? 0.5 : 1,
                      }}
                    >
                      <CheckSquare checked={checked} />
                      <IngredientIcon item={ing.item} />
                      <Serif size={16} style={{ flex: 1, textDecorationLine: checked ? 'line-through' : 'none' }} color={checked ? t.muted : t.text}>
                        {ing.item}
                      </Serif>
                      {qty ? <Mono size={11}>{qty}</Mono> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <RecipePickerSheet
        open={showAdd}
        existingIds={existingIds}
        onPick={(r) => addRecipe(r)}
        onClose={() => setShowAdd(false)}
      />

      <RateCookSheet
        open={rateCook !== null}
        cookId={rateCook?.cookId ?? null}
        recipeTitle={rateCook?.title}
        onClose={() => setRateCook(null)}
      />
    </View>
  );
}
