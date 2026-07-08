import { Ionicons } from '@expo/vector-icons';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/BottomSheet';
import RecipeCard from '@/components/RecipeCard';
import RecipeFilterBar from '@/components/RecipeFilterBar';
import { Body, Divider, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { RecipeTagRow } from '@/lib/tagMeta';
import { font, useTheme } from '@/lib/theme';
import useRecipeFilters from '@/lib/useRecipeFilters';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

type SortOption = 'newest' | 'oldest' | 'a-z' | 'z-a';

function getGreeting(): { text: string; punctuation: string } {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const morning = [
    { text: 'Good morning', punctuation: '!' },
    { text: 'Rise and shine', punctuation: '!' },
    { text: 'Morning', punctuation: '!' },
  ];
  const afternoon = [
    { text: "What's for lunch", punctuation: '?' },
    { text: 'Good afternoon', punctuation: '!' },
    { text: 'Afternoon', punctuation: '!' },
  ];
  const evening = [
    { text: "What's for dinner", punctuation: '?' },
    { text: 'Good evening', punctuation: '!' },
    { text: 'Hungry yet', punctuation: '?' },
  ];
  if (month === 11 || month <= 1) {
    morning.push({ text: "It's BBQ weather", punctuation: '!' });
    afternoon.push({ text: "It's BBQ weather", punctuation: '!' });
  } else if (month >= 5 && month <= 7) {
    evening.push({ text: 'Perfect soup weather', punctuation: '!' });
    afternoon.push({ text: 'Perfect soup weather', punctuation: '!' });
  }
  const pool = hour < 12 ? morning : hour < 17 ? afternoon : evening;
  return pool[dayOfYear % pool.length];
}

interface RecipesData {
  recipes: Recipe[];
  tags: Tag[];
  recipeTags: RecipeTagRow[];
}

async function fetchAll(): Promise<RecipesData> {
  const [recipesRes, tagsRes, recipeTagsRes] = await Promise.all([
    supabase
      .from('recipes')
      .select(RECIPE_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    supabase.from('tags').select('*').order('name'),
    supabase.from('recipe_tags').select('recipe_id, tag_id'),
  ]);
  if (recipesRes.error) throw new Error(recipesRes.error.message);
  return {
    recipes: (recipesRes.data ?? []) as unknown as Recipe[],
    tags: (tagsRes.data ?? []) as Tag[],
    recipeTags: (recipeTagsRes.data ?? []) as RecipeTagRow[],
  };
}

const SORT_LABELS: [SortOption, string][] = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['a-z', 'A – Z'],
  ['z-a', 'Z – A'],
];

export default function RecipeListScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user, session, profile, familyMembers } = useAuth();
  const [search, setSearch] = useState('');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [favOverrides, setFavOverrides] = useState<Record<string, boolean>>({});

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['recipes'],
    queryFn: fetchAll,
    enabled: !!session,
  });

  const recipes = useMemo(() => {
    const list = data?.recipes ?? [];
    return list.map((r) => (r.id in favOverrides ? { ...r, is_favourite: favOverrides[r.id] } : r));
  }, [data?.recipes, favOverrides]);

  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? recipes.filter((r) => r.is_favourite) : recipes,
    tags: data?.tags ?? [],
    recipeTags: data?.recipeTags ?? [],
    userId: user?.id,
    searchQuery: search,
  });

  const sortedRecipes = useMemo(
    () =>
      [...filters.filteredRecipes].sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case 'a-z':
            return a.title.localeCompare(b.title);
          case 'z-a':
            return b.title.localeCompare(a.title);
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      }),
    [filters.filteredRecipes, sortBy],
  );

  const familyOwnerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of familyMembers) {
      if (m.user_id !== user?.id && m.profile?.display_name) map.set(m.user_id, m.profile.display_name);
    }
    return map;
  }, [familyMembers, user?.id]);

  const total = recipes.length;
  const hasAnyFilter =
    filters.hasActiveFilter || search !== '' || showFavouritesOnly || sortBy !== 'newest';
  const greeting = getGreeting();
  const hasActiveFilters = showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== 'newest';

  function resetAll() {
    filters.resetFilters();
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy('newest');
  }

  const subtitle = isPending
    ? 'Loading your recipes…'
    : hasAnyFilter
      ? `Showing ${sortedRecipes.length} of ${total} recipe${total !== 1 ? 's' : ''}.`
      : familyMembers.length > 1
        ? `${total} recipe${total !== 1 ? 's' : ''} in your family collection.`
        : `You have ${total} recipe${total !== 1 ? 's' : ''} saved.`;

  const header = (
    <View style={{ paddingTop: insets.top + 8 }}>
      {/* Masthead */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <Eyebrow>The kitchen</Eyebrow>
        <Serif size={34} style={{ marginTop: 10, lineHeight: 36 }}>
          {greeting.text}
          {profile?.display_name ? (
            <>
              {', '}
              <Serif size={34} italic color={t.green}>
                {profile.display_name}
              </Serif>
            </>
          ) : (
            ''
          )}
          {greeting.punctuation}
        </Serif>
        <Body size={14.5} color={t.textSoft} style={{ marginTop: 10, lineHeight: 21 }}>
          {subtitle}
        </Body>
      </View>

      {/* Search + filter */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 }}>
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
            placeholder="Search recipes..."
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            style={{ flex: 1, paddingVertical: 11, fontSize: 15, color: t.text, fontFamily: font.sans }}
          />
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
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

      <RecipeFilterBar {...filters} />
      <View style={{ height: 12 }} />
    </View>
  );

  const empty = (
    <View style={{ alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 }}>
      <Ionicons name="restaurant-outline" size={40} color={t.muted} />
      <Serif size={21} style={{ marginTop: 16 }}>
        {error ? 'Something went wrong' : 'No recipes found'}
      </Serif>
      <Body size={14} color={t.muted} style={{ marginTop: 4, textAlign: 'center' }}>
        {error ? error.message : 'Try adjusting your filters or add a new recipe.'}
      </Body>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={isPending ? [] : sortedRecipes}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 18, paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={isPending ? null : empty}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={t.green} />
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <RecipeCard
              recipe={item}
              ownerName={familyOwnerNames.get(item.user_id)}
              onToggleFavourite={(id, next) => setFavOverrides((p) => ({ ...p, [id]: next }))}
            />
          </View>
        )}
      />

      {/* Filter sheet */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
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
                onPress={() => filters.setOwnerFilter(value)}
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
            onPress={() => setShowFavouritesOnly((v) => !v)}
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
                onPress={() => setSortBy(value)}
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

          {hasActiveFilters && (
            <>
              <Divider style={{ marginVertical: 8 }} />
              <Pressable onPress={resetAll} style={{ paddingVertical: 11, paddingHorizontal: 12 }}>
                <Body size={14} color={t.red}>
                  Reset all filters
                </Body>
              </Pressable>
            </>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}
