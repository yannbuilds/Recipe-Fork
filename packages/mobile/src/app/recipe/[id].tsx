import type { Ingredient, Recipe, Tag } from '@recipe-aggregator/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const RECIPE_SELECT =
  'id, user_id, title, description, ingredients, steps, source_url, creator_name, author_notes, user_notes, video_url, image_url, servings, custom_servings, prep_time, cook_time, is_favourite, created_at, updated_at';

type RecipeTagRow = {
  tags: Tag | Tag[] | null;
};

async function fetchRecipe(id: string): Promise<Recipe> {
  const [{ data: recipe, error: recipeError }, { data: tagRows, error: tagsError }] =
    await Promise.all([
      supabase.from('recipes').select(RECIPE_SELECT).eq('id', id).single(),
      supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', id),
    ]);

  if (recipeError) throw new Error(recipeError.message);
  if (tagsError) throw new Error(tagsError.message);

  const tags =
    ((tagRows ?? []) as RecipeTagRow[])
      .flatMap((row) => (Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []))
      .filter(Boolean) ?? [];

  return { ...(recipe as unknown as Recipe), tags };
}

function formatTime(minutes: number | null): string {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function getDomain(url: string | null): string {
  if (!url) return 'Source';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function ingredientText(ingredient: Ingredient): string {
  if (ingredient.original_text) return ingredient.original_text;
  return [ingredient.quantity, ingredient.unit, ingredient.item].filter(Boolean).join(' ');
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function RecipeDetailScreen() {
  useKeepAwake();

  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session, loading: authLoading } = useAuth();

  const recipeId = Array.isArray(id) ? id[0] : id;

  const {
    data: recipe,
    isPending,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => fetchRecipe(recipeId!),
    enabled: !!session && !!recipeId,
  });

  const favouriteMutation = useMutation({
    mutationFn: async (nextValue: boolean) => {
      if (!recipeId) return;
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ is_favourite: nextValue })
        .eq('id', recipeId);
      if (updateError) throw new Error(updateError.message);
    },
    onMutate: async (nextValue) => {
      await queryClient.cancelQueries({ queryKey: ['recipe', recipeId] });
      const previousRecipe = queryClient.getQueryData<Recipe>(['recipe', recipeId]);
      queryClient.setQueryData<Recipe>(['recipe', recipeId], (current) =>
        current ? { ...current, is_favourite: nextValue } : current,
      );
      return { previousRecipe };
    },
    onError: (mutationError, _nextValue, context) => {
      if (context?.previousRecipe) {
        queryClient.setQueryData(['recipe', recipeId], context.previousRecipe);
      }
      Alert.alert('Could not update favourite', mutationError.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
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

  if (!recipeId) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Recipe not found.</Text>
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

  if (error || !recipe) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.danger }]}>
          {error?.message ?? 'Recipe not found.'}
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

  const sourceDomain = getDomain(recipe.source_url);
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  const servings = recipe.custom_servings ?? recipe.servings;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.accent}
        />
      }
    >
      {recipe.image_url ? (
        <Image source={{ uri: recipe.image_url }} style={styles.heroImage} contentFit="cover" />
      ) : (
        <View style={[styles.heroImage, styles.heroPlaceholder, { backgroundColor: theme.border }]}>
          <Text style={[styles.heroPlaceholderText, { color: theme.textSecondary }]}>Pie Keeper</Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.kicker, { color: theme.textSecondary }]}>
              {sourceDomain}
            </Text>
            <Text style={[styles.title, { color: theme.text }]}>{recipe.title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recipe.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
            style={({ pressed }) => [
              styles.favouriteButton,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed || favouriteMutation.isPending ? 0.72 : 1,
              },
            ]}
            onPress={() => favouriteMutation.mutate(!recipe.is_favourite)}
            disabled={favouriteMutation.isPending}
          >
            <Text style={[styles.favouriteText, { color: recipe.is_favourite ? theme.accent : theme.textSecondary }]}>
              {recipe.is_favourite ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        {recipe.description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {recipe.description}
          </Text>
        ) : null}

        {recipe.tags?.length ? (
          <View style={styles.tagRow}>
            {recipe.tags.map((tag) => (
              <View
                key={tag.id}
                style={[styles.tagPill, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <Text style={[styles.tagText, { color: theme.textSecondary }]}>
                  {tag.emoji ? `${tag.emoji} ` : ''}
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.metaGrid}>
        <View style={[styles.metaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Prep</Text>
          <Text style={[styles.metaValue, { color: theme.text }]}>{formatTime(recipe.prep_time)}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Cook</Text>
          <Text style={[styles.metaValue, { color: theme.text }]}>{formatTime(recipe.cook_time)}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Serves</Text>
          <Text style={[styles.metaValue, { color: theme.text }]}>{servings ?? '-'}</Text>
        </View>
        <View style={[styles.metaCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.metaValue, { color: theme.text }]}>{formatTime(totalTime)}</Text>
        </View>
      </View>

      <Section title="Ingredients">
        <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {recipe.ingredients.length ? (
            recipe.ingredients.map((ingredient, index) => (
              <View
                key={`${ingredient.item}-${index}`}
                style={[
                  styles.ingredientRow,
                  index < recipe.ingredients.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 },
                ]}
              >
                <Text style={[styles.bullet, { color: theme.accent }]}>•</Text>
                <Text style={[styles.ingredientText, { color: theme.text }]}>
                  {ingredientText(ingredient)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No ingredients saved.</Text>
          )}
        </View>
      </Section>

      <Section title="Method">
        <View style={styles.stepsList}>
          {recipe.steps.length ? (
            recipe.steps
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((step, index) => (
                <View
                  key={`${step.order}-${index}`}
                  style={[styles.stepCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <Text style={[styles.stepNumber, { color: theme.accent }]}>
                    {step.order || index + 1}
                  </Text>
                  <Text style={[styles.stepText, { color: theme.text }]}>{step.instruction}</Text>
                </View>
              ))
          ) : (
            <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No method saved.</Text>
            </View>
          )}
        </View>
      </Section>

      {recipe.user_notes ? (
        <Section title="My notes">
          <View style={[styles.notePanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.noteText, { color: theme.text }]}>{recipe.user_notes}</Text>
          </View>
        </Section>
      ) : null}

      {recipe.author_notes ? (
        <Section title="Author notes">
          <View style={[styles.notePanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.noteText, { color: theme.text }]}>{recipe.author_notes}</Text>
          </View>
        </Section>
      ) : null}

      <View style={styles.actionRow}>
        {recipe.source_url ? (
          <Pressable
            style={({ pressed }) => [
              styles.sourceButton,
              { backgroundColor: theme.accent, opacity: pressed ? 0.78 : 1 },
            ]}
            onPress={() => Linking.openURL(recipe.source_url)}
          >
            <Text style={styles.sourceButtonText}>Open source</Text>
          </Pressable>
        ) : null}
        {recipe.video_url ? (
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.78 : 1 },
            ]}
            onPress={() => Linking.openURL(recipe.video_url!)}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Watch video</Text>
          </Pressable>
        ) : null}
      </View>

      <Link href="/" asChild>
        <Pressable style={styles.backLink}>
          <Text style={[styles.backText, { color: theme.textSecondary }]}>Back to recipes</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrollContent: { paddingBottom: 32 },
  heroImage: { width: '100%', aspectRatio: 1.25 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroPlaceholderText: { fontSize: 16, fontWeight: '600' },
  header: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  headerTopRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  titleBlock: { flex: 1, gap: 6 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 39 },
  favouriteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favouriteText: { fontSize: 27, lineHeight: 31 },
  description: { fontSize: 16, lineHeight: 23 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { fontSize: 13, fontWeight: '600' },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  metaCard: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metaLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  metaValue: { fontSize: 20, fontWeight: '700' },
  section: { paddingHorizontal: 20, paddingTop: 26, gap: 10 },
  sectionTitle: { fontSize: 21, fontWeight: '700' },
  panel: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  ingredientRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  bullet: { fontSize: 20, lineHeight: 23 },
  ingredientText: { flex: 1, fontSize: 16, lineHeight: 23 },
  emptyText: { padding: 14, fontSize: 15, lineHeight: 21 },
  stepsList: { gap: 10 },
  stepCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    gap: 8,
  },
  stepNumber: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  stepText: { fontSize: 16, lineHeight: 24 },
  notePanel: { borderWidth: 1, borderRadius: 14, padding: 15 },
  noteText: { fontSize: 15, lineHeight: 23 },
  actionRow: { paddingHorizontal: 20, paddingTop: 28, gap: 10 },
  sourceButton: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  sourceButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: { borderRadius: 12, borderWidth: 1, paddingVertical: 15, alignItems: 'center' },
  secondaryButtonText: { fontSize: 16, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingTop: 22, paddingBottom: 8 },
  backText: { fontSize: 15, fontWeight: '600' },
  retryButton: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  errorText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
});
