import { supabase } from '@recipe-aggregator/shared';

/**
 * Save AI-suggested tags to Supabase, reusing existing tags where possible.
 * Non-critical – callers should .catch() to avoid failing the recipe save.
 */
export async function saveTags(recipeId: string, tagNames: string[]): Promise<void> {
  if (tagNames.length === 0) return;

  const { data: existingTags } = await supabase
    .from('tags')
    .select('id, name');

  const existingMap = new Map(
    (existingTags ?? []).map((t: { id: string; name: string }) => [t.name, t.id]),
  );

  const tagIds: string[] = [];

  for (const name of tagNames) {
    if (existingMap.has(name)) {
      tagIds.push(existingMap.get(name)!);
    } else {
      const { data } = await supabase
        .from('tags')
        .insert({ name })
        .select('id')
        .single();
      if (data) tagIds.push(data.id);
    }
  }

  if (tagIds.length > 0) {
    await supabase.from('recipe_tags').insert(
      tagIds.map((tag_id) => ({ recipe_id: recipeId, tag_id })),
    );
  }
}
