import { Ionicons } from '@expo/vector-icons';
import { dedupeRecipesBySource } from '@recipe-aggregator/shared/recipeSource';
import type { Cookbook, Recipe, Tag } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/BottomSheet';
import CookbookRow from '@/components/CookbookRow';
import RecipeFilterBar from '@/components/RecipeFilterBar';
import { Body, Button, Divider, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { DAY_INDEXES, DAY_SHORT, dayDate, planServings, todayIndex } from '@/lib/mealPlanDays';
import { supabase } from '@/lib/supabase';
import type { RecipeTagRow } from '@/lib/tagMeta';
import { font, useTheme } from '@/lib/theme';
import useRecipeFilters from '@/lib/useRecipeFilters';

export interface PlanPrefs {
  /** Cooks in the week — pots on the stove, not nights at the table. */
  meals: number;
  /** People eating one meal. */
  servings: number;
  /** Meals one cook covers, without assigning the later meals to dates. */
  nights: number;
}

export interface PlanPick {
  recipe: Recipe;
  nights: number;
}

/** One cook — the only unit that gets placed on a day. */
interface Slot {
  key: string;
  recipeId: string;
  day: number | null;
}

interface Props {
  open: boolean;
  weekStart: Date;
  takenDays: Set<number>;
  prefs: PlanPrefs | null;
  onSavePrefs: (prefs: PlanPrefs) => void;
  onCommit: (
    picks: PlanPick[],
    slots: { recipeId: string; day: number | null }[],
    servingsPerMeal: number,
  ) => Promise<void>;
  onClose: () => void;
}

/**
 * Home's four sort options plus the one plan mode cares about most: what you
 * haven't cooked in a while. That's the default here — the whole point of the
 * picker is to get last month's recipes back in front of you.
 */
type SortOption = 'suggested' | 'newest' | 'oldest' | 'a-z' | 'z-a';

const SORT_LABELS: [SortOption, string][] = [
  ['suggested', 'Not cooked lately'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['a-z', 'A – Z'],
  ['z-a', 'Z – A'],
];

/**
 * Plan mode. Asks the setup questions once, remembers the answers, and from
 * then on opens straight at picking. Every step after the first is skippable —
 * you can bail at any point and the meals just land in the week unplaced.
 */
export default function PlanWeekSheet({
  open,
  weekStart,
  takenDays,
  prefs,
  onSavePrefs,
  onCommit,
  onClose,
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [meals, setMeals] = useState(3);
  const [servings, setServings] = useState(2);
  const [nights, setNights] = useState(2);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [lastCooked, setLastCooked] = useState<Record<string, string>>({});
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [cookbookRecipes, setCookbookRecipes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('suggested');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  // Two ways to look at the same collection: the whole list, or your shelves.
  // Not a filter — a mode. Cookbooks get the shelf treatment they have on the
  // Cookbook tab, because browsing them is half the reason they exist.
  const [browse, setBrowse] = useState<'all' | 'cookbooks'>('all');
  const [cookbookId, setCookbookId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // See the web planner: URL variants can be separate database rows, but they
  // represent one recipe in the all-recipes picker.
  const uniqueRecipes = useMemo(
    () => dedupeRecipesBySource(recipes, user?.id),
    [recipes, user?.id],
  );

  // Same filtering the home tab runs on: search across titles and ingredients,
  // owner, and the tag-category facets.
  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? uniqueRecipes.filter((r) => r.is_favourite) : uniqueRecipes,
    tags,
    recipeTags,
    userId: user?.id,
    searchQuery: search,
  });

  useEffect(() => {
    if (!open) return;
    setStep(prefs ? 2 : 1);
    setMeals(prefs?.meals ?? 3);
    setServings(prefs?.servings ?? 2);
    setNights(prefs?.nights ?? 2);
    setPicks([]);
    setSlots([]);
    setActiveSlot(null);
    setSearch('');
    setSortBy('suggested');
    setShowFavouritesOnly(false);
    setBrowse('all');
    setCookbookId(null);
    setFilterOpen(false);
    filters.resetFilters();
    setLoading(true);
    (async () => {
      const [
        { data: recipeData },
        { data: cookData },
        { data: cbData },
        { data: cbRecipeData },
        { data: tagData },
        { data: recipeTagData },
      ] = await Promise.all([
        supabase.from('recipes').select('*').order('title'),
        supabase.from('recipe_cooks').select('recipe_id, cooked_at'),
        supabase
          .from('cookbooks')
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id, recipe_id'),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
      ]);
      setRecipes((recipeData as Recipe[]) ?? []);
      const map: Record<string, string> = {};
      for (const r of (cookData as { recipe_id: string; cooked_at: string }[]) ?? []) {
        if (!map[r.recipe_id] || r.cooked_at > map[r.recipe_id]) map[r.recipe_id] = r.cooked_at;
      }
      setLastCooked(map);
      setCookbooks((cbData as Cookbook[]) ?? []);
      const members: Record<string, Set<string>> = {};
      for (const row of (cbRecipeData as { cookbook_id: string; recipe_id: string }[]) ?? []) {
        (members[row.cookbook_id] ??= new Set()).add(row.recipe_id);
      }
      setCookbookRecipes(members);
      setTags((tagData as Tag[]) ?? []);
      setRecipeTags((recipeTagData as RecipeTagRow[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefs]);

  // Cookbooks you can actually pick from — an empty one is just noise here.
  const pickableCookbooks = useMemo(
    () => cookbooks.filter((c) => (cookbookRecipes[c.id]?.size ?? 0) > 0),
    [cookbooks, cookbookRecipes],
  );

  const activeCookbook = cookbookId ? cookbooks.find((c) => c.id === cookbookId) : undefined;

  // Four plates per shelf, newest first — the same cover strip the Cookbook
  // tab builds, derived from data this sheet already has.
  const cookbookCovers = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const out: Record<string, string[]> = {};
    for (const cb of cookbooks) {
      const ids = cookbookRecipes[cb.id];
      out[cb.id] = !ids
        ? []
        : [...ids]
            .map((id) => byId.get(id))
            .filter((r): r is Recipe => !!r?.image_url)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 4)
            .map((r) => r.image_url as string);
    }
    return out;
  }, [recipes, cookbooks, cookbookRecipes]);

  // Everything that matches — no cap. If you have 200 recipes, plan mode shows
  // 200; narrowing is the filters' job, not a silent truncation's.
  const visible = useMemo(() => {
    // Inside a shelf you get the shelf, least recently cooked first — the
    // recipe filters belong to the all-recipes mode and are reset on the way in.
    if (browse === 'cookbooks') {
      if (!cookbookId) return [];
      const ids = cookbookRecipes[cookbookId];
      const list = ids ? recipes.filter((r) => ids.has(r.id)) : [];
      return [...list].sort((a, b) => (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? ''));
    }
    return [...filters.filteredRecipes].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'a-z':
          return a.title.localeCompare(b.title);
        case 'z-a':
          return b.title.localeCompare(a.title);
        default:
          // Longest time since you last cooked it, never-cooked first.
          return (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? '');
      }
    });
  }, [browse, cookbookId, recipes, filters.filteredRecipes, cookbookRecipes, sortBy, lastCooked]);

  const hasActiveFilters = showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== 'suggested';
  const isNarrowed = hasActiveFilters || filters.activeCategories.size > 0 || search.trim() !== '';

  function resetAllFilters() {
    filters.resetFilters();
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy('suggested');
  }

  /** Switching mode is a clean slate — the other mode's controls don't linger. */
  function setMode(next: 'all' | 'cookbooks') {
    haptics.select();
    setBrowse(next);
    setCookbookId(null);
    setFilterOpen(false);
    resetAllFilters();
  }

  const totalMeals = picks.reduce((sum, p) => sum + p.nights, 0);
  // What the setup answers add up to: cooks × meals covered by each batch.
  const plannedMeals = meals * nights;
  // A pick can always be cycled past the default — the answer is a starting
  // point, not a cap.
  const maxNights = Math.max(3, nights);

  function togglePick(recipe: Recipe) {
    haptics.select();
    setPicks((prev) => {
      const found = prev.find((p) => p.recipe.id === recipe.id);
      if (found) return prev.filter((p) => p.recipe.id !== recipe.id);
      // Everything starts on the answer from step 1 — most cooks here are meal
      // prep, so 1 meal would mean re-tapping every card.
      return [...prev, { recipe, nights }];
    });
  }

  function cycleNights(recipeId: string) {
    haptics.light();
    setPicks((prev) =>
      prev.map((p) =>
        p.recipe.id === recipeId ? { ...p, nights: p.nights >= maxNights ? 1 : p.nights + 1 } : p,
      ),
    );
  }

  function minutesFor(recipeId: string): number {
    const r = recipes.find((x) => x.id === recipeId);
    return (r?.prep_time ?? 0) + (r?.cook_time ?? 0);
  }

  function recipeFor(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  }

  /**
   * What one pick gets shopped for, and whether the recipe — not the maths —
   * set that number. `asWritten` is the case worth labelling: the recipe already
   * makes more than people × meals, so it's planned whole instead of scaled down.
   */
  function servingsFor(pick: PlanPick): { total: number; asWritten: boolean } {
    const total = planServings(pick.recipe, servings, pick.nights);
    return { total, asWritten: total > servings * pick.nights };
  }

  function goToPlacement() {
    const next: Slot[] = picks.map((pick) => ({
      key: pick.recipe.id,
      recipeId: pick.recipe.id,
      day: null,
    }));
    setSlots(next);
    setActiveSlot(next[0]?.key ?? null);
    setStep(3);
  }

  function placeOnDay(day: number) {
    if (!activeSlot) return;
    haptics.select();
    setSlots((prev) => {
      const next = prev.map((s) => (s.key === activeSlot ? { ...s, day } : s));
      const stillOpen = next.find((s) => s.day === null);
      setActiveSlot(stillOpen?.key ?? null);
      return next;
    });
  }

  function autoFill() {
    haptics.success();
    const today = todayIndex(weekStart);
    const used = new Set<number>([
      ...takenDays,
      ...slots.filter((s) => s.day !== null).map((s) => s.day as number),
    ]);
    const free = DAY_INDEXES.filter((d) => !used.has(d) && (today === null || d >= today));

    const take = (day: number) => {
      const i = free.indexOf(day);
      if (i >= 0) free.splice(i, 1);
    };

    // Longest cooks choose first, so the 90-minute braise gets a weekend.
    const open = slots
      .filter((s) => s.day === null)
      .sort((a, b) => minutesFor(b.recipeId) - minutesFor(a.recipeId));

    const assigned = new Map<string, number>();
    for (const slot of open) {
      if (free.length === 0) break;
      const weekend = free.filter((d) => d === 0 || d === 6);
      const day = minutesFor(slot.recipeId) >= 45 && weekend.length > 0 ? weekend[0] : free[0];
      take(day);
      assigned.set(slot.key, day);
    }
    setSlots((prev) => prev.map((s) => (assigned.has(s.key) ? { ...s, day: assigned.get(s.key)! } : s)));
    setActiveSlot(null);
  }

  async function commit() {
    setSaving(true);
    await onCommit(
      picks,
      slots.map((s) => ({ recipeId: s.recipeId, day: s.day })),
      servings,
    );
    setSaving(false);
    haptics.success();
    onClose();
  }

  /**
   * One line of the setup sentence: "I want to cook — 3 — meals". Three stacked
   * dial-sized steppers would read as a form; three sentence rows read as one
   * thought, and take up less room than the two big ones they replace.
   */
  const numberRow = (
    lead: string,
    value: number,
    set: (n: number) => void,
    unit: string,
    min: number,
    max: number,
  ) => {
    const round = {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    };
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingHorizontal: 13,
          paddingVertical: 9,
          marginBottom: 7,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 4,
          backgroundColor: t.card,
        }}
      >
        <Serif size={16} color={t.textSoft} numberOfLines={1} style={{ flex: 1 }}>
          {lead}
        </Serif>
        <Pressable
          hitSlop={6}
          onPress={() => {
            haptics.select();
            set(Math.max(min, value - 1));
          }}
          style={round}
        >
          <Ionicons name="remove" size={16} color={t.green} />
        </Pressable>
        <Serif size={27} style={{ minWidth: 28, textAlign: 'center', lineHeight: 32 }}>
          {value}
        </Serif>
        <Pressable
          hitSlop={6}
          onPress={() => {
            haptics.select();
            set(Math.min(max, value + 1));
          }}
          style={round}
        >
          <Ionicons name="add" size={16} color={t.green} />
        </Pressable>
        <Mono size={9} style={{ letterSpacing: 1.3, minWidth: 42 }}>
          {unit.toUpperCase()}
        </Mono>
      </View>
    );
  };

  /** Prefs recap plus the All-recipes / Cookbooks switch — on top of every
   *  step-2 view, so the mode is always one tap away. */
  const modeSwitch = (
    <View style={{ paddingTop: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 999,
          backgroundColor: t.card,
          paddingLeft: 14,
          paddingRight: 6,
          paddingVertical: 6,
          marginHorizontal: 20,
          marginBottom: 14,
        }}
      >
        <Mono size={9.5} color={t.textSoft} style={{ letterSpacing: 1 }}>
          {meals} COOKS × {nights} MEAL{nights === 1 ? '' : 'S'} · {servings} PEOPLE
        </Mono>
        <Pressable
          onPress={() => setStep(1)}
          style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}
        >
          <Body size={12} color={t.green}>
            Change
          </Body>
        </Pressable>
      </View>

      {/* Two ways in: the whole collection, or your shelves. */}
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          padding: 3,
          marginHorizontal: 20,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 999,
          backgroundColor: t.card,
        }}
      >
        {(
          [
            ['all', 'All recipes', uniqueRecipes.length],
            ['cookbooks', 'Cookbooks', pickableCookbooks.length],
          ] as const
        ).map(([value, label, count]) => {
          const on = browse === value;
          return (
            <Pressable
              key={value}
              onPress={() => setMode(value)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: on ? t.greenSolid : 'transparent',
              }}
            >
              <Mono size={9.5} color={on ? t.onGreen : t.muted} style={{ letterSpacing: 1.3 }}>
                {label.toUpperCase()}
              </Mono>
              <Mono size={9.5} color={on ? t.onGreen : t.muted} style={{ opacity: 0.75 }}>
                {count}
              </Mono>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  /**
   * The recipe grid's header. In all-recipes mode it's the home tab's kit —
   * same search field, same filter button and sheet, same category rails. Inside
   * a cookbook it's the shelf's own title bar instead.
   */
  const pickHeader = (
    <View>
      {modeSwitch}

      {browse === 'all' ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: t.card,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="search" size={16} color={t.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search recipes…"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: t.text, fontFamily: font.sans }}
              />
            </View>
            <Pressable
              onPress={() => {
                haptics.select();
                setFilterOpen(true);
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hasActiveFilters ? t.greenLight : t.card,
                borderWidth: 1,
                borderColor: hasActiveFilters ? t.green : t.border,
              }}
            >
              <Ionicons name="options-outline" size={20} color={hasActiveFilters ? t.green : t.muted} />
            </Pressable>
          </View>

          <RecipeFilterBar {...filters} gutter={20} />

          {/* Always say how much of the collection you're looking at — the picker
              used to quietly stop at 60 and there was no way to tell. */}
          {!loading && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                paddingHorizontal: 20,
                marginTop: 14,
              }}
            >
              <Body size={12.5} color={t.muted} style={{ flexShrink: 1, lineHeight: 18 }}>
                {isNarrowed
                  ? `Showing ${visible.length} of ${uniqueRecipes.length} recipe${uniqueRecipes.length === 1 ? '' : 's'}.`
                  : `All ${uniqueRecipes.length} recipe${uniqueRecipes.length === 1 ? '' : 's'}, least recently cooked first.`}
              </Body>
              {isNarrowed && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    haptics.select();
                    resetAllFilters();
                  }}
                >
                  <Body size={12.5} color={t.green}>
                    Show everything
                  </Body>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ) : (
        activeCookbook && (
          // Inside a shelf — back out the way you came in.
          <View style={{ paddingHorizontal: 20 }}>
            <Pressable
              hitSlop={8}
              onPress={() => {
                haptics.select();
                setCookbookId(null);
              }}
            >
              <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.3 }}>
                ← COOKBOOKS
              </Mono>
            </Pressable>
            <Serif size={22} numberOfLines={2} style={{ marginTop: 8, lineHeight: 26 }}>
              {activeCookbook.emoji || '📗'} {activeCookbook.name}
            </Serif>
            <Body size={12.5} color={t.muted} style={{ marginTop: 5, lineHeight: 18 }}>
              {visible.length} recipe{visible.length === 1 ? '' : 's'}, least recently cooked first
              {activeCookbook.description ? ` · ${activeCookbook.description}` : ''}
            </Body>
          </View>
        )
      )}
    </View>
  );

  const renderPick = ({ item: recipe }: { item: Recipe }) => {
    const pick = picks.find((p) => p.recipe.id === recipe.id);
    return (
      <View style={{ width: '48.5%' }}>
        <Pressable onPress={() => togglePick(recipe)}>
          <View
            style={{
              aspectRatio: 4 / 3,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: t.paper3,
              borderWidth: pick ? 2 : 1,
              borderColor: pick ? t.greenSolid : t.border,
            }}
          >
            {recipe.image_url ? (
              <Image
                source={{ uri: recipe.image_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={recipe.id}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="restaurant-outline" size={22} color={t.muted} />
              </View>
            )}
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pick ? t.greenSolid : 'rgba(0,0,0,0.45)',
              }}
            >
              <Ionicons name={pick ? 'checkmark' : 'add'} size={14} color="#fff" />
            </View>
          </View>
          <Serif size={14} numberOfLines={2} style={{ marginTop: 6, lineHeight: 17 }}>
            {recipe.title}
          </Serif>
        </Pressable>

        {/* One cook can cover several flexible meals. */}
        {pick && (
          <Pressable
            onPress={() => cycleNights(recipe.id)}
            style={{
              alignSelf: 'flex-start',
              marginTop: 5,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.green,
              backgroundColor: t.greenLight,
            }}
          >
            <Mono size={9} color={t.green} style={{ letterSpacing: 0.8 }}>
              {pick.nights}× ·{' '}
              {servingsFor(pick).asWritten ? 'MAKES' : 'SERVES'} {servingsFor(pick).total}
            </Mono>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    // Full screen, not `pageSheet`. A page sheet is laid out by UIKit at a
    // height React Native doesn't reliably know about, so the pinned footer —
    // the only way forward through the flow — ended up below the sheet's
    // visible edge and untappable. Full screen means the flex layout here and
    // the visible screen are the same box, so the footer is always reachable.
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <View>
            <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.6 }}>
              {step === 1
                ? 'SET UP · ONCE'
                : step === 2
                  ? `${picks.length} OF ${meals} COOKS · ${totalMeals} MEAL${totalMeals === 1 ? '' : 'S'}`
                  : 'CHOOSE COOKING DAYS'}
            </Mono>
            <Serif size={23} style={{ marginTop: 6 }}>
              Plan the week
            </Serif>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ paddingTop: 4 }}>
            <Ionicons name="close" size={22} color={t.muted} />
          </Pressable>
        </View>

        {/* The picker is a real list — the whole collection, virtualised, so a
            couple of hundred recipes scroll as smoothly as ten. */}
        {step === 2 && browse === 'cookbooks' && !activeCookbook ? (
          // The shelf, as it looks on the Cookbook tab.
          <FlatList
            data={loading ? [] : pickableCookbooks}
            keyExtractor={(c) => c.id}
            renderItem={({ item, index }) => (
              <CookbookRow
                cookbook={item}
                recipeCount={cookbookRecipes[item.id]?.size ?? 0}
                coverImages={cookbookCovers[item.id] ?? []}
                index={index}
                gutter={20}
                onPress={() => {
                  haptics.select();
                  setCookbookId(item.id);
                }}
              />
            )}
            ListHeaderComponent={modeSwitch}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={t.green} style={{ marginVertical: 28 }} />
              ) : (
                <Body size={14} color={t.muted} style={{ paddingVertical: 24, textAlign: 'center' }}>
                  No cookbooks with recipes in them yet.
                </Body>
              )
            }
            contentContainerStyle={{ gap: 20, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={4}
            windowSize={7}
          />
        ) : step === 2 ? (
          <FlatList
            data={loading ? [] : visible}
            keyExtractor={(r) => r.id}
            numColumns={2}
            renderItem={renderPick}
            ListHeaderComponent={pickHeader}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={t.green} style={{ marginVertical: 28 }} />
              ) : (
                <Body size={14} color={t.muted} style={{ paddingVertical: 24, textAlign: 'center' }}>
                  {isNarrowed ? 'No recipes match those filters.' : 'Nothing to pick here yet.'}
                </Body>
              )
            }
            columnWrapperStyle={{ paddingHorizontal: 20, justifyContent: 'space-between' }}
            contentContainerStyle={{ gap: 14, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={8}
            windowSize={7}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* ── Step 1: one sentence, three numbers ───── */}
            {step === 1 && (
              <View>
                <Serif size={20} style={{ marginBottom: 14 }}>
                  How does a normal week go?
                </Serif>

                {numberRow('I want to cook', meals, setMeals, 'recipes', 1, 14)}
                {numberRow('for', servings, setServings, 'people', 1, 12)}
                {numberRow('each batch covers', nights, setNights, 'meals', 1, 7)}

                {/* The whole point of the sentence: you never do the multiplication. */}
                <View
                  style={{
                    marginTop: 16,
                    paddingHorizontal: 15,
                    paddingVertical: 13,
                    borderLeftWidth: 2,
                    borderLeftColor: t.green,
                    backgroundColor: t.greenLight,
                    borderRadius: 3,
                  }}
                >
                  <Serif size={19} style={{ lineHeight: 24 }}>
                    That's{' '}
                    <Serif size={19} color={t.green} italic>
                      {plannedMeals} meal{plannedMeals === 1 ? '' : 's'}
                    </Serif>{' '}
                    covered.
                  </Serif>
                  <Body size={12.5} color={t.textSoft} style={{ lineHeight: 19, marginTop: 5 }}>
                    {nights === 1
                      ? `Each cook shops for ${servings} serving${servings === 1 ? '' : 's'}.`
                      : `One cook covers ${nights} meals, so each batch shops for ${servings * nights} servings.`}
                    {plannedMeals > 7 ? ' That covers more than seven dinners, so you’ll have some spare.' : ''}
                    {' A recipe already written for more than that is planned whole, never scaled down.'}
                  </Body>
                </View>

                <Mono size={9} style={{ letterSpacing: 1.3, marginTop: 12, lineHeight: 14 }}>
                  SAVED FOR NEXT TIME — YOU'LL SKIP STRAIGHT TO PICKING
                </Mono>
              </View>
            )}

            {/* ── Step 3: place them ───────────────────── */}
            {step === 3 && (
              <View>
                <Body size={13.5} color={t.textSoft} style={{ lineHeight: 20, marginBottom: 14 }}>
                  Pick a recipe below, then tap the day you plan to cook it. Later meals from the batch stay flexible.
                </Body>

                {DAY_INDEXES.map((d) => {
                  const slot = slots.find((s) => s.day === d);
                  const recipe = slot ? recipeFor(slot.recipeId) : undefined;
                  const busy = takenDays.has(d);
                  const date = dayDate(weekStart, d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => !busy && placeOnDay(d)}
                      disabled={busy}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        marginBottom: 6,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderStyle: slot || busy ? 'solid' : 'dashed',
                        borderColor: slot ? t.green : t.border,
                        backgroundColor: slot ? t.greenLight : t.card,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Mono size={9.5} style={{ width: 46, letterSpacing: 0.6 }}>
                        {DAY_SHORT[d].toUpperCase()} {date.getDate()}
                      </Mono>
                      {recipe ? (
                        <>
                          {recipe.image_url ? (
                            <Image
                              source={{ uri: recipe.image_url }}
                              style={{ width: 32, height: 32, borderRadius: 3 }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              recyclingKey={recipe.id}
                            />
                          ) : (
                            <View style={{ width: 32, height: 32, borderRadius: 3, backgroundColor: t.paper3 }} />
                          )}
                          <Serif size={15} numberOfLines={1} style={{ flex: 1 }}>
                            {recipe.title}
                          </Serif>
                        </>
                      ) : (
                        <Mono size={9} style={{ flex: 1, letterSpacing: 1.2 }}>
                          {busy ? 'ALREADY PLANNED' : activeSlot ? 'TAP TO PLACE' : 'FREE'}
                        </Mono>
                      )}
                    </Pressable>
                  );
                })}

                <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Mono size={9} style={{ letterSpacing: 1.5 }}>
                      STILL TO PLACE
                    </Mono>
                    <Mono size={10}>{slots.filter((s) => s.day === null).length}</Mono>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {slots
                      .filter((s) => s.day === null)
                      .map((s) => {
                        const recipe = recipeFor(s.recipeId);
                        const isActive = activeSlot === s.key;
                        return (
                          <Pressable
                            key={s.key}
                            onPress={() => {
                              haptics.select();
                              setActiveSlot(s.key);
                            }}
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: 3,
                              overflow: 'hidden',
                              backgroundColor: t.paper3,
                              borderWidth: isActive ? 2 : 1,
                              borderColor: isActive ? t.greenSolid : t.border,
                            }}
                          >
                            {recipe?.image_url ? (
                              <Image
                                source={{ uri: recipe.image_url }}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={recipe.id}
                              />
                            ) : (
                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="restaurant-outline" size={16} color={t.muted} />
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer — always on screen, never behind the tab bar or the keyboard. */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            borderTopWidth: 1,
            borderTopColor: t.border,
            backgroundColor: t.card,
          }}
        >
          {step === 1 && (
            <Button
              label="Choose recipes"
              onPress={() => {
                haptics.success();
                onSavePrefs({ meals, servings, nights });
                setStep(2);
              }}
              style={{ flex: 1 }}
            />
          )}
          {step === 2 && (
            <>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
              <Button
                label={picks.length === 0 ? 'Pick some recipes' : `Next — place ${picks.length} cook${picks.length === 1 ? '' : 's'}`}
                onPress={goToPlacement}
                disabled={picks.length === 0}
                style={{ flex: 1.4 }}
              />
            </>
          )}
          {step === 3 && (
            <>
              <Button label="Fill it in for me" variant="secondary" onPress={autoFill} style={{ flex: 1 }} />
              <Button label={saving ? 'Adding…' : 'Done'} onPress={commit} disabled={saving} style={{ flex: 1 }} />
            </>
          )}
        </View>

        {/* Filter & sort — the home tab's sheet, minus nothing, plus the
            not-cooked-lately sort that plan mode opens on. */}
        <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4 }}>
            <Serif size={19} weight="semi">
              Filter &amp; sort
            </Serif>

            <Mono size={10} style={{ marginTop: 18, marginBottom: 8 }}>
              SHOW
            </Mono>
            {(['all', 'mine', 'shared'] as const).map((value) => {
              const label = value === 'all' ? 'All recipes' : value === 'mine' ? 'Mine' : 'Shared';
              const active = filters.ownerFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    haptics.select();
                    filters.setOwnerFilter(value);
                  }}
                  style={{
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: active ? t.greenLight : 'transparent',
                  }}
                >
                  <Body size={14} weight={active ? 'semi' : 'regular'} color={active ? t.green : t.text}>
                    {label}
                  </Body>
                </Pressable>
              );
            })}

            <Divider style={{ marginVertical: 8 }} />

            <Pressable
              onPress={() => {
                haptics.light();
                setShowFavouritesOnly((v) => !v);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 11,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: showFavouritesOnly ? t.redLight : 'transparent',
              }}
            >
              <Ionicons
                name={showFavouritesOnly ? 'heart' : 'heart-outline'}
                size={16}
                color={showFavouritesOnly ? t.red : t.text}
              />
              <Body size={14} color={showFavouritesOnly ? t.red : t.text}>
                Favourites only
              </Body>
            </Pressable>

            <Divider style={{ marginVertical: 8 }} />

            <Mono size={10} style={{ marginBottom: 8 }}>
              SORT BY
            </Mono>
            {SORT_LABELS.map(([value, label]) => {
              const active = sortBy === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    haptics.select();
                    setSortBy(value);
                  }}
                  style={{
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: active ? t.greenLight : 'transparent',
                  }}
                >
                  <Body size={14} weight={active ? 'semi' : 'regular'} color={active ? t.green : t.text}>
                    {label}
                  </Body>
                </Pressable>
              );
            })}

            {isNarrowed && (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <Pressable
                  onPress={() => {
                    haptics.light();
                    resetAllFilters();
                  }}
                  style={{ paddingVertical: 11, paddingHorizontal: 12 }}
                >
                  <Body size={14} color={t.red}>
                    Reset all filters
                  </Body>
                </Pressable>
              </>
            )}
          </ScrollView>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
