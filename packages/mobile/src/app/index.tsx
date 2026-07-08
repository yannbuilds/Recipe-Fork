import type { Recipe } from '@recipe-aggregator/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

// Same shape the web list view fetches — full recipe rows come in on demand.
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

async function fetchRecipes(): Promise<RecipeListItem[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RecipeListItem[];
}

function formatMeta(recipe: RecipeListItem): string {
  const parts: string[] = [];
  const total = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  if (total > 0) parts.push(`${total} min`);
  if (recipe.servings) parts.push(`Serves ${recipe.servings}`);
  return parts.join(' · ');
}

export default function RecipeListScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');

  const { data: recipes, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
    enabled: !!session,
  });

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.ingredients?.some((i) => i.item?.toLowerCase().includes(q)),
    );
  }, [recipes, search]);

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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        style={[
          styles.search,
          { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.text },
        ]}
        placeholder="Search recipes or ingredients"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: theme.danger, textAlign: 'center' }}>{error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {search ? 'No recipes match your search.' : 'No recipes yet — save some from the web app.'}
            </Text>
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
                    {formatMeta(item)}
                  </Text>
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  listContent: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardImage: { width: 96, height: 96 },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center', gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', lineHeight: 21 },
  cardMeta: { fontSize: 13 },
});
