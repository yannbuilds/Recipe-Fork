import { Ionicons } from '@expo/vector-icons';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import RecipeFilterBar from '@/components/RecipeFilterBar';
import { Body, Divider, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import type { RecipeTagRow } from '@/lib/tagMeta';
import { font, useTheme } from '@/lib/theme';
import useRecipeFilters from '@/lib/useRecipeFilters';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

// `ingredients` rides along so callers can check for linked sub-recipes without
// a second fetch — RECIPE_SELECT already pulls it.
type Item = Pick<
  Recipe,
  'id' | 'title' | 'image_url' | 'prep_time' | 'cook_time' | 'servings' | 'ingredients'
>;

type SortOption = 'a-z' | 'z-a' | 'newest' | 'oldest';

const SORT_LABELS: [SortOption, string][] = [
  ['a-z', 'A – Z'],
  ['z-a', 'Z – A'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
];

interface Props {
  open: boolean;
  title?: string;
  existingIds: Set<string>;
  /** Recipes to leave out of the list entirely — used to stop a recipe linking
   *  to itself. `existingIds` only hints; this hides. */
  excludeIds?: Set<string>;
  onPick: (recipe: Item) => void;
  onClose: () => void;
}

export default function RecipePickerSheet({ open, title = 'Add a recipe', existingIds, excludeIds, onPick, onClose }: Props) {
  const t = useTheme();
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('a-z');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Same filtering the home tab runs on: search across titles and ingredients,
  // owner, and the tag-category facets.
  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? recipes.filter((r) => r.is_favourite) : recipes,
    tags,
    recipeTags,
    userId: user?.id,
    searchQuery: search,
  });

  useEffect(() => {
    if (!open) return;
    setAdded(new Set());
    setSearch('');
    setSortBy('a-z');
    setShowFavouritesOnly(false);
    setFilterOpen(false);
    filters.resetFilters();
    setLoading(true);
    (async () => {
      const [recipesRes, tagsRes, recipeTagsRes] = await Promise.all([
        supabase.from('recipes').select(RECIPE_SELECT).order('title'),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
      ]);
      setRecipes((recipesRes.data ?? []) as unknown as Recipe[]);
      setTags((tagsRes.data ?? []) as Tag[]);
      setRecipeTags((recipeTagsRes.data ?? []) as RecipeTagRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A recipe already in the week is only a hint, never a block — you may well
  // want a second batch of it, or to cook the same thing twice.
  const visible = useMemo(
    () =>
      [...filters.filteredRecipes]
        .filter((r) => !added.has(r.id) && !excludeIds?.has(r.id))
        .sort((a, b) => {
          switch (sortBy) {
            case 'z-a':
              return b.title.localeCompare(a.title);
            case 'newest':
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            case 'oldest':
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            default:
              return a.title.localeCompare(b.title);
          }
        }),
    [filters.filteredRecipes, added, excludeIds, sortBy],
  );

  const hasActiveFilters = showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== 'a-z';
  const isNarrowed = hasActiveFilters || filters.activeCategories.size > 0 || search.trim() !== '';

  function resetAllFilters() {
    filters.resetFilters();
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy('a-z');
  }

  // The list gets the room the sheet can spare, so you're scrolling your whole
  // collection rather than peering at it through a letterbox.
  const listHeight = Math.min(520, Math.max(240, windowHeight * (filterOpen ? 0.34 : 0.52)));

  const optionRow = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={{
        paddingVertical: 9,
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

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi">
          {title}
        </Serif>

        {/* Search + filters, the same pair as the home tab. */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              backgroundColor: t.bg,
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
              setFilterOpen((v) => !v);
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: filterOpen || hasActiveFilters ? t.greenLight : t.bg,
              borderWidth: 1,
              borderColor: filterOpen || hasActiveFilters ? t.green : t.border,
            }}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={filterOpen || hasActiveFilters ? t.green : t.muted}
            />
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <RecipeFilterBar {...filters} gutter={20} />
      </View>

      {/* Show / favourites / sort — inline rather than a second sheet on top of
          this one, which iOS would stack awkwardly. */}
      {filterOpen && (
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <Divider style={{ marginBottom: 8 }} />
          <Mono size={10} style={{ marginBottom: 6 }}>
            SHOW
          </Mono>
          {(['all', 'mine', 'shared'] as const).map((value) =>
            optionRow(
              value === 'all' ? 'All recipes' : value === 'mine' ? 'Mine' : 'Shared',
              filters.ownerFilter === value,
              () => filters.setOwnerFilter(value),
            ),
          )}
          <Pressable
            onPress={() => {
              haptics.light();
              setShowFavouritesOnly((v) => !v);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 9,
              paddingHorizontal: 12,
              borderRadius: 10,
              marginTop: 2,
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
          <Mono size={10} style={{ marginBottom: 6 }}>
            SORT BY
          </Mono>
          {SORT_LABELS.map(([value, label]) => optionRow(label, sortBy === value, () => setSortBy(value)))}
          <Divider style={{ marginTop: 8 }} />
        </View>
      )}

      {!loading && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 6,
            paddingHorizontal: 20,
            marginTop: 12,
          }}
        >
          <Body size={12.5} color={t.muted} style={{ flexShrink: 1 }}>
            {isNarrowed
              ? `Showing ${visible.length} of ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}.`
              : `All ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}.`}
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

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 28 }} color={t.green} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          style={{ height: listHeight, marginTop: 6 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={10}
          windowSize={7}
          ListEmptyComponent={
            <Body size={14} color={t.muted} style={{ paddingVertical: 20, textAlign: 'center' }}>
              {isNarrowed ? 'No recipes match those filters.' : 'No recipes to add.'}
            </Body>
          }
          renderItem={({ item: r }) => {
            const meta = (r.prep_time ?? 0) + (r.cook_time ?? 0);
            return (
              <Pressable
                onPress={() => {
                  haptics.success();
                  onPick(r);
                  setAdded((prev) => new Set(prev).add(r.id));
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
              >
                {r.image_url ? (
                  <Image
                    source={{ uri: r.image_url }}
                    style={{ width: 52, height: 52, borderRadius: 6 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={r.id}
                  />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 6, backgroundColor: t.paper3 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Serif size={16} numberOfLines={1}>
                    {r.title}
                  </Serif>
                  {(meta > 0 || r.servings != null || existingIds.has(r.id)) && (
                    <Mono size={10} style={{ marginTop: 2 }} color={existingIds.has(r.id) ? t.green : undefined}>
                      {existingIds.has(r.id) ? 'IN THE WEEK  ·  ' : ''}
                      {meta > 0 ? `${meta} MIN` : ''}
                      {meta > 0 && r.servings != null ? '  ·  ' : ''}
                      {r.servings != null ? `${r.servings} SERVES` : ''}
                    </Mono>
                  )}
                </View>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: t.green,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Body size={18} color={t.green}>
                    +
                  </Body>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </BottomSheet>
  );
}
