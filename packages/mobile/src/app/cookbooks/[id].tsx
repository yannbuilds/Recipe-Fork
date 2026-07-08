import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

type RecipeListItem = Pick<
  Recipe,
  | 'id'
  | 'user_id'
  | 'title'
  | 'image_url'
  | 'prep_time'
  | 'cook_time'
  | 'servings'
  | 'is_favourite'
  | 'created_at'
  | 'ingredients'
>;

type CookbookRecipeRow = {
  recipes: RecipeListItem | RecipeListItem[] | null;
};

type CookbookDetailData = {
  cookbook: Cookbook;
  recipes: RecipeListItem[];
};

async function fetchCookbookDetail(id: string): Promise<CookbookDetailData> {
  const [{ data: cookbook, error: cookbookError }, { data: recipeRows, error: recipesError }] =
    await Promise.all([
      supabase
        .from('cookbooks')
        .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('cookbook_recipes')
        .select(`recipe_id, added_at, recipes(${RECIPE_SELECT})`)
        .eq('cookbook_id', id),
    ]);

  if (cookbookError) throw new Error(cookbookError.message);
  if (!cookbook) throw new Error('Cookbook not found');
  if (recipesError) throw new Error(recipesError.message);

  const recipes = ((recipeRows ?? []) as unknown as CookbookRecipeRow[])
    .map((row) => (Array.isArray(row.recipes) ? row.recipes[0] : row.recipes))
    .filter((recipe): recipe is RecipeListItem => !!recipe)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    cookbook: cookbook as Cookbook,
    recipes,
  };
}

function formatMeta(recipe: RecipeListItem): string {
  const parts: string[] = [];
  const total = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  if (total > 0) parts.push(`${total} min`);
  if (recipe.servings) parts.push(`Serves ${recipe.servings}`);
  return parts.join(' · ');
}

function recipeCountLabel(count: number): string {
  if (count === 1) return '1 recipe';
  return `${count} recipes`;
}

export default function CookbookDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, loading: authLoading } = useAuth();
  const cookbookId = Array.isArray(id) ? id[0] : id;

  const {
    data,
    isPending,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['cookbook', cookbookId],
    queryFn: () => fetchCookbookDetail(cookbookId!),
    enabled: !!session && !!cookbookId,
  });

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (!cookbookId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Cookbook not found.</Text>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.error, { color: theme.danger }]}>
          {error?.message ?? 'Cookbook not found.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={() => refetch()}
        >
          <Text style={{ color: theme.text }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { cookbook, recipes } = data;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: theme.textSecondary }]}>Cookbook</Text>
        <Text style={[styles.title, { color: theme.text }]}>
          {cookbook.emoji ? `${cookbook.emoji} ` : ''}
          {cookbook.name}
        </Text>
        {cookbook.description ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{cookbook.description}</Text>
        ) : null}
        <Text style={[styles.count, { color: theme.textSecondary }]}>
          {recipeCountLabel(recipes.length)}
        </Text>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.accent} />
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No recipes here yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Add recipes to this cookbook from the web app for now.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Link href="/cookbooks" asChild>
            <Pressable style={styles.backLink}>
              <Text style={[styles.backText, { color: theme.textSecondary }]}>Back to cookbooks</Text>
            </Pressable>
          </Link>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/recipe/[id]', params: { id: item.id } }} asChild>
            <Pressable
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.cardImage} contentFit="cover" />
              ) : (
                <View style={[styles.cardImage, { backgroundColor: theme.border }]} />
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                  {item.is_favourite ? '★ ' : ''}
                  {item.title}
                </Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {formatMeta(item) || 'Recipe'}
                </Text>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 7 },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '700', lineHeight: 37 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  count: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 4 },
  listContent: { padding: 20, gap: 12 },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardImage: { width: 96, height: 96 },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center', gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  cardMeta: { fontSize: 13 },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 18, gap: 7 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21 },
  backLink: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  backText: { fontSize: 15, fontWeight: '600' },
  error: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  retryButton: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
});
