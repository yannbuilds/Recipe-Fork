import { supabase } from '@/lib/supabase';

type TagInput = { name: string; emoji: string };

/** Resolve tag names to ids, creating any that don't exist yet. */
async function resolveTagIds(tags: TagInput[]): Promise<string[]> {
  const { data: existingTags } = await supabase.from('tags').select('id, name');

  const existingMap = new Map(
    (existingTags ?? []).map((t: { id: string; name: string }) => [t.name, t.id]),
  );

  const tagIds: string[] = [];

  for (const tag of tags) {
    if (existingMap.has(tag.name)) {
      tagIds.push(existingMap.get(tag.name)!);
    } else {
      const { data } = await supabase
        .from('tags')
        .insert({ name: tag.name, emoji: tag.emoji })
        .select('id')
        .single();
      if (data) tagIds.push(data.id);
    }
  }

  return tagIds;
}

/**
 * Save AI-suggested tags to Supabase, reusing existing tags where possible.
 * Non-critical – callers should .catch() to avoid failing the recipe save.
 */
export async function saveTags(recipeId: string, tags: TagInput[]): Promise<void> {
  if (tags.length === 0) return;

  const tagIds = await resolveTagIds(tags);

  if (tagIds.length > 0) {
    await supabase
      .from('recipe_tags')
      .insert(tagIds.map((tag_id) => ({ recipe_id: recipeId, tag_id })));
  }
}

/**
 * Make a recipe's tags exactly this set — diff-based, so untouched tags keep
 * their rows. Unlike saveTags this also removes, which is what editing needs.
 */
export async function syncTags(recipeId: string, tags: TagInput[]): Promise<void> {
  const [wantedIds, { data: currentRows }] = await Promise.all([
    resolveTagIds(tags),
    supabase.from('recipe_tags').select('tag_id').eq('recipe_id', recipeId),
  ]);

  const wanted = new Set(wantedIds);
  const current = new Set((currentRows ?? []).map((row: { tag_id: string }) => row.tag_id));
  const toRemove = [...current].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId).in('tag_id', toRemove);
  }
  if (toAdd.length > 0) {
    await supabase
      .from('recipe_tags')
      .insert(toAdd.map((tag_id) => ({ recipe_id: recipeId, tag_id })));
  }
}
