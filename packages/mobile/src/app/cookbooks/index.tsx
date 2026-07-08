import type { Cookbook } from '@recipe-aggregator/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, Redirect } from 'expo-router';
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

type CookbookImageRow = {
  cookbook_id: string;
  recipes: { image_url: string | null; created_at: string } | { image_url: string | null; created_at: string }[] | null;
};

type CookbookListItem = Cookbook & {
  recipeCount: number;
  coverImages: string[];
};

async function fetchCookbooks(): Promise<CookbookListItem[]> {
  const { data: cookbooks, error: cookbookError } = await supabase
    .from('cookbooks')
    .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (cookbookError) throw new Error(cookbookError.message);

  const list = (cookbooks ?? []) as Cookbook[];
  if (list.length === 0) return [];

  const ids = list.map((cookbook) => cookbook.id);
  const { data: recipeRows, error: recipesError } = await supabase
    .from('cookbook_recipes')
    .select('cookbook_id, recipes(image_url, created_at)')
    .in('cookbook_id', ids);

  if (recipesError) throw new Error(recipesError.message);

  const counts: Record<string, number> = {};
  const imagesByCookbook: Record<string, { url: string; created_at: string }[]> = {};

  for (const row of (recipeRows ?? []) as unknown as CookbookImageRow[]) {
    counts[row.cookbook_id] = (counts[row.cookbook_id] ?? 0) + 1;
    const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
    if (recipe?.image_url) {
      imagesByCookbook[row.cookbook_id] = imagesByCookbook[row.cookbook_id] ?? [];
      imagesByCookbook[row.cookbook_id].push({
        url: recipe.image_url,
        created_at: recipe.created_at,
      });
    }
  }

  return list.map((cookbook) => ({
    ...cookbook,
    recipeCount: counts[cookbook.id] ?? 0,
    coverImages: (imagesByCookbook[cookbook.id] ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4)
      .map((image) => image.url),
  }));
}

function recipeCountLabel(count: number): string {
  if (count === 1) return '1 recipe';
  return `${count} recipes`;
}

export default function CookbooksScreen() {
  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();

  const {
    data: cookbooks,
    isPending,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['cookbooks'],
    queryFn: fetchCookbooks,
    enabled: !!session,
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: theme.textSecondary }]}>The shelves</Text>
        <Text style={[styles.title, { color: theme.text }]}>Cookbooks</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Browse your saved recipe collections.
        </Text>
      </View>

      <View style={styles.navRow}>
        <Link href="/" asChild>
          <Pressable style={[styles.navButton, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.navButtonText, { color: theme.text }]}>Recipes</Text>
          </Pressable>
        </Link>
        <View style={[styles.navButton, styles.navButtonActive, { borderColor: theme.accent }]}>
          <Text style={[styles.navButtonText, { color: theme.accent }]}>Cookbooks</Text>
        </View>
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.error, { color: theme.danger }]}>{error.message}</Text>
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
      ) : (
        <FlatList
          data={cookbooks ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.accent} />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No cookbooks yet</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Create cookbooks on the web app for now; they will appear here for mobile browsing.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={{ pathname: '/cookbooks/[id]', params: { id: item.id } }} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <View style={[styles.coverGrid, { backgroundColor: theme.border }]}>
                  {item.coverImages.length ? (
                    item.coverImages.map((url, index) => (
                      <Image
                        key={`${url}-${index}`}
                        source={{ uri: url }}
                        style={styles.coverImage}
                        contentFit="cover"
                      />
                    ))
                  ) : (
                    <Text style={[styles.coverEmoji, { color: theme.textSecondary }]}>
                      {item.emoji || 'PK'}
                    </Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                    {item.emoji ? `${item.emoji} ` : ''}
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text style={[styles.cardDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                    {recipeCountLabel(item.recipeCount)}
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
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 6 },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { fontSize: 36, fontWeight: '700', lineHeight: 40 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  navRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  navButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 11,
  },
  navButtonActive: { backgroundColor: 'transparent' },
  navButtonText: { fontSize: 14, fontWeight: '700' },
  listContent: { padding: 20, gap: 14 },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 132,
  },
  coverGrid: {
    width: 132,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: { width: '50%', height: '50%' },
  coverEmoji: { fontSize: 26, fontWeight: '800' },
  cardBody: { flex: 1, padding: 14, justifyContent: 'center', gap: 6 },
  cardTitle: { fontSize: 19, fontWeight: '700', lineHeight: 24 },
  cardDescription: { fontSize: 14, lineHeight: 20 },
  cardMeta: { fontSize: 13, fontWeight: '700' },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 18, gap: 7 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21 },
  error: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  retryButton: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
});
