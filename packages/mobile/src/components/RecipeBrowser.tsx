import { Ionicons } from '@expo/vector-icons';
import type { Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import CookbookRow from '@/components/CookbookRow';
import RecipeFilterBar from '@/components/RecipeFilterBar';
import { Body, Divider, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { font, useTheme } from '@/lib/theme';
import type { RecipeBrowserData } from '@/lib/useRecipeBrowserData';
import useRecipeFilters from '@/lib/useRecipeFilters';

/**
 * Home's four sort options plus the one a picker cares about most: what you
 * haven't cooked in a while. That's the default — the whole point of browsing
 * the collection is to get last month's recipes back in front of you.
 */
export type BrowseSort = 'suggested' | 'newest' | 'oldest' | 'a-z' | 'z-a';

const SORT_LABELS: [BrowseSort, string][] = [
  ['suggested', 'Not cooked lately'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['a-z', 'A – Z'],
  ['z-a', 'Z – A'],
];

interface Props {
  /** Drives the reset — every time the surface opens you start fresh. */
  open: boolean;
  data: RecipeBrowserData;
  /** Recipes drawn as already chosen. */
  selectedIds?: Set<string>;
  /** Recipes left out of the list entirely. */
  excludeIds?: Set<string>;
  onSelect: (recipe: Recipe) => void;
  /** An extra line under a card — plan mode's meals pill, the picker's hint. */
  renderCardExtra?: (recipe: Recipe) => ReactNode;
  /** Sits above the All recipes / Cookbooks switch — plan mode's prefs recap. */
  topSlot?: ReactNode;
  defaultSort?: BrowseSort;
  emptyLabel?: string;
}

/**
 * The one way to browse the collection from inside a modal: your whole library
 * or your cookbook shelves, the home tab's search and filters over the top, and
 * a grid of plates you tap to choose. Plan mode and the add-a-recipe picker
 * both render this, so they show the same thing and can never drift apart.
 */
export default function RecipeBrowser({
  open,
  data,
  selectedIds,
  excludeIds,
  onSelect,
  renderCardExtra,
  topSlot,
  defaultSort = 'suggested',
  emptyLabel = 'Nothing to pick here yet.',
}: Props) {
  const t = useTheme();
  const { user } = useAuth();
  const { uniqueRecipes, recipes, tags, recipeTags, lastCooked, cookbookRecipes, pickableCookbooks, cookbookCovers, cookbooks, loading } = data;

  const [sortBy, setSortBy] = useState<BrowseSort>(defaultSort);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  // Two ways to look at the same collection: the whole list, or your shelves.
  // Not a filter — a mode. Cookbooks get the shelf treatment they have on the
  // Cookbook tab, because browsing them is half the reason they exist.
  const [browse, setBrowse] = useState<'all' | 'cookbooks'>('all');
  const [cookbookId, setCookbookId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');

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
    setSortBy(defaultSort);
    setShowFavouritesOnly(false);
    setBrowse('all');
    setCookbookId(null);
    setFilterOpen(false);
    setSearch('');
    filters.resetFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCookbook = cookbookId ? cookbooks.find((c) => c.id === cookbookId) : undefined;

  // Everything that matches — no cap. If you have 200 recipes you see 200;
  // narrowing is the filters' job, not a silent truncation's.
  const visible = useMemo(() => {
    const hidden = (r: Recipe) => excludeIds?.has(r.id) ?? false;
    // Inside a shelf you get the shelf, least recently cooked first — the
    // recipe filters belong to the all-recipes mode and are reset on the way in.
    if (browse === 'cookbooks') {
      if (!cookbookId) return [];
      const ids = cookbookRecipes[cookbookId];
      const list = ids ? recipes.filter((r) => ids.has(r.id) && !hidden(r)) : [];
      return [...list].sort((a, b) => (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? ''));
    }
    return filters.filteredRecipes.filter((r) => !hidden(r)).sort((a, b) => {
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
  }, [browse, cookbookId, recipes, filters.filteredRecipes, cookbookRecipes, sortBy, lastCooked, excludeIds]);

  const hasActiveFilters =
    showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== defaultSort;
  const isNarrowed = hasActiveFilters || filters.activeCategories.size > 0 || search.trim() !== '';

  function resetAllFilters() {
    filters.resetFilters();
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy(defaultSort);
  }

  /** Switching mode is a clean slate — the other mode's controls don't linger. */
  function setMode(next: 'all' | 'cookbooks') {
    haptics.select();
    setBrowse(next);
    setCookbookId(null);
    setFilterOpen(false);
    resetAllFilters();
  }

  /** The recap slot plus the All-recipes / Cookbooks switch — on top of every
   *  view, so the mode is always one tap away. */
  const modeSwitch = (
    <View style={{ paddingTop: 20 }}>
      {topSlot}

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
  const listHeader = (
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

          {/* Always say how much of the collection you're looking at — the
              picker used to quietly stop at 60 and there was no way to tell. */}
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
                  : `All ${uniqueRecipes.length} recipe${uniqueRecipes.length === 1 ? '' : 's'}${sortBy === 'suggested' ? ', least recently cooked first.' : '.'}`}
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

  const renderCard = ({ item: recipe }: { item: Recipe }) => {
    const picked = selectedIds?.has(recipe.id) ?? false;
    return (
      <View style={{ width: '48.5%' }}>
        <Pressable onPress={() => onSelect(recipe)}>
          <View
            style={{
              aspectRatio: 4 / 3,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: t.paper3,
              borderWidth: picked ? 2 : 1,
              borderColor: picked ? t.greenSolid : t.border,
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
                backgroundColor: picked ? t.greenSolid : 'rgba(0,0,0,0.45)',
              }}
            >
              <Ionicons name={picked ? 'checkmark' : 'add'} size={14} color="#fff" />
            </View>
          </View>
          <Serif size={14} numberOfLines={2} style={{ marginTop: 6, lineHeight: 17 }}>
            {recipe.title}
          </Serif>
        </Pressable>

        {renderCardExtra?.(recipe)}
      </View>
    );
  };

  return (
    <>
      {/* A real list — the whole collection, virtualised, so a couple of
          hundred recipes scroll as smoothly as ten. */}
      {browse === 'cookbooks' && !activeCookbook ? (
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
      ) : (
        <FlatList
          data={loading ? [] : visible}
          keyExtractor={(r) => r.id}
          numColumns={2}
          renderItem={renderCard}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={t.green} style={{ marginVertical: 28 }} />
            ) : (
              <Body size={14} color={t.muted} style={{ paddingVertical: 24, textAlign: 'center' }}>
                {isNarrowed ? 'No recipes match those filters.' : emptyLabel}
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
      )}

      {/* Filter & sort — the home tab's sheet, minus nothing, plus the
          not-cooked-lately sort this browser opens on. */}
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
    </>
  );
}
