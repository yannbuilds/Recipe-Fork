import useOfflineState from './useOfflineState';
import { dedupeRecipesBySource } from '@recipe-aggregator/shared/recipeSource';
import type { Cookbook, Recipe, Tag } from '@recipe-aggregator/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { RecipeTagRow } from '@/lib/tagMeta';

export interface RecipeBrowserData {
  /** Every recipe, as stored. */
  recipes: Recipe[];
  /** What the browser lists — URL variants of one source collapsed to one. */
  uniqueRecipes: Recipe[];
  tags: Tag[];
  recipeTags: RecipeTagRow[];
  /** Recipe id → the last time it was cooked, for the "not cooked lately" sort. */
  lastCooked: Record<string, string>;
  cookbooks: Cookbook[];
  cookbookRecipes: Record<string, Set<string>>;
  /** Cookbooks you can actually pick from — an empty one is just noise. */
  pickableCookbooks: Cookbook[];
  /** Cookbook id → custom/chosen cover followed by newest recipe photos. */
  cookbookCovers: Record<string, string[]>;
  loading: boolean;
}

/**
 * Everything the recipe browser lists, fetched once each time the surface
 * holding it opens. Plan mode and the add-a-recipe picker share it so both
 * show the same collection, the same cookbooks and the same cooking history.
 */
export default function useRecipeBrowserData(open: boolean): RecipeBrowserData {
  const { user } = useAuth();
  const [recipes, setRecipes] = useOfflineState<Recipe[]>('browser-recipes', []);
  const [tags, setTags] = useOfflineState<Tag[]>('tags', []);
  const [recipeTags, setRecipeTags] = useOfflineState<RecipeTagRow[]>('recipe-tags', []);
  const [lastCooked, setLastCooked] = useOfflineState<Record<string, string>>('last-cooked', {});
  const [cookbooks, setCookbooks] = useOfflineState<Cookbook[]>('cookbooks', []);
  const [cookbookRecipeIds, setCookbookRecipeIds] = useOfflineState<Record<string, string[]>>('cookbook-members', {});
  const cookbookRecipes = useMemo(() => Object.fromEntries(Object.entries(cookbookRecipeIds).map(([id, ids]) => [id, new Set(ids)])), [cookbookRecipeIds]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(recipes.length === 0);
    (async () => {
      const results = await Promise.all([
        supabase.from('recipes').select('*').order('title'),
        supabase.from('recipe_cooks').select('recipe_id, cooked_at'),
        supabase.from('cookbooks').select('*').order('sort_order').order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id, recipe_id'),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
      ]);
      if (cancelled) return;
      if (results.some(result => result.error)) { setLoading(false); return; }
      const [
        { data: recipeData },
        { data: cookData },
        { data: cbData },
        { data: cbRecipeData },
        { data: tagData },
        { data: recipeTagData },
      ] = results;
      if (cancelled) return;
      setRecipes((recipeData as Recipe[]) ?? []);
      const map: Record<string, string> = {};
      for (const row of (cookData as { recipe_id: string; cooked_at: string }[]) ?? []) {
        if (!map[row.recipe_id] || row.cooked_at > map[row.recipe_id]) {
          map[row.recipe_id] = row.cooked_at;
        }
      }
      setLastCooked(map);
      setCookbooks((cbData as Cookbook[]) ?? []);
      const members: Record<string, Set<string>> = {};
      for (const row of (cbRecipeData as { cookbook_id: string; recipe_id: string }[]) ?? []) {
        (members[row.cookbook_id] ??= new Set()).add(row.recipe_id);
      }
      setCookbookRecipeIds(Object.fromEntries(Object.entries(members).map(([id, ids]) => [id, [...ids]])));
      setTags((tagData as Tag[]) ?? []);
      setRecipeTags((recipeTagData as RecipeTagRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  // Importing the same page with a trailing slash or a tracking link creates a
  // handful of distinct rows. They are one recipe as far as picking goes.
  const uniqueRecipes = useMemo(
    () => dedupeRecipesBySource(recipes, user?.id),
    [recipes, user?.id],
  );

  const pickableCookbooks = useMemo(
    () => cookbooks.filter((c) => (cookbookRecipes[c.id]?.size ?? 0) > 0),
    [cookbooks, cookbookRecipes],
  );

  // Four plates per shelf — custom cover first, then a chosen recipe photo,
  // then newest recipe photos. This matches the main Cookbook tab.
  const cookbookCovers = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const out: Record<string, string[]> = {};
    for (const cb of cookbooks) {
      const ids = cookbookRecipes[cb.id];
      const recipeImages = !ids
        ? []
        : [...ids]
          .map((id) => byId.get(id))
          .filter((r): r is Recipe => !!r?.image_url)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const chosen = cb.cover_recipe_id ? byId.get(cb.cover_recipe_id)?.image_url : null;
      out[cb.id] = [...new Set([cb.cover_image_url, chosen, ...recipeImages.map((r) => r.image_url)].filter((url): url is string => !!url))].slice(0, 4);
    }
    return out;
  }, [recipes, cookbooks, cookbookRecipes]);

  return {
    recipes,
    uniqueRecipes,
    tags,
    recipeTags,
    lastCooked,
    cookbooks,
    cookbookRecipes,
    pickableCookbooks,
    cookbookCovers,
    loading,
  };
}
