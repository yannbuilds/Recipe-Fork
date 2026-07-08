import type { Recipe } from '@recipe-aggregator/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

async function fetchRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Recipe;
}

function formatIngredient(ing: Recipe['ingredients'][number]): string {
  const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ').trim();
  return qty ? `${qty} ${ing.item}` : ing.item;
}

export default function RecipeDetailScreen() {
  // The whole point of this screen: phone stays awake while you cook.
  useKeepAwake();

  const theme = useTheme();
  const { session, loading: authLoading } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: recipe, isPending, error } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => fetchRecipe(id),
    enabled: !!session && !!id,
  });

  if (!authLoading && !session) {
    return <Redirect href="/sign-in" />;
  }

  if (isPending || authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.danger, textAlign: 'center' }}>
          {error?.message ?? 'Recipe not found.'}
        </Text>
      </View>
    );
  }

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  const steps = [...recipe.steps].sort((a, b) => a.order - b.order);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: '' }} />

      {recipe.image_url && (
        <Image source={{ uri: recipe.image_url }} style={styles.hero} contentFit="cover" />
      )}

      <Text style={[styles.title, { color: theme.text }]}>{recipe.title}</Text>

      <View style={styles.metaRow}>
        {recipe.prep_time != null && (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            Prep {recipe.prep_time} min
          </Text>
        )}
        {recipe.cook_time != null && (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            Cook {recipe.cook_time} min
          </Text>
        )}
        {totalTime > 0 && (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>Total {totalTime} min</Text>
        )}
        {recipe.servings != null && (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            Serves {recipe.custom_servings ?? recipe.servings}
          </Text>
        )}
      </View>

      {recipe.description && (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {recipe.description}
        </Text>
      )}

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Ingredients</Text>
      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {recipe.ingredients.map((ing, i) => (
          <Text key={i} style={[styles.ingredient, { color: theme.text }]}>
            •  {formatIngredient(ing)}
          </Text>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Steps</Text>
      <View style={styles.stepsList}>
        {steps.map((step) => (
          <View
            key={step.order}
            style={[styles.stepCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.stepNumber, { color: theme.accent }]}>{step.order}</Text>
            <Text style={[styles.stepText, { color: theme.text }]}>{step.instruction}</Text>
          </View>
        ))}
      </View>

      {recipe.user_notes && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Notes</Text>
          <View
            style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.ingredient, { color: theme.text }]}>{recipe.user_notes}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  hero: { width: '100%', height: 220, borderRadius: 16, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  meta: { fontSize: 14 },
  description: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  sectionCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  ingredient: { fontSize: 16, lineHeight: 24 },
  stepsList: { gap: 10 },
  stepCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  stepNumber: { fontSize: 17, fontWeight: '700', minWidth: 22 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24 },
});
